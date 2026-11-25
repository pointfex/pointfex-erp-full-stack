import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { LedgerService } from './ledger.service'

function createStatefulLedgerPrismaMock() {
  let seq = 1
  const nextId = (prefix: string) => `${prefix}_${seq++}`

  const teams = [
    { id: 'team_alpha', name: 'Team Alpha', code: 'TA', pmPositionId: 'pos_pm_alpha', createdAt: new Date() },
    { id: 'team_bravo', name: 'Team Bravo', code: 'TB', pmPositionId: 'pos_pm_bravo', createdAt: new Date() },
  ]

  const positionAssignments = [
    {
      employeeId: 'emp_pm_alpha',
      positionId: 'pos_pm_alpha',
      isActive: true,
      assignedAt: new Date(),
      position: { roleCategory: 'pm' },
      employee: { id: 'emp_pm_alpha', name: 'Alpha PM', status: 'active' },
    },
  ]

  const teamMemberships = [
    { id: 'tm_1', teamId: 'team_alpha', employeeId: 'emp_dev_alpha', isActive: true, roleInTeam: 'developer' },
    { id: 'tm_2', teamId: 'team_bravo', employeeId: 'emp_dev_bravo', isActive: true, roleInTeam: 'developer' },
  ]

  const accounts = new Map<string, any>([
    [
      'acc_company',
      {
        id: 'acc_company',
        code: 'COMPANY_FUND',
        name: 'Company Fund',
        type: 'COMPANY_FUND',
        teamId: null,
        balance: new Prisma.Decimal('200000.00'),
        currency: 'BDT',
        isActive: true,
      },
    ],
    [
      'acc_alpha',
      {
        id: 'acc_alpha',
        code: 'SQUAD_team_alpha',
        name: 'Team Alpha Squad Account',
        type: 'SQUAD',
        teamId: 'team_alpha',
        balance: new Prisma.Decimal('100000.00'),
        currency: 'BDT',
        isActive: true,
      },
    ],
    [
      'acc_bravo',
      {
        id: 'acc_bravo',
        code: 'SQUAD_team_bravo',
        name: 'Team Bravo Squad Account',
        type: 'SQUAD',
        teamId: 'team_bravo',
        balance: new Prisma.Decimal('100000.00'),
        currency: 'BDT',
        isActive: true,
      },
    ],
  ])

  const wallets = new Map<string, any>()
  const financialTransactions: any[] = []
  const ledgerTransactions: any[] = []
  const sprintLocks = new Map<number, any>()
  const notifications: any[] = []
  const auditLogs: any[] = []

  const snapshotState = () => ({
    accounts: new Map(Array.from(accounts.entries()).map(([k, v]) => [k, { ...v, balance: new Prisma.Decimal(v.balance) }])),
    wallets: new Map(
      Array.from(wallets.entries()).map(([k, v]) => [
        k,
        {
          ...v,
          balance: new Prisma.Decimal(v.balance),
          totalEarnedToDate: new Prisma.Decimal(v.totalEarnedToDate),
          sprintBonusEarned: new Prisma.Decimal(v.sprintBonusEarned),
          totalPenalties: new Prisma.Decimal(v.totalPenalties),
          totalSpendings: new Prisma.Decimal(v.totalSpendings),
        },
      ]),
    ),
    finLen: financialTransactions.length,
    ledLen: ledgerTransactions.length,
    locks: new Map(Array.from(sprintLocks.entries()).map(([k, v]) => [k, { ...v }])),
    notifLen: notifications.length,
    auditLen: auditLogs.length,
  })

  const restoreState = (snap: ReturnType<typeof snapshotState>) => {
    accounts.clear()
    for (const [k, v] of snap.accounts) accounts.set(k, v)
    wallets.clear()
    for (const [k, v] of snap.wallets) wallets.set(k, v)
    financialTransactions.length = snap.finLen
    ledgerTransactions.length = snap.ledLen
    sprintLocks.clear()
    for (const [k, v] of snap.locks) sprintLocks.set(k, v)
    notifications.length = snap.notifLen
    auditLogs.length = snap.auditLen
  }

  let txQueue = Promise.resolve()

  const attachReversedBy = (row: any) => ({
    ...row,
    reversedBy: ledgerTransactions.find((r) => r.reversalOfId === row.id) || null,
  })

  const matchesSimpleOrClause = (row: any, orClauses: any[]): boolean =>
    orClauses.some((clause) => {
      if (clause.teamId?.in) return clause.teamId.in.includes(row.teamId)
      if (clause.employeeId) return row.employeeId === clause.employeeId
      if (clause.sourceKind && clause.sourceRefId) {
        if (clause.sourceRefId.in) {
          return row.sourceKind === clause.sourceKind && clause.sourceRefId.in.includes(row.sourceRefId)
        }
        return row.sourceKind === clause.sourceKind && row.sourceRefId === clause.sourceRefId
      }
      if (clause.destKind && clause.destRefId) {
        if (clause.destRefId.in) {
          return row.destKind === clause.destKind && clause.destRefId.in.includes(row.destRefId)
        }
        return row.destKind === clause.destKind && row.destRefId === clause.destRefId
      }
      if (clause.referenceNo?.contains) {
        return row.referenceNo.toLowerCase().includes(clause.referenceNo.contains.toLowerCase())
      }
      if (clause.reason?.contains) {
        return row.reason.toLowerCase().includes(clause.reason.contains.toLowerCase())
      }
      return false
    })

  const matchesWhere = (row: any, where: any): boolean => {
    if (!where) return true
    if (where.AND) {
      return where.AND.every((c: any) => matchesWhere(row, c))
    }
    if (where.OR) {
      return matchesSimpleOrClause(row, where.OR)
    }
    if (where.sprintNumber !== undefined && row.sprintNumber !== where.sprintNumber) return false
    if (where.type !== undefined && row.type !== where.type) return false
    if (where.teamId !== undefined && row.teamId !== where.teamId) return false
    if (where.employeeId !== undefined && row.employeeId !== where.employeeId) return false
    return true
  }

  const client: any = {
    companyTreasury: {
      findUnique: jest.fn(async () => ({ id: 'singleton', unallocatedReserves: new Prisma.Decimal('999999.00') })),
      update: jest.fn(async () => {
        throw new Error('CompanyTreasury must NOT be mutated by LedgerService')
      }),
    },
    team: {
      findMany: jest.fn(async ({ where }: any) => {
        let res = [...teams]
        if (where?.pmPositionId?.in) {
          res = res.filter((t) => where.pmPositionId.in.includes(t.pmPositionId))
        }
        return res
      }),
    },
    teamMembership: {
      findMany: jest.fn(async ({ where }: any) =>
        teamMemberships.filter(
          (m) => m.employeeId === where.employeeId && m.isActive === where.isActive,
        ),
      ),
    },
    positionAssignment: {
      findMany: jest.fn(async ({ where }: any) =>
        positionAssignments.filter((pa) => pa.employeeId === where.employeeId && pa.isActive),
      ),
    },
    employeeRole: {
      findMany: jest.fn(async () => []),
    },
    financeAccount: {
      findUnique: jest.fn(async ({ where, include }: any) => {
        let acc: any = null
        if (where.id) acc = accounts.get(where.id) || null
        else if (where.teamId) acc = Array.from(accounts.values()).find((a) => a.teamId === where.teamId) || null
        else if (where.code) acc = Array.from(accounts.values()).find((a) => a.code === where.code) || null
        if (!acc) return null
        return include?.team ? { ...acc, team: teams.find((t) => t.id === acc.teamId) || null } : { ...acc }
      }),
      findMany: jest.fn(async ({ where, include }: any = {}) => {
        let list = Array.from(accounts.values())
        if (where?.type) list = list.filter((a) => a.type === where.type)
        if (where?.teamId?.in) list = list.filter((a) => where.teamId.in.includes(a.teamId))
        return list.map((a) => ({
          ...a,
          ...(include?.team ? { team: teams.find((t) => t.id === a.teamId) || null } : {}),
        }))
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const acc = accounts.get(where.id)
        if (!acc) throw new Error(`Account ${where.id} not found`)
        acc.balance = new Prisma.Decimal(data.balance)
        return { ...acc }
      }),
    },
    employeeWallet: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.employeeId) return wallets.get(where.employeeId) || null
        if (where.id) return Array.from(wallets.values()).find((w) => w.id === where.id) || null
        return null
      }),
      upsert: jest.fn(async ({ where, create }: any) => {
        const existing = wallets.get(where.employeeId)
        if (existing) return existing
        const created = {
          id: nextId('wallet'),
          employeeId: create.employeeId,
          balance: new Prisma.Decimal(create.balance ?? 0),
          totalEarnedToDate: new Prisma.Decimal(0),
          sprintBonusEarned: new Prisma.Decimal(0),
          totalPenalties: new Prisma.Decimal(0),
          totalSpendings: new Prisma.Decimal(0),
          currency: 'BDT',
          currencySymbol: '৳',
          lastPayoutDate: null,
        }
        wallets.set(create.employeeId, created)
        return created
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const w = Array.from(wallets.values()).find((item) => item.id === where.id)
        if (!w) throw new Error(`Wallet ${where.id} not found`)
        if (data.balance !== undefined) w.balance = new Prisma.Decimal(data.balance)
        if (data.totalEarnedToDate !== undefined) w.totalEarnedToDate = new Prisma.Decimal(data.totalEarnedToDate)
        if (data.sprintBonusEarned !== undefined) w.sprintBonusEarned = new Prisma.Decimal(data.sprintBonusEarned)
        if (data.totalSpendings !== undefined) w.totalSpendings = new Prisma.Decimal(data.totalSpendings)
        if (data.lastPayoutDate !== undefined) w.lastPayoutDate = data.lastPayoutDate
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
      findUnique: jest.fn(async ({ where, include }: any) => {
        let found: any = null
        if (where.id) found = ledgerTransactions.find((t) => t.id === where.id) || null
        else if (where.idempotencyKey) {
          found = ledgerTransactions.find((t) => t.idempotencyKey === where.idempotencyKey) || null
        } else if (where.reversalOfId) {
          found = ledgerTransactions.find((t) => t.reversalOfId === where.reversalOfId) || null
        }
        if (!found) return null
        return include?.reversedBy ? attachReversedBy(found) : { ...found }
      }),
      findMany: jest.fn(async ({ where, include }: any = {}) => {
        const rows = ledgerTransactions.filter((r) => matchesWhere(r, where))
        return rows.map((r) => (include?.reversedBy ? attachReversedBy(r) : { ...r }))
      }),
      create: jest.fn(async ({ data }: any) => {
        if (ledgerTransactions.some((t) => t.idempotencyKey === data.idempotencyKey)) {
          throw new Error(`Unique constraint failed on idempotencyKey=${data.idempotencyKey}`)
        }
        if (data.reversalOfId && ledgerTransactions.some((t) => t.reversalOfId === data.reversalOfId)) {
          throw new Error(`Unique constraint failed on reversalOfId=${data.reversalOfId}`)
        }
        const row = { id: nextId('ltx'), createdAt: new Date(), ...data }
        ledgerTransactions.push(row)
        return { ...row }
      }),
      update: jest.fn(async () => {
        throw new Error('Security policy: ledgerTransaction.update() is blocked (append-only)')
      }),
      delete: jest.fn(async () => {
        throw new Error('Security policy: ledgerTransaction.delete() is blocked (append-only)')
      }),
    },
    sprintLock: {
      findUnique: jest.fn(async ({ where }: any) => sprintLocks.get(where.sprintNumber) || null),
      findMany: jest.fn(async () => Array.from(sprintLocks.values())),
      upsert: jest.fn(async ({ where, update, create }: any) => {
        const existing = sprintLocks.get(where.sprintNumber)
        if (existing) {
          Object.assign(existing, update)
          return { ...existing }
        }
        const created = { id: nextId('lock'), createdAt: new Date(), ...create }
        sprintLocks.set(where.sprintNumber, created)
        return { ...created }
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const existing = sprintLocks.get(where.sprintNumber)
        Object.assign(existing, data)
        return { ...existing }
      }),
    },
    notification: {
      createMany: jest.fn(async ({ data }: any) => {
        notifications.push(...data)
        return { count: data.length }
      }),
    },
    $queryRaw: jest.fn(async (strings: TemplateStringsArray) => {
      const sql = strings.join(' ')
      if (sql.includes('finance_accounts')) {
        return Array.from(accounts.values()).map((a) => ({ ...a }))
      }
      if (sql.includes('employee_wallets')) {
        return Array.from(wallets.values()).map((w) => ({ ...w }))
      }
      return []
    }),
    $transaction: jest.fn((cb: (tx: any) => Promise<any>) => {
      const run = txQueue.then(async () => {
        const snap = snapshotState()
        try {
          return await cb(client)
        } catch (err) {
          restoreState(snap)
          throw err
        }
      })
      txQueue = run.then(
        () => undefined,
        () => undefined,
      )
      return run
    }),
  }

  const auditLogger: any = {
    log: jest.fn(async (entry: any) => {
      auditLogs.push(entry)
      return entry
    }),
  }

  return {
    client,
    auditLogger,
    accounts,
    wallets,
    financialTransactions,
    ledgerTransactions,
    sprintLocks,
    auditLogs,
  }
}

