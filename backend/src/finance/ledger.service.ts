import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import { LedgerRefKind, LedgerTxType, Prisma } from '@prisma/client'
import { randomBytes } from 'crypto'
import { PrismaService } from '../common/prisma.service'
import { AuditLoggerService } from '../common/audit-logger.service'
import { AuthenticatedUser } from '../common/auth-user.interface'
import {
  buildAuditActor,
  findManagedTeamIds,
  findMemberTeamIds,
  hasGlobalFinanceAccess,
  isActorCeo,
  resolveActorRoles,
} from './finance-actor.util'
import { notifyFinanceRoles } from './finance-notifications.helper'

export interface PostLedgerTransactionInput {
  idempotencyKey: string
  sprintNumber: number
  type: LedgerTxType
  sourceKind: LedgerRefKind
  sourceRefId: string
  destKind: LedgerRefKind
  destRefId: string
  grossAmount: Prisma.Decimal | string | number
  deductions?: Prisma.Decimal | string | number
  teamId?: string | null
  employeeId?: string | null
  reason: string
  approvedById?: string | null
  approvedAt?: Date | null
  approvalRef?: string | null
  reversalOfId?: string | null
  metadata?: Record<string, any> | null
  allowClosedSprintCeoOverride?: boolean
  financialTxTypeOverride?: string
}

export interface LedgerFilterQuery {
  sprintNumber?: number
  type?: LedgerTxType
  teamId?: string
  employeeId?: string
  accountId?: string
  fromDate?: Date
  toDate?: Date
  search?: string
  limit?: number
  offset?: number
}

const LEDGER_MIRROR_TYPE_MAP: Record<LedgerTxType, string> = {
  ADD_MONEY: 'cfo_add_money',
  POOL_CREDIT: 'cfo_pool_credit',
  TRANSFER: 'cfo_transfer',
  EXECUTIVE_PAYROLL: 'cfo_executive_payroll',
  SQUAD_PAYROLL: 'cfo_squad_payroll',
  BONUS_AWARD: 'cfo_bonus_award',
  PENALTY_SPLIT: 'cfo_penalty_split',
  PENALTY_RESIDUAL: 'cfo_penalty_residual',
  CFO_COMMISSION: 'cfo_commission',
  REVERSAL: 'reversal',
}

function escapeCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value)
  // Prefix potential Excel/Sheets formula triggers before RFC-4180 quoting.
  const neutralized = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
  if (/[",\r\n]/.test(neutralized)) {
    return `"${neutralized.replace(/"/g, '""')}"`
  }
  return neutralized
}

