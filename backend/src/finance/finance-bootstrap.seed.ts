import { Prisma, PrismaClient } from '@prisma/client'
import { AuditLoggerService } from '../common/audit-logger.service'

export const DEFAULT_BONUS_TIERS = [
  { minScore: 90, maxScore: 100, amount: '5000.00', label: 'Tier S (Outstanding)' },
  { minScore: 75, maxScore: 89.99, amount: '3500.00', label: 'Tier A (Exceeds Expectations)' },
  { minScore: 60, maxScore: 74.99, amount: '2000.00', label: 'Tier B (Meets Expectations)' },
  { minScore: 0, maxScore: 59.99, amount: '0.00', label: 'No Bonus (Below Threshold)' },
] as const

export const DEFAULT_PENALTY_TABLE = {
  CODE_SMELL: {
    amount: '500.00',
    recipientRole: 'cto',
    recipientPct: '0.20',
    companyPct: '0.80',
    requiresCeoApproval: false,
    triggersRosterChange: false,
  },
  CTO_CONSULTANCY: {
    amount: '1500.00',
    recipientRole: 'cto',
    recipientPct: '0.50',
    companyPct: '0.50',
    requiresCeoApproval: false,
    triggersRosterChange: false,
  },
  SLACKER: {
    amount: '1000.00',
    recipientRole: 'chro',
    recipientPct: '0.20',
    companyPct: '0.80',
    requiresCeoApproval: false,
    triggersRosterChange: false,
  },
  SWAP_FIRE: {
    amount: '2000.00',
    recipientRole: 'chro',
    recipientPct: '0.25',
    companyPct: '0.75',
    requiresCeoApproval: false,
    triggersRosterChange: true,
  },
  DEADLINE: {
    amount: '2500.00',
    recipientRole: 'cfo',
    recipientPct: '0.20',
    companyPct: '0.80',
    requiresCeoApproval: true,
    triggersRosterChange: false,
  },
  BLIND_QA: {
    amount: '1500.00',
    recipientRole: null,
    recipientPct: '0.00',
    companyPct: '1.00',
    requiresCeoApproval: false,
    triggersRosterChange: false,
  },
} as const

export const DEFAULT_FINANCE_CONFIG_VALUES = {
  payrollRateBDT: new Prisma.Decimal('2500.00'),
  commissionRatePct: new Prisma.Decimal('5.00'),
  sprintPoolTotalBDT: new Prisma.Decimal('150000.00'),
  squadOpeningSeedBDT: new Prisma.Decimal('100000.00'),
  executivePayrollRoles: ['cto', 'cpo', 'cfo', 'chro'],
  rankWeights: [6, 5, 4, 3, 2, 1],
  bonusTiers: DEFAULT_BONUS_TIERS,
  penaltyTable: DEFAULT_PENALTY_TABLE,
}

export interface BootstrapFinanceOptions {
  actorId?: string
  reviewerId?: string
  openingSeedAmount?: string
  initialSprintNumber?: number
  auditLogger?: AuditLoggerService
}

export interface BootstrapFinanceSummary {
  companyFundAccountId: string
  squadAccountsEnsured: number
  openingSeedsPosted: number
}

async function resolveBootstrapActorIds(
  prisma: PrismaClient,
  options?: BootstrapFinanceOptions,
): Promise<{ requesterId: string; reviewerId: string }> {
  if (options?.actorId && options?.reviewerId) {
    return { requesterId: options.actorId, reviewerId: options.reviewerId }
  }

  const findActiveEmployeeByRole = async (roleSlug: string): Promise<string | null> => {
    const roleAssignment = await prisma.employeeRole.findFirst({
      where: {
        isActive: true,
        role: { slug: roleSlug, isActive: true },
        employee: { status: 'active' },
      },
      select: { employeeId: true },
    })
    if (roleAssignment?.employeeId) return roleAssignment.employeeId

    const posAssignment = await prisma.positionAssignment.findFirst({
      where: {
        isActive: true,
        position: { roleCategory: roleSlug },
        employee: { status: 'active' },
      },
      select: { employeeId: true },
    })
    return posAssignment?.employeeId ?? null
  }

  const ceoId =
    options?.reviewerId ??
    (await findActiveEmployeeByRole('ceo')) ??
    (
      await prisma.employee.findFirst({
        where: { status: 'active' },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      })
    )?.id

  const cfoId = options?.actorId ?? (await findActiveEmployeeByRole('cfo')) ?? ceoId

  if (!ceoId || !cfoId) {
    throw new Error('Cannot bootstrap finance accounts: no active employee records found.')
  }

  return {
    requesterId: cfoId,
    reviewerId: ceoId,
  }
}

