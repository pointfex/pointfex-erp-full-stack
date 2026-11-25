import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import { BonusAwardStatus, Prisma } from '@prisma/client'
import { PrismaService } from '../common/prisma.service'
import { AuditLoggerService } from '../common/audit-logger.service'
import { AuthenticatedUser } from '../common/auth-user.interface'
import {
  buildAuditActor,
  findManagedTeamIds,
  hasGlobalFinanceAccess,
  isActivePmOfTeam,
  isActorCeo,
  resolveActorRoles,
} from './finance-actor.util'
import { BonusTierRule, FinanceConfigService } from './finance-config.service'
import { notifyFinanceRoles } from './finance-notifications.helper'
import { LedgerService } from './ledger.service'

export interface BonusCriteriaScoresInput {
  delivery: number
  quality: number
  ownership: number
  collaboration: number
  reliability: number
}

export interface ScoreBonusInput {
  sprintNumber: number
  teamId: string
  employeeId: string
  criteriaScores: BonusCriteriaScoresInput
  evidence: string
}

const CRITERIA_MAX_WEIGHTS: Record<keyof BonusCriteriaScoresInput, number> = {
  delivery: 25,
  quality: 20,
  ownership: 25,
  collaboration: 15,
  reliability: 15,
}

@Injectable()
export class BonusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
    private readonly configService: FinanceConfigService,
    @Optional() private readonly auditLogger?: AuditLoggerService,
  ) {}

  private resolveTierAmount(
    totalScore: Prisma.Decimal,
    bonusTiersRaw: unknown,
  ): { amount: Prisma.Decimal; label: string } {
    const tiers = Array.isArray(bonusTiersRaw) ? (bonusTiersRaw as BonusTierRule[]) : []
    const numericScore = totalScore.toNumber()
    const matched = tiers.find(
      (t) => numericScore >= Number(t.minScore) && numericScore <= Number(t.maxScore),
    )
    if (!matched) {
      return { amount: new Prisma.Decimal('0.00'), label: 'No Matching Tier' }
    }
    return {
      amount: new Prisma.Decimal(matched.amount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
      label: matched.label,
    }
  }

  async assertWithinSquadPoolCap(
    tx: Prisma.TransactionClient,
    sprintNumber: number,
    teamId: string,
    candidateAmount: Prisma.Decimal,
    excludeAwardId?: string,
  ) {
    const poolCredits = await tx.moneyRequest.findMany({
      where: {
        type: 'POOL_CREDIT',
        sprintNumber,
        teamId,
        status: 'PAID',
      },
      select: { id: true, amount: true },
    })

    const poolCreditTotal = poolCredits.reduce(
      (sum, req) => sum.plus(new Prisma.Decimal(req.amount)),
      new Prisma.Decimal('0.00'),
    )
    if (poolCreditTotal.lessThanOrEqualTo(0)) {
      throw new BadRequestException(
        `Bonus blocked: no posted sprint pool credit (POOL_CREDIT) exists for squad "${teamId}" in sprint ${sprintNumber}`,
      )
    }

    const allocatedAwards = await tx.bonusAward.findMany({
      where: {
        sprintNumber,
        teamId,
        status: { in: ['APPROVED', 'PAID'] },
        ...(excludeAwardId ? { id: { not: excludeAwardId } } : {}),
      },
      select: { id: true, tierAmount: true },
    })

    const existingAllocated = allocatedAwards.reduce(
      (sum, a) => sum.plus(new Prisma.Decimal(a.tierAmount)),
      new Prisma.Decimal('0.00'),
    )

    const projectedTotal = existingAllocated.plus(candidateAmount)
    if (projectedTotal.greaterThan(poolCreditTotal)) {
      const remaining = Prisma.Decimal.max(
        new Prisma.Decimal('0.00'),
        poolCreditTotal.minus(existingAllocated),
      )
      throw new BadRequestException(
        `Bonus exceeds squad sprint pool credit cap (pool Tk ${poolCreditTotal.toFixed(2)}, already allocated Tk ${existingAllocated.toFixed(2)}, remaining Tk ${remaining.toFixed(2)}, requested Tk ${candidateAmount.toFixed(2)})`,
      )
    }

    return {
      poolCreditTotal,
      existingAllocated,
      remainingAfter: poolCreditTotal.minus(projectedTotal),
    }
  }

  async scoreBonus(dto: ScoreBonusInput, actor: AuthenticatedUser) {
    if (!Number.isInteger(dto.sprintNumber) || dto.sprintNumber < 1) {
      throw new BadRequestException('sprintNumber must be a positive integer')
    }
    if (!dto.teamId?.trim() || !dto.employeeId?.trim()) {
      throw new BadRequestException('teamId and employeeId are required')
    }
    if (!dto.evidence || dto.evidence.trim().length < 10) {
      throw new BadRequestException('Bonus evidence (at least 10 characters) is required')
    }
    if (!dto.criteriaScores || typeof dto.criteriaScores !== 'object') {
      throw new BadRequestException('criteriaScores object is required')
    }

    let scoreSum = new Prisma.Decimal('0.00')
    for (const [criterion, maxWeight] of Object.entries(CRITERIA_MAX_WEIGHTS) as Array<
      [keyof BonusCriteriaScoresInput, number]
    >) {
      const rawVal = dto.criteriaScores[criterion]
      if (typeof rawVal !== 'number' || !Number.isFinite(rawVal)) {
        throw new BadRequestException(`Score for criterion "${criterion}" must be a finite number`)
      }
      if (rawVal < 0 || rawVal > maxWeight) {
        throw new BadRequestException(
          `Score for criterion "${criterion}" must be between 0 and ${maxWeight}`,
        )
      }
      scoreSum = scoreSum.plus(new Prisma.Decimal(rawVal))
    }

    const totalScore = scoreSum.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)

    return this.prisma.$transaction(async (tx) => {
      await this.ledgerService.assertSprintNotLocked(tx, dto.sprintNumber, { actor })

      const roles = await resolveActorRoles(tx, actor)
      const isSquadPm = await isActivePmOfTeam(tx, actor.id, dto.teamId)
      if (!isSquadPm && !isActorCeo(actor, roles)) {
        throw new ForbiddenException(
          'Only the squad PM or CEO may score squad members for sprint bonuses',
        )
      }

      const team = await tx.team.findUnique({ where: { id: dto.teamId } })
      if (!team) {
        throw new NotFoundException(`Team "${dto.teamId}" not found`)
      }

      // Verify recipient belongs to this squad as an active member or squad PM.
      const isMember = await tx.teamMembership.findFirst({
        where: {
          teamId: dto.teamId,
          employeeId: dto.employeeId,
          isActive: true,
          employee: { status: 'active' },
        },
        select: { id: true },
      })
      const isTeamPmRecipient =
        team.pmPositionId && tx.positionAssignment
          ? await tx.positionAssignment.findFirst({
              where: {
                positionId: team.pmPositionId,
                employeeId: dto.employeeId,
                isActive: true,
                employee: { status: 'active' },
              },
              select: { id: true },
            })
          : null

      if (!isMember && !isTeamPmRecipient) {
        throw new BadRequestException(
          `Employee "${dto.employeeId}" is not an active member or PM of squad "${team.name}"`,
        )
      }

      const existing = await tx.bonusAward.findUnique({
        where: {
          sprintNumber_teamId_employeeId: {
            sprintNumber: dto.sprintNumber,
            teamId: dto.teamId,
            employeeId: dto.employeeId,
          },
        },
      })
      if (existing && (existing.status === 'APPROVED' || existing.status === 'PAID')) {
        throw new BadRequestException(
          `BonusAward for employee "${dto.employeeId}" in Sprint ${dto.sprintNumber} is already ${existing.status}`,
        )
      }

      const config = await this.configService.getConfig(tx)
      const { amount: tierAmount, label: tierLabel } = this.resolveTierAmount(
        totalScore,
        config.bonusTiers,
      )

      const award = await tx.bonusAward.upsert({
        where: {
          sprintNumber_teamId_employeeId: {
            sprintNumber: dto.sprintNumber,
            teamId: dto.teamId,
            employeeId: dto.employeeId,
          },
        },
        update: {
          criteriaScores: dto.criteriaScores as unknown as Prisma.InputJsonValue,
          totalScore,
          evidence: dto.evidence.trim(),
          tierAmount,
          status: 'SUBMITTED',
          scoredById: actor.id,
          approvedById: null,
          approvedAt: null,
          rejectionReason: null,
        },
        create: {
          sprintNumber: dto.sprintNumber,
          teamId: dto.teamId,
          employeeId: dto.employeeId,
          criteriaScores: dto.criteriaScores as unknown as Prisma.InputJsonValue,
          totalScore,
          evidence: dto.evidence.trim(),
          tierAmount,
          status: 'SUBMITTED',
          scoredById: actor.id,
        },
      })

      await notifyFinanceRoles(tx, ['ceo'], {
        title: `Bonus Score Submitted (${tierLabel})`,
        message: `Bonus score ${totalScore.toFixed(2)}/100 (Tk ${tierAmount.toFixed(2)}) for squad ${team.name} awaiting CEO approval`,
        entityType: 'BonusAward',
        entityId: award.id,
        excludeEmployeeId: actor.id,
      })

      await this.auditLogger?.log(
        {
          ...buildAuditActor(actor),
          action: 'BONUS_AWARD_SCORED',
          actionCode: 'bonus_awards:score',
          severity: 'INFO',
          entityType: 'BonusAward',
          entityId: award.id,
          description: `Scored Sprint ${dto.sprintNumber} bonus for employee ${dto.employeeId}: ${totalScore.toFixed(2)}/100 (Tk ${tierAmount.toFixed(2)})`,
          category: 'FINANCE',
          afterState: {
            totalScore: totalScore.toFixed(2),
            tierAmount: tierAmount.toFixed(2),
            tierLabel,
            status: award.status,
          },
        },
        tx,
      )

      return award
    })
  }

  async approveBonus(awardId: string, actor: AuthenticatedUser) {
    const roles = await resolveActorRoles(this.prisma, actor)
    if (!isActorCeo(actor, roles)) {
      throw new ForbiddenException('Only the CEO may approve bonus awards')
    }

    return this.prisma.$transaction(async (tx) => {
      const award = await tx.bonusAward.findUnique({ where: { id: awardId } })
      if (!award) {
        throw new NotFoundException(`BonusAward "${awardId}" not found`)
      }
      if (award.scoredById === actor.id) {
        throw new ForbiddenException('Scorer cannot approve their own bonus submission')
      }
      if (award.status !== 'SUBMITTED') {
        throw new BadRequestException(`BonusAward "${awardId}" is ${award.status}, not SUBMITTED`)
      }

      await this.ledgerService.assertSprintNotLocked(tx, award.sprintNumber, { actor })

      const tierAmount = new Prisma.Decimal(award.tierAmount)
      if (tierAmount.lessThanOrEqualTo(0)) {
        throw new BadRequestException(
          'Bonus score falls in a Tk 0.00 tier and cannot be approved for disbursement',
        )
      }

      await this.assertWithinSquadPoolCap(tx, award.sprintNumber, award.teamId, tierAmount, award.id)

      const updated = await tx.bonusAward.update({
        where: { id: awardId },
        data: {
          status: 'APPROVED',
          approvedById: actor.id,
          approvedAt: new Date(),
        },
      })

      await this.auditLogger?.log(
        {
          ...buildAuditActor(actor, 'CEO'),
          action: 'BONUS_AWARD_APPROVED',
          actionCode: 'bonus_awards:approve',
          severity: 'CRITICAL',
          entityType: 'BonusAward',
          entityId: updated.id,
          description: `CEO approved Sprint ${updated.sprintNumber} bonus award of Tk ${tierAmount.toFixed(2)} for employee ${updated.employeeId}`,
          category: 'FINANCE',
          beforeState: { status: award.status },
          afterState: { status: updated.status, tierAmount: tierAmount.toFixed(2) },
          mfaVerified: true,
        },
        tx,
      )

      return updated
    })
  }

  async rejectBonus(awardId: string, rejectionReason: string, actor: AuthenticatedUser) {
    const roles = await resolveActorRoles(this.prisma, actor)
    if (!isActorCeo(actor, roles)) {
      throw new ForbiddenException('Only the CEO may reject bonus awards')
    }
    if (!rejectionReason || rejectionReason.trim().length < 5) {
      throw new BadRequestException('rejectionReason (at least 5 characters) is required')
    }

    return this.prisma.$transaction(async (tx) => {
      const award = await tx.bonusAward.findUnique({ where: { id: awardId } })
      if (!award) {
        throw new NotFoundException(`BonusAward "${awardId}" not found`)
      }
      if (award.scoredById === actor.id) {
        throw new ForbiddenException('Scorer cannot reject their own bonus submission')
      }
      if (award.status !== 'SUBMITTED') {
        throw new BadRequestException(`BonusAward "${awardId}" is ${award.status}, not SUBMITTED`)
      }

      const updated = await tx.bonusAward.update({
        where: { id: awardId },
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
          action: 'BONUS_AWARD_REJECTED',
          actionCode: 'bonus_awards:approve',
          severity: 'WARNING',
          entityType: 'BonusAward',
          entityId: updated.id,
          description: `CEO rejected Sprint ${updated.sprintNumber} bonus award: ${rejectionReason.trim()}`,
          category: 'FINANCE',
          beforeState: { status: award.status },
          afterState: { status: updated.status, rejectionReason: rejectionReason.trim() },
          reason: rejectionReason.trim(),
        },
        tx,
      )

      return updated
    })
  }

  private async disburseAwardsInTx(
    tx: Prisma.TransactionClient,
    awards: any[],
    actor: AuthenticatedUser,
  ) {
    const disbursed: any[] = []
    const alreadyPaid: any[] = []
    const now = new Date()

    for (const award of awards) {
      if (award.status === 'PAID') {
        alreadyPaid.push(award)
        continue
      }
      if (award.status !== 'APPROVED') {
        throw new BadRequestException(
          `BonusAward "${award.id}" must be CEO-approved before disbursement (current: ${award.status})`,
        )
      }

      const amount = new Prisma.Decimal(award.tierAmount)
      if (amount.lessThanOrEqualTo(0)) {
        throw new BadRequestException(`BonusAward "${award.id}" has Tk 0.00 tier amount`)
      }

      // Re-check pool cap against all prior APPROVED/PAID awards (excluding this APPROVED one)
      // plus any prior batch disbursements updated to PAID earlier in this transaction.
      await this.assertWithinSquadPoolCap(tx, award.sprintNumber, award.teamId, amount, award.id)

      const squadAccount = await tx.financeAccount.findUnique({
        where: { teamId: award.teamId },
      })
      if (!squadAccount) {
        throw new NotFoundException(`Squad FinanceAccount for team "${award.teamId}" not found`)
      }

      const ledgerResult = await this.ledgerService.postTransaction(
        {
          idempotencyKey: `bonus_award:${award.id}`,
          sprintNumber: award.sprintNumber,
          type: 'BONUS_AWARD',
          sourceKind: 'FINANCE_ACCOUNT',
          sourceRefId: squadAccount.id,
          destKind: 'PERSONAL_WALLET',
          destRefId: award.employeeId,
          teamId: award.teamId,
          employeeId: award.employeeId,
          grossAmount: amount,
          reason: `Sprint ${award.sprintNumber} Performance Bonus (${new Prisma.Decimal(award.totalScore).toFixed(2)}/100)`,
          approvedById: award.approvedById,
          approvedAt: award.approvedAt,
          approvalRef: award.id,
          metadata: {
            bonusAwardId: award.id,
            totalScore: String(award.totalScore),
            criteriaScores: award.criteriaScores,
          },
        },
        actor,
        tx,
      )

      const updated = await tx.bonusAward.update({
        where: { id: award.id },
        data: {
          status: 'PAID',
          disbursedById: actor.id,
          disbursedAt: now,
          ledgerTransactionId: ledgerResult.transaction.id,
        },
      })
      disbursed.push(updated)
    }

    if (disbursed.length > 0) {
      await this.auditLogger?.log(
        {
          ...buildAuditActor(actor),
          action: 'BONUS_AWARDS_DISBURSED',
          actionCode: 'bonus_awards:disburse',
          severity: 'CRITICAL',
          entityType: 'BonusAward',
          entityId: disbursed.map((d) => d.id).join(','),
          description: `Disbursed ${disbursed.length} CEO-approved sprint bonus award(s)`,
          category: 'FINANCE',
          afterState: {
            disbursedIds: disbursed.map((d) => d.id),
            totalDisbursed: disbursed
              .reduce((acc, d) => acc.plus(new Prisma.Decimal(d.tierAmount)), new Prisma.Decimal(0))
              .toFixed(2),
          },
          mfaVerified: true,
        },
        tx,
      )
    }

    return { disbursed, alreadyPaid }
  }

  async disburseBonus(awardId: string, actor: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      const award = await tx.bonusAward.findUnique({ where: { id: awardId } })
      if (!award) {
        throw new NotFoundException(`BonusAward "${awardId}" not found`)
      }
      const { disbursed, alreadyPaid } = await this.disburseAwardsInTx(tx, [award], actor)
      if (alreadyPaid.length > 0) {
        return { award: alreadyPaid[0], idempotentHit: true }
      }
      return { award: disbursed[0], idempotentHit: false }
    })
  }

  async disburseSprintBonuses(
    dto: { sprintNumber: number; teamId?: string; awardIds?: string[] },
    actor: AuthenticatedUser,
  ) {
    if (!Number.isInteger(dto.sprintNumber) || dto.sprintNumber < 1) {
      throw new BadRequestException('sprintNumber must be a positive integer')
    }

    return this.prisma.$transaction(async (tx) => {
      const explicitSelection = Array.isArray(dto.awardIds) && dto.awardIds.length > 0
      const awards = await tx.bonusAward.findMany({
        where: {
          sprintNumber: dto.sprintNumber,
          ...(dto.teamId ? { teamId: dto.teamId } : {}),
          ...(explicitSelection ? { id: { in: dto.awardIds } } : { status: 'APPROVED' }),
        },
        orderBy: [{ teamId: 'asc' }, { createdAt: 'asc' }],
      })

      if (awards.length === 0) {
        throw new BadRequestException(
          `No approved bonus awards found for disbursement in Sprint ${dto.sprintNumber}`,
        )
      }

      const { disbursed, alreadyPaid } = await this.disburseAwardsInTx(tx, awards, actor)
      return {
        sprintNumber: dto.sprintNumber,
        disbursedCount: disbursed.length,
        disbursed,
        alreadyPaid,
      }
    })
  }

  async listBonuses(
    filters: { sprintNumber?: number; teamId?: string; status?: BonusAwardStatus },
    actor: AuthenticatedUser,
  ) {
    const roles = await resolveActorRoles(this.prisma, actor)
    const where: Prisma.BonusAwardWhereInput = {}
    if (filters.sprintNumber !== undefined) where.sprintNumber = filters.sprintNumber
    if (filters.status) where.status = filters.status

    if (hasGlobalFinanceAccess(actor, roles)) {
      if (filters.teamId) where.teamId = filters.teamId
    } else {
      const managedTeamIds = await findManagedTeamIds(this.prisma, actor.id)
      if (managedTeamIds.length > 0) {
        if (filters.teamId && !managedTeamIds.includes(filters.teamId)) {
          throw new ForbiddenException('PM may only view bonus awards within their own squad')
        }
        where.teamId = filters.teamId ?? { in: managedTeamIds }
      } else {
        where.employeeId = actor.id
      }
    }

    return this.prisma.bonusAward.findMany({
      where,
      orderBy: [{ sprintNumber: 'desc' }, { createdAt: 'desc' }],
    })
  }
}
