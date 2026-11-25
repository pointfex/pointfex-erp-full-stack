import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import { PayrollRunKind, PayrollRunStatus, Prisma } from '@prisma/client'
import { PrismaService } from '../common/prisma.service'
import { AuditLoggerService } from '../common/audit-logger.service'
import { AuthenticatedUser } from '../common/auth-user.interface'
import {
  buildAuditActor,
  findActiveEmployeesForRole,
  findManagedTeamIds,
  hasGlobalFinanceAccess,
  isActivePmOfTeam,
  isActorCeo,
  resolveActorRoles,
} from './finance-actor.util'
import { FinanceConfigService } from './finance-config.service'
import { LedgerService } from './ledger.service'

export interface ExecutivePayrollSlot {
  employeeId: string
  employeeName?: string
  roleSlug: string
  positionId: string | null
  slotKey: string
}

export interface SquadRosterMember {
  employeeId: string
  employeeName?: string
  roleInRun: string
}

@Injectable()
export class PayrollService {
  private readonly logger = new Logger(PayrollService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
    private readonly configService: FinanceConfigService,
    @Optional() private readonly auditLogger?: AuditLoggerService,
  ) {}

  async runExecutivePayroll(sprintNumber: number, actor: AuthenticatedUser) {
    if (!Number.isInteger(sprintNumber) || sprintNumber < 1) {
      throw new BadRequestException('sprintNumber must be a positive integer')
    }

    const scopeKey = `EXEC:${sprintNumber}`

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.payrollRun.findUnique({ where: { scopeKey } })
      if (existing && existing.status === 'PAID') {
        return { run: existing, idempotentHit: true }
      }

      await this.ledgerService.assertSprintNotLocked(tx, sprintNumber, { actor })

      const config = await this.configService.getConfig(tx)
      const rate = new Prisma.Decimal(config.payrollRateBDT).toDecimalPlaces(
        2,
        Prisma.Decimal.ROUND_HALF_UP,
      )
      const rawRoles = Array.isArray(config.executivePayrollRoles)
        ? config.executivePayrollRoles
        : ['cto', 'cpo', 'cfo', 'chro']
      const executiveRoles = Array.from(
        new Set(rawRoles.map((r) => String(r).trim().toLowerCase()).filter(Boolean)),
      )

      if (executiveRoles.includes('ceo')) {
        throw new BadRequestException('CEO cannot be included in executive payroll')
      }
      if (executiveRoles.length === 0) {
        throw new BadRequestException('executivePayrollRoles cannot be empty')
      }

      const ceoEmployeeIds = new Set(
        (await findActiveEmployeesForRole(tx, 'ceo')).map((e) => e.employeeId),
      )

      const slots: ExecutivePayrollSlot[] = []
      const seenAppointmentKeys = new Set<string>()
      const seenRoleOnlyEmployees = new Set<string>()
      const distinctEmployees = new Set<string>()

      for (const roleSlug of executiveRoles) {
        const candidates = await findActiveEmployeesForRole(tx, roleSlug)
        for (const c of candidates) {
          if (ceoEmployeeIds.has(c.employeeId)) continue

          if (c.positionId) {
            const apptKey = `${c.employeeId}:pos:${c.positionId}`
            if (seenAppointmentKeys.has(apptKey)) continue
            seenAppointmentKeys.add(apptKey)
            distinctEmployees.add(c.employeeId)
            slots.push({
              employeeId: c.employeeId,
              employeeName: c.employeeName,
              roleSlug,
              positionId: c.positionId,
              slotKey: apptKey,
            })
          } else {
            if (seenRoleOnlyEmployees.has(c.employeeId) || distinctEmployees.has(c.employeeId)) {
              // Without distinct formal appointments, one person only receives one slot.
              continue
            }
            seenRoleOnlyEmployees.add(c.employeeId)
            distinctEmployees.add(c.employeeId)
            slots.push({
              employeeId: c.employeeId,
              employeeName: c.employeeName,
              roleSlug,
              positionId: null,
              slotKey: `${c.employeeId}:${roleSlug}`,
            })
          }
        }
      }

      if (distinctEmployees.size < executiveRoles.length) {
        this.logger.warn(
          `[ExecutivePayroll] Sprint ${sprintNumber} blocked: resolved ${distinctEmployees.size} distinct executive(s) for ${executiveRoles.length} configured roles [${executiveRoles.join(', ')}]`,
        )
        throw new BadRequestException(
          `Executive payroll blocked: resolved ${distinctEmployees.size} distinct active executives, expected at least ${executiveRoles.length} [${executiveRoles.join(', ')}]`,
        )
      }

      const totalAmount = rate.mul(slots.length).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)

