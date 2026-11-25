import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import { PenaltyCategory, PenaltyStatus, Prisma } from '@prisma/client'
import { PrismaService } from '../common/prisma.service'
import { AuditLoggerService } from '../common/audit-logger.service'
import { AuthenticatedUser } from '../common/auth-user.interface'
import {
  buildAuditActor,
  findActiveEmployeesForRole,
  findManagedTeamIds,
  hasGlobalFinanceAccess,
  isActorCeo,
  resolveActorRoles,
} from './finance-actor.util'
import { FinanceConfigService, PenaltyRuleConfig } from './finance-config.service'
import { notifyFinanceRoles } from './finance-notifications.helper'
import { LedgerService } from './ledger.service'

export interface RecordPenaltyInput {
  sprintNumber: number
  teamId: string
  category: PenaltyCategory
  reason: string
  recipientEmployeeId?: string
}

const VALID_CATEGORIES = new Set<PenaltyCategory>([
  'CODE_SMELL',
  'CTO_CONSULTANCY',
  'SLACKER',
  'SWAP_FIRE',
  'DEADLINE',
  'BLIND_QA',
])

@Injectable()
export class PenaltyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
    private readonly configService: FinanceConfigService,
    @Optional() private readonly auditLogger?: AuditLoggerService,
  ) {}

  private assertCanRecordCategory(
    category: PenaltyCategory,
    actor: AuthenticatedUser,
    roles: Set<string>,
  ) {
    if (isActorCeo(actor, roles)) return

    switch (category) {
      case 'CODE_SMELL':
      case 'CTO_CONSULTANCY':
        if (!roles.has('cto')) {
          throw new ForbiddenException(
            `Only CTO or CEO may record ${category} penalties`,
          )
        }
        return
      case 'SLACKER':
      case 'SWAP_FIRE':
        if (!roles.has('chro') && !roles.has('cpo')) {
          throw new ForbiddenException(
            `Only CHRO, CPO, or CEO may record ${category} penalties`,
          )
        }
        return
      case 'DEADLINE':
        if (
          !roles.has('cfo') &&
          !roles.has('cto') &&
          !roles.has('chro') &&
          !roles.has('cpo')
        ) {
          throw new ForbiddenException(
            'Only executives (CEO/CFO/CTO/CHRO/CPO) may record DEADLINE penalties',
          )
        }
        return
      case 'BLIND_QA':
        if (
          !roles.has('cto') &&
          !roles.has('cpo') &&
          !roles.has('cfo') &&
          !roles.has('chro')
        ) {
          throw new ForbiddenException(
            'Only executives may record BLIND_QA penalties',
          )
        }
        return
    }
  }

  async recordPenalty(dto: RecordPenaltyInput, actor: AuthenticatedUser) {
    if (!Number.isInteger(dto.sprintNumber) || dto.sprintNumber < 1) {
      throw new BadRequestException('sprintNumber must be a positive integer')
    }
    if (!dto.teamId?.trim()) {
      throw new BadRequestException('teamId is required')
    }
    if (!VALID_CATEGORIES.has(dto.category)) {
      throw new BadRequestException(`Invalid penalty category "${dto.category}"`)
    }
    if (!dto.reason || dto.reason.trim().length < 5) {
      throw new BadRequestException('Penalty reason (at least 5 characters) is required')
    }

    return this.prisma.$transaction(async (tx) => {
      await this.ledgerService.assertSprintNotLocked(tx, dto.sprintNumber, { actor })

      const roles = await resolveActorRoles(tx, actor)
      this.assertCanRecordCategory(dto.category, actor, roles)

      const squadAccount = await tx.financeAccount.findUnique({
        where: { teamId: dto.teamId },
      })
      if (!squadAccount) {
        throw new NotFoundException(`Squad FinanceAccount for team "${dto.teamId}" not found`)
      }

      const config = await this.configService.getConfig(tx)
      const penaltyTable = (config.penaltyTable ?? {}) as unknown as Record<string, PenaltyRuleConfig>
      const rule = penaltyTable[dto.category]
      if (!rule) {
        throw new BadRequestException(`No configured penalty rule for "${dto.category}"`)
      }

      const grossAmount = new Prisma.Decimal(rule.amount).toDecimalPlaces(
        2,
        Prisma.Decimal.ROUND_HALF_UP,
      )
      const recPct = new Prisma.Decimal(rule.recipientPct ?? 0)

      let recipientEmployeeId: string | null = null
      if (rule.recipientRole && recPct.greaterThan(0)) {
        if (dto.recipientEmployeeId?.trim()) {
          const explicitEmp = await tx.employee.findUnique({
            where: { id: dto.recipientEmployeeId.trim() },
            select: { id: true, status: true },
          })
          if (!explicitEmp || explicitEmp.status !== 'active') {
            throw new NotFoundException(
              `Recipient employee "${dto.recipientEmployeeId}" not found or inactive`,
            )
          }
          recipientEmployeeId = explicitEmp.id
        } else {
          const holders = await findActiveEmployeesForRole(tx, rule.recipientRole)
          recipientEmployeeId = holders[0]?.employeeId ?? null
        }

        if (!recipientEmployeeId) {
          throw new BadRequestException(
            `No active "${rule.recipientRole}" recipient found for ${dto.category} split credit`,
          )
        }
      }

      // Compute exact paisa shares so recipientShare + companyFundShare === grossAmount cleanly.
      const grossPaisa = grossAmount
        .mul(100)
        .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
        .toNumber()
      const recipientPaisa = recipientEmployeeId
        ? new Prisma.Decimal(grossPaisa)
            .mul(recPct)
            .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
            .toNumber()
        : 0
      const companyFundPaisa = grossPaisa - recipientPaisa

      const recipientShare = new Prisma.Decimal(recipientPaisa).div(100).toDecimalPlaces(2)
      const companyFundShare = new Prisma.Decimal(companyFundPaisa).div(100).toDecimalPlaces(2)

      const requiresApproval = Boolean(rule.requiresCeoApproval || dto.category === 'DEADLINE')
      const actorIsCeo = isActorCeo(actor, roles)
      const now = new Date()

      let status: PenaltyStatus = 'RECORDED'
      let approvedById: string | null = null
      let approvedAt: Date | null = null
      if (requiresApproval) {
        if (actorIsCeo) {
          status = 'APPROVED'
          approvedById = actor.id
          approvedAt = now
        } else {
          status = 'PENDING_CEO_APPROVAL'
        }
      }

      const triggersRosterChange = Boolean(
        rule.triggersRosterChange || dto.category === 'SWAP_FIRE',
      )

      const record = await tx.penaltyRecord.create({
        data: {
          sprintNumber: dto.sprintNumber,
          teamId: dto.teamId,
          category: dto.category,
          grossAmount,
          recipientEmployeeId,
          recipientShare,
          companyFundShare,
          reason: dto.reason.trim(),
          status,
          recordedById: actor.id,
          approvedById,
          approvedAt,
          triggersRosterChange,
        },
      })

      if (status === 'PENDING_CEO_APPROVAL') {
        await notifyFinanceRoles(tx, ['ceo'], {
          title: `Deadline Penalty Approval Required (Tk ${grossAmount.toFixed(2)})`,
          message: `${dto.category} penalty of Tk ${grossAmount.toFixed(2)} for squad ${squadAccount.name} awaits CEO approval`,
          entityType: 'PenaltyRecord',
          entityId: record.id,
          excludeEmployeeId: actor.id,
        })
      }

      await this.auditLogger?.log(
        {
          ...buildAuditActor(actor),
          action: 'PENALTY_RECORDED',
          actionCode: 'penalties:record',
          severity: 'WARNING',
          entityType: 'PenaltyRecord',
          entityId: record.id,
          description: `Recorded ${dto.category} penalty of Tk ${grossAmount.toFixed(2)} against squad ${dto.teamId}`,
          category: 'FINANCE',
          afterState: {
            category: dto.category,
            status: record.status,
            grossAmount: grossAmount.toFixed(2),
            recipientEmployeeId,
            recipientShare: recipientShare.toFixed(2),
            companyFundShare: companyFundShare.toFixed(2),
            triggersRosterChange,
          },
          reason: dto.reason.trim(),
        },
        tx,
      )

      return record
    })
  }

  async approvePenalty(penaltyId: string, actor: AuthenticatedUser) {
    const roles = await resolveActorRoles(this.prisma, actor)
    if (!isActorCeo(actor, roles)) {
      throw new ForbiddenException('Only the CEO may approve DEADLINE penalties')
    }

    return this.prisma.$transaction(async (tx) => {
      const record = await tx.penaltyRecord.findUnique({ where: { id: penaltyId } })
      if (!record) {
        throw new NotFoundException(`PenaltyRecord "${penaltyId}" not found`)
      }
      if (record.recordedById === actor.id) {
        throw new ForbiddenException('Recorder cannot approve their own penalty record')
      }
      if (record.status !== 'PENDING_CEO_APPROVAL') {
        throw new BadRequestException(
          `PenaltyRecord "${penaltyId}" is ${record.status}, not PENDING_CEO_APPROVAL`,
        )
      }

      await this.ledgerService.assertSprintNotLocked(tx, record.sprintNumber, { actor })

      const updated = await tx.penaltyRecord.update({
        where: { id: penaltyId },
        data: {
          status: 'APPROVED',
          approvedById: actor.id,
          approvedAt: new Date(),
        },
      })

      await this.auditLogger?.log(
        {
          ...buildAuditActor(actor, 'CEO'),
          action: 'PENALTY_APPROVED',
          actionCode: 'money_requests:approve',
          severity: 'CRITICAL',
          entityType: 'PenaltyRecord',
          entityId: updated.id,
          description: `CEO approved ${updated.category} penalty of Tk ${new Prisma.Decimal(updated.grossAmount).toFixed(2)}`,
          category: 'FINANCE',
          beforeState: { status: record.status },
          afterState: { status: updated.status },
          mfaVerified: true,
        },
        tx,
      )

      return updated
    })
  }

  async rejectPenalty(
    penaltyId: string,
    rejectionReason: string,
    actor: AuthenticatedUser,
  ) {
    const roles = await resolveActorRoles(this.prisma, actor)
    if (!isActorCeo(actor, roles)) {
      throw new ForbiddenException('Only the CEO may reject DEADLINE penalties')
    }
    if (!rejectionReason || rejectionReason.trim().length < 5) {
      throw new BadRequestException('rejectionReason (at least 5 characters) is required')
    }

    return this.prisma.$transaction(async (tx) => {
      const record = await tx.penaltyRecord.findUnique({ where: { id: penaltyId } })
      if (!record) {
        throw new NotFoundException(`PenaltyRecord "${penaltyId}" not found`)
      }
      if (record.recordedById === actor.id) {
        throw new ForbiddenException('Recorder cannot reject their own penalty record')
      }
      if (record.status !== 'PENDING_CEO_APPROVAL') {
        throw new BadRequestException(
          `PenaltyRecord "${penaltyId}" is ${record.status}, not PENDING_CEO_APPROVAL`,
        )
      }

      const updated = await tx.penaltyRecord.update({
        where: { id: penaltyId },
        data: {
          status: 'REJECTED',
          approvedById: actor.id,
          approvedAt: new Date(),
          rejectionReason: rejectionReason.trim(),
        },
      })

      await this.auditLogger?.log(
        {
          ...buildAuditActor(actor, 'CEO'),
          action: 'PENALTY_REJECTED',
          actionCode: 'money_requests:approve',
          severity: 'WARNING',
          entityType: 'PenaltyRecord',
          entityId: updated.id,
          description: `CEO rejected ${updated.category} penalty: ${rejectionReason.trim()}`,
          category: 'FINANCE',
          beforeState: { status: record.status },
          afterState: { status: updated.status, rejectionReason: rejectionReason.trim() },
          reason: rejectionReason.trim(),
        },
        tx,
      )

      return updated
    })
  }

  async postPenalty(penaltyId: string, actor: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      const record = await tx.penaltyRecord.findUnique({ where: { id: penaltyId } })
      if (!record) {
        throw new NotFoundException(`PenaltyRecord "${penaltyId}" not found`)
      }

      if (record.status === 'POSTED') {
        return { penalty: record, idempotentHit: true }
      }

      if (record.category === 'DEADLINE' && record.status !== 'APPROVED') {
        throw new BadRequestException(
          `DEADLINE penalty "${penaltyId}" must be CEO-approved before posting (current: ${record.status})`,
        )
      }
      if (record.status !== 'RECORDED' && record.status !== 'APPROVED') {
        throw new BadRequestException(
          `PenaltyRecord "${penaltyId}" cannot be posted from status ${record.status}`,
        )
      }

      await this.ledgerService.assertSprintNotLocked(tx, record.sprintNumber, { actor })

      const squadAccount = await tx.financeAccount.findUnique({
        where: { teamId: record.teamId },
      })
      if (!squadAccount) {
        throw new NotFoundException(`Squad FinanceAccount for team "${record.teamId}" not found`)
      }

      const companyFund = await tx.financeAccount.findFirst({
        where: { type: 'COMPANY_FUND' },
      })
      if (!companyFund) {
        throw new NotFoundException('COMPANY_FUND finance account not found')
      }

      const grossAmount = new Prisma.Decimal(record.grossAmount)
      if (new Prisma.Decimal(squadAccount.balance).lessThan(grossAmount)) {
        throw new BadRequestException(
          `Insufficient squad balance in ${squadAccount.name} to post penalty (available Tk ${new Prisma.Decimal(squadAccount.balance).toFixed(2)}, required Tk ${grossAmount.toFixed(2)})`,
        )
      }

      const ledgerTxIds: string[] = []
      const recipientShare = new Prisma.Decimal(record.recipientShare)
      const companyFundShare = new Prisma.Decimal(record.companyFundShare)
      const now = new Date()

      if (recipientShare.greaterThan(0) && record.recipientEmployeeId) {
        const leg1 = await this.ledgerService.postTransaction(
          {
            idempotencyKey: `penalty_split:${record.id}`,
            sprintNumber: record.sprintNumber,
            type: 'PENALTY_SPLIT',
            sourceKind: 'FINANCE_ACCOUNT',
            sourceRefId: squadAccount.id,
            destKind: 'PERSONAL_WALLET',
            destRefId: record.recipientEmployeeId,
            teamId: record.teamId,
            employeeId: record.recipientEmployeeId,
            grossAmount: recipientShare,
            reason: `${record.category} penalty split credit: ${record.reason}`,
            approvedById: record.approvedById ?? actor.id,
            approvedAt: record.approvedAt ?? now,
            approvalRef: record.id,
            metadata: {
              penaltyRecordId: record.id,
              category: record.category,
              leg: 'RECIPIENT_SPLIT',
            },
          },
          actor,
          tx,
        )
        ledgerTxIds.push(leg1.transaction.id)
      }

      if (companyFundShare.greaterThan(0)) {
        const leg2 = await this.ledgerService.postTransaction(
          {
            idempotencyKey: `penalty_residual:${record.id}`,
            sprintNumber: record.sprintNumber,
            type: 'PENALTY_RESIDUAL',
            sourceKind: 'FINANCE_ACCOUNT',
            sourceRefId: squadAccount.id,
            destKind: 'FINANCE_ACCOUNT',
            destRefId: companyFund.id,
            teamId: record.teamId,
            grossAmount: companyFundShare,
            reason: `${record.category} penalty residual to Company Fund: ${record.reason}`,
            approvedById: record.approvedById ?? actor.id,
            approvedAt: record.approvedAt ?? now,
            approvalRef: record.id,
            metadata: {
              penaltyRecordId: record.id,
              category: record.category,
              leg: 'COMPANY_FUND_RESIDUAL',
            },
          },
          actor,
          tx,
        )
        ledgerTxIds.push(leg2.transaction.id)
      }

      const updated = await tx.penaltyRecord.update({
        where: { id: record.id },
        data: {
          status: 'POSTED',
          postedById: actor.id,
          postedAt: now,
          ledgerTxIds,
        },
      })

      await this.auditLogger?.log(
        {
          ...buildAuditActor(actor),
          action: 'PENALTY_POSTED',
          actionCode: 'penalties:post',
          severity: 'CRITICAL',
          entityType: 'PenaltyRecord',
          entityId: updated.id,
          description: `Posted ${updated.category} penalty (Tk ${grossAmount.toFixed(2)}: recipient Tk ${recipientShare.toFixed(2)}, Company Fund Tk ${companyFundShare.toFixed(2)})`,
          category: 'FINANCE',
          beforeState: { status: record.status },
          afterState: { status: updated.status, ledgerTxIds },
          mfaVerified: true,
        },
        tx,
      )

      return { penalty: updated, idempotentHit: false }
    })
  }

  async listPenalties(
    filters: {
      sprintNumber?: number
      teamId?: string
      category?: PenaltyCategory
      status?: PenaltyStatus
    },
    actor: AuthenticatedUser,
  ) {
    const roles = await resolveActorRoles(this.prisma, actor)
    const where: Prisma.PenaltyRecordWhereInput = {}
    if (filters.sprintNumber !== undefined) where.sprintNumber = filters.sprintNumber
    if (filters.category) where.category = filters.category
    if (filters.status) where.status = filters.status

    const canViewAll =
      hasGlobalFinanceAccess(actor, roles) ||
      roles.has('cto') ||
      roles.has('chro') ||
      roles.has('cpo')

    if (canViewAll) {
      if (filters.teamId) where.teamId = filters.teamId
    } else {
      const managedTeamIds = await findManagedTeamIds(this.prisma, actor.id)
      if (managedTeamIds.length === 0) {
        throw new ForbiddenException('You do not have permission to view squad penalty records')
      }
      if (filters.teamId && !managedTeamIds.includes(filters.teamId)) {
        throw new ForbiddenException('PM may only view penalties for their own squad')
      }
      where.teamId = filters.teamId ?? { in: managedTeamIds }
    }

    return this.prisma.penaltyRecord.findMany({
      where,
      orderBy: [{ sprintNumber: 'desc' }, { createdAt: 'desc' }],
    })
  }

  async getPendingRosterChangeFlags(teamId?: string) {
    return this.prisma.penaltyRecord.findMany({
      where: {
        ...(teamId ? { teamId } : {}),
        triggersRosterChange: true,
        rosterChangeConsumedByRunId: null,
        status: { in: ['RECORDED', 'APPROVED', 'POSTED'] },
      },
      orderBy: { createdAt: 'desc' },
    })
  }
}