/**
 * Idempotent finance bootstrapper:
 * 1. Seeds singleton FinanceConfig defaults (never overwrites existing customized config).
 * 2. Ensures single COMPANY_FUND FinanceAccount with opening balance 0.
 * 3. Discovers all Team rows dynamically, ensures a SQUAD FinanceAccount per Team,
 *    and posts a Tk 100,000 approved ADD_MONEY ("Opening seed") once per team.
 */
export async function bootstrapFinanceData(
  prisma: PrismaClient,
  options?: BootstrapFinanceOptions,
): Promise<BootstrapFinanceSummary> {
  const { requesterId, reviewerId } = await resolveBootstrapActorIds(prisma, options)
  const openingSeedAmount = new Prisma.Decimal(options?.openingSeedAmount ?? '100000.00')
  const sprintNumber = options?.initialSprintNumber ?? 1
  const auditLogger = options?.auditLogger

  await prisma.financeConfig.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      payrollRateBDT: DEFAULT_FINANCE_CONFIG_VALUES.payrollRateBDT,
      commissionRatePct: DEFAULT_FINANCE_CONFIG_VALUES.commissionRatePct,
      sprintPoolTotalBDT: DEFAULT_FINANCE_CONFIG_VALUES.sprintPoolTotalBDT,
      squadOpeningSeedBDT: openingSeedAmount,
      executivePayrollRoles: DEFAULT_FINANCE_CONFIG_VALUES.executivePayrollRoles,
      rankWeights: DEFAULT_FINANCE_CONFIG_VALUES.rankWeights,
      bonusTiers: DEFAULT_FINANCE_CONFIG_VALUES.bonusTiers as unknown as Prisma.InputJsonValue,
      penaltyTable: DEFAULT_FINANCE_CONFIG_VALUES.penaltyTable as unknown as Prisma.InputJsonValue,
      updatedById: reviewerId,
    },
  })

  const companyFund = await prisma.financeAccount.upsert({
    where: { code: 'COMPANY_FUND' },
    update: {},
    create: {
      code: 'COMPANY_FUND',
      name: 'Company Fund',
      type: 'COMPANY_FUND',
      balance: new Prisma.Decimal('0.00'),
      currency: 'BDT',
      isActive: true,
    },
  })

  const teams = await prisma.team.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
  })

  let squadAccountsEnsured = 0
  let openingSeedsPosted = 0

  for (const team of teams) {
    const idempotencyKey = `opening_seed:${team.id}`
    const posted = await prisma.$transaction(async (tx) => {
      let squadAccount = await tx.financeAccount.findUnique({
        where: { teamId: team.id },
      })
      if (!squadAccount) {
        squadAccount = await tx.financeAccount.create({
          data: {
            code: `SQUAD_${team.id}`,
            name: `${team.name} Squad Account`,
            type: 'SQUAD',
            teamId: team.id,
            balance: new Prisma.Decimal('0.00'),
            currency: 'BDT',
            isActive: true,
          },
        })
      }

      const existingLedger = await tx.ledgerTransaction.findUnique({
        where: { idempotencyKey },
        select: { id: true },
      })
      if (existingLedger) {
        return false
      }

      const lockedRows = await tx.$queryRaw<Array<{ id: string; balance: Prisma.Decimal }>>`
        SELECT "id", "balance" FROM "finance_accounts" WHERE "id" = ${squadAccount.id} FOR UPDATE
      `
      const currentBalance = new Prisma.Decimal(lockedRows[0]?.balance ?? squadAccount.balance)
      const nextBalance = currentBalance.plus(openingSeedAmount)
      const now = new Date()
      const requestIdempotencyKey = `opening_seed_req:${team.id}`

      const request = await tx.moneyRequest.create({
        data: {
          type: 'ADD_MONEY',
          sprintNumber,
          sourceKind: 'EXTERNAL',
          sourceRefId: 'OPENING_SEED',
          destKind: 'FINANCE_ACCOUNT',
          destRefId: squadAccount.id,
          teamId: team.id,
          amount: openingSeedAmount,
          reason: 'Opening seed',
          purpose: 'SQUAD_OPENING_SEED',
          status: 'PAID',
          requesterId,
          approvedById: reviewerId,
          approvedAt: now,
          postedById: requesterId,
          postedAt: now,
          idempotencyKey: requestIdempotencyKey,
        },
      })

      const referenceNo = `LTX-SEED-${team.id}`
      const ledgerTx = await tx.ledgerTransaction.create({
        data: {
          referenceNo,
          idempotencyKey,
          sprintNumber,
          type: 'ADD_MONEY',
          sourceKind: 'EXTERNAL',
          sourceRefId: 'OPENING_SEED',
          destKind: 'FINANCE_ACCOUNT',
          destRefId: squadAccount.id,
          grossAmount: openingSeedAmount,
          deductions: new Prisma.Decimal('0.00'),
          netAmount: openingSeedAmount,
          teamId: team.id,
          reason: 'Opening seed',
          createdById: requesterId,
          approvedById: reviewerId,
          approvedAt: now,
          approvalRef: request.id,
          status: 'PAID',
          metadata: {
            seedType: 'OPENING_SEED',
            teamId: team.id,
            teamName: team.name,
            balanceBefore: currentBalance.toFixed(2),
            balanceAfter: nextBalance.toFixed(2),
          },
        },
      })

      await tx.moneyRequest.update({
        where: { id: request.id },
        data: { ledgerTransactionId: ledgerTx.id },
      })

      await tx.financeAccount.update({
        where: { id: squadAccount.id },
        data: { balance: nextBalance },
      })

      if (auditLogger) {
        const actor = await tx.employee.findUnique({
          where: { id: requesterId },
          select: { id: true, name: true, email: true },
        })
        await auditLogger.log(
          {
            actorId: actor?.id ?? requesterId,
            actorName: actor?.name ?? 'System Bootstrap',
            actorEmail: actor?.email ?? 'system@pointfex.local',
            actorRole: 'cfo',
            action: 'FINANCE_OPENING_SEED',
            actionCode: 'money_requests:post',
            severity: 'INFO',
            entityType: 'FinanceAccount',
            entityId: squadAccount.id,
            description: `Posted opening seed of Tk ${openingSeedAmount.toFixed(2)} for squad ${team.name}`,
            category: 'FINANCE',
            beforeState: { balance: currentBalance.toFixed(2) },
            afterState: { balance: nextBalance.toFixed(2), ledgerTransactionId: ledgerTx.id },
            payload: { requestId: request.id, teamId: team.id, idempotencyKey },
          },
          tx,
        )
      }

      return true
    })

    squadAccountsEnsured += 1
    if (posted) {
      openingSeedsPosted += 1
    }
  }

  return {
    companyFundAccountId: companyFund.id,
    squadAccountsEnsured,
    openingSeedsPosted,
  }
}

async function runCli() {
  const prisma = new PrismaClient()
  try {
    const summary = await bootstrapFinanceData(prisma)
    console.log('[finance-bootstrap] completed:', summary)
  } finally {
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  runCli().catch((err) => {
    console.error('[finance-bootstrap] failed:', err)
    process.exit(1)
  })
}