      const companyFund = await tx.financeAccount.findFirst({
        where: { type: 'COMPANY_FUND' },
      })
      if (!companyFund) {
        throw new NotFoundException('COMPANY_FUND finance account not found')
      }
      if (new Prisma.Decimal(companyFund.balance).lessThan(totalAmount)) {
        throw new BadRequestException(
          `Insufficient Company Fund balance for executive payroll (available Tk ${new Prisma.Decimal(companyFund.balance).toFixed(2)}, required Tk ${totalAmount.toFixed(2)})`,
        )
      }

      const now = new Date()
      const run = await tx.payrollRun.upsert({
        where: { scopeKey },
        update: {
          status: 'PAID',
          ratePerPerson: rate,
          headcount: slots.length,
          totalAmount,
          rosterSnapshot: { roles: executiveRoles, slots } as unknown as Prisma.InputJsonValue,
          confirmedById: actor.id,
          confirmedAt: now,
          executedById: actor.id,
          executedAt: now,
        },
        create: {
          sprintNumber,
          kind: 'EXECUTIVE',
          teamId: null,
          scopeKey,
          status: 'PAID',
          ratePerPerson: rate,
          headcount: slots.length,
          totalAmount,
          rosterSnapshot: { roles: executiveRoles, slots } as unknown as Prisma.InputJsonValue,
          createdById: actor.id,
          confirmedById: actor.id,
          confirmedAt: now,
          executedById: actor.id,
          executedAt: now,
        },
      })

      for (const slot of slots) {
        await this.ledgerService.postTransaction(
          {
            idempotencyKey: `exec_payroll:${sprintNumber}:${slot.slotKey}`,
            sprintNumber,
            type: 'EXECUTIVE_PAYROLL',
            sourceKind: 'FINANCE_ACCOUNT',
            sourceRefId: companyFund.id,
            destKind: 'PERSONAL_WALLET',
            destRefId: slot.employeeId,
            employeeId: slot.employeeId,
            grossAmount: rate,
            reason: `Sprint ${sprintNumber} Executive Payroll (${slot.roleSlug.toUpperCase()})`,
            approvedById: actor.id,
            approvedAt: now,
            approvalRef: run.id,
            metadata: {
              payrollRunId: run.id,
              roleSlug: slot.roleSlug,
              positionId: slot.positionId,
            },
          },
          actor,
          tx,
        )
      }

      await this.auditLogger?.log(
        {
          ...buildAuditActor(actor),
          action: 'EXECUTIVE_PAYROLL_EXECUTED',
          actionCode: 'payroll:run',
          severity: 'CRITICAL',
          entityType: 'PayrollRun',
          entityId: run.id,
          description: `Executed Sprint ${sprintNumber} Executive Payroll for ${slots.length} executive slots totaling Tk ${totalAmount.toFixed(2)}`,
          category: 'FINANCE',
          afterState: {
            sprintNumber,
            headcount: slots.length,
            totalAmount: totalAmount.toFixed(2),
            slots: slots.map((s) => ({ employeeId: s.employeeId, roleSlug: s.roleSlug })),
          },
          mfaVerified: true,
        },
        tx,
      )

