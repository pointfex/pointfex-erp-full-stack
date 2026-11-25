import { BadRequestException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { VoteEngineService } from './vote-engine.service'

describe('VoteEngineService Treasury Finalization (Phase 8)', () => {
  const buildFixture = (unallocatedReserves: string, requestedAmount: string) => {
    const treasury = {
      id: 'singleton',
      unallocatedReserves: new Prisma.Decimal(unallocatedReserves),
      totalApprovedBudgets: new Prisma.Decimal('200000.00'),
    }
    const project = {
      id: 'proj_1',
      name: 'Core Platform',
      budget: new Prisma.Decimal('50000.00'),
    }
    const budgetRequest = {
      id: 'req_1',
      projectId: 'proj_1',
      requesterId: 'emp_pm_1',
      requestedAmount: new Prisma.Decimal(requestedAmount),
      approvedAmount: null as Prisma.Decimal | null,
      status: 'pending',
      feedback: null as string | null,
      project,
    }
    const auditLogs: any[] = []

    const txMock: any = {
      companyTreasury: {
        findUnique: jest.fn(async () => treasury),
        update: jest.fn(async ({ data }) => {
          if (data.unallocatedReserves?.decrement) {
            treasury.unallocatedReserves = treasury.unallocatedReserves.minus(
              data.unallocatedReserves.decrement,
            )
          }
          if (data.totalApprovedBudgets?.increment) {
            treasury.totalApprovedBudgets = treasury.totalApprovedBudgets.plus(
              data.totalApprovedBudgets.increment,
            )
          }
          return treasury
        }),
      },
      budgetRequest: {
        update: jest.fn(async ({ data }) => {
          Object.assign(budgetRequest, data)
          return budgetRequest
        }),
      },
      project: {
        update: jest.fn(async ({ data }) => {
          if (data.budget?.increment) {
            project.budget = project.budget.plus(data.budget.increment)
          }
          return project
        }),
      },
    }

    const prismaMock: any = {
      budgetRequest: {
        findUnique: jest.fn(async () => budgetRequest),
      },
      $transaction: jest.fn(async (cb: (tx: any) => Promise<any>) => cb(txMock)),
    }

    const auditLoggerMock: any = {
      log: jest.fn(async (entry: any) => {
        auditLogs.push(entry)
        return entry
      }),
    }

    const service = new VoteEngineService(prismaMock, auditLoggerMock)
    return { service, treasury, project, budgetRequest, auditLogs, txMock }
  }

  it('decrements unallocatedReserves, increments totalApprovedBudgets & project.budget, and logs audit on approval', async () => {
    const { service, treasury, project, budgetRequest, auditLogs } = buildFixture(
      '100000.00',
      '25000.00',
    )

    await service.finalizeBudgetRequest('req_1', 'approved', 'emp_ceo_01', 'Approved by vote')

    expect(budgetRequest.status).toBe('approved')
    expect(Number(project.budget)).toBe(75000)
    expect(Number(treasury.unallocatedReserves)).toBe(75000)
    expect(Number(treasury.totalApprovedBudgets)).toBe(225000)
    expect(auditLogs).toHaveLength(1)
    expect(auditLogs[0].action).toBe('BUDGET_REQUEST_FINALIZED_APPROVED')
  })

  it('throws BadRequestException and leaves treasury untouched when unallocatedReserves are insufficient', async () => {
    const { service, treasury, project, budgetRequest, auditLogs, txMock } = buildFixture(
      '10000.00',
      '25000.00',
    )

    await expect(
      service.finalizeBudgetRequest('req_1', 'approved', 'emp_ceo_01', 'Approved by vote'),
    ).rejects.toThrow(BadRequestException)

    expect(budgetRequest.status).toBe('pending')
    expect(Number(project.budget)).toBe(50000)
    expect(Number(treasury.unallocatedReserves)).toBe(10000)
    expect(txMock.companyTreasury.update).not.toHaveBeenCalled()
    expect(auditLogs).toHaveLength(0)
  })

  it('updates request to rejected, leaves CompanyTreasury untouched, and logs audit', async () => {
    const { service, treasury, project, budgetRequest, auditLogs, txMock } = buildFixture(
      '100000.00',
      '25000.00',
    )

    await service.finalizeBudgetRequest('req_1', 'rejected', 'emp_ceo_01', 'Out of quarter scope')

    expect(budgetRequest.status).toBe('rejected')
    expect(Number(project.budget)).toBe(50000)
    expect(Number(treasury.unallocatedReserves)).toBe(100000)
    expect(txMock.companyTreasury.update).not.toHaveBeenCalled()
    expect(auditLogs).toHaveLength(1)
    expect(auditLogs[0].action).toBe('BUDGET_REQUEST_FINALIZED_REJECTED')
  })
})
