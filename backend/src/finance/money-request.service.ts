import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import { LedgerRefKind, MoneyRequestStatus, MoneyRequestType, Prisma } from '@prisma/client'
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
import { FinanceConfigService } from './finance-config.service'
import { notifyFinanceRoles } from './finance-notifications.helper'
import { LedgerService } from './ledger.service'

export interface CreateAddMoneyRequestInput {
  sprintNumber: number
  destAccountId: string
  amount: number | string
  reason: string
  purpose?: string
}

export interface CreateTransferRequestInput {
  sprintNumber: number
  sourceAccountId: string
  destKind: 'FINANCE_ACCOUNT' | 'PERSONAL_WALLET'
  destRefId: string
  amount: number | string
  reason: string
  purpose?: string
}

export interface SubmitSprintRankingInput {
  sprintNumber: number
  entries: Array<{ teamId: string; rank: number }>
}

export interface PoolShareAllocation {
  teamId: string
  rank: number
  weight: number
  amount: Prisma.Decimal
}

/**
 * Computes exact BDT (2 decimal place) largest-remainder allocations from integer
 * paise so the distributed total matches `poolTotalInput` with zero drift.
 */
export function computeLargestRemainderPoolShares(
  poolTotalInput: Prisma.Decimal | string | number,
  weights: number[],
  rankedTeamIds: string[],
): PoolShareAllocation[] {
  if (!Array.isArray(weights) || weights.length === 0 || weights.length !== rankedTeamIds.length) {
    throw new BadRequestException('weights and rankedTeamIds must have matching non-empty lengths')
  }
  const poolTotal = new Prisma.Decimal(poolTotalInput)
  if (!poolTotal.isFinite() || poolTotal.lessThanOrEqualTo(0)) {
    throw new BadRequestException('poolTotal must be greater than 0')
  }

  const totalPaisa = poolTotal.mul(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber()
  const weightSum = weights.reduce((acc, w) => acc + w, 0)
  if (weightSum <= 0) {
    throw new BadRequestException('rankWeights sum must be positive')
  }

  const parts = rankedTeamIds.map((teamId, idx) => {
    const weight = weights[idx]
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new BadRequestException(`Invalid weight at rank ${idx + 1}`)
    }
    const numerator = totalPaisa * weight
    const floorPaisa = Math.floor(numerator / weightSum)
    const remainderNumerator = numerator % weightSum
    return {
      teamId,
      rank: idx + 1,
      weight,
      floorPaisa,
      remainderNumerator,
    }
  })

  const allocatedPaisa = parts.reduce((acc, p) => acc + p.floorPaisa, 0)
  const leftover = totalPaisa - allocatedPaisa

  const sortedForExtra = [...parts].sort((a, b) => {
    if (b.remainderNumerator !== a.remainderNumerator) {
      return b.remainderNumerator - a.remainderNumerator
    }
    return a.rank - b.rank
  })

  const extraByTeam = new Map<string, number>()
  for (let i = 0; i < leftover; i += 1) {
    const target = sortedForExtra[i % sortedForExtra.length]
    extraByTeam.set(target.teamId, (extraByTeam.get(target.teamId) ?? 0) + 1)
  }

  return parts.map((p) => {
    const finalPaisa = p.floorPaisa + (extraByTeam.get(p.teamId) ?? 0)
    return {
      teamId: p.teamId,
      rank: p.rank,
      weight: p.weight,
      amount: new Prisma.Decimal(finalPaisa).div(100).toDecimalPlaces(2),
    }
  })
}

