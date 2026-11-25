import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../common/prisma.service'
import { AuditLoggerService } from '../common/audit-logger.service'
import { AuthenticatedUser } from '../common/auth-user.interface'
import { isEmployeeCeo, loadEmployeeWithSecurityContext } from '../common/security-policy.util'

export interface VoteTally {
  totalEligible: number
  threshold: number
  approvals: number
  rejections: number
  remaining: number
  voters: Array<{
    id: string
    name: string
    choice: 'APPROVE' | 'REJECT'
    reason?: string | null
    createdAt: Date
  }>
  status: string
  voteDeadline?: Date | null
}

@Injectable()
export class VoteEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogger: AuditLoggerService,
  ) {}

  /**
   * Eligible voters: active employees holding permission `votes:cast`, excluding the requester.
   */
  async getEligibleVoters(requesterId: string) {
    const activeVoters = await this.prisma.employee.findMany({
      where: {
        isSuspended: false,
        id: { not: requesterId },
        OR: [
          {
            employeeRoles: {
              some: {
                isActive: true,
                role: {
                  isActive: true,
                  OR: [
                    { isRootRole: true },
                    { rolePermissions: { some: { permission: { code: 'votes:cast' } } } },
                    { slug: { in: ['ceo', 'cto', 'cfo', 'chro', 'coo', 'cpo', 'cro'] } },
                  ],
                },
              },
            },
          },
          {
            permissionGrants: {
              some: {
                permission: { code: 'votes:cast' },
                isActive: true,
              },
            },
          },
        ],
      },
      select: { id: true, name: true, email: true, title: true },
    })

    return activeVoters
  }

  async getTally(requestId: string, requesterId: string, status: string, deadline?: Date | null): Promise<VoteTally> {
    const eligible = await this.getEligibleVoters(requesterId)
    const votes = await this.prisma.executiveVote.findMany({
      where: { requestId },
      include: { voter: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    })

    const eligibleSet = new Set(eligible.map((e) => e.id))
    const validVotes = votes.filter((v) => eligibleSet.has(v.voterId))

    const approvals = validVotes.filter((v) => v.choice === 'APPROVE').length
    const rejections = validVotes.filter((v) => v.choice === 'REJECT').length
    const totalEligible = eligible.length
    const threshold = Math.floor(totalEligible / 2) + 1
    const remaining = Math.max(0, totalEligible - (approvals + rejections))

    return {
      totalEligible,
      threshold,
      approvals,
      rejections,
      remaining,
      voters: validVotes.map((v) => ({
        id: v.voter?.id || v.voterId,
        name: v.voter?.name || 'Executive Voter',
        choice: v.choice as 'APPROVE' | 'REJECT',
        reason: v.reason,
        createdAt: v.createdAt,
      })),
      status,
      voteDeadline: deadline,
    }
  }

  async castVote(
    requestId: string,
    targetType: 'PROJECT_REQUEST' | 'BUDGET_REQUEST',
    actor: AuthenticatedUser,
    choice: 'APPROVE' | 'REJECT',
    reason?: string,
  ) {
    if (targetType === 'PROJECT_REQUEST') {
      const req = await this.prisma.projectCreationRequest.findUnique({
        where: { id: requestId },
      })
      if (!req) throw new NotFoundException('Project request not found')
      if (req.requesterId === actor.id) {
        throw new ForbiddenException('Security law: Requester cannot vote on their own request.')
      }
      if (req.status !== 'IN_VOTE' && req.status !== 'SUBMITTED') {
        throw new BadRequestException(`Vote is not open for this request (status: ${req.status}).`)
      }

      const now = new Date()
      if (req.voteDeadline && req.voteDeadline <= now) {
        await this.prisma.projectCreationRequest.update({
          where: { id: requestId },
          data: { status: 'EXPIRED' },
        })
        throw new BadRequestException('Voting deadline has expired. Request marked as expired.')
      }

      const eligible = await this.getEligibleVoters(req.requesterId)
      if (!eligible.some((e) => e.id === actor.id)) {
        throw new ForbiddenException('You are not an eligible voter for executive proposals.')
      }

      // Upsert vote
      await this.prisma.executiveVote.upsert({
        where: { requestId_voterId: { requestId, voterId: actor.id } },
        update: { choice, reason: reason?.trim() || null, updatedAt: now },
        create: {
          requestId,
          targetType,
          voterId: actor.id,
          choice,
          reason: reason?.trim() || null,
        },
      })

      const tally = await this.getTally(requestId, req.requesterId, req.status, req.voteDeadline)
      let resolvedStatus: string = req.status

      // Check win or impossible conditions
      if (tally.approvals >= tally.threshold) {
        // APPROVED!
        resolvedStatus = 'APPROVED'
        await this.finalizeProjectRequest(req.id, 'APPROVED', 'Approved by majority executive vote')
      } else if (tally.approvals + tally.remaining < tally.threshold) {
        // REJECTED (impossible to reach threshold)
        resolvedStatus = 'REJECTED'
        await this.finalizeProjectRequest(
          req.id,
          'REJECTED',
          'Approval threshold unreachable by remaining voters',
        )
      }

      await this.auditLogger.log({
        actorId: actor.id,
        actorName: actor.name || actor.id,
        actorEmail: actor.email || '',
        actorRole: 'EXECUTIVE',
        action: 'EXECUTIVE_VOTE_CAST',
        actionCode: 'VOTE_SUBMITTED',
        severity: 'INFO',
        entityType: 'project_request',
        entityId: requestId,
        description: `Cast ${choice} vote for project request "${req.title}". Approvals: ${tally.approvals}/${tally.threshold}.`,
        category: 'governance',
      })

      return this.getTally(requestId, req.requesterId, resolvedStatus, req.voteDeadline)
    } else {
      // Budget Request vote
      const req = await this.prisma.budgetRequest.findUnique({
        where: { id: requestId },
        include: { project: true },
      })
      if (!req) throw new NotFoundException('Budget request not found')
      if (req.requesterId === actor.id) {
        throw new ForbiddenException('Security law: Requester cannot vote on their own request.')
      }
      if (req.status !== 'pending') {
        throw new BadRequestException(`Request is already finalized (${req.status}).`)
      }

      const now = new Date()
      if (req.voteDeadline && req.voteDeadline <= now) {
        await this.prisma.budgetRequest.update({
          where: { id: requestId },
          data: { status: 'rejected', feedback: 'Voting deadline expired' },
        })
        throw new BadRequestException('Voting deadline has expired.')
      }

      const eligible = await this.getEligibleVoters(req.requesterId)
      if (!eligible.some((e) => e.id === actor.id)) {
        throw new ForbiddenException('You are not an eligible voter for budget requests.')
      }

      await this.prisma.executiveVote.upsert({
        where: { requestId_voterId: { requestId, voterId: actor.id } },
        update: { choice, reason: reason?.trim() || null, updatedAt: now },
        create: {
          requestId,
          targetType,
          voterId: actor.id,
          choice,
          reason: reason?.trim() || null,
        },
      })

      const tally = await this.getTally(requestId, req.requesterId, req.status, req.voteDeadline)
      let resolvedBudgetStatus = req.status

      if (tally.approvals >= tally.threshold) {
        resolvedBudgetStatus = 'approved'
        await this.finalizeBudgetRequest(req.id, 'approved', actor.id, 'Approved by executive vote')
      } else if (tally.approvals + tally.remaining < tally.threshold) {
        resolvedBudgetStatus = 'rejected'
        await this.finalizeBudgetRequest(
          req.id,
          'rejected',
          actor.id,
          'Unreachable threshold by remaining voters',
        )
      }

      return this.getTally(requestId, req.requesterId, resolvedBudgetStatus, req.voteDeadline)
    }
  }

  async ceoOverride(
    requestId: string,
    targetType: 'PROJECT_REQUEST' | 'BUDGET_REQUEST',
    actor: AuthenticatedUser,
    decision: 'APPROVE' | 'REJECT',
    reason?: string,
  ) {
    const actorEmployee = await loadEmployeeWithSecurityContext(this.prisma, actor.id)
    if (!isEmployeeCeo(actorEmployee)) {
      throw new ForbiddenException('Only the Chief Executive Officer may override executive votes.')
    }

    const effectiveReason = reason?.trim() || 'Strategic executive priority decided by CEO override'

    if (targetType === 'PROJECT_REQUEST') {
      const finalStatus = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED'
      return this.finalizeProjectRequest(requestId, finalStatus, `CEO override: ${effectiveReason}`, actor.id)
    } else {
      const finalStatus = decision === 'APPROVE' ? 'approved' : 'rejected'
      return this.finalizeBudgetRequest(requestId, finalStatus, actor.id, `CEO override: ${effectiveReason}`)
    }
  }

  async finalizeProjectRequest(
    requestId: string,
    status: 'APPROVED' | 'REJECTED' | 'EXPIRED',
    reason: string,
    decidedById?: string,
  ) {
    const req = await this.prisma.projectCreationRequest.findUnique({
      where: { id: requestId },
      include: { requester: true },
    })
    if (!req) return null

    const now = new Date()
    let approvedProjectId: string | undefined

    if (status === 'APPROVED') {
      // Create project in Planning
      const code = req.code || `PRJ-${Date.now().toString(36).toUpperCase()}`
      const project = await this.prisma.project.create({
        data: {
          id: `proj_${Date.now()}`,
          name: req.title,
          code,
          description: req.scopeDeliverables,
          budget: req.initialBudgetBDT,
          allocatedBudget: 0,
          status: 'planning',
          health: 'on_track',
          startDate: now,
          deadline: new Date(now.getTime() + 60 * 86400000), // default 60d
          priority: 'High Priority',
          tags: ['executive_approved'],
        },
      })
      approvedProjectId = project.id
    }

    const updated = await this.prisma.projectCreationRequest.update({
      where: { id: requestId },
      data: {
        status,
        decidedById: decidedById || null,
        decisionReason: reason,
        decidedAt: now,
        approvedProjectId: approvedProjectId || null,
      },
    })

    await this.auditLogger.log({
      actorId: decidedById || 'SYSTEM',
      actorName: decidedById ? 'Chief Executive Officer' : 'Vote Engine',
      actorEmail: '',
      actorRole: 'GOVERNANCE',
      action: `PROJECT_REQUEST_${status}`,
      actionCode: `PROJECT_REQ_${status}`,
      severity: status === 'APPROVED' ? 'WARNING' : 'INFO',
      entityType: 'project_request',
      entityId: requestId,
      description: `Project request "${req.title}" finalized as ${status}. ${reason}`,
      category: 'governance',
    })

    return updated
  }

  async finalizeBudgetRequest(
    requestId: string,
    status: 'approved' | 'rejected',
    reviewedById: string,
    feedback: string,
  ) {
    const req = await this.prisma.budgetRequest.findUnique({
      where: { id: requestId },
      include: { project: true },
    })
    if (!req) return null

    const now = new Date()
    if (status === 'approved') {
      await this.prisma.$transaction(async (tx) => {
        const treasury =
          tx.companyTreasury && typeof tx.companyTreasury.findUnique === 'function'
            ? await tx.companyTreasury.findUnique({ where: { id: 'singleton' } })
            : null

        const requestedDecimal = new Prisma.Decimal(req.requestedAmount)
        if (treasury && requestedDecimal.greaterThan(treasury.unallocatedReserves)) {
          throw new BadRequestException(
            `Insufficient unallocated treasury reserves to finalize budget request (available Tk ${new Prisma.Decimal(treasury.unallocatedReserves).toFixed(2)}, requested Tk ${requestedDecimal.toFixed(2)})`,
          )
        }

        await tx.budgetRequest.update({
          where: { id: requestId },
          data: {
            status: 'approved',
            approvedAmount: req.requestedAmount,
            reviewedById,
            reviewedAt: now,
            feedback,
          },
        })

        await tx.project.update({
          where: { id: req.projectId },
          data: {
            budget: { increment: req.requestedAmount },
          },
        })

        if (treasury && typeof tx.companyTreasury.update === 'function') {
          await tx.companyTreasury.update({
            where: { id: 'singleton' },
            data: {
              unallocatedReserves: { decrement: req.requestedAmount },
              totalApprovedBudgets: { increment: req.requestedAmount },
            },
          })
        }

        await this.auditLogger.log(
          {
            actorId: reviewedById,
            actorName: reviewedById,
            actorEmail: '',
            actorRole: 'EXECUTIVE_VOTE',
            action: 'BUDGET_REQUEST_FINALIZED_APPROVED',
            actionCode: 'budgets:approve_request',
            severity: 'CRITICAL',
            entityType: 'BudgetRequest',
            entityId: req.id,
            description: `Finalized approved budget increase of Tk ${requestedDecimal.toFixed(2)} for project ${req.project?.name || req.projectId}`,
            category: 'FINANCE',
            beforeState: treasury
              ? {
                  unallocatedReserves: String(treasury.unallocatedReserves),
                  totalApprovedBudgets: String(treasury.totalApprovedBudgets),
                }
              : undefined,
            afterState: {
              approvedAmount: requestedDecimal.toFixed(2),
              projectId: req.projectId,
            },
            reason: feedback,
          },
          tx,
        )
      })
    } else {
      await this.prisma.$transaction(async (tx) => {
        await tx.budgetRequest.update({
          where: { id: requestId },
          data: {
            status: 'rejected',
            reviewedById,
            reviewedAt: now,
            feedback,
          },
        })

        await this.auditLogger.log(
          {
            actorId: reviewedById,
            actorName: reviewedById,
            actorEmail: '',
            actorRole: 'EXECUTIVE_VOTE',
            action: 'BUDGET_REQUEST_FINALIZED_REJECTED',
            actionCode: 'budgets:reject_request',
            severity: 'WARNING',
            entityType: 'BudgetRequest',
            entityId: req.id,
            description: `Finalized rejection of budget request for project ${req.project?.name || req.projectId}: ${feedback}`,
            category: 'FINANCE',
            afterState: { status: 'rejected', projectId: req.projectId },
            reason: feedback,
          },
          tx,
        )
      })
    }
  }

  async sweepExpiredVotes() {
    const now = new Date()
    const expiredProjectReqs = await this.prisma.projectCreationRequest.findMany({
      where: {
        status: 'IN_VOTE',
        voteDeadline: { lte: now },
      },
    })

    for (const r of expiredProjectReqs) {
      await this.finalizeProjectRequest(r.id, 'EXPIRED', 'Voting deadline passed without reaching threshold')
    }

    const expiredBudgetReqs = await this.prisma.budgetRequest.findMany({
      where: {
        status: 'pending',
        voteDeadline: { lte: now },
      },
    })

    for (const b of expiredBudgetReqs) {
      await this.finalizeBudgetRequest(b.id, 'rejected', 'SYSTEM', 'Voting deadline passed')
    }

    return {
      expiredProjects: expiredProjectReqs.length,
      expiredBudgets: expiredBudgetReqs.length,
    }
  }
}
