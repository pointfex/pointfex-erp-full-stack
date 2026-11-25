import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common'
import { PrismaService } from '../common/prisma.service'
import { AuthenticatedUser } from '../common/auth-user.interface'
import { applyDisciplinaryDeduction } from './kpi-engine'
import { getDhakaWeekBoundaries } from '../common/dhaka-time.util'
import { Prisma } from '@prisma/client'
import * as crypto from 'crypto'

export interface CreateDisciplinaryDeductionDto {
  userId: string
  points: number
  reason: string
  referenceDocId: string
  targetWeekStart: string | Date
}

@Injectable()
export class DisciplinaryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Applies a CHRO or CEO disciplinary deduction to an employee's weekly KPI.
   */
  async applyDisciplinaryDeduction(
    dto: CreateDisciplinaryDeductionDto,
    actor: AuthenticatedUser,
  ) {
    const actorRole = (actor.role || '').toLowerCase()
    const isChroOrCeo = actorRole === 'chro' || actorRole === 'ceo'
    if (!isChroOrCeo) {
      throw new ForbiddenException('Only CHRO or CEO may issue disciplinary KPI deductions')
    }

    // Self-targeting blocked
    if (dto.userId === actor.id) {
      throw new ForbiddenException('Security law: Self-targeted disciplinary action is strictly prohibited')
    }

    // Validation
    const points = Number(dto.points)
    if (isNaN(points) || points <= 0 || points > 100) {
      throw new BadRequestException('Disciplinary deduction points must be strictly between 0 and 100')
    }
    if (!dto.reason || dto.reason.trim().length < 10) {
      throw new BadRequestException('A formal justification reason (minimum 10 characters) is required')
    }
    if (!dto.referenceDocId || dto.referenceDocId.trim().length === 0) {
      throw new BadRequestException('A legal / HR referenceDocId is required for disciplinary actions')
    }

    const employee = await this.prisma.employee.findUnique({ where: { id: dto.userId } })
    if (!employee) throw new NotFoundException(`Employee "${dto.userId}" not found`)

    const targetWeekStart = new Date(dto.targetWeekStart)

    return this.prisma.$transaction(async (tx) => {
      // 1. Create DisciplinaryAction record
      const action = await tx.disciplinaryAction.create({
        data: {
          userId: dto.userId,
          deductionPoints: new Prisma.Decimal(points),
          reason: dto.reason.trim(),
          referenceDocId: dto.referenceDocId.trim(),
          appliedByChroId: actor.id,
          weekStart: targetWeekStart,
        },
      })

      // 2. Fetch target week's WeeklyKpiRecord
      const weekBounds = getDhakaWeekBoundaries(targetWeekStart)
      const weeklyRecord = await tx.weeklyKpiRecord.findFirst({
        where: {
          employeeId: dto.userId,
          OR: [
            { weekStart: targetWeekStart },
            { year: weekBounds.year, weekNumber: weekBounds.weekNumber },
          ],
        },
      })

      if (!weeklyRecord || weeklyRecord.isInactive || weeklyRecord.score === null) {
        throw new BadRequestException(
          'No KPI deduction shall be applied to an N/A week (inactivity week), and no deduction shall carry forward from that week per CHRO Policy §2.4.',
        )
      }

      const valueBefore = weeklyRecord.score
      const baseScore = Number(weeklyRecord.score)

      const deductionResult = applyDisciplinaryDeduction({
        weeklyValue: baseScore,
        points,
      })

      if (!deductionResult.deductionApplied || deductionResult.value === null) {
        throw new BadRequestException('Disciplinary deduction could not be applied to the target week.')
      }

      const valueAfter = new Prisma.Decimal(deductionResult.value)
      const actualDelta = Number(valueAfter) - Number(valueBefore)

      await tx.weeklyKpiRecord.update({
        where: { id: weeklyRecord.id },
        data: {
          score: valueAfter,
        },
      })

      // 3. Append negative KPI audit log event
      await this.appendKpiAudit(tx, {
        employeeId: dto.userId,
        actionType: 'CHRO_DISCIPLINARY',
        valueBefore,
        valueAfter,
        deltaValue: new Prisma.Decimal(actualDelta),
        reason: `Disciplinary deduction: -${points} pts [Ref: ${dto.referenceDocId}] - ${dto.reason.trim()}`,
        actorId: actor.id,
        authorizedRole: actorRole.toUpperCase(),
      })

      // 4. Notify employee
      if (tx.notification && typeof tx.notification.create === 'function') {
        try {
          await tx.notification.create({
            data: {
              userId: dto.userId,
              title: 'Disciplinary KPI Deduction Notice',
              message: `A disciplinary deduction of -${points} points was applied by ${actorRole.toUpperCase()} (Ref: ${dto.referenceDocId}): ${dto.reason.trim()}`,
              type: 'financial',
              entityType: 'disciplinary_action',
              entityId: action.id,
            },
          })
        } catch {
          // Non-blocking
        }
      }

      return {
        id: action.id,
        userId: action.userId,
        deductionPoints: points,
        referenceDocId: action.referenceDocId,
        scoreBefore: valueBefore ? Number(valueBefore) : null,
        scoreAfter: valueAfter ? Number(valueAfter) : null,
        status: 'APPLIED',
      }
    })
  }

  /**
   * Reverses an existing disciplinary deduction (MFA + reason required).
   * Never edits or drops rows; appends a REVERSAL audit event.
   */
  async reverseDisciplinaryDeduction(
    actionId: string,
    reason: string,
    actor: AuthenticatedUser,
  ) {
    const actorRole = (actor.role || '').toLowerCase()
    const isChroOrCeo = actorRole === 'chro' || actorRole === 'ceo'
    if (!isChroOrCeo) {
      throw new ForbiddenException('Only CHRO or CEO may reverse disciplinary KPI deductions')
    }
    if (!reason || reason.trim().length < 5) {
      throw new BadRequestException('A justification reason is required for disciplinary reversal')
    }

    const action = await this.prisma.disciplinaryAction.findUnique({
      where: { id: actionId },
    })
    if (!action) throw new NotFoundException(`DisciplinaryAction "${actionId}" not found`)
    if (action.isReversed) {
      throw new BadRequestException('This disciplinary action has already been reversed')
    }

    const points = Number(action.deductionPoints)
    const now = new Date()

    return this.prisma.$transaction(async (tx) => {
      // 1. Mark action reversed
      await tx.disciplinaryAction.update({
        where: { id: actionId },
        data: {
          isReversed: true,
          reversalReason: reason.trim(),
          reversedById: actor.id,
          reversedAt: now,
        },
      })

      // 2. Recalculate target week's WeeklyKpiRecord by restoring points
      const weeklyRecord = await tx.weeklyKpiRecord.findFirst({
        where: {
          employeeId: action.userId,
          weekStart: action.weekStart,
        },
      })

      let valueBefore: Prisma.Decimal | null = null
      let valueAfter: Prisma.Decimal | null = null

      if (weeklyRecord && weeklyRecord.score !== null) {
        valueBefore = weeklyRecord.score
        const restored = Math.min(100, Number(weeklyRecord.score) + points)
        valueAfter = new Prisma.Decimal(restored)

        await tx.weeklyKpiRecord.update({
          where: { id: weeklyRecord.id },
          data: { score: valueAfter },
        })
      }

      // 3. Append REVERSAL audit log event
      await this.appendKpiAudit(tx, {
        employeeId: action.userId,
        actionType: 'REVERSAL',
        valueBefore,
        valueAfter,
        deltaValue: new Prisma.Decimal(points),
        reason: `Reversal of disciplinary deduction ${actionId} (+${points} pts): ${reason.trim()}`,
        actorId: actor.id,
        authorizedRole: actorRole.toUpperCase(),
      })

      // 4. Notify employee
      if (tx.notification && typeof tx.notification.create === 'function') {
        try {
          await tx.notification.create({
            data: {
              userId: action.userId,
              title: 'Disciplinary Deduction Reversed',
              message: `Disciplinary deduction (Ref: ${action.referenceDocId}) has been reversed by ${actorRole.toUpperCase()}: ${reason.trim()}`,
              type: 'financial',
              entityType: 'disciplinary_action',
              entityId: action.id,
            },
          })
        } catch {
          // Non-blocking
        }
      }

      return {
        id: action.id,
        status: 'REVERSED',
        restoredPoints: points,
        scoreAfter: valueAfter ? Number(valueAfter) : null,
      }
    })
  }

  private async appendKpiAudit(
    tx: Prisma.TransactionClient,
    data: {
      employeeId: string
      actionType: string
      valueBefore?: Prisma.Decimal | null
      valueAfter?: Prisma.Decimal | null
      deltaValue: Prisma.Decimal
      reason: string
      actorId: string
      authorizedRole: string
    },
  ) {
    const lastEntry = await tx.kpiXpAuditLog.findFirst({
      orderBy: { sequence: 'desc' },
      select: { sequence: true, entryHash: true },
    })

    const sequence = (lastEntry?.sequence || 0) + 1
    const prevHash = lastEntry?.entryHash || '00000000000000000000000000000000'
    const payload = `${sequence}|${prevHash}|${data.employeeId}|KPI|${data.deltaValue}|${data.actionType}|${Date.now()}`
    const entryHash = crypto.createHash('sha256').update(payload).digest('hex')

    await tx.kpiXpAuditLog.create({
      data: {
        sequence,
        prevHash,
        entryHash,
        employeeId: data.employeeId,
        metricType: 'KPI',
        deltaValue: data.deltaValue,
        valueBefore: data.valueBefore,
        valueAfter: data.valueAfter,
        actionType: data.actionType,
        triggerEvent: data.reason,
        reason: data.reason,
        authorizedById: data.actorId,
        authorizedRole: data.authorizedRole,
        recordedAt: new Date(),
      },
    })
  }
}
