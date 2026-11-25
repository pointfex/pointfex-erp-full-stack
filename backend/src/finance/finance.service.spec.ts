import { Test, TestingModule } from '@nestjs/testing'
import { FinanceService } from './finance.service'
import { PrismaService } from '../common/prisma.service'
import { BadRequestException } from '@nestjs/common'
import { Prisma } from '@prisma/client'

describe('FinanceService - Financial Constraints & Ledger Integrity', () => {
  let service: FinanceService
  let prisma: any

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn((callback) => callback(prisma)),
      companyTreasury: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      project: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      employee: {
        findUnique: jest.fn(),
      },
      employeeWallet: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      financialTransaction: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      budgetRequest: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [FinanceService, { provide: PrismaService, useValue: prisma }],
    }).compile()

    service = module.get<FinanceService>(FinanceService)
  })

  describe('PM Developer Budget Allocation Constraint', () => {
    it('should reject allocation if amount exceeds remaining project budget', async () => {
      // Project budget ৳45,000, already allocated ৳40,000 => Remaining is ৳5,000
      prisma.project.findUnique.mockResolvedValue({
        id: 'proj_01',
        budget: new Prisma.Decimal(45000),
        allocatedBudget: new Prisma.Decimal(40000),
      })
      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp_dev_01',
        name: 'Arifur Rahman',
      })

      // PM attempts to allocate ৳6,000 (exceeds remaining ৳5,000)
      await expect(
        service.allocateDeveloperBudget(
          {
            developerId: 'emp_dev_01',
            projectId: 'proj_01',
            amount: 6000,
          },
          { id: 'emp_pm_01', role: 'pm' },
        ),
      ).rejects.toThrow(BadRequestException)
    })

    it('should succeed and disburse if amount is within remaining project budget', async () => {
      prisma.project.findUnique.mockResolvedValue({
        id: 'proj_01',
        budget: new Prisma.Decimal(45000),
        allocatedBudget: new Prisma.Decimal(35000),
      })
      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp_dev_01',
        name: 'Arifur Rahman',
      })
      prisma.project.update.mockResolvedValue({
        id: 'proj_01',
        allocatedBudget: new Prisma.Decimal(40000),
      })
      prisma.employeeWallet.upsert.mockResolvedValue({
        id: 'wal_01',
        balance: new Prisma.Decimal(15000),
      })
      prisma.financialTransaction.create.mockResolvedValue({
        id: 'tx_01',
        amount: new Prisma.Decimal(5000),
      })

      const result = await service.allocateDeveloperBudget(
        {
          developerId: 'emp_dev_01',
          projectId: 'proj_01',
          amount: 5000,
        },
        { id: 'emp_pm_01', role: 'pm' },
      )

      expect(result.message).toContain('Successfully allocated')
      expect(prisma.project.update).toHaveBeenCalled()
      expect(prisma.employeeWallet.upsert).toHaveBeenCalled()
      expect(prisma.financialTransaction.create).toHaveBeenCalled()
    })
  })

  describe('CFO Project Budget Pool Constraint', () => {
    it('should reject budget adjustment if delta exceeds unallocated liquid reserves', async () => {
      // Project budget ৳30,000, target new budget ৳60,000 (delta +৳30,000)
      // Treasury unallocated reserves: ৳20,000 (less than ৳30,000 delta)
      prisma.project.findUnique.mockResolvedValue({
        id: 'proj_01',
        name: 'Unseen Bangladesh',
        budget: new Prisma.Decimal(30000),
      })
      prisma.companyTreasury.findUnique.mockResolvedValue({
        id: 'singleton',
        unallocatedReserves: new Prisma.Decimal(20000),
      })

      await expect(
        service.allocateProjectBudget(
          {
            projectId: 'proj_01',
            newBudget: 60000,
          },
          { id: 'emp_cfo_01', role: 'cfo' },
        ),
      ).rejects.toThrow(BadRequestException)
    })
  })

  describe('Discretionary Bonus & Penalty Bounds', () => {
    it('should disburse bonus, decrement liquid reserves and credit wallet', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp_dev_01',
        name: 'Arifur Rahman',
      })
      prisma.employeeWallet.findUnique.mockResolvedValue({
        employeeId: 'emp_dev_01',
        balance: new Prisma.Decimal(10000),
      })
      prisma.companyTreasury.findUnique.mockResolvedValue({
        id: 'singleton',
        unallocatedReserves: new Prisma.Decimal(50000),
      })
      prisma.financialTransaction.create.mockResolvedValue({
        id: 'tx_bonus',
      })

      const res = await service.issueAdjustment(
        {
          userId: 'emp_dev_01',
          amount: 5000,
          type: 'bonus',
          reason: 'Outstanding Performance Accolade',
        },
        { id: 'emp_cfo_01', role: 'cfo' },
      )

      expect(res.message).toContain('bonus to Arifur Rahman')
      expect(prisma.employeeWallet.upsert).toHaveBeenCalled()
      expect(prisma.companyTreasury.update).toHaveBeenCalled()
    })

    it('should prevent negative wallet balances on penalty deductions', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp_dev_01',
        name: 'Arifur Rahman',
      })
      // Developer has ৳1,000 balance, penalty is ৳3,000 => balance cannot drop below 0
      prisma.employeeWallet.findUnique.mockResolvedValue({
        employeeId: 'emp_dev_01',
        balance: new Prisma.Decimal(1000),
      })
      prisma.financialTransaction.create.mockResolvedValue({
        id: 'tx_pen',
      })

      await service.issueAdjustment(
        {
          userId: 'emp_dev_01',
          amount: 3000,
          type: 'penalty',
          reason: 'SLA Breach',
        },
        { id: 'emp_chro_01', role: 'chro' },
      )

      expect(prisma.employeeWallet.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            balance: { decrement: new Prisma.Decimal(1000) }, // Deducts at most current balance
            totalPenalties: { increment: new Prisma.Decimal(3000) },
          }),
        }),
      )
    })
  })

  describe('Phase 7c-7e Hardening Fixes', () => {
    it('blocks reverseTransaction when wallet balance would become negative and reverts counters symmetrically', async () => {
      const bonusOrig = {
        id: 'tx_bonus_orig',
        walletId: 'w_1',
        employeeId: 'emp_dev_1',
        projectId: 'proj_1',
        milestoneId: null,
        amount: new Prisma.Decimal('5000.00'),
        type: 'bonus',
      }
      const walletState = {
        id: 'w_1',
        employeeId: 'emp_dev_1',
        balance: new Prisma.Decimal('2000.00'),
        totalEarnedToDate: new Prisma.Decimal('5000.00'),
        sprintBonusEarned: new Prisma.Decimal('5000.00'),
        totalPenalties: new Prisma.Decimal('0.00'),
      }
      const finTxRows: any[] = []
      const auditLogs: any[] = []
      const txMock: any = {
        financialTransaction: {
          findUnique: jest.fn(async () => bonusOrig),
          findFirst: jest.fn(async () => null),
          create: jest.fn(async ({ data }) => {
            const row = { id: 'tx_rev_1', ...data }
            finTxRows.push(row)
            return row
          }),
        },
        employeeWallet: {
          findUnique: jest.fn(async () => ({ ...walletState })),
          update: jest.fn(async ({ data }) => {
            Object.assign(walletState, data)
            return walletState
          }),
        },
      }
      const localPrisma: any = { $transaction: jest.fn(async (cb: any) => cb(txMock)) }
      const localAudit: any = { log: jest.fn(async (entry: any) => auditLogs.push(entry)) }
      const { FinanceService } = require('./finance.service')
      const localSvc = new FinanceService(localPrisma, undefined, undefined, localAudit)

      // Balance is 2,000 < 5,000 reversal -> blocked cleanly
      await expect(
        localSvc.reverseTransaction('tx_bonus_orig', 'Duplicate bonus', { id: 'emp_cfo_01', role: 'cfo' }),
      ).rejects.toThrow(BadRequestException)
      expect(txMock.employeeWallet.update).not.toHaveBeenCalled()

      // Top up wallet to 6,000 -> reversal succeeds, balance becomes 1,000, bonus counters become 0, audit written
      walletState.balance = new Prisma.Decimal('6000.00')
      const res = await localSvc.reverseTransaction(
        'tx_bonus_orig',
        'Correct bonus reversal',
        { id: 'emp_cfo_01', role: 'cfo', email: 'cfo@pointfex.com' },
      )
      expect(res.reversed).toBe(true)
      expect(walletState.balance.toFixed(2)).toBe('1000.00')
      expect(walletState.totalEarnedToDate.toFixed(2)).toBe('0.00')
      expect(walletState.sprintBonusEarned.toFixed(2)).toBe('0.00')
      expect(auditLogs).toHaveLength(1)
    })

    it('blocks self-adjustment in issueAdjustment and self-rejection in rejectBudgetRequest', async () => {
      const { ForbiddenException } = require('@nestjs/common')
      const { FinanceService } = require('./finance.service')
      const localPrisma: any = {
        budgetRequest: {
          findUnique: jest.fn(async () => ({ id: 'breq_1', projectId: 'p1', requesterId: 'emp_cfo_01', status: 'pending' })),
        },
      }
      const localSvc = new FinanceService(localPrisma)

      await expect(
        localSvc.issueAdjustment(
          { userId: 'emp_cfo_01', amount: 1000, type: 'bonus', reason: 'Self bonus attempt' },
          { id: 'emp_cfo_01', role: 'cfo' },
        ),
      ).rejects.toThrow(ForbiddenException)

      await expect(
        localSvc.rejectBudgetRequest(
          'breq_1',
          { feedback: 'Self reject test' },
          { id: 'emp_cfo_01', role: 'cfo' },
        ),
      ).rejects.toThrow(ForbiddenException)
    })

    it('enforces PM ownership and idempotencyKey in allocateDeveloperBudget when full delegates are present', async () => {
      const { ForbiddenException } = require('@nestjs/common')
      const { FinanceService } = require('./finance.service')
      const finTxList: any[] = []
      const txMock: any = {
        positionAssignment: {
          findMany: jest.fn(async () => [{ positionId: 'pos_pm_1' }]),
        },
        team: {
          findMany: jest.fn(async () => [{ id: 'team_1' }]),
        },
        teamProject: {
          findFirst: jest.fn(async ({ where }: any) =>
            where.projectId === 'proj_1' ? { id: 'tp_1' } : null,
          ),
        },
        teamMembership: {
          findFirst: jest.fn(async ({ where }: any) =>
            where.employeeId === 'emp_dev_1' ? { id: 'tm_1' } : null,
          ),
        },
        project: {
          findUnique: jest.fn(async () => ({
            id: 'proj_1',
            name: 'Alpha App',
            budget: new Prisma.Decimal('50000.00'),
            allocatedBudget: new Prisma.Decimal('0.00'),
          })),
          update: jest.fn(async () => ({ id: 'proj_1', name: 'Alpha App' })),
        },
        employee: {
          findUnique: jest.fn(async () => ({ id: 'emp_dev_1', name: 'Dev One' })),
        },
        employeeWallet: {
          upsert: jest.fn(async () => ({ id: 'w_1', employeeId: 'emp_dev_1', balance: new Prisma.Decimal('5000.00') })),
          findUnique: jest.fn(async () => ({ id: 'w_1', employeeId: 'emp_dev_1', balance: new Prisma.Decimal('5000.00') })),
        },
        companyTreasury: {
          upsert: jest.fn(async () => ({ id: 'singleton' })),
        },
        financialTransaction: {
          findFirst: jest.fn(async ({ where }: any) =>
            finTxList.find((t) => t.reason === where.reason && t.projectId === where.projectId) || null,
          ),
          create: jest.fn(async ({ data }: any) => {
            const row = { id: `ft_${finTxList.length + 1}`, ...data }
            finTxList.push(row)
            return row
          }),
        },
        auditLog: {
          create: jest.fn(async () => ({ id: 'aud_1' })),
        },
      }
      const localPrisma: any = { $transaction: jest.fn(async (cb: any) => cb(txMock)) }
      const localSvc = new FinanceService(localPrisma)
      const pmActor = { id: 'emp_pm_1', role: 'pm', email: 'pm@pointfex.com' }

      // Wrong project rejected
      await expect(
        localSvc.allocateDeveloperBudget(
          { developerId: 'emp_dev_1', projectId: 'proj_other', amount: 5000 },
          pmActor,
        ),
      ).rejects.toThrow(ForbiddenException)

      // Valid PM project + member with idempotencyKey allocates once and returns idempotentHit on retry
      const first = await localSvc.allocateDeveloperBudget(
        { developerId: 'emp_dev_1', projectId: 'proj_1', amount: 5000, idempotencyKey: 'alloc_idem_1' },
        pmActor,
      )
      const second = await localSvc.allocateDeveloperBudget(
        { developerId: 'emp_dev_1', projectId: 'proj_1', amount: 5000, idempotencyKey: 'alloc_idem_1' },
        pmActor,
      )
      expect(first.transaction.id).toBe(second.transaction.id)
      expect((second as any).idempotentHit).toBe(true)
      expect(finTxList).toHaveLength(1)
    })
  })
})