describe('LedgerService (Phase 2 & 10 Invariants)', () => {
  const cfoActor: any = { id: 'emp_cfo_01', role: 'cfo', email: 'cfo@pointfex.com' }
  const ceoActor: any = {
    id: 'emp_ceo_01',
    role: 'ceo',
    email: 'ceo@pointfex.com',
    permissions: ['system:root'],
  }
  const auditorActor: any = {
    id: 'emp_auditor_01',
    role: 'auditor',
    email: 'auditor@pointfex.com',
    permissions: ['finance_ledger:read_all', 'finance_reports:export'],
  }
  const pmAlphaActor: any = { id: 'emp_pm_alpha', role: 'pm', email: 'pm.alpha@pointfex.com' }
  const devAlphaActor: any = { id: 'emp_dev_alpha', role: 'developer', email: 'dev.alpha@pointfex.com' }

  it('conserves double-entry balances, mirrors to EmployeeWallet & FinancialTransaction, and never mutates CompanyTreasury', async () => {
    const fixture = createStatefulLedgerPrismaMock()
    const ledger = new LedgerService(fixture.client, fixture.auditLogger)

    const res = await ledger.postTransaction(
      {
        idempotencyKey: 'bonus_test_1',
        sprintNumber: 1,
        type: 'BONUS_AWARD',
        sourceKind: 'FINANCE_ACCOUNT',
        sourceRefId: 'acc_alpha',
        destKind: 'PERSONAL_WALLET',
        destRefId: 'emp_dev_alpha',
        teamId: 'team_alpha',
        employeeId: 'emp_dev_alpha',
        grossAmount: '5000.00',
        reason: 'Top sprint score bonus',
      },
      cfoActor,
    )

    expect(res.idempotentHit).toBe(false)
    expect(fixture.accounts.get('acc_alpha').balance.toFixed(2)).toBe('95000.00')
    expect(fixture.wallets.get('emp_dev_alpha').balance.toFixed(2)).toBe('5000.00')
    expect(fixture.wallets.get('emp_dev_alpha').totalEarnedToDate.toFixed(2)).toBe('5000.00')
    expect(fixture.wallets.get('emp_dev_alpha').sprintBonusEarned.toFixed(2)).toBe('5000.00')
    expect(fixture.financialTransactions).toHaveLength(1)
    expect(fixture.financialTransactions[0].type).toBe('cfo_bonus_award')
    expect(fixture.client.companyTreasury.update).not.toHaveBeenCalled()
    expect(fixture.auditLogs).toHaveLength(1)
  })

  it('blocks negative balances on FINANCE_ACCOUNT and PERSONAL_WALLET transfers and post-spend reversals', async () => {
    const fixture = createStatefulLedgerPrismaMock()
    const ledger = new LedgerService(fixture.client, fixture.auditLogger)

    // Exceeds Team Alpha Tk 100,000 balance
    await expect(
      ledger.postTransaction(
        {
          idempotencyKey: 'too_big_1',
          sprintNumber: 1,
          type: 'TRANSFER',
          sourceKind: 'FINANCE_ACCOUNT',
          sourceRefId: 'acc_alpha',
          destKind: 'FINANCE_ACCOUNT',
          destRefId: 'acc_bravo',
          grossAmount: '150000.00',
          reason: 'Oversized transfer',
        },
        cfoActor,
      ),
    ).rejects.toThrow(BadRequestException)

    // Pay dev 3,000 then spend 2,000, leaving 1,000 -> reversing 3,000 must fail
    const payout = await ledger.postTransaction(
      {
        idempotencyKey: 'pay_dev_1',
        sprintNumber: 1,
        type: 'SQUAD_PAYROLL',
        sourceKind: 'FINANCE_ACCOUNT',
        sourceRefId: 'acc_alpha',
        destKind: 'PERSONAL_WALLET',
        destRefId: 'emp_dev_alpha',
        teamId: 'team_alpha',
        employeeId: 'emp_dev_alpha',
        grossAmount: '3000.00',
        reason: 'Sprint 1 dev salary',
      },
      cfoActor,
    )

    await ledger.postTransaction(
      {
        idempotencyKey: 'dev_spend_1',
        sprintNumber: 1,
        type: 'TRANSFER',
        sourceKind: 'PERSONAL_WALLET',
        sourceRefId: 'emp_dev_alpha',
        destKind: 'FINANCE_ACCOUNT',
        destRefId: 'acc_company',
        employeeId: 'emp_dev_alpha',
        grossAmount: '2000.00',
        reason: 'Device reimbursement settlement',
      },
      cfoActor,
    )

    await expect(
      ledger.reverseTransaction(payout.transaction.id, 'Duplicate payroll payout check', cfoActor),
    ).rejects.toThrow(BadRequestException)

    // Verify rollback preserved dev wallet at 1,000.00
    expect(fixture.wallets.get('emp_dev_alpha').balance.toFixed(2)).toBe('1000.00')
  })

  it('blocks Company Fund -> Squad Payroll and Bonus paths directly and via transfers', async () => {
    const fixture = createStatefulLedgerPrismaMock()
    const ledger = new LedgerService(fixture.client, fixture.auditLogger)

    await expect(
      ledger.postTransaction(
        {
          idempotencyKey: 'blocked_cf_payroll',
          sprintNumber: 1,
          type: 'SQUAD_PAYROLL',
          sourceKind: 'FINANCE_ACCOUNT',
          sourceRefId: 'acc_company',
          destKind: 'PERSONAL_WALLET',
          destRefId: 'emp_dev_alpha',
          grossAmount: '2500.00',
          reason: 'Direct company fund squad payroll',
        },
        cfoActor,
      ),
    ).rejects.toThrow(BadRequestException)

    await expect(
      ledger.postTransaction(
        {
          idempotencyKey: 'blocked_cf_transfer_bonus',
          sprintNumber: 1,
          type: 'TRANSFER',
          sourceKind: 'FINANCE_ACCOUNT',
          sourceRefId: 'acc_company',
          destKind: 'FINANCE_ACCOUNT',
          destRefId: 'acc_alpha',
          grossAmount: '5000.00',
          reason: 'Transfer for bonus award',
          metadata: { purpose: 'BONUS_AWARD' },
        },
        cfoActor,
      ),
    ).rejects.toThrow(BadRequestException)
  })

  it('guarantees idempotency under sequential and concurrent Promise.all execution and rejects double reversals', async () => {
    const fixture = createStatefulLedgerPrismaMock()
    const ledger = new LedgerService(fixture.client, fixture.auditLogger)

    const payload = {
      idempotencyKey: 'concurrent_exec_1',
      sprintNumber: 1,
      type: 'EXECUTIVE_PAYROLL' as const,
      sourceKind: 'FINANCE_ACCOUNT' as const,
      sourceRefId: 'acc_company',
      destKind: 'PERSONAL_WALLET' as const,
      destRefId: 'emp_cfo_01',
      employeeId: 'emp_cfo_01',
      grossAmount: '2500.00',
      reason: 'Executive salary Sprint 1',
    }

    const [r1, r2] = await Promise.all([
      ledger.postTransaction(payload, cfoActor),
      ledger.postTransaction(payload, cfoActor),
    ])

    expect(r1.transaction.id).toBe(r2.transaction.id)
    expect(Number(r1.idempotentHit) + Number(r2.idempotentHit)).toBe(1)
    expect(fixture.accounts.get('acc_company').balance.toFixed(2)).toBe('197500.00')
    expect(fixture.wallets.get('emp_cfo_01').balance.toFixed(2)).toBe('2500.00')

    // First reversal succeeds without mutating original row
    const rev1 = await ledger.reverseTransaction(
      r1.transaction.id,
      'Reversing executive payout test',
      cfoActor,
    )
    expect(rev1.reversed).toBe(true)
    expect(fixture.client.ledgerTransaction.update).not.toHaveBeenCalled()
    expect(fixture.client.ledgerTransaction.delete).not.toHaveBeenCalled()
    expect(fixture.accounts.get('acc_company').balance.toFixed(2)).toBe('200000.00')
    expect(fixture.wallets.get('emp_cfo_01').balance.toFixed(2)).toBe('0.00')

    // Second reversal fails cleanly
    await expect(
      ledger.reverseTransaction(r1.transaction.id, 'Double reversal attempt', cfoActor),
    ).rejects.toThrow(BadRequestException)
  })

  it('enforces SprintLock workflow and CEO-only reversal override on closed sprints', async () => {
    const fixture = createStatefulLedgerPrismaMock()
    const ledger = new LedgerService(fixture.client, fixture.auditLogger)

    const posted = await ledger.postTransaction(
      {
        idempotencyKey: 'sprint_close_tx',
        sprintNumber: 2,
        type: 'ADD_MONEY',
        sourceKind: 'EXTERNAL',
        sourceRefId: 'EXT',
        destKind: 'FINANCE_ACCOUNT',
        destRefId: 'acc_company',
        grossAmount: '10000.00',
        reason: 'Client deposit Sprint 2',
      },
      cfoActor,
    )

    await ledger.requestSprintLock(2, 'Sprint 2 reconciliation complete', cfoActor)

    // Self-approval blocked if same user tries
    await expect(ledger.approveSprintLock(2, cfoActor)).rejects.toThrow(ForbiddenException)

    // CEO approves sprint lock
    const locked = await ledger.approveSprintLock(2, ceoActor)
    expect(locked.status).toBe('LOCKED')

    // CFO blocked from posting or reversing in locked sprint 2
    await expect(
      ledger.postTransaction(
        {
          idempotencyKey: 'locked_post',
          sprintNumber: 2,
          type: 'ADD_MONEY',
          sourceKind: 'EXTERNAL',
          sourceRefId: 'EXT',
          destKind: 'FINANCE_ACCOUNT',
          destRefId: 'acc_company',
          grossAmount: '500.00',
          reason: 'Late deposit',
        },
        cfoActor,
      ),
    ).rejects.toThrow(ForbiddenException)

    await expect(
      ledger.reverseTransaction(posted.transaction.id, 'Late reversal by CFO', cfoActor),
    ).rejects.toThrow(ForbiddenException)

    // CEO reversal override succeeds on locked sprint
    const ceoRev = await ledger.reverseTransaction(
      posted.transaction.id,
      'CEO period-close adjustment reversal',
      ceoActor,
    )
    expect(ceoRev.reversed).toBe(true)
    expect(fixture.accounts.get('acc_company').balance.toFixed(2)).toBe('200000.00')
  })

  it('enforces backend role scoping on accounts/transactions/statements and neutralizes CSV formula injection', async () => {
    const fixture = createStatefulLedgerPrismaMock()
    const ledger = new LedgerService(fixture.client, fixture.auditLogger)

    await ledger.postTransaction(
      {
        idempotencyKey: 'formula_tx_alpha',
        sprintNumber: 1,
        type: 'BONUS_AWARD',
        sourceKind: 'FINANCE_ACCOUNT',
        sourceRefId: 'acc_alpha',
        destKind: 'PERSONAL_WALLET',
        destRefId: 'emp_dev_alpha',
        teamId: 'team_alpha',
        employeeId: 'emp_dev_alpha',
        grossAmount: '2000.00',
        reason: '=HYPERLINK("http://evil.test","click"), "quote" test',
      },
      cfoActor,
    )

    await ledger.postTransaction(
      {
        idempotencyKey: 'bravo_tx',
        sprintNumber: 1,
        type: 'BONUS_AWARD',
        sourceKind: 'FINANCE_ACCOUNT',
        sourceRefId: 'acc_bravo',
        destKind: 'PERSONAL_WALLET',
        destRefId: 'emp_dev_bravo',
        teamId: 'team_bravo',
        employeeId: 'emp_dev_bravo',
        grossAmount: '2000.00',
        reason: '+CMD|Bravo dev reward',
      },
      cfoActor,
    )

    // Auditor sees all accounts & transactions
    const auditorAccounts = await ledger.getAccounts(auditorActor)
    expect(auditorAccounts.scope).toBe('GLOBAL')
    expect(auditorAccounts.accounts).toHaveLength(3)
    const auditorTxs = await ledger.getTransactions({}, auditorActor)
    expect(auditorTxs).toHaveLength(2)

    // PM Alpha sees only Alpha squad account & cannot inspect Bravo statement
    const pmAccounts = await ledger.getAccounts(pmAlphaActor)
    expect(pmAccounts.scope).toBe('PM_SQUAD')
    expect(pmAccounts.companyFund).toBeNull()
    expect(pmAccounts.squadAccounts).toHaveLength(1)
    expect(pmAccounts.squadAccounts[0].teamId).toBe('team_alpha')
    await expect(ledger.getAccountStatement('acc_bravo', {}, pmAlphaActor)).rejects.toThrow(
      ForbiddenException,
    )

    // Developer Alpha sees only own personal transaction (NOT Bravo, NOT statement)
    const devAccounts = await ledger.getAccounts(devAlphaActor)
    expect(devAccounts.scope).toBe('MEMBER_SELF')
    expect(devAccounts.companyFund).toBeNull()
    expect(devAccounts.squadAccounts).toHaveLength(1)
    const devTxs = await ledger.getTransactions({}, devAlphaActor)
    expect(devTxs).toHaveLength(1)
    expect(devTxs[0].employeeId).toBe('emp_dev_alpha')
    await expect(ledger.getAccountStatement('acc_alpha', {}, devAlphaActor)).rejects.toThrow(
      ForbiddenException,
    )

    // CSV export neutralizes leading = and + triggers and escapes RFC-4180 quotes
    const exported = await ledger.exportTransactionsCsv({}, auditorActor)
    expect(exported.count).toBe(2)
    expect(exported.csv).toContain(`"'=HYPERLINK(""http://evil.test"",""click""), ""quote"" test"`)
    expect(exported.csv).toContain(`'+CMD|Bravo dev reward`)
  })
})