@Injectable()
export class LedgerService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly auditLogger?: AuditLoggerService,
  ) {}

  async assertSprintNotLocked(
    tx: Prisma.TransactionClient,
    sprintNumber: number,
    options?: { allowCeoOverride?: boolean; actor?: AuthenticatedUser },
  ) {
    if (!tx.sprintLock || typeof tx.sprintLock.findUnique !== 'function') {
      return
    }
    const lock = await tx.sprintLock.findUnique({ where: { sprintNumber } })
    if (!lock || lock.status !== 'LOCKED') {
      return
    }
    if (options?.allowCeoOverride && options.actor) {
      const roles = await resolveActorRoles(tx, options.actor)
      if (isActorCeo(options.actor, roles)) {
        return
      }
    }
    throw new ForbiddenException(
      `Sprint ${sprintNumber} is financially locked; only the CEO may post a reversal override`,
    )
  }

  async postTransaction(
    input: PostLedgerTransactionInput,
    actor: AuthenticatedUser,
    externalTx?: Prisma.TransactionClient,
  ) {
    if (!input.idempotencyKey?.trim()) {
      throw new BadRequestException('idempotencyKey is required for ledger posting')
    }
    if (!Number.isInteger(input.sprintNumber) || input.sprintNumber < 1) {
      throw new BadRequestException('sprintNumber must be a positive integer')
    }
    if (!input.reason || input.reason.trim().length < 3) {
      throw new BadRequestException('Transaction reason (at least 3 characters) is required')
    }
    if (input.sourceKind === input.destKind && input.sourceRefId === input.destRefId) {
      throw new BadRequestException('Source and destination accounts cannot be identical')
    }

    const grossAmount = new Prisma.Decimal(input.grossAmount)
    const deductions = new Prisma.Decimal(input.deductions ?? 0)
    const netAmount = grossAmount.minus(deductions)

    if (!grossAmount.isFinite() || grossAmount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('grossAmount must be greater than 0')
    }
    if (!deductions.isFinite() || deductions.lessThan(0)) {
      throw new BadRequestException('deductions cannot be negative')
    }
    if (!netAmount.isFinite() || netAmount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('netAmount must be greater than 0')
    }

    const executeInTx = async (tx: Prisma.TransactionClient) => {
      const existing = await tx.ledgerTransaction.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      })
      if (existing) {
        return { transaction: existing, idempotentHit: true }
      }

      await this.assertSprintNotLocked(tx, input.sprintNumber, {
        allowCeoOverride: input.allowClosedSprintCeoOverride,
        actor,
      })

      const accountIds = Array.from(
        new Set(
          [
            input.sourceKind === 'FINANCE_ACCOUNT' ? input.sourceRefId : null,
            input.destKind === 'FINANCE_ACCOUNT' ? input.destRefId : null,
          ].filter((id): id is string => Boolean(id)),
        ),
      ).sort()

      const lockedAccountsById = new Map<
        string,
        { id: string; balance: Prisma.Decimal; type: string; teamId: string | null; isActive: boolean; name: string }
      >()

      if (accountIds.length > 0) {
        if (typeof (tx as any).$queryRaw === 'function') {
          const lockedRows = await (tx as any).$queryRaw`
            SELECT "id", "balance", "type", "teamId", "isActive", "name"
            FROM "finance_accounts"
            WHERE "id" IN (${Prisma.join(accountIds)})
            ORDER BY "id"
            FOR UPDATE
          `
          if (Array.isArray(lockedRows)) {
            for (const row of lockedRows) {
              if (row?.id) {
                lockedAccountsById.set(row.id, {
                  id: row.id,
                  balance: new Prisma.Decimal(row.balance),
                  type: row.type,
                  teamId: row.teamId ?? null,
                  isActive: row.isActive ?? true,
                  name: row.name ?? row.id,
                })
              }
            }
          }
        }

        for (const accId of accountIds) {
          if (!lockedAccountsById.has(accId)) {
            const acc = await tx.financeAccount.findUnique({ where: { id: accId } })
            if (!acc) {
              throw new NotFoundException(`FinanceAccount "${accId}" not found`)
            }
            lockedAccountsById.set(acc.id, {
              id: acc.id,
              balance: new Prisma.Decimal(acc.balance),
              type: acc.type,
              teamId: acc.teamId ?? null,
              isActive: acc.isActive,
              name: acc.name,
            })
          }
        }
      }

      const sourceAccount =
        input.sourceKind === 'FINANCE_ACCOUNT' ? lockedAccountsById.get(input.sourceRefId) : undefined
      const destAccount =
        input.destKind === 'FINANCE_ACCOUNT' ? lockedAccountsById.get(input.destRefId) : undefined

      if (sourceAccount && !sourceAccount.isActive) {
        throw new BadRequestException(`Source account "${sourceAccount.name}" is inactive`)
      }
      if (destAccount && !destAccount.isActive) {
        throw new BadRequestException(`Destination account "${destAccount.name}" is inactive`)
      }

      // Blocked path enforcement: Company Fund cannot directly pay squad payroll or bonuses.
      if (
        sourceAccount?.type === 'COMPANY_FUND' &&
        (input.type === 'SQUAD_PAYROLL' ||
          input.type === 'BONUS_AWARD' ||
          (destAccount?.type === 'SQUAD' &&
            input.type === 'TRANSFER' &&
            typeof input.metadata?.purpose === 'string' &&
            /PAYROLL|BONUS/i.test(input.metadata.purpose)))
      ) {
        throw new BadRequestException(
          'Company Fund cannot directly pay squad payroll or bonuses',
        )
      }

      const walletEmployeeIds = Array.from(
        new Set(
          [
            input.sourceKind === 'PERSONAL_WALLET' ? input.sourceRefId : null,
            input.destKind === 'PERSONAL_WALLET' ? input.destRefId : null,
          ].filter((id): id is string => Boolean(id)),
        ),
      ).sort()

      const walletsByEmpId = new Map<
        string,
        {
          id: string
          employeeId: string
          balance: Prisma.Decimal
          totalEarnedToDate: Prisma.Decimal
          sprintBonusEarned: Prisma.Decimal
          totalPenalties: Prisma.Decimal
          totalSpendings: Prisma.Decimal
        }
      >()

      if (walletEmployeeIds.length > 0) {
        for (const empId of walletEmployeeIds) {
          await tx.employeeWallet.upsert({
            where: { employeeId: empId },
            update: {},
            create: {
              employeeId: empId,
              balance: new Prisma.Decimal('0.00'),
              currency: 'BDT',
              currencySymbol: '৳',
            },
          })
        }

        if (typeof (tx as any).$queryRaw === 'function') {
          await (tx as any).$queryRaw`
            SELECT "id", "employeeId", "balance"
            FROM "employee_wallets"
            WHERE "employeeId" IN (${Prisma.join(walletEmployeeIds)})
            ORDER BY "id"
            FOR UPDATE
          `
        }

        for (const empId of walletEmployeeIds) {
          const w = await tx.employeeWallet.findUnique({ where: { employeeId: empId } })
          if (!w) {
            throw new NotFoundException(`Personal wallet for employee "${empId}" not found`)
          }
          walletsByEmpId.set(empId, {
            id: w.id,
            employeeId: w.employeeId,
            balance: new Prisma.Decimal(w.balance),
            totalEarnedToDate: new Prisma.Decimal(w.totalEarnedToDate ?? 0),
            sprintBonusEarned: new Prisma.Decimal(w.sprintBonusEarned ?? 0),
            totalPenalties: new Prisma.Decimal(w.totalPenalties ?? 0),
            totalSpendings: new Prisma.Decimal(w.totalSpendings ?? 0),
          })
        }
      }

      const sourceWallet =
        input.sourceKind === 'PERSONAL_WALLET' ? walletsByEmpId.get(input.sourceRefId) : undefined
      const destWallet =
        input.destKind === 'PERSONAL_WALLET' ? walletsByEmpId.get(input.destRefId) : undefined

      // Enforce non-negative balance invariants on source accounts/wallets.
      let sourceBalanceBefore: string | null = null
      let sourceBalanceAfter: string | null = null
      if (sourceAccount) {
        if (sourceAccount.balance.lessThan(netAmount)) {
          throw new BadRequestException(
            `Insufficient balance in ${sourceAccount.name} (available Tk ${sourceAccount.balance.toFixed(2)}, required Tk ${netAmount.toFixed(2)})`,
          )
        }
        const nextSource = sourceAccount.balance.minus(netAmount)
        sourceBalanceBefore = sourceAccount.balance.toFixed(2)
        sourceBalanceAfter = nextSource.toFixed(2)
        await tx.financeAccount.update({
          where: { id: sourceAccount.id },
          data: { balance: nextSource },
        })
      } else if (sourceWallet) {
        if (sourceWallet.balance.lessThan(netAmount)) {
          throw new BadRequestException(
            `Insufficient personal wallet balance (available Tk ${sourceWallet.balance.toFixed(2)}, required Tk ${netAmount.toFixed(2)})`,
          )
        }
        const nextSource = sourceWallet.balance.minus(netAmount)
        sourceBalanceBefore = sourceWallet.balance.toFixed(2)
        sourceBalanceAfter = nextSource.toFixed(2)

        const walletUpdate: Prisma.EmployeeWalletUpdateInput = { balance: nextSource }
        if (input.type === 'REVERSAL') {
          const reversedType = String(input.metadata?.reversedType ?? '')
          const nextEarned = Prisma.Decimal.max(
            new Prisma.Decimal(0),
            sourceWallet.totalEarnedToDate.minus(netAmount),
          )
          walletUpdate.totalEarnedToDate = nextEarned
          if (reversedType === 'BONUS_AWARD') {
            walletUpdate.sprintBonusEarned = Prisma.Decimal.max(
              new Prisma.Decimal(0),
              sourceWallet.sprintBonusEarned.minus(netAmount),
            )
          }
        } else {
          walletUpdate.totalSpendings = sourceWallet.totalSpendings.plus(netAmount)
        }

        await tx.employeeWallet.update({
          where: { id: sourceWallet.id },
          data: walletUpdate,
        })
      }

      let destBalanceBefore: string | null = null
      let destBalanceAfter: string | null = null
      if (destAccount) {
        const nextDest = destAccount.balance.plus(netAmount)
        destBalanceBefore = destAccount.balance.toFixed(2)
        destBalanceAfter = nextDest.toFixed(2)
        await tx.financeAccount.update({
          where: { id: destAccount.id },
          data: { balance: nextDest },
        })
      } else if (destWallet) {
        const nextDest = destWallet.balance.plus(netAmount)
        destBalanceBefore = destWallet.balance.toFixed(2)
        destBalanceAfter = nextDest.toFixed(2)
        const now = new Date()

        const walletUpdate: Prisma.EmployeeWalletUpdateInput = {
          balance: nextDest,
          lastPayoutDate: now,
        }
        if (input.type === 'REVERSAL') {
          walletUpdate.totalSpendings = Prisma.Decimal.max(
            new Prisma.Decimal(0),
            destWallet.totalSpendings.minus(netAmount),
          )
        } else {
          walletUpdate.totalEarnedToDate = destWallet.totalEarnedToDate.plus(netAmount)
          if (input.type === 'BONUS_AWARD') {
            walletUpdate.sprintBonusEarned = destWallet.sprintBonusEarned.plus(netAmount)
          }
        }

        await tx.employeeWallet.update({
          where: { id: destWallet.id },
          data: walletUpdate,
        })
      }

      const mirrorType = input.financialTxTypeOverride ?? LEDGER_MIRROR_TYPE_MAP[input.type]
      if (destWallet) {
        await tx.financialTransaction.create({
          data: {
            walletId: destWallet.id,
            employeeId: destWallet.employeeId,
            amount: netAmount,
            type: mirrorType,
            description: input.reason.trim(),
            status: 'completed',
            reason: input.reason.trim(),
            reversalOfId: input.reversalOfId ?? null,
          },
        })
      }
      if (sourceWallet) {
        await tx.financialTransaction.create({
          data: {
            walletId: sourceWallet.id,
            employeeId: sourceWallet.employeeId,
            amount: netAmount.negated(),
            type: mirrorType,
            description: input.reason.trim(),
            status: 'deducted',
            reason: input.reason.trim(),
            reversalOfId: input.reversalOfId ?? null,
          },
        })
      }

      const referenceNo = `LTX-S${input.sprintNumber}-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`

      const ledgerTx = await tx.ledgerTransaction.create({
        data: {
          referenceNo,
          idempotencyKey: input.idempotencyKey,
          sprintNumber: input.sprintNumber,
          type: input.type,
          sourceKind: input.sourceKind,
          sourceRefId: input.sourceRefId,
          destKind: input.destKind,
          destRefId: input.destRefId,
          grossAmount: grossAmount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
          deductions: deductions.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
          netAmount: netAmount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
          teamId: input.teamId ?? null,
          employeeId: input.employeeId ?? null,
          reason: input.reason.trim(),
          createdById: actor.id,
          approvedById: input.approvedById ?? null,
          approvedAt: input.approvedAt ?? null,
          approvalRef: input.approvalRef ?? null,
          status: 'PAID',
          reversalOfId: input.reversalOfId ?? null,
          metadata: {
            ...(input.metadata ?? {}),
            sourceBalanceBefore,
            sourceBalanceAfter,
            destBalanceBefore,
            destBalanceAfter,
          },
        },
      })

      await this.auditLogger?.log(
        {
          ...buildAuditActor(actor),
          action: `LEDGER_${input.type}`,
          actionCode: input.type === 'REVERSAL' ? 'transactions:reverse' : 'money_requests:post',
          severity: input.type === 'REVERSAL' ? 'WARNING' : 'INFO',
          entityType: 'LedgerTransaction',
          entityId: ledgerTx.id,
          description: input.reason.trim(),
          category: 'FINANCE',
          beforeState: { sourceBalanceBefore, destBalanceBefore },
          afterState: {
            referenceNo,
            type: input.type,
            netAmount: netAmount.toFixed(2),
            sourceBalanceAfter,
            destBalanceAfter,
          },
          reason: input.reason.trim(),
          payload: {
            idempotencyKey: input.idempotencyKey,
            sprintNumber: input.sprintNumber,
            teamId: input.teamId ?? null,
            employeeId: input.employeeId ?? null,
            reversalOfId: input.reversalOfId ?? null,
          },
        },
        tx,
      )

      return { transaction: ledgerTx, idempotentHit: false }
    }

    return externalTx ? executeInTx(externalTx) : this.prisma.$transaction(executeInTx)
  }

  async reverseTransaction(ledgerTxId: string, reason: string, actor: AuthenticatedUser) {
    if (!reason || reason.trim().length < 5) {
      throw new BadRequestException('Reversal reason (at least 5 characters) is required')
    }

    return this.prisma.$transaction(async (tx) => {
      const original = await tx.ledgerTransaction.findUnique({
        where: { id: ledgerTxId },
        include: { reversedBy: { select: { id: true, referenceNo: true } } },
      })
      if (!original) {
        throw new NotFoundException(`Ledger transaction "${ledgerTxId}" not found`)
      }
      if (original.type === 'REVERSAL') {
        throw new BadRequestException('Cannot reverse a transaction that is already a reversal')
      }
      const existingReversal =
        original.reversedBy ??
        (await tx.ledgerTransaction.findUnique({ where: { reversalOfId: original.id } }))
      if (existingReversal) {
        throw new BadRequestException(
          `Ledger transaction "${original.referenceNo}" has already been reversed`,
        )
      }

      const roles = await resolveActorRoles(tx, actor)
      const result = await this.postTransaction(
        {
          idempotencyKey: `reversal:${original.id}`,
          sprintNumber: original.sprintNumber,
          type: 'REVERSAL',
          sourceKind: original.destKind,
          sourceRefId: original.destRefId,
          destKind: original.sourceKind,
          destRefId: original.sourceRefId,
          grossAmount: original.netAmount,
          deductions: new Prisma.Decimal('0.00'),
          teamId: original.teamId,
          employeeId: original.employeeId,
          reason: `Reversal of ${original.referenceNo}: ${reason.trim()}`,
          approvedById: actor.id,
          approvedAt: new Date(),
          approvalRef: original.id,
          reversalOfId: original.id,
          allowClosedSprintCeoOverride: isActorCeo(actor, roles),
          metadata: {
            reversalOfId: original.id,
            originalReferenceNo: original.referenceNo,
            reversedType: original.type,
            userReason: reason.trim(),
          },
        },
        actor,
        tx,
      )

      return {
        reversed: true,
        originalTransactionId: original.id,
        reversalTransaction: result.transaction,
      }
    })
  }

  async getAccounts(actor: AuthenticatedUser) {
    const roles = await resolveActorRoles(this.prisma, actor)
    if (hasGlobalFinanceAccess(actor, roles)) {
      const accounts = await this.prisma.financeAccount.findMany({
        include: { team: { select: { id: true, name: true, code: true } } },
        orderBy: [{ type: 'asc' }, { code: 'asc' }],
      })
      const companyFund = accounts.find((a) => a.type === 'COMPANY_FUND') ?? null
      const squadAccounts = accounts.filter((a) => a.type === 'SQUAD')
      const totalSquadBalance = squadAccounts.reduce(
        (sum, acc) => sum.plus(new Prisma.Decimal(acc.balance)),
        new Prisma.Decimal(0),
      )

      return {
        scope: 'GLOBAL',
        accounts,
        companyFund,
        squadAccounts,
        totalSquadBalance: totalSquadBalance.toFixed(2),
      }
    }

    const managedTeamIds = await findManagedTeamIds(this.prisma, actor.id)
    const memberTeamIds = await findMemberTeamIds(this.prisma, actor.id)
    const visibleTeamIds = Array.from(new Set([...managedTeamIds, ...memberTeamIds]))
    const myWallet = await this.prisma.employeeWallet.findUnique({
      where: { employeeId: actor.id },
    })

    const squadAccounts =
      visibleTeamIds.length > 0
        ? await this.prisma.financeAccount.findMany({
            where: { type: 'SQUAD', teamId: { in: visibleTeamIds } },
            select: {
              id: true,
              code: true,
              name: true,
              type: true,
              teamId: true,
              balance: true,
              currency: true,
              isActive: true,
              team: { select: { id: true, name: true, code: true } },
            },
            orderBy: { code: 'asc' },
          })
        : []

    return {
      scope: managedTeamIds.length > 0 ? 'PM_SQUAD' : 'MEMBER_SELF',
      accounts: squadAccounts,
      companyFund: null,
      squadAccounts,
      personalWallet: myWallet,
    }
  }

  async getTransactions(filters: LedgerFilterQuery, actor: AuthenticatedUser) {
    const roles = await resolveActorRoles(this.prisma, actor)
    const isGlobal = hasGlobalFinanceAccess(actor, roles)
    const andClauses: Prisma.LedgerTransactionWhereInput[] = []

    if (filters.sprintNumber !== undefined) {
      andClauses.push({ sprintNumber: filters.sprintNumber })
    }
    if (filters.type) {
      andClauses.push({ type: filters.type })
    }
    if (filters.fromDate || filters.toDate) {
      andClauses.push({
        createdAt: {
          ...(filters.fromDate ? { gte: filters.fromDate } : {}),
          ...(filters.toDate ? { lte: filters.toDate } : {}),
        },
      })
    }
    if (filters.search?.trim()) {
      const q = filters.search.trim()
      andClauses.push({
        OR: [
          { referenceNo: { contains: q, mode: 'insensitive' } },
          { reason: { contains: q, mode: 'insensitive' } },
        ],
      })
    }

    if (isGlobal) {
      if (filters.teamId) andClauses.push({ teamId: filters.teamId })
      if (filters.employeeId) andClauses.push({ employeeId: filters.employeeId })
      if (filters.accountId) {
        andClauses.push({
          OR: [
            { sourceKind: 'FINANCE_ACCOUNT', sourceRefId: filters.accountId },
            { destKind: 'FINANCE_ACCOUNT', destRefId: filters.accountId },
          ],
        })
      }
    } else {
      const managedTeamIds = await findManagedTeamIds(this.prisma, actor.id)
      if (managedTeamIds.length > 0) {
        const pmAccounts = await this.prisma.financeAccount.findMany({
          where: { type: 'SQUAD', teamId: { in: managedTeamIds } },
          select: { id: true },
        })
        const pmAccountIds = pmAccounts.map((a) => a.id)
        andClauses.push({
          OR: [
            { teamId: { in: managedTeamIds } },
            { sourceKind: 'FINANCE_ACCOUNT', sourceRefId: { in: pmAccountIds } },
            { destKind: 'FINANCE_ACCOUNT', destRefId: { in: pmAccountIds } },
            { employeeId: actor.id },
            { sourceKind: 'PERSONAL_WALLET', sourceRefId: actor.id },
            { destKind: 'PERSONAL_WALLET', destRefId: actor.id },
          ],
        })
        if (filters.teamId) {
          if (!managedTeamIds.includes(filters.teamId)) {
            throw new ForbiddenException('PM may only filter transactions within their own squad')
          }
          andClauses.push({ teamId: filters.teamId })
        }
      } else {
        // Strictly scope developers/non-PMs to their own personal transactions.
        andClauses.push({
          OR: [
            { employeeId: actor.id },
            { sourceKind: 'PERSONAL_WALLET', sourceRefId: actor.id },
            { destKind: 'PERSONAL_WALLET', destRefId: actor.id },
          ],
        })
      }
    }

    const where: Prisma.LedgerTransactionWhereInput =
      andClauses.length > 0 ? { AND: andClauses } : {}

    return this.prisma.ledgerTransaction.findMany({
      where,
      include: {
        reversedBy: { select: { id: true, referenceNo: true, createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(filters.limit ?? 100, 1), 500),
      skip: Math.max(filters.offset ?? 0, 0),
    })
  }

  async getAccountStatement(
    accountId: string,
    filters: { fromDate?: Date; toDate?: Date; sprintNumber?: number },
    actor: AuthenticatedUser,
  ) {
    const account = await this.prisma.financeAccount.findUnique({
      where: { id: accountId },
      include: { team: { select: { id: true, name: true, code: true } } },
    })
    if (!account) {
      throw new NotFoundException(`FinanceAccount "${accountId}" not found`)
    }

    const roles = await resolveActorRoles(this.prisma, actor)
    if (!hasGlobalFinanceAccess(actor, roles)) {
      const managedTeamIds = await findManagedTeamIds(this.prisma, actor.id)
      if (!(account.type === 'SQUAD' && account.teamId && managedTeamIds.includes(account.teamId))) {
        throw new ForbiddenException('You do not have permission to view this account statement')
      }
    }

    const accountSideWhere: Prisma.LedgerTransactionWhereInput = {
      OR: [
        { sourceKind: 'FINANCE_ACCOUNT', sourceRefId: accountId },
        { destKind: 'FINANCE_ACCOUNT', destRefId: accountId },
      ],
    }

    const allEntriesForOpening = filters.fromDate
      ? await this.prisma.ledgerTransaction.findMany({
          where: {
            AND: [
              accountSideWhere,
              { createdAt: { lt: filters.fromDate } },
              ...(filters.sprintNumber !== undefined
                ? [{ sprintNumber: filters.sprintNumber }]
                : []),
            ],
          },
          orderBy: { createdAt: 'asc' },
        })
      : []

    let openingBalance = new Prisma.Decimal('0.00')
    for (const tx of allEntriesForOpening) {
      const amt = new Prisma.Decimal(tx.netAmount)
      if (tx.destKind === 'FINANCE_ACCOUNT' && tx.destRefId === accountId) {
        openingBalance = openingBalance.plus(amt)
      }
      if (tx.sourceKind === 'FINANCE_ACCOUNT' && tx.sourceRefId === accountId) {
        openingBalance = openingBalance.minus(amt)
      }
    }

    const entries = await this.prisma.ledgerTransaction.findMany({
      where: {
        AND: [
          accountSideWhere,
          ...(filters.sprintNumber !== undefined ? [{ sprintNumber: filters.sprintNumber }] : []),
          ...(filters.fromDate || filters.toDate
            ? [
                {
                  createdAt: {
                    ...(filters.fromDate ? { gte: filters.fromDate } : {}),
                    ...(filters.toDate ? { lte: filters.toDate } : {}),
                  },
                },
              ]
            : []),
        ],
      },
      include: { reversedBy: { select: { id: true, referenceNo: true, createdAt: true } } },
      orderBy: { createdAt: 'asc' },
    })

    let totalCredits = new Prisma.Decimal('0.00')
    let totalDebits = new Prisma.Decimal('0.00')
    let runningBalance = openingBalance

    const statementLines = entries.map((tx) => {
      const amt = new Prisma.Decimal(tx.netAmount)
      const isCredit = tx.destKind === 'FINANCE_ACCOUNT' && tx.destRefId === accountId
      const isDebit = tx.sourceKind === 'FINANCE_ACCOUNT' && tx.sourceRefId === accountId
      if (isCredit) {
        totalCredits = totalCredits.plus(amt)
        runningBalance = runningBalance.plus(amt)
      }
      if (isDebit) {
        totalDebits = totalDebits.plus(amt)
        runningBalance = runningBalance.minus(amt)
      }
      return {
        ...tx,
        direction: isCredit ? 'CREDIT' : 'DEBIT',
        runningBalance: runningBalance.toFixed(2),
      }
    })

    return {
      account,
      openingBalance: openingBalance.toFixed(2),
      totalCredits: totalCredits.toFixed(2),
      totalDebits: totalDebits.toFixed(2),
      closingBalance: runningBalance.toFixed(2),
      currentAccountBalance: new Prisma.Decimal(account.balance).toFixed(2),
      entries: statementLines,
    }
  }

  async exportTransactionsCsv(filters: LedgerFilterQuery, actor: AuthenticatedUser) {
    const rows = await this.getTransactions(
      { ...filters, limit: Math.min(filters.limit ?? 500, 500) },
      actor,
    )

    const headers = [
      'ReferenceNo',
      'CreatedAt',
      'Sprint',
      'Type',
      'SourceKind',
      'SourceRef',
      'DestKind',
      'DestRef',
      'GrossAmount',
      'Deductions',
      'NetAmount',
      'TeamId',
      'EmployeeId',
      'Reason',
      'ReversedBy',
    ]

    const lines = [headers.map(escapeCsvCell).join(',')]
    for (const row of rows) {
      const cells = [
        row.referenceNo,
        row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
        row.sprintNumber,
        row.type,
        row.sourceKind,
        row.sourceRefId,
        row.destKind,
        row.destRefId,
        new Prisma.Decimal(row.grossAmount).toFixed(2),
        new Prisma.Decimal(row.deductions).toFixed(2),
        new Prisma.Decimal(row.netAmount).toFixed(2),
        row.teamId ?? '',
        row.employeeId ?? '',
        row.reason,
        (row as any).reversedBy?.referenceNo ?? '',
      ]
      lines.push(cells.map(escapeCsvCell).join(','))
    }

    const sprintTag = filters.sprintNumber ? `sprint-${filters.sprintNumber}` : 'all-sprints'
    return {
      filename: `pointfex-ledger-${sprintTag}.csv`,
      csv: lines.join('\r\n'),
      count: rows.length,
    }
  }

  async listSprintLocks() {
    return this.prisma.sprintLock.findMany({
      orderBy: { sprintNumber: 'desc' },
    })
  }

  async requestSprintLock(sprintNumber: number, reason: string, actor: AuthenticatedUser) {
    if (!Number.isInteger(sprintNumber) || sprintNumber < 1) {
      throw new BadRequestException('sprintNumber must be a positive integer')
    }
    if (!reason || reason.trim().length < 5) {
      throw new BadRequestException('Lock reason (at least 5 characters) is required')
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.sprintLock.findUnique({ where: { sprintNumber } })
      if (existing?.status === 'LOCKED') {
        throw new BadRequestException(`Sprint ${sprintNumber} is already locked`)
      }

      const now = new Date()
      const lock = await tx.sprintLock.upsert({
        where: { sprintNumber },
        update: {
          status: 'PENDING_APPROVAL',
          requestedById: actor.id,
          requestedAt: now,
          reason: reason.trim(),
        },
        create: {
          sprintNumber,
          status: 'PENDING_APPROVAL',
          requestedById: actor.id,
          requestedAt: now,
          reason: reason.trim(),
        },
      })

      await notifyFinanceRoles(tx, ['ceo'], {
        title: `Sprint ${sprintNumber} Lock Requested`,
        message: `${actor.name || actor.email || actor.id} requested financial lock for Sprint ${sprintNumber}: ${reason.trim()}`,
        entityType: 'SprintLock',
        entityId: lock.id,
        excludeEmployeeId: actor.id,
      })

      await this.auditLogger?.log(
        {
          ...buildAuditActor(actor),
          action: 'SPRINT_LOCK_REQUESTED',
          actionCode: 'sprints:lock',
          severity: 'INFO',
          entityType: 'SprintLock',
          entityId: lock.id,
          description: `Requested financial period lock for Sprint ${sprintNumber}`,
          category: 'FINANCE',
          afterState: { sprintNumber, status: lock.status },
          reason: reason.trim(),
        },
        tx,
      )

      return lock
    })
  }

  async approveSprintLock(sprintNumber: number, actor: AuthenticatedUser) {
    const roles = await resolveActorRoles(this.prisma, actor)
    if (!isActorCeo(actor, roles)) {
      throw new ForbiddenException('Only the CEO may approve a sprint financial lock')
    }

    return this.prisma.$transaction(async (tx) => {
      const lock = await tx.sprintLock.findUnique({ where: { sprintNumber } })
      if (!lock) {
        throw new NotFoundException(`Sprint lock request for sprint ${sprintNumber} not found`)
      }
      if (lock.status === 'LOCKED') {
        throw new BadRequestException(`Sprint ${sprintNumber} is already locked`)
      }
      if (lock.status !== 'PENDING_APPROVAL') {
        throw new BadRequestException(`Sprint ${sprintNumber} lock must be pending approval`)
      }
      if (lock.requestedById === actor.id) {
        throw new ForbiddenException('Requester cannot approve their own sprint lock request')
      }

      const updated = await tx.sprintLock.update({
        where: { sprintNumber },
        data: {
          status: 'LOCKED',
          approvedById: actor.id,
          approvedAt: new Date(),
        },
      })

      await this.auditLogger?.log(
        {
          ...buildAuditActor(actor, 'CEO'),
          action: 'SPRINT_LOCK_APPROVED',
          actionCode: 'money_requests:approve',
          severity: 'CRITICAL',
          entityType: 'SprintLock',
          entityId: updated.id,
          description: `Approved financial period lock for Sprint ${sprintNumber}`,
          category: 'FINANCE',
          beforeState: { status: lock.status },
          afterState: { status: updated.status, sprintNumber },
          mfaVerified: true,
        },
        tx,
      )

      return updated
    })
  }
}
