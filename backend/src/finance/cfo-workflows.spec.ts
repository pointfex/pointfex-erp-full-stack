import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { BonusService } from './bonus.service'
import { CommissionService } from './commission.service'
import { bootstrapFinanceData, DEFAULT_FINANCE_CONFIG_VALUES } from './finance-bootstrap.seed'
import { FinanceConfigService } from './finance-config.service'
import { LedgerService } from './ledger.service'
import { computeLargestRemainderPoolShares, MoneyRequestService } from './money-request.service'
import { PayrollService } from './payroll.service'
import { PenaltyService } from './penalty.service'

function createWorkflowHarness(options?: { omitChroExec?: boolean; cpoIsAlsoGammaPm?: boolean }) {
  let seq = 1
  const nextId = (prefix: string) => `${prefix}_${seq++}`

  const teams = [
    { id: 'team_alpha', name: 'Alpha', code: 'TA', pmPositionId: 'pos_pm_alpha', createdAt: new Date(1) },
    { id: 'team_bravo', name: 'Bravo', code: 'TB', pmPositionId: 'pos_pm_bravo', createdAt: new Date(2) },
    { id: 'team_gamma', name: 'Gamma', code: 'TC', pmPositionId: 'pos_pm_gamma', createdAt: new Date(3) },
    { id: 'team_delta', name: 'Delta', code: 'TD', pmPositionId: 'pos_pm_delta', createdAt: new Date(4) },
    { id: 'team_echo', name: 'Echo', code: 'TE', pmPositionId: 'pos_pm_echo', createdAt: new Date(5) },
    { id: 'team_foxtrot', name: 'Foxtrot', code: 'TF', pmPositionId: 'pos_pm_foxtrot', createdAt: new Date(6) },
  ]

  const employees: Record<string, any> = {
    emp_ceo: { id: 'emp_ceo', name: 'CEO User', status: 'active' },
    emp_cto: { id: 'emp_cto', name: 'CTO User', status: 'active' },
    emp_cpo: { id: 'emp_cpo', name: 'CPO User', status: 'active' },
    emp_cfo: { id: 'emp_cfo', name: 'CFO User', status: 'active' },
    emp_chro: { id: 'emp_chro', name: 'CHRO User', status: 'active' },
    emp_pm_alpha: { id: 'emp_pm_alpha', name: 'Alpha PM', status: 'active' },
    emp_dev_alpha: { id: 'emp_dev_alpha', name: 'Alpha Dev', status: 'active' },
    emp_dev_gamma: { id: 'emp_dev_gamma', name: 'Gamma Dev', status: 'active' },
  }

  const positionAssignments: any[] = [
    {
      employeeId: 'emp_ceo',
      positionId: 'pos_ceo',
      isActive: true,
      assignedAt: new Date(1),
      position: { roleCategory: 'ceo' },
      employee: employees.emp_ceo,
    },
    {
      employeeId: 'emp_cto',
      positionId: 'pos_cto',
      isActive: true,
      assignedAt: new Date(2),
      position: { roleCategory: 'cto' },
      employee: employees.emp_cto,
    },
    {
      employeeId: 'emp_cpo',
      positionId: 'pos_cpo',
      isActive: true,
      assignedAt: new Date(3),
      position: { roleCategory: 'cpo' },
      employee: employees.emp_cpo,
    },
    {
      employeeId: 'emp_cfo',
      positionId: 'pos_cfo',
      isActive: true,
      assignedAt: new Date(4),
      position: { roleCategory: 'cfo' },
      employee: employees.emp_cfo,
    },
    ...(options?.omitChroExec
      ? []
      : [
          {
            employeeId: 'emp_chro',
            positionId: 'pos_chro',
            isActive: true,
            assignedAt: new Date(5),
            position: { roleCategory: 'chro' },
            employee: employees.emp_chro,
          },
        ]),
    {
      employeeId: 'emp_pm_alpha',
      positionId: 'pos_pm_alpha',
      isActive: true,
      assignedAt: new Date(6),
      position: { roleCategory: 'pm' },
      employee: employees.emp_pm_alpha,
    },
    ...(options?.cpoIsAlsoGammaPm
      ? [
          {
            employeeId: 'emp_cpo',
            positionId: 'pos_pm_gamma',
            isActive: true,
            assignedAt: new Date(7),
            position: { roleCategory: 'pm' },
            employee: employees.emp_cpo,
          },
        ]
      : []),
  ]

  const teamMemberships: any[] = [
    { id: 'tm_a1', teamId: 'team_alpha', employeeId: 'emp_dev_alpha', isActive: true, roleInTeam: 'developer', employee: employees.emp_dev_alpha },
    { id: 'tm_g1', teamId: 'team_gamma', employeeId: 'emp_dev_gamma', isActive: true, roleInTeam: 'developer', employee: employees.emp_dev_gamma },
    // Simulate dual-membership in Gamma to ensure same-squad dedupe prevents double paying within Gamma
    ...(options?.cpoIsAlsoGammaPm
      ? [{ id: 'tm_g_pm', teamId: 'team_gamma', employeeId: 'emp_cpo', isActive: true, roleInTeam: 'lead_developer', employee: employees.emp_cpo }]
      : []),
  ]

  let financeConfig: any = {
    id: 'singleton',
    ...DEFAULT_FINANCE_CONFIG_VALUES,
    rankWeights: [...DEFAULT_FINANCE_CONFIG_VALUES.rankWeights],
    bonusTiers: JSON.parse(JSON.stringify(DEFAULT_FINANCE_CONFIG_VALUES.bonusTiers)),
    penaltyTable: JSON.parse(JSON.stringify(DEFAULT_FINANCE_CONFIG_VALUES.penaltyTable)),
    executivePayrollRoles: [...DEFAULT_FINANCE_CONFIG_VALUES.executivePayrollRoles],
    updatedById: 'emp_ceo',
  }

  const accounts = new Map<string, any>([
    [
      'acc_company',
      {
        id: 'acc_company',
        code: 'COMPANY_FUND',
        name: 'Company Fund',
        type: 'COMPANY_FUND',
        teamId: null,
        balance: new Prisma.Decimal('0.00'),
        currency: 'BDT',
        isActive: true,
      },
    ],
  ])
  for (const t of teams) {
    const id = `acc_${t.id}`
    accounts.set(id, {
      id,
      code: `SQUAD_${t.id}`,
      name: `${t.name} Squad Account`,
      type: 'SQUAD',
      teamId: t.id,
      balance: new Prisma.Decimal('100000.00'),
      currency: 'BDT',
      isActive: true,
    })
  }

  const wallets = new Map<string, any>()
  const financialTransactions: any[] = []
  const ledgerTransactions: any[] = []
  const moneyRequests: any[] = []
  const sprintRankings = new Map<number, any>()
  const payrollRuns: any[] = []
  const bonusAwards: any[] = []
  const penaltyRecords: any[] = []
  const commissionRecords: any[] = []
  const sprintLocks = new Map<number, any>()
  const notifications: any[] = []
  const auditLogs: any[] = []

  const prisma: any = {
    employee: {
      findUnique: jest.fn(async ({ where }: any) => employees[where.id] || null),
      findFirst: jest.fn(async () => employees.emp_ceo),
    },
    team: {
      findUnique: jest.fn(async ({ where }: any) => teams.find((t) => t.id === where.id) || null),
      findMany: jest.fn(async ({ where }: any = {}) => {
        if (where?.pmPositionId?.in) return teams.filter((t) => where.pmPositionId.in.includes(t.pmPositionId))
        return [...teams]
      }),
    },
    teamMembership: {
      findFirst: jest.fn(async ({ where }: any) =>
        teamMemberships.find(
          (m) => m.teamId === where.teamId && m.employeeId === where.employeeId && m.isActive,
        ) || null,
      ),
      findMany: jest.fn(async ({ where }: any) =>
        teamMemberships.filter((m) => (!where.teamId || m.teamId === where.teamId) && (!where.employeeId || m.employeeId === where.employeeId) && m.isActive),
      ),
    },
    positionAssignment: {
      findFirst: jest.fn(async ({ where }: any) => {
        if (where?.positionId && where?.employeeId) {
          return positionAssignments.find((pa) => pa.positionId === where.positionId && pa.employeeId === where.employeeId && pa.isActive) || null
        }
        const slug = where?.position?.roleCategory
        return positionAssignments.find((pa) => pa.position.roleCategory === slug && pa.isActive) || null
      }),
      findMany: jest.fn(async ({ where }: any) => {
        if (where?.employeeId) return positionAssignments.filter((pa) => pa.employeeId === where.employeeId && pa.isActive)
        if (where?.positionId) return positionAssignments.filter((pa) => pa.positionId === where.positionId && pa.isActive)
        if (where?.position?.roleCategory?.in) {
          return positionAssignments.filter((pa) => where.position.roleCategory.in.includes(pa.position.roleCategory) && pa.isActive)
        }
        if (where?.position?.roleCategory) {
          return positionAssignments.filter((pa) => pa.position.roleCategory === where.position.roleCategory && pa.isActive)
        }
        return []
      }),
    },
    employeeRole: {
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
    },
    financeConfig: {
      findUnique: jest.fn(async () => ({ ...financeConfig })),
      upsert: jest.fn(async ({ create }: any) => {
        if (!financeConfig) financeConfig = { ...create }
        return { ...financeConfig }
      }),
      update: jest.fn(async ({ data }: any) => {
        financeConfig = { ...financeConfig, ...data }
        return { ...financeConfig }
      }),
    },
    financeAccount: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.id) return accounts.get(where.id) ? { ...accounts.get(where.id) } : null
        if (where.teamId) {
          const found = Array.from(accounts.values()).find((a) => a.teamId === where.teamId)
          return found ? { ...found } : null
        }
        if (where.code) {
          const found = Array.from(accounts.values()).find((a) => a.code === where.code)
          return found ? { ...found } : null
        }
        return null
      }),
      findFirst: jest.fn(async ({ where }: any) => {
        const found = Array.from(accounts.values()).find((a) => a.type === where.type)
        return found ? { ...found } : null
      }),
      findMany: jest.fn(async ({ where }: any = {}) => {
        let res = Array.from(accounts.values())
        if (where?.type) res = res.filter((a) => a.type === where.type)
        if (where?.teamId?.in) res = res.filter((a) => where.teamId.in.includes(a.teamId))
        return res.map((a) => ({ ...a }))
      }),
      upsert: jest.fn(async ({ where, create }: any) => {
        const existing = Array.from(accounts.values()).find((a) => a.code === where.code)
        if (existing) return { ...existing }
        const created = { id: nextId('acc'), ...create }
        accounts.set(created.id, created)
        return { ...created }
      }),
      create: jest.fn(async ({ data }: any) => {
        const created = { id: nextId('acc'), ...data }
        accounts.set(created.id, created)
        return { ...created }
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const acc = accounts.get(where.id)
        acc.balance = new Prisma.Decimal(data.balance)
        return { ...acc }
      }),
    },
    employeeWallet: {
      findUnique: jest.fn(async ({ where }: any) => wallets.get(where.employeeId) || null),
      upsert: jest.fn(async ({ where, create }: any) => {
        const ex = wallets.get(where.employeeId)
        if (ex) return ex
        const created = {
          id: nextId('wal'),
          employeeId: create.employeeId,
          balance: new Prisma.Decimal(create.balance ?? 0),
          totalEarnedToDate: new Prisma.Decimal(0),
          sprintBonusEarned: new Prisma.Decimal(0),
          totalPenalties: new Prisma.Decimal(0),
          totalSpendings: new Prisma.Decimal(0),
        }
        wallets.set(create.employeeId, created)
        return created
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const w = Array.from(wallets.values()).find((item) => item.id === where.id)
        if (data.balance !== undefined) w.balance = new Prisma.Decimal(data.balance)
        if (data.totalEarnedToDate !== undefined) w.totalEarnedToDate = new Prisma.Decimal(data.totalEarnedToDate)
        if (data.sprintBonusEarned !== undefined) w.sprintBonusEarned = new Prisma.Decimal(data.sprintBonusEarned)
        return { ...w }
      }),
    },
    financialTransaction: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: nextId('fintx'), createdAt: new Date(), ...data }
        financialTransactions.push(row)
        return row
      }),
    },
    ledgerTransaction: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.id) return ledgerTransactions.find((t) => t.id === where.id) || null
        if (where.idempotencyKey) return ledgerTransactions.find((t) => t.idempotencyKey === where.idempotencyKey) || null
        if (where.reversalOfId) return ledgerTransactions.find((t) => t.reversalOfId === where.reversalOfId) || null
        return null
      }),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: nextId('ltx'), createdAt: new Date(), ...data }
        ledgerTransactions.push(row)
        return { ...row }
      }),
    },
    moneyRequest: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: nextId('mreq'), createdAt: new Date(), ...data }
        moneyRequests.push(row)
        return { ...row }
      }),
      findUnique: jest.fn(async ({ where }: any) => moneyRequests.find((r) => r.id === where.id) || null),
      findMany: jest.fn(async ({ where }: any = {}) =>
        moneyRequests.filter((r) => {
          if (where?.type && r.type !== where.type) return false
          if (where?.sprintNumber !== undefined && r.sprintNumber !== where.sprintNumber) return false
          if (where?.teamId && r.teamId !== where.teamId) return false
          if (where?.status && r.status !== where.status) return false
          return true
        }),
      ),
      count: jest.fn(async ({ where }: any) =>
        moneyRequests.filter(
          (r) =>
            (!where.type || r.type === where.type) &&
            (!where.sprintNumber || r.sprintNumber === where.sprintNumber) &&
            (!where.status || r.status === where.status),
        ).length,
      ),
      update: jest.fn(async ({ where, data }: any) => {
        const row = moneyRequests.find((r) => r.id === where.id)
        Object.assign(row, data)
        return { ...row }
      }),
    },
    sprintRanking: {
      findUnique: jest.fn(async ({ where }: any) => sprintRankings.get(where.sprintNumber) || null),
      findMany: jest.fn(async () => Array.from(sprintRankings.values())),
      upsert: jest.fn(async ({ where, update, create }: any) => {
        const existing = sprintRankings.get(where.sprintNumber)
        if (existing) {
          Object.assign(existing, update)
          return { ...existing }
        }
        const created = { id: nextId('srank'), createdAt: new Date(), ...create }
        sprintRankings.set(where.sprintNumber, created)
        return { ...created }
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const existing = sprintRankings.get(where.sprintNumber)
        Object.assign(existing, data)
        return { ...existing }
      }),
    },
    payrollRun: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.scopeKey) return payrollRuns.find((r) => r.scopeKey === where.scopeKey) || null
        if (where.id) return payrollRuns.find((r) => r.id === where.id) || null
        return null
      }),
      findMany: jest.fn(async ({ where }: any = {}) =>
        payrollRuns.filter((r) => {
          if (where?.sprintNumber !== undefined && r.sprintNumber !== where.sprintNumber) return false
          if (where?.kind && r.kind !== where.kind) return false
          if (where?.id?.in && !where.id.in.includes(r.id)) return false
          if (where?.teamId?.in && !where.teamId.in.includes(r.teamId)) return false
          return true
        }),
      ),
      upsert: jest.fn(async ({ where, update, create }: any) => {
        const existing = payrollRuns.find((r) => r.scopeKey === where.scopeKey)
        if (existing) {
          Object.assign(existing, update)
          return { ...existing }
        }
        const created = { id: nextId('prun'), rosterChangeFlagConsumed: false, createdAt: new Date(), ...create }
        payrollRuns.push(created)
        return { ...created }
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = payrollRuns.find((r) => r.id === where.id)
        Object.assign(row, data)
        return { ...row }
      }),
    },
    bonusAward: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.id) return bonusAwards.find((b) => b.id === where.id) || null
        if (where.sprintNumber_teamId_employeeId) {
          const k = where.sprintNumber_teamId_employeeId
          return bonusAwards.find((b) => b.sprintNumber === k.sprintNumber && b.teamId === k.teamId && b.employeeId === k.employeeId) || null
        }
        return null
      }),
      findMany: jest.fn(async ({ where }: any = {}) =>
        bonusAwards.filter((b) => {
          if (where?.sprintNumber !== undefined && b.sprintNumber !== where.sprintNumber) return false
          if (where?.teamId && b.teamId !== where.teamId) return false
          if (where?.status?.in && !where.status.in.includes(b.status)) return false
          if (typeof where?.status === 'string' && b.status !== where.status) return false
          if (where?.id?.not && b.id === where.id.not) return false
          if (where?.id?.in && !where.id.in.includes(b.id)) return false
          return true
        }),
      ),
      upsert: jest.fn(async ({ where, update, create }: any) => {
        const k = where.sprintNumber_teamId_employeeId
        const existing = bonusAwards.find((b) => b.sprintNumber === k.sprintNumber && b.teamId === k.teamId && b.employeeId === k.employeeId)
        if (existing) {
          Object.assign(existing, update)
          return { ...existing }
        }
        const created = { id: nextId('bonus'), createdAt: new Date(), ...create }
        bonusAwards.push(created)
        return { ...created }
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = bonusAwards.find((b) => b.id === where.id)
        Object.assign(row, data)
        return { ...row }
      }),
    },
    penaltyRecord: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: nextId('pen'), rosterChangeConsumedByRunId: null, ledgerTxIds: [], createdAt: new Date(), ...data }
        penaltyRecords.push(row)
        return { ...row }
      }),
      findUnique: jest.fn(async ({ where }: any) => penaltyRecords.find((p) => p.id === where.id) || null),
      findMany: jest.fn(async ({ where }: any = {}) =>
        penaltyRecords.filter((p) => {
          if (where?.teamId && p.teamId !== where.teamId) return false
          if (where?.triggersRosterChange !== undefined && p.triggersRosterChange !== where.triggersRosterChange) return false
          if (where?.rosterChangeConsumedByRunId === null && p.rosterChangeConsumedByRunId !== null) return false
          if (where?.status?.in && !where.status.in.includes(p.status)) return false
          return true
        }),
      ),
      update: jest.fn(async ({ where, data }: any) => {
        const row = penaltyRecords.find((p) => p.id === where.id)
        Object.assign(row, data)
        return { ...row }
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        let count = 0
        for (const p of penaltyRecords) {
          if (
            (!where.teamId || p.teamId === where.teamId) &&
            (!where.triggersRosterChange || p.triggersRosterChange === where.triggersRosterChange) &&
            (where.rosterChangeConsumedByRunId !== null || p.rosterChangeConsumedByRunId === null)
          ) {
            Object.assign(p, data)
            count += 1
          }
        }
        return { count }
      }),
    },
    commissionRecord: {
      findUnique: jest.fn(async ({ where }: any) => commissionRecords.find((c) => c.sprintNumber === where.sprintNumber) || null),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: nextId('comm'), createdAt: new Date(), ...data }
        commissionRecords.push(row)
        return { ...row }
      }),
      findMany: jest.fn(async () => [...commissionRecords]),
    },
    sprintLock: {
      findUnique: jest.fn(async ({ where }: any) => sprintLocks.get(where.sprintNumber) || null),
    },
    notification: {
      createMany: jest.fn(async ({ data }: any) => {
        notifications.push(...data)
        return { count: data.length }
      }),
    },
    $queryRaw: jest.fn(async (strings: TemplateStringsArray) => {
      const sql = strings.join(' ')
      if (sql.includes('finance_accounts')) return Array.from(accounts.values()).map((a) => ({ ...a }))
      if (sql.includes('employee_wallets')) return Array.from(wallets.values()).map((w) => ({ ...w }))
      return []
    }),
    $transaction: jest.fn(async (cb: (tx: any) => Promise<any>) => cb(prisma)),
  }

  const auditLogger: any = {
    log: jest.fn(async (entry: any) => {
      auditLogs.push(entry)
      return entry
    }),
  }

  const configService = new FinanceConfigService(prisma, auditLogger)
  const ledgerService = new LedgerService(prisma, auditLogger)
  const moneyRequestService = new MoneyRequestService(prisma, ledgerService, configService, auditLogger)
  const payrollService = new PayrollService(prisma, ledgerService, configService, auditLogger)
  const bonusService = new BonusService(prisma, ledgerService, configService, auditLogger)
  const penaltyService = new PenaltyService(prisma, ledgerService, configService, auditLogger)
  const commissionService = new CommissionService(prisma, ledgerService, configService, auditLogger)

  return {
    prisma,
    accounts,
    wallets,
    moneyRequests,
    payrollRuns,
    bonusAwards,
    penaltyRecords,
    commissionRecords,
    notifications,
    auditLogs,
    configService,
    ledgerService,
    moneyRequestService,
    payrollService,
    bonusService,
    penaltyService,
    commissionService,
  }
}