      return { run, idempotentHit: false }
    })
  }

  async generateSquadPayroll(sprintNumber: number, teamId: string, actor: AuthenticatedUser) {
    if (!Number.isInteger(sprintNumber) || sprintNumber < 1) {
      throw new BadRequestException('sprintNumber must be a positive integer')
    }
    if (!teamId?.trim()) {
      throw new BadRequestException('teamId is required')
    }

    const scopeKey = `SQUAD:${sprintNumber}:${teamId}`

    return this.prisma.$transaction(async (tx) => {
      await this.ledgerService.assertSprintNotLocked(tx, sprintNumber, { actor })

      const existing = await tx.payrollRun.findUnique({ where: { scopeKey } })
      if (existing && (existing.status === 'PAID' || existing.status === 'CONFIRMED')) {
        return { run: existing, alreadyExists: true }
      }

      const team = await tx.team.findUnique({ where: { id: teamId } })
      if (!team) {
        throw new NotFoundException(`Team "${teamId}" not found`)
      }
      const squadAccount = await tx.financeAccount.findUnique({ where: { teamId } })
      if (!squadAccount) {
        throw new NotFoundException(`Squad FinanceAccount for team "${teamId}" not found`)
      }

      const memberMap = new Map<string, SquadRosterMember>()
      const pmEmployeeIds: string[] = []

      if (team.pmPositionId && tx.positionAssignment) {
        const pmAssignments = await tx.positionAssignment.findMany({
          where: {
            positionId: team.pmPositionId,
            isActive: true,
            employee: { status: 'active' },
          },
          include: { employee: { select: { id: true, name: true } } },
        })
        for (const pa of pmAssignments ?? []) {
          if (pa?.employeeId) {
            pmEmployeeIds.push(pa.employeeId)
          }
          if (pa?.employeeId && !memberMap.has(pa.employeeId)) {
            memberMap.set(pa.employeeId, {
              employeeId: pa.employeeId,
              employeeName: pa.employee?.name ?? undefined,
              roleInRun: 'PM',
            })
          }
        }
      }

      const memberships = await tx.teamMembership.findMany({
        where: {
          teamId,
          isActive: true,
          employee: { status: 'active' },
        },
        include: { employee: { select: { id: true, name: true } } },
      })
      for (const m of memberships ?? []) {
        if (m?.employeeId && !memberMap.has(m.employeeId)) {
          memberMap.set(m.employeeId, {
            employeeId: m.employeeId,
            employeeName: m.employee?.name ?? undefined,
            roleInRun: m.roleInTeam || 'developer',
          })
        }
      }

      const members = Array.from(memberMap.values())
      if (members.length === 0) {
        throw new BadRequestException(`No active members or PM found for squad "${team.name}"`)
      }

      const pendingFlags =
        tx.penaltyRecord && typeof tx.penaltyRecord.findMany === 'function'
          ? await tx.penaltyRecord.findMany({
              where: {
                teamId,
                triggersRosterChange: true,
                rosterChangeConsumedByRunId: null,
                status: { in: ['RECORDED', 'APPROVED', 'POSTED'] },
              },
              orderBy: { createdAt: 'asc' },
            })
          : []

      const config = await this.configService.getConfig(tx)
      const rate = new Prisma.Decimal(config.payrollRateBDT).toDecimalPlaces(
        2,
        Prisma.Decimal.ROUND_HALF_UP,
      )
      const totalAmount = rate.mul(members.length).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)

      const rosterSnapshot = {
        teamId,
        teamName: team.name,
        members,
        pendingRosterChanges: pendingFlags.map((p) => ({
          penaltyId: p.id,
          category: p.category,
          reason: p.reason,
          createdAt: p.createdAt,
        })),
      }

      const run = await tx.payrollRun.upsert({
        where: { scopeKey },
        update: {
          ratePerPerson: rate,
          headcount: members.length,
          totalAmount,
          rosterSnapshot: rosterSnapshot as unknown as Prisma.InputJsonValue,
        },
        create: {
          sprintNumber,
          kind: 'SQUAD',
          teamId,
          scopeKey,
          status: 'DRAFT',
          ratePerPerson: rate,
          headcount: members.length,
          totalAmount,
          rosterSnapshot: rosterSnapshot as unknown as Prisma.InputJsonValue,
          createdById: actor.id,
        },
      })

      await this.auditLogger?.log(
        {
          ...buildAuditActor(actor),
          action: 'SQUAD_PAYROLL_DRAFT_GENERATED',
          actionCode: 'payroll:run',
          severity: 'INFO',
          entityType: 'PayrollRun',
          entityId: run.id,
          description: `Generated Sprint ${sprintNumber} draft payroll for ${team.name} (${members.length} members, Tk ${totalAmount.toFixed(2)})`,
          category: 'FINANCE',
          afterState: {
            scopeKey,
            headcount: members.length,
            totalAmount: totalAmount.toFixed(2),
            pendingRosterChangeCount: pendingFlags.length,
          },
        },
        tx,
      )

      const notifyPmIds = pmEmployeeIds.filter((id) => id !== actor.id)
      if (notifyPmIds.length > 0 && tx.notification && typeof tx.notification.createMany === 'function') {
        await tx.notification.createMany({
          data: notifyPmIds.map((userId) => ({
            userId,
            title: `Confirm Sprint ${sprintNumber} Payroll (${team.name})`,
            message: `Draft payroll for ${team.name} (${members.length} members, Tk ${totalAmount.toFixed(2)}) is awaiting PM confirmation.`,
            type: 'financial',
            entityType: 'PayrollRun',
            entityId: run.id,
          })),
        })
      }

      return { run, alreadyExists: false }
    })
  }

  async confirmSquadPayroll(runId: string, actor: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      const run = await tx.payrollRun.findUnique({ where: { id: runId } })
      if (!run || run.kind !== 'SQUAD' || !run.teamId) {
        throw new NotFoundException(`Squad PayrollRun "${runId}" not found`)
      }

      const roles = await resolveActorRoles(tx, actor)
      const isPm = await isActivePmOfTeam(tx, actor.id, run.teamId)
      if (!isPm && !isActorCeo(actor, roles)) {
        throw new ForbiddenException(
          'Only the squad PM or CEO may confirm this squad payroll roster',
        )
      }

      if (run.status !== 'DRAFT') {
        throw new BadRequestException(
          `PayrollRun "${runId}" cannot be confirmed from status ${run.status}`,
        )
      }

      await this.ledgerService.assertSprintNotLocked(tx, run.sprintNumber, { actor })

      const updated = await tx.payrollRun.update({
        where: { id: run.id },
        data: {
          status: 'CONFIRMED',
          confirmedById: actor.id,
          confirmedAt: new Date(),
        },
      })

      await this.auditLogger?.log(
        {
          ...buildAuditActor(actor),
          action: 'SQUAD_PAYROLL_CONFIRMED',
          actionCode: 'payroll:confirm',
          severity: 'INFO',
          entityType: 'PayrollRun',
          entityId: updated.id,
          description: `PM confirmed Sprint ${updated.sprintNumber} payroll roster for squad ${updated.teamId}`,
          category: 'FINANCE',
          beforeState: { status: run.status },
          afterState: { status: updated.status },
        },
        tx,
      )

      return updated
    })
  }

  async executeSquadPayrollBatch(
    dto: { sprintNumber: number; runIds?: string[]; teamIds?: string[] },
    actor: AuthenticatedUser,
  ) {
    if (!Number.isInteger(dto.sprintNumber) || dto.sprintNumber < 1) {
      throw new BadRequestException('sprintNumber must be a positive integer')
    }

    return this.prisma.$transaction(async (tx) => {
      await this.ledgerService.assertSprintNotLocked(tx, dto.sprintNumber, { actor })

      const explicitSelection =
        (Array.isArray(dto.runIds) && dto.runIds.length > 0) ||
        (Array.isArray(dto.teamIds) && dto.teamIds.length > 0)

      const candidates = await tx.payrollRun.findMany({
        where: {
          sprintNumber: dto.sprintNumber,
          kind: 'SQUAD',
          ...(dto.runIds?.length ? { id: { in: dto.runIds } } : {}),
          ...(dto.teamIds?.length ? { teamId: { in: dto.teamIds } } : {}),
        },
        orderBy: { teamId: 'asc' },
      })

      if (candidates.length === 0) {
        throw new BadRequestException(
          `No squad payroll runs found for Sprint ${dto.sprintNumber}`,
        )
      }

      const alreadyPaidRuns = candidates.filter((r) => r.status === 'PAID')
      const unconfirmedSelected = candidates.filter(
        (r) => r.status === 'DRAFT' && (explicitSelection || candidates.every((c) => c.status !== 'CONFIRMED')),
      )
      if (unconfirmedSelected.length > 0) {
        throw new BadRequestException(
          `Squad payroll run ${unconfirmedSelected[0].scopeKey} must be confirmed by PM before execution`,
        )
      }

      const toExecute = candidates.filter((r) => r.status === 'CONFIRMED')
      if (toExecute.length === 0 && alreadyPaidRuns.length === 0) {
        throw new BadRequestException(
          `No PM-confirmed squad payroll runs available to execute for Sprint ${dto.sprintNumber}`,
        )
      }

      const executedRuns: any[] = []
      const now = new Date()

      for (const run of toExecute) {
        if (!run.teamId) continue
        const squadAccount = await tx.financeAccount.findUnique({
          where: { teamId: run.teamId },
        })
        if (!squadAccount) {
          throw new NotFoundException(`Squad FinanceAccount for team "${run.teamId}" not found`)
        }
        const totalRequired = new Prisma.Decimal(run.totalAmount)
        if (new Prisma.Decimal(squadAccount.balance).lessThan(totalRequired)) {
          throw new BadRequestException(
            `Insufficient squad balance in ${squadAccount.name} for payroll (available Tk ${new Prisma.Decimal(squadAccount.balance).toFixed(2)}, required Tk ${totalRequired.toFixed(2)})`,
          )
        }

        const snapshot = (run.rosterSnapshot ?? {}) as {
          teamName?: string
          members?: SquadRosterMember[]
        }
        const members = Array.isArray(snapshot.members) ? snapshot.members : []
        if (members.length === 0) {
          throw new BadRequestException(`PayrollRun "${run.id}" has empty roster snapshot`)
        }

        for (const member of members) {
          await this.ledgerService.postTransaction(
            {
              idempotencyKey: `squad_payroll:${dto.sprintNumber}:${run.teamId}:${member.employeeId}`,
              sprintNumber: dto.sprintNumber,
              type: 'SQUAD_PAYROLL',
              sourceKind: 'FINANCE_ACCOUNT',
              sourceRefId: squadAccount.id,
              destKind: 'PERSONAL_WALLET',
              destRefId: member.employeeId,
              teamId: run.teamId,
              employeeId: member.employeeId,
              grossAmount: run.ratePerPerson,
              reason: `Sprint ${dto.sprintNumber} Squad Payroll (${snapshot.teamName || squadAccount.name})`,
              approvedById: run.confirmedById,
              approvedAt: run.confirmedAt,
              approvalRef: run.id,
              metadata: {
                payrollRunId: run.id,
                roleInRun: member.roleInRun,
              },
            },
            actor,
            tx,
          )
        }

        let consumedFlagCount = 0
        if (tx.penaltyRecord && typeof tx.penaltyRecord.updateMany === 'function') {
          const updateRes = await tx.penaltyRecord.updateMany({
            where: {
              teamId: run.teamId,
              triggersRosterChange: true,
              rosterChangeConsumedByRunId: null,
              status: { in: ['RECORDED', 'APPROVED', 'POSTED'] },
            },
            data: { rosterChangeConsumedByRunId: run.id },
          })
          consumedFlagCount = updateRes?.count ?? 0
        }

        const updatedRun = await tx.payrollRun.update({
          where: { id: run.id },
          data: {
            status: 'PAID',
            executedById: actor.id,
            executedAt: now,
            rosterChangeFlagConsumed: consumedFlagCount > 0,
          },
        })
        executedRuns.push(updatedRun)
      }

      if (executedRuns.length > 0) {
        await this.auditLogger?.log(
          {
            ...buildAuditActor(actor),
            action: 'SQUAD_PAYROLL_BATCH_EXECUTED',
            actionCode: 'payroll:run',
            severity: 'CRITICAL',
            entityType: 'PayrollRun',
            entityId: executedRuns.map((r) => r.id).join(','),
            description: `Executed Sprint ${dto.sprintNumber} squad payroll batch across ${executedRuns.length} squad(s)`,
            category: 'FINANCE',
            afterState: {
              sprintNumber: dto.sprintNumber,
              executedRunIds: executedRuns.map((r) => r.id),
            },
            mfaVerified: true,
          },
          tx,
        )
      }

      return {
        sprintNumber: dto.sprintNumber,
        executedRuns,
        alreadyPaidRuns,
      }
    })
  }

  async listPayrollRuns(
    filters: {
      sprintNumber?: number
      kind?: PayrollRunKind
      teamId?: string
      status?: PayrollRunStatus
    },
    actor: AuthenticatedUser,
  ) {
    const roles = await resolveActorRoles(this.prisma, actor)
    const where: Prisma.PayrollRunWhereInput = {}
    if (filters.sprintNumber !== undefined) where.sprintNumber = filters.sprintNumber
    if (filters.kind) where.kind = filters.kind
    if (filters.status) where.status = filters.status

    if (hasGlobalFinanceAccess(actor, roles)) {
      if (filters.teamId) where.teamId = filters.teamId
    } else {
      const managedTeamIds = await findManagedTeamIds(this.prisma, actor.id)
      if (managedTeamIds.length === 0) {
        throw new ForbiddenException('You do not have permission to view payroll runs')
      }
      where.kind = 'SQUAD'
      where.teamId = filters.teamId
        ? managedTeamIds.includes(filters.teamId)
          ? filters.teamId
          : '__FORBIDDEN__'
        : { in: managedTeamIds }
      if (where.teamId === '__FORBIDDEN__') {
        throw new ForbiddenException('PM may only view payroll runs for their own squad')
      }
    }

    return this.prisma.payrollRun.findMany({
      where,
      orderBy: [{ sprintNumber: 'desc' }, { createdAt: 'desc' }],
    })
  }
}