@Injectable()
export class MoneyRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
    private readonly configService: FinanceConfigService,
    @Optional() private readonly auditLogger?: AuditLoggerService,
  ) {}

  async createAddMoneyRequest(dto: CreateAddMoneyRequestInput, actor: AuthenticatedUser) {
    if (!Number.isInteger(dto.sprintNumber) || dto.sprintNumber < 1) {
      throw new BadRequestException('sprintNumber must be a positive integer')
    }
    const amount = new Prisma.Decimal(dto.amount)
    if (!amount.isFinite() || amount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('amount must be greater than 0')
    }
    if (!dto.reason || dto.reason.trim().length < 5) {
      throw new BadRequestException('reason (at least 5 characters) is required')
    }

    return this.prisma.$transaction(async (tx) => {
      await this.ledgerService.assertSprintNotLocked(tx, dto.sprintNumber, { actor })

      const destAccount = await tx.financeAccount.findUnique({
        where: { id: dto.destAccountId },
      })
      if (!destAccount || !destAccount.isActive) {
        throw new NotFoundException(`Destination account "${dto.destAccountId}" not found or inactive`)
      }

      const roles = await resolveActorRoles(tx, actor)
      const isGlobalCreator =
        isActorCeo(actor, roles) ||
        roles.has('cfo') ||
        Boolean(actor.permissions?.includes('money_requests:post'))

      if (!isGlobalCreator) {
        if (
          destAccount.type !== 'SQUAD' ||
          !destAccount.teamId ||
          !(await isActivePmOfTeam(tx, actor.id, destAccount.teamId))
        ) {
          throw new ForbiddenException(
            'PM may only submit Add Money requests for their own managed squad account',
          )
        }
      }

      const request = await tx.moneyRequest.create({
        data: {
          type: 'ADD_MONEY',
          sprintNumber: dto.sprintNumber,
          sourceKind: 'EXTERNAL',
          sourceRefId: 'EXTERNAL_FUNDING',
          destKind: 'FINANCE_ACCOUNT',
          destRefId: destAccount.id,
          teamId: destAccount.teamId,
          amount: amount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
          reason: dto.reason.trim(),
          purpose: dto.purpose?.trim() || null,
          status: 'SUBMITTED',
          requesterId: actor.id,
        },
      })

      await notifyFinanceRoles(tx, ['ceo'], {
        title: `Add Money Request (Tk ${amount.toFixed(2)})`,
        message: `Add Money request of Tk ${amount.toFixed(2)} to ${destAccount.name} awaiting CEO approval`,
        entityType: 'MoneyRequest',
        entityId: request.id,
        excludeEmployeeId: actor.id,
      })

      await this.auditLogger?.log(
        {
          ...buildAuditActor(actor),
          action: 'MONEY_REQUEST_ADD_CREATED',
          actionCode: 'money_requests:create',
          severity: 'INFO',
          entityType: 'MoneyRequest',
          entityId: request.id,
          description: `Created Add Money request of Tk ${amount.toFixed(2)} for ${destAccount.name}`,
          category: 'FINANCE',
          afterState: { status: request.status, amount: amount.toFixed(2), destAccountId: destAccount.id },
          reason: dto.reason.trim(),
        },
        tx,
      )

      return request
    })
  }

  async createTransferRequest(dto: CreateTransferRequestInput, actor: AuthenticatedUser) {
    if (!Number.isInteger(dto.sprintNumber) || dto.sprintNumber < 1) {
      throw new BadRequestException('sprintNumber must be a positive integer')
    }
    const amount = new Prisma.Decimal(dto.amount)
    if (!amount.isFinite() || amount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('amount must be greater than 0')
    }
    if (!dto.reason || dto.reason.trim().length < 5) {
      throw new BadRequestException('reason (at least 5 characters) is required')
    }
    if (dto.destKind === 'FINANCE_ACCOUNT' && dto.sourceAccountId === dto.destRefId) {
      throw new BadRequestException('Source and destination accounts cannot be identical')
    }

    return this.prisma.$transaction(async (tx) => {
      await this.ledgerService.assertSprintNotLocked(tx, dto.sprintNumber, { actor })

      const sourceAccount = await tx.financeAccount.findUnique({
        where: { id: dto.sourceAccountId },
      })
      if (!sourceAccount || !sourceAccount.isActive) {
        throw new NotFoundException(`Source account "${dto.sourceAccountId}" not found or inactive`)
      }

      let destTeamId: string | null = sourceAccount.teamId
      if (dto.destKind === 'FINANCE_ACCOUNT') {
        const destAccount = await tx.financeAccount.findUnique({
          where: { id: dto.destRefId },
        })
        if (!destAccount || !destAccount.isActive) {
          throw new NotFoundException(
            `Destination account "${dto.destRefId}" not found or inactive`,
          )
        }
        if (
          sourceAccount.type === 'COMPANY_FUND' &&
          destAccount.type === 'SQUAD' &&
          dto.purpose &&
          /PAYROLL|BONUS/i.test(dto.purpose)
        ) {
          throw new BadRequestException(
            'Transfers from Company Fund to Squad Accounts for payroll or bonuses are prohibited',
          )
        }
        destTeamId = destAccount.teamId ?? sourceAccount.teamId
      } else {
        const emp = await tx.employee.findUnique({
          where: { id: dto.destRefId },
          select: { id: true, status: true },
        })
        if (!emp || emp.status !== 'active') {
          throw new NotFoundException(`Destination employee "${dto.destRefId}" not found or inactive`)
        }
      }

      const request = await tx.moneyRequest.create({
        data: {
          type: 'TRANSFER',
          sprintNumber: dto.sprintNumber,
          sourceKind: 'FINANCE_ACCOUNT',
          sourceRefId: sourceAccount.id,
          destKind: dto.destKind as LedgerRefKind,
          destRefId: dto.destRefId,
          teamId: destTeamId,
          amount: amount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
          reason: dto.reason.trim(),
          purpose: dto.purpose?.trim() || null,
          status: 'SUBMITTED',
          requesterId: actor.id,
        },
      })

      await notifyFinanceRoles(tx, ['ceo'], {
        title: `Transfer Request (Tk ${amount.toFixed(2)})`,
        message: `Transfer request of Tk ${amount.toFixed(2)} from ${sourceAccount.name} awaiting CEO approval`,
        entityType: 'MoneyRequest',
        entityId: request.id,
        excludeEmployeeId: actor.id,
      })

      await this.auditLogger?.log(
        {
          ...buildAuditActor(actor),
          action: 'MONEY_REQUEST_TRANSFER_CREATED',
          actionCode: 'money_requests:create',
          severity: 'INFO',
          entityType: 'MoneyRequest',
          entityId: request.id,
          description: `Created Transfer request of Tk ${amount.toFixed(2)} from ${sourceAccount.name}`,
          category: 'FINANCE',
          afterState: {
            status: request.status,
            amount: amount.toFixed(2),
            sourceAccountId: sourceAccount.id,
            destKind: dto.destKind,
            destRefId: dto.destRefId,
            purpose: dto.purpose ?? null,
          },
          reason: dto.reason.trim(),
        },
        tx,
      )

      return request
    })
  }

  async approveMoneyRequest(requestId: string, actor: AuthenticatedUser) {
    const roles = await resolveActorRoles(this.prisma, actor)
    if (!isActorCeo(actor, roles)) {
      throw new ForbiddenException('Only the CEO may approve Add Money or Transfer requests')
    }

    return this.prisma.$transaction(async (tx) => {
      const req = await tx.moneyRequest.findUnique({ where: { id: requestId } })
      if (!req) {
        throw new NotFoundException(`MoneyRequest "${requestId}" not found`)
      }
      if (req.requesterId === actor.id) {
        throw new ForbiddenException('Requester cannot approve their own money request')
      }
      if (req.status !== 'SUBMITTED') {
        throw new BadRequestException(`MoneyRequest "${requestId}" has already been ${req.status}`)
      }

      const updated = await tx.moneyRequest.update({
        where: { id: requestId },
        data: {
          status: 'APPROVED',
          approvedById: actor.id,
          approvedAt: new Date(),
        },
      })

      await this.auditLogger?.log(
        {
          ...buildAuditActor(actor, 'CEO'),
          action: 'MONEY_REQUEST_APPROVED',
          actionCode: 'money_requests:approve',
          severity: 'CRITICAL',
          entityType: 'MoneyRequest',
          entityId: updated.id,
          description: `CEO approved ${updated.type} request of Tk ${new Prisma.Decimal(updated.amount).toFixed(2)}`,
          category: 'FINANCE',
          beforeState: { status: req.status },
          afterState: { status: updated.status },
          mfaVerified: true,
        },
        tx,
      )

      return updated
    })
  }

  async rejectMoneyRequest(
    requestId: string,
    rejectionReason: string,
    actor: AuthenticatedUser,
  ) {
    const roles = await resolveActorRoles(this.prisma, actor)
    if (!isActorCeo(actor, roles)) {
      throw new ForbiddenException('Only the CEO may reject Add Money or Transfer requests')
    }
    if (!rejectionReason || rejectionReason.trim().length < 5) {
      throw new BadRequestException('rejectionReason (at least 5 characters) is required')
    }

    return this.prisma.$transaction(async (tx) => {
      const req = await tx.moneyRequest.findUnique({ where: { id: requestId } })
      if (!req) {
        throw new NotFoundException(`MoneyRequest "${requestId}" not found`)
      }
      if (req.requesterId === actor.id) {
        throw new ForbiddenException('Requester cannot adjudicate their own money request')
      }
      if (req.status !== 'SUBMITTED') {
        throw new BadRequestException(`MoneyRequest "${requestId}" has already been ${req.status}`)
      }

      const updated = await tx.moneyRequest.update({
        where: { id: requestId },
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
          action: 'MONEY_REQUEST_REJECTED',
          actionCode: 'money_requests:approve',
          severity: 'WARNING',
          entityType: 'MoneyRequest',
          entityId: updated.id,
          description: `CEO rejected ${updated.type} request: ${rejectionReason.trim()}`,
          category: 'FINANCE',
          beforeState: { status: req.status },
          afterState: { status: updated.status, rejectionReason: rejectionReason.trim() },
          reason: rejectionReason.trim(),
        },
        tx,
      )

      return updated
    })
  }

  async postMoneyRequest(requestId: string, actor: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      const req = await tx.moneyRequest.findUnique({ where: { id: requestId } })
      if (!req) {
        throw new NotFoundException(`MoneyRequest "${requestId}" not found`)
      }

      if (req.status === 'PAID' && req.ledgerTransactionId) {
        const existingTx = await tx.ledgerTransaction.findUnique({
          where: { id: req.ledgerTransactionId },
        })
        return { request: req, transaction: existingTx, idempotentHit: true }
      }

      if (req.status !== 'APPROVED') {
        throw new BadRequestException(
          `MoneyRequest "${requestId}" must be CEO-approved before posting (current status: ${req.status})`,
        )
      }

      const ledgerResult = await this.ledgerService.postTransaction(
        {
          idempotencyKey: `money_req:${req.id}`,
          sprintNumber: req.sprintNumber,
          type: req.type,
          sourceKind: req.sourceKind,
          sourceRefId: req.sourceRefId,
          destKind: req.destKind,
          destRefId: req.destRefId,
          grossAmount: req.amount,
          teamId: req.teamId,
          employeeId: req.destKind === 'PERSONAL_WALLET' ? req.destRefId : null,
          reason: req.reason,
          approvedById: req.approvedById,
          approvedAt: req.approvedAt,
          approvalRef: req.id,
          metadata: {
            moneyRequestId: req.id,
            purpose: req.purpose ?? null,
          },
        },
        actor,
        tx,
      )

      const updated = await tx.moneyRequest.update({
        where: { id: req.id },
        data: {
          status: 'PAID',
          postedById: actor.id,
          postedAt: new Date(),
          ledgerTransactionId: ledgerResult.transaction.id,
          idempotencyKey: `money_req:${req.id}`,
        },
      })

      await this.auditLogger?.log(
        {
          ...buildAuditActor(actor),
          action: 'MONEY_REQUEST_POSTED',
          actionCode: 'money_requests:post',
          severity: 'INFO',
          entityType: 'MoneyRequest',
          entityId: updated.id,
          description: `Posted ${updated.type} request of Tk ${new Prisma.Decimal(updated.amount).toFixed(2)}`,
          category: 'FINANCE',
          beforeState: { status: req.status },
          afterState: { status: updated.status, ledgerTransactionId: ledgerResult.transaction.id },
          mfaVerified: true,
        },
        tx,
      )

      return { request: updated, transaction: ledgerResult.transaction, idempotentHit: false }
    })
  }

  async submitSprintRanking(dto: SubmitSprintRankingInput, actor: AuthenticatedUser) {
    if (!Number.isInteger(dto.sprintNumber) || dto.sprintNumber < 1) {
      throw new BadRequestException('sprintNumber must be a positive integer')
    }

    const roles = await resolveActorRoles(this.prisma, actor)
    const isAllowed = roles.has('chro') || roles.has('cpo') || isActorCeo(actor, roles)
    if (!isAllowed) {
      throw new ForbiddenException('Only CHRO, CPO, or CEO may submit sprint rankings')
    }

    const config = await this.configService.getConfig()
    const weights = Array.isArray(config.rankWeights)
      ? (config.rankWeights as number[])
      : [6, 5, 4, 3, 2, 1]

    if (!Array.isArray(dto.entries) || dto.entries.length !== weights.length) {
      throw new BadRequestException(
        `Sprint ranking must rank exactly ${weights.length} squads`,
      )
    }

    const ranks = dto.entries.map((e) => e.rank)
    const teamIds = dto.entries.map((e) => e.teamId)
    const expectedRanks = new Set(Array.from({ length: weights.length }, (_, i) => i + 1))

    if (new Set(teamIds).size !== weights.length) {
      throw new BadRequestException('Duplicate teamId in sprint ranking entries')
    }
    if (
      new Set(ranks).size !== weights.length ||
      ranks.some((r) => !Number.isInteger(r) || !expectedRanks.has(r))
    ) {
      throw new BadRequestException(`Ranks must be unique integers from 1 to ${weights.length}`)
    }

    const sortedEntries = [...dto.entries].sort((a, b) => a.rank - b.rank)

    return this.prisma.$transaction(async (tx) => {
      await this.ledgerService.assertSprintNotLocked(tx, dto.sprintNumber, { actor })

      const existing = await tx.sprintRanking.findUnique({
        where: { sprintNumber: dto.sprintNumber },
      })
      if (existing && (existing.status === 'APPROVED' || existing.poolPostedAt)) {
        throw new BadRequestException(
          `Sprint ${dto.sprintNumber} ranking is already ${existing.status} and cannot be overwritten`,
        )
      }

      const squadAccounts = await tx.financeAccount.findMany({
        where: { type: 'SQUAD', teamId: { in: teamIds }, isActive: true },
        select: { teamId: true },
      })
      const validTeamSet = new Set(squadAccounts.map((a) => a.teamId))
      for (const tid of teamIds) {
        if (!validTeamSet.has(tid)) {
          throw new BadRequestException(`Active squad finance account not found for team "${tid}"`)
        }
      }

      const ranking = await tx.sprintRanking.upsert({
        where: { sprintNumber: dto.sprintNumber },
        update: {
          entries: sortedEntries as unknown as Prisma.InputJsonValue,
          status: 'SUBMITTED',
          submittedById: actor.id,
          approvedById: null,
          approvedAt: null,
          rejectionReason: null,
        },
        create: {
          sprintNumber: dto.sprintNumber,
          entries: sortedEntries as unknown as Prisma.InputJsonValue,
          status: 'SUBMITTED',
          submittedById: actor.id,
        },
      })

      await notifyFinanceRoles(tx, ['ceo'], {
        title: `Sprint ${dto.sprintNumber} Ranking Submitted`,
        message: `Sprint ${dto.sprintNumber} squad rankings submitted for CEO approval before pool credit distribution`,
        entityType: 'SprintRanking',
        entityId: ranking.id,
        excludeEmployeeId: actor.id,
      })

      await this.auditLogger?.log(
        {
          ...buildAuditActor(actor),
          action: 'SPRINT_RANKING_SUBMITTED',
          actionCode: 'money_requests:create',
          severity: 'INFO',
          entityType: 'SprintRanking',
          entityId: ranking.id,
          description: `Submitted Sprint ${dto.sprintNumber} squad ranking`,
          category: 'FINANCE',
          afterState: { sprintNumber: dto.sprintNumber, entries: sortedEntries },
        },
        tx,
      )

      return ranking
    })
  }

  async approveSprintRanking(sprintNumber: number, actor: AuthenticatedUser) {
    const roles = await resolveActorRoles(this.prisma, actor)
    if (!isActorCeo(actor, roles)) {
      throw new ForbiddenException('Only the CEO may approve sprint rankings')
    }

    return this.prisma.$transaction(async (tx) => {
      const ranking = await tx.sprintRanking.findUnique({ where: { sprintNumber } })
      if (!ranking) {
        throw new NotFoundException(`SprintRanking for sprint ${sprintNumber} not found`)
      }
      if (ranking.submittedById === actor.id) {
        throw new ForbiddenException('Submitter cannot approve their own sprint ranking')
      }
      if (ranking.status !== 'SUBMITTED') {
        throw new BadRequestException(
          `SprintRanking for sprint ${sprintNumber} is ${ranking.status}, not SUBMITTED`,
        )
      }

      const updated = await tx.sprintRanking.update({
        where: { sprintNumber },
        data: {
          status: 'APPROVED',
          approvedById: actor.id,
          approvedAt: new Date(),
        },
      })

      await this.auditLogger?.log(
        {
          ...buildAuditActor(actor, 'CEO'),
          action: 'SPRINT_RANKING_APPROVED',
          actionCode: 'money_requests:approve',
          severity: 'CRITICAL',
          entityType: 'SprintRanking',
          entityId: updated.id,
          description: `CEO approved Sprint ${sprintNumber} squad rankings`,
          category: 'FINANCE',
          beforeState: { status: ranking.status },
          afterState: { status: updated.status },
          mfaVerified: true,
        },
        tx,
      )

      return updated
    })
  }

  async rejectSprintRanking(
    sprintNumber: number,
    rejectionReason: string,
    actor: AuthenticatedUser,
  ) {
    const roles = await resolveActorRoles(this.prisma, actor)
    if (!isActorCeo(actor, roles)) {
      throw new ForbiddenException('Only the CEO may reject sprint rankings')
    }
    if (!rejectionReason || rejectionReason.trim().length < 5) {
      throw new BadRequestException('rejectionReason (at least 5 characters) is required')
    }

    return this.prisma.$transaction(async (tx) => {
      const ranking = await tx.sprintRanking.findUnique({ where: { sprintNumber } })
      if (!ranking) {
        throw new NotFoundException(`SprintRanking for sprint ${sprintNumber} not found`)
      }
      if (ranking.submittedById === actor.id) {
        throw new ForbiddenException('Submitter cannot reject their own sprint ranking')
      }
      if (ranking.status !== 'SUBMITTED') {
        throw new BadRequestException(
          `SprintRanking for sprint ${sprintNumber} is ${ranking.status}, not SUBMITTED`,
        )
      }

      const updated = await tx.sprintRanking.update({
        where: { sprintNumber },
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
          action: 'SPRINT_RANKING_REJECTED',
          actionCode: 'money_requests:approve',
          severity: 'WARNING',
          entityType: 'SprintRanking',
          entityId: updated.id,
          description: `CEO rejected Sprint ${sprintNumber} rankings: ${rejectionReason.trim()}`,
          category: 'FINANCE',
          beforeState: { status: ranking.status },
          afterState: { status: updated.status, rejectionReason: rejectionReason.trim() },
          reason: rejectionReason.trim(),
        },
        tx,
      )

      return updated
    })
  }

  async postSprintPoolCredits(sprintNumber: number, actor: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      const ranking = await tx.sprintRanking.findUnique({ where: { sprintNumber } })
      if (!ranking) {
        throw new NotFoundException(`SprintRanking for sprint ${sprintNumber} not found`)
      }
      if (ranking.poolPostedAt) {
        const existingPoolCredits = await tx.moneyRequest.findMany({
          where: { type: 'POOL_CREDIT', sprintNumber },
          orderBy: { createdAt: 'asc' },
        })
        return { ranking, poolCredits: existingPoolCredits, idempotentHit: true }
      }
      if (ranking.status !== 'APPROVED') {
        throw new BadRequestException(
          `Sprint ${sprintNumber} ranking must be CEO-approved before posting pool credits`,
        )
      }

      const config = await this.configService.getConfig(tx)
      const weights = Array.isArray(config.rankWeights)
        ? (config.rankWeights as number[])
        : [6, 5, 4, 3, 2, 1]
      const poolTotal = new Prisma.Decimal(config.sprintPoolTotalBDT)

      const entries = (ranking.entries as Array<{ teamId: string; rank: number }>)
        .slice()
        .sort((a, b) => a.rank - b.rank)
      const shares = computeLargestRemainderPoolShares(
        poolTotal,
        weights,
        entries.map((e) => e.teamId),
      )

      const companyFund = await tx.financeAccount.findFirst({
        where: { type: 'COMPANY_FUND' },
      })
      if (!companyFund) {
        throw new NotFoundException('COMPANY_FUND finance account not found')
      }
      if (new Prisma.Decimal(companyFund.balance).lessThan(poolTotal)) {
        throw new BadRequestException(
          `Insufficient balance in ${companyFund.name} for sprint pool credits (available Tk ${new Prisma.Decimal(companyFund.balance).toFixed(2)}, required Tk ${poolTotal.toFixed(2)})`,
        )
      }

      const squadAccounts = await tx.financeAccount.findMany({
        where: { type: 'SQUAD', teamId: { in: shares.map((s) => s.teamId) } },
      })
      const accountByTeam = new Map(squadAccounts.map((a) => [a.teamId, a]))
      const now = new Date()
      const postedRequests: any[] = []

      for (const share of shares) {
        const squadAccount = accountByTeam.get(share.teamId)
        if (!squadAccount) {
          throw new NotFoundException(`Squad account for team "${share.teamId}" not found`)
        }

        const reason = `Sprint ${sprintNumber} Pool Credit (Rank #${share.rank}, weight ${share.weight})`
        const req = await tx.moneyRequest.create({
          data: {
            type: 'POOL_CREDIT',
            sprintNumber,
            sourceKind: 'FINANCE_ACCOUNT',
            sourceRefId: companyFund.id,
            destKind: 'FINANCE_ACCOUNT',
            destRefId: squadAccount.id,
            teamId: share.teamId,
            amount: share.amount,
            reason,
            purpose: 'SPRINT_POOL_CREDIT',
            status: 'PAID',
            requesterId: ranking.submittedById,
            approvedById: ranking.approvedById,
            approvedAt: ranking.approvedAt,
            postedById: actor.id,
            postedAt: now,
            idempotencyKey: `pool_credit_req:${sprintNumber}:${share.teamId}`,
          },
        })

        const ledgerResult = await this.ledgerService.postTransaction(
          {
            idempotencyKey: `pool_credit:${sprintNumber}:${share.teamId}`,
            sprintNumber,
            type: 'POOL_CREDIT',
            sourceKind: 'FINANCE_ACCOUNT',
            sourceRefId: companyFund.id,
            destKind: 'FINANCE_ACCOUNT',
            destRefId: squadAccount.id,
            grossAmount: share.amount,
            teamId: share.teamId,
            reason,
            approvedById: ranking.approvedById,
            approvedAt: ranking.approvedAt,
            approvalRef: req.id,
            metadata: {
              moneyRequestId: req.id,
              rank: share.rank,
              weight: share.weight,
              sprintPoolTotal: poolTotal.toFixed(2),
            },
          },
          actor,
          tx,
        )

        const updatedReq = await tx.moneyRequest.update({
          where: { id: req.id },
          data: { ledgerTransactionId: ledgerResult.transaction.id },
        })
        postedRequests.push(updatedReq)
      }

      const updatedRanking = await tx.sprintRanking.update({
        where: { sprintNumber },
        data: {
          poolPostedAt: now,
          poolPostedById: actor.id,
        },
      })

      await this.auditLogger?.log(
        {
          ...buildAuditActor(actor),
          action: 'SPRINT_POOL_CREDITS_POSTED',
          actionCode: 'money_requests:post',
          severity: 'CRITICAL',
          entityType: 'SprintRanking',
          entityId: updatedRanking.id,
          description: `Posted Sprint ${sprintNumber} pool credits totaling Tk ${poolTotal.toFixed(2)} across ${shares.length} squads`,
          category: 'FINANCE',
          afterState: {
            sprintNumber,
            totalDistributed: poolTotal.toFixed(2),
            shares: shares.map((s) => ({
              teamId: s.teamId,
              rank: s.rank,
              amount: s.amount.toFixed(2),
            })),
          },
          mfaVerified: true,
        },
        tx,
      )

      return { ranking: updatedRanking, poolCredits: postedRequests, idempotentHit: false }
    })
  }

  async listMoneyRequests(
    filters: {
      type?: MoneyRequestType
      status?: MoneyRequestStatus
      sprintNumber?: number
      teamId?: string
    },
    actor: AuthenticatedUser,
  ) {
    const roles = await resolveActorRoles(this.prisma, actor)
    const where: Prisma.MoneyRequestWhereInput = {}
    if (filters.type) where.type = filters.type
    if (filters.status) where.status = filters.status
    if (filters.sprintNumber !== undefined) where.sprintNumber = filters.sprintNumber

    if (hasGlobalFinanceAccess(actor, roles)) {
      if (filters.teamId) where.teamId = filters.teamId
    } else {
      const managedTeamIds = await findManagedTeamIds(this.prisma, actor.id)
      where.OR = [
        { requesterId: actor.id },
        ...(managedTeamIds.length > 0 ? [{ teamId: { in: managedTeamIds } }] : []),
      ]
      if (filters.teamId) {
        if (!managedTeamIds.includes(filters.teamId)) {
          throw new ForbiddenException('Access denied for other squad money requests')
        }
        where.teamId = filters.teamId
      }
    }

    return this.prisma.moneyRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })
  }

  async listSprintRankings(sprintNumber?: number) {
    return this.prisma.sprintRanking.findMany({
      where: sprintNumber !== undefined ? { sprintNumber } : undefined,
      orderBy: { sprintNumber: 'desc' },
    })
  }
}