describe('CFO Finance Workflows (Phase 3-7 & Bootstrap)', () => {
  const ceo: any = { id: 'emp_ceo', role: 'ceo', email: 'ceo@pointfex.com', permissions: ['system:root'] }
  const cfo: any = { id: 'emp_cfo', role: 'cfo', email: 'cfo@pointfex.com' }
  const cto: any = { id: 'emp_cto', role: 'cto', email: 'cto@pointfex.com' }
  const chro: any = { id: 'emp_chro', role: 'chro', email: 'chro@pointfex.com' }
  const cpo: any = { id: 'emp_cpo', role: 'cpo', email: 'cpo@pointfex.com' }
  const pmAlpha: any = { id: 'emp_pm_alpha', role: 'pm', email: 'pm@pointfex.com' }

  it('computes largest-remainder 150,000 pool shares to exact paisa', () => {
    const shares = computeLargestRemainderPoolShares(
      '150000.00',
      [6, 5, 4, 3, 2, 1],
      ['t1', 't2', 't3', 't4', 't5', 't6'],
    )
    const sum = shares.reduce((acc, s) => acc.plus(s.amount), new Prisma.Decimal('0.00'))
    expect(sum.toFixed(2)).toBe('150000.00')
    expect(shares).toHaveLength(6)
    expect(shares[0].amount.greaterThan(shares[5].amount)).toBe(true)
  })

  it('runs bootstrapFinanceData idempotently without duplicating opening seeds', async () => {
    const h = createWorkflowHarness()
    // Reset all squad accounts to 0 and test opening seed idempotency
    for (const acc of h.accounts.values()) {
      acc.balance = new Prisma.Decimal('0.00')
    }

    const first = await bootstrapFinanceData(h.prisma, { actorId: 'emp_cfo', reviewerId: 'emp_ceo' })
    expect(first.squadAccountsEnsured).toBe(6)
    expect(first.openingSeedsPosted).toBe(6)
    expect(h.accounts.get('acc_team_alpha').balance.toFixed(2)).toBe('100000.00')

    const second = await bootstrapFinanceData(h.prisma, { actorId: 'emp_cfo', reviewerId: 'emp_ceo' })
    expect(second.openingSeedsPosted).toBe(0)
    expect(h.accounts.get('acc_team_alpha').balance.toFixed(2)).toBe('100000.00')
  })

  it('enforces Add Money, CEO approval, self-approval block, Transfer blocked path, Ranking + POOL_CREDIT, and Commission', async () => {
    const h = createWorkflowHarness()

    // PM cannot create Add Money for Company Fund or another squad
    await expect(
      h.moneyRequestService.createAddMoneyRequest(
        { sprintNumber: 1, destAccountId: 'acc_company', amount: 50000, reason: 'Unauthorized company topup' },
        pmAlpha,
      ),
    ).rejects.toThrow(ForbiddenException)

    // CFO creates Add Money for Company Fund -> CEO approves -> CFO posts
    const addReq = await h.moneyRequestService.createAddMoneyRequest(
      { sprintNumber: 1, destAccountId: 'acc_company', amount: 250000, reason: 'Client retainer Sprint 1' },
      cfo,
    )
    expect(h.notifications.some((n) => n.userId === 'emp_ceo')).toBe(true)

    // Non-CEO cannot approve; CEO self-approval also blocked if CEO requested
    await expect(h.moneyRequestService.approveMoneyRequest(addReq.id, cfo)).rejects.toThrow(ForbiddenException)
    const ceoSelfReq = await h.moneyRequestService.createAddMoneyRequest(
      { sprintNumber: 1, destAccountId: 'acc_company', amount: 1000, reason: 'Self approval check' },
      ceo,
    )
    await expect(h.moneyRequestService.approveMoneyRequest(ceoSelfReq.id, ceo)).rejects.toThrow(ForbiddenException)
    await expect(h.moneyRequestService.rejectMoneyRequest(addReq.id, 'no', ceo)).rejects.toThrow(BadRequestException)

    await h.moneyRequestService.approveMoneyRequest(addReq.id, ceo)
    const postedAdd = await h.moneyRequestService.postMoneyRequest(addReq.id, cfo)
    expect(postedAdd.request.status).toBe('PAID')
    expect(h.accounts.get('acc_company').balance.toFixed(2)).toBe('250000.00')

    // Blocked Transfer path: Company Fund -> Squad for payroll/bonus
    await expect(
      h.moneyRequestService.createTransferRequest(
        {
          sprintNumber: 1,
          sourceAccountId: 'acc_company',
          destKind: 'FINANCE_ACCOUNT',
          destRefId: 'acc_team_alpha',
          amount: 10000,
          purpose: 'SQUAD_PAYROLL',
          reason: 'Should fail policy',
        },
        cfo,
      ),
    ).rejects.toThrow(BadRequestException)

    // Commission gated on sprint pool credits being posted first
    await expect(h.commissionService.runCommission(1, cfo)).rejects.toThrow(BadRequestException)

    // CFO blocked from submitting sprint rankings
    const sixEntries = [
      { teamId: 'team_alpha', rank: 1 },
      { teamId: 'team_bravo', rank: 2 },
      { teamId: 'team_gamma', rank: 3 },
      { teamId: 'team_delta', rank: 4 },
      { teamId: 'team_echo', rank: 5 },
      { teamId: 'team_foxtrot', rank: 6 },
    ]
    await expect(
      h.moneyRequestService.submitSprintRanking({ sprintNumber: 1, entries: sixEntries }, cfo),
    ).rejects.toThrow(ForbiddenException)

    // Duplicate ranks rejected
    await expect(
      h.moneyRequestService.submitSprintRanking(
        {
          sprintNumber: 1,
          entries: [
            { teamId: 'team_alpha', rank: 1 },
            { teamId: 'team_bravo', rank: 1 },
            ...sixEntries.slice(2),
          ],
        },
        chro,
      ),
    ).rejects.toThrow(BadRequestException)

    // CHRO submits -> CEO approves -> CFO posts batch POOL_CREDIT (150,000)
    await h.moneyRequestService.submitSprintRanking({ sprintNumber: 1, entries: sixEntries }, chro)
    await h.moneyRequestService.approveSprintRanking(1, ceo)
    const poolBatch = await h.moneyRequestService.postSprintPoolCredits(1, cfo)
    expect(poolBatch.poolCredits).toHaveLength(6)
    expect(poolBatch.poolCredits.every((r) => r.type === 'POOL_CREDIT')).toBe(true)
    expect(h.accounts.get('acc_company').balance.toFixed(2)).toBe('100000.00')

    // CFO cannot edit FinanceConfig
    await expect(h.configService.updateConfig({ commissionRatePct: 25 }, cfo)).rejects.toThrow(ForbiddenException)

    // Commission succeeds once per sprint (5% x 150,000 = 7,500)
    const comm = await h.commissionService.runCommission(1, cfo)
    expect(new Prisma.Decimal(comm.amount).toFixed(2)).toBe('7500.00')
    expect(h.wallets.get('emp_cfo').balance.toFixed(2)).toBe('7500.00')

    // Second commission run in same sprint blocked
    await expect(h.commissionService.runCommission(1, cfo)).rejects.toThrow(ConflictException)
  })

  it('enforces Executive Payroll 4-distinct-executive block & CEO exclusion, plus Squad Payroll dual-role & swap flag consumption', async () => {
    // 1. Missing 4th executive -> logs warning & blocks instead of paying 3
    const incomplete = createWorkflowHarness({ omitChroExec: true })
    incomplete.accounts.get('acc_company').balance = new Prisma.Decimal('50000.00')
    await expect(incomplete.payrollService.runExecutivePayroll(1, cfo)).rejects.toThrow(BadRequestException)

    // 2. Complete 4 executives + CPO dual-role as Gamma PM
    const h = createWorkflowHarness({ cpoIsAlsoGammaPm: true })
    h.accounts.get('acc_company').balance = new Prisma.Decimal('50000.00')

    const execRun = await h.payrollService.runExecutivePayroll(1, cfo)
    expect(execRun.run.headcount).toBe(4)
    expect(new Prisma.Decimal(execRun.run.totalAmount).toFixed(2)).toBe('10000.00')
    expect(h.wallets.get('emp_ceo')).toBeUndefined() // CEO excluded
    expect(h.wallets.get('emp_cpo').balance.toFixed(2)).toBe('2500.00')

    // Idempotent retry on EXEC:1
    const execRetry = await h.payrollService.runExecutivePayroll(1, cfo)
    expect(execRetry.idempotentHit).toBe(true)
    expect(h.wallets.get('emp_cpo').balance.toFixed(2)).toBe('2500.00')

    // Record SWAP_FIRE penalty for Gamma -> triggersRosterChange = true
    await h.penaltyService.recordPenalty(
      { sprintNumber: 1, teamId: 'team_gamma', category: 'SWAP_FIRE', reason: 'Squad roster swap required' },
      chro,
    )

    // Generate Gamma squad payroll -> surfaces pending swap alert & dedupes dual-membership within Gamma
    const draft = await h.payrollService.generateSquadPayroll(1, 'team_gamma', cfo)
    expect((draft.run.rosterSnapshot as any).pendingRosterChanges).toHaveLength(1)
    expect(draft.run.headcount).toBe(2) // emp_cpo (PM) + emp_dev_gamma

    // Unconfirmed squad payroll blocked from batch execution
    await expect(
      h.payrollService.executeSquadPayrollBatch({ sprintNumber: 1, runIds: [draft.run.id] }, cfo),
    ).rejects.toThrow(BadRequestException)

    // CFO cannot confirm Gamma squad payroll
    await expect(h.payrollService.confirmSquadPayroll(draft.run.id, cfo)).rejects.toThrow(ForbiddenException)

    // CPO (as Gamma PM) confirms Gamma squad payroll -> batch execute pays CPO again as Gamma PM and consumes swap flag
    await h.payrollService.confirmSquadPayroll(draft.run.id, cpo)
    const batchExec = await h.payrollService.executeSquadPayrollBatch(
      { sprintNumber: 1, runIds: [draft.run.id] },
      cfo,
    )
    expect(batchExec.executedRuns).toHaveLength(1)
    expect(batchExec.executedRuns[0].rosterChangeFlagConsumed).toBe(true)
    expect(h.wallets.get('emp_cpo').balance.toFixed(2)).toBe('5000.00') // Exec (2500) + Gamma PM (2500)
    expect(h.wallets.get('emp_dev_gamma').balance.toFixed(2)).toBe('2500.00')
    expect(h.penaltyRecords[0].rosterChangeConsumedByRunId).toBe(draft.run.id)
  })

  it('enforces Bonus 5-criteria tiers, self-approval block, and pool-credit cap at approval and disbursement', async () => {
    const h = createWorkflowHarness()

    // Invalid criterion weight (> 25) rejected
    await expect(
      h.bonusService.scoreBonus(
        {
          sprintNumber: 1,
          teamId: 'team_alpha',
          employeeId: 'emp_dev_alpha',
          criteriaScores: { delivery: 30, quality: 18, ownership: 20, collaboration: 12, reliability: 12 },
          evidence: 'High velocity sprint PRs merged cleanly',
        },
        pmAlpha,
      ),
    ).rejects.toThrow(BadRequestException)

    // Valid high score (92 -> 5000.00 Tier S)
    const award = await h.bonusService.scoreBonus(
      {
        sprintNumber: 1,
        teamId: 'team_alpha',
        employeeId: 'emp_dev_alpha',
        criteriaScores: { delivery: 24, quality: 19, ownership: 23, collaboration: 13, reliability: 13 },
        evidence: 'Shipped entire checkout flow ahead of deadline',
      },
      pmAlpha,
    )
    expect(new Prisma.Decimal(award.tierAmount).toFixed(2)).toBe('5000.00')

    // Blocked when no POOL_CREDIT posted yet
    await expect(h.bonusService.approveBonus(award.id, ceo)).rejects.toThrow(BadRequestException)

    // Seed small POOL_CREDIT (4,000) -> 5,000 award exceeds 4,000 pool cap -> still blocked
    h.moneyRequests.push({
      id: 'pool_small',
      type: 'POOL_CREDIT',
      sprintNumber: 1,
      teamId: 'team_alpha',
      amount: new Prisma.Decimal('4000.00'),
      status: 'PAID',
    })
    await expect(h.bonusService.approveBonus(award.id, ceo)).rejects.toThrow(BadRequestException)

    // Top up POOL_CREDIT (+2,000 => 6,000 total) -> approve & disburse succeed
    h.moneyRequests[0].amount = new Prisma.Decimal('6000.00')
    await h.bonusService.approveBonus(award.id, ceo)
    const disbursed = await h.bonusService.disburseBonus(award.id, cfo)
    expect(disbursed.award.status).toBe('PAID')
    expect(h.wallets.get('emp_dev_alpha').balance.toFixed(2)).toBe('5000.00')
    expect(h.wallets.get('emp_dev_alpha').sprintBonusEarned.toFixed(2)).toBe('5000.00')
  })

  it('enforces Penalty role matrix, DEADLINE CEO approval, zero-paise 20/80 split, and BLIND_QA routing', async () => {
    const h = createWorkflowHarness()

    // CTO blocked from SLACKER; CHRO blocked from CODE_SMELL
    await expect(
      h.penaltyService.recordPenalty(
        { sprintNumber: 1, teamId: 'team_alpha', category: 'SLACKER', reason: 'Repeated idle time' },
        cto,
      ),
    ).rejects.toThrow(ForbiddenException)
    await expect(
      h.penaltyService.recordPenalty(
        { sprintNumber: 1, teamId: 'team_alpha', category: 'CODE_SMELL', reason: 'Missing tests' },
        chro,
      ),
    ).rejects.toThrow(ForbiddenException)

    // CFO records DEADLINE -> PENDING_CEO_APPROVAL -> cannot post until CEO approves -> 20% CFO / 80% Company Fund
    const deadlinePen = await h.penaltyService.recordPenalty(
      { sprintNumber: 1, teamId: 'team_alpha', category: 'DEADLINE', reason: 'Missed Sprint 1 delivery cutoff' },
      cfo,
    )
    expect(deadlinePen.status).toBe('PENDING_CEO_APPROVAL')
    expect(new Prisma.Decimal(deadlinePen.recipientShare).toFixed(2)).toBe('500.00')
    expect(new Prisma.Decimal(deadlinePen.companyFundShare).toFixed(2)).toBe('2000.00')
    await expect(h.penaltyService.postPenalty(deadlinePen.id, cfo)).rejects.toThrow(BadRequestException)

    await h.penaltyService.approvePenalty(deadlinePen.id, ceo)
    const postedDeadline = await h.penaltyService.postPenalty(deadlinePen.id, cfo)
    expect(postedDeadline.penalty.ledgerTxIds).toHaveLength(2)
    expect(h.wallets.get('emp_cfo').balance.toFixed(2)).toBe('500.00')
    expect(h.accounts.get('acc_company').balance.toFixed(2)).toBe('2000.00')
    expect(h.accounts.get('acc_team_alpha').balance.toFixed(2)).toBe('97500.00')

    // BLIND_QA routes 100% (1,500.00) to Company Fund in 1 ledger leg
    const blindQa = await h.penaltyService.recordPenalty(
      { sprintNumber: 1, teamId: 'team_alpha', category: 'BLIND_QA', reason: 'Unverified PR broke staging' },
      cto,
    )
    const postedBlindQa = await h.penaltyService.postPenalty(blindQa.id, cfo)
    expect(postedBlindQa.penalty.ledgerTxIds).toHaveLength(1)
    expect(h.accounts.get('acc_company').balance.toFixed(2)).toBe('3500.00')
    expect(h.accounts.get('acc_team_alpha').balance.toFixed(2)).toBe('96000.00')
  })
})
