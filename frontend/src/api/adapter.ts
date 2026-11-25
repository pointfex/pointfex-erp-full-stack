import type {
  SeedData,
  User,
  Team,
  Project,
  Milestone,
  Repository,
  Task,
  TaskComment,
  Wallet,
  Transaction,
  PerformanceRecord,
  Report,
  Announcement,
  Notification,
  ActivityLog,
  CodeQualityGate,
  SecurityAlert,
  TestingSuite,
  ConsultancyRequest,
  CompanyTreasury,
} from '../types'
import { ROLE_LIST } from '../data/roles'
import { formatBDT } from '../utils/money'

export interface BackendBundle {
  employees: any[]
  positions: any[]
  teams: any[]
  projects: any[]
  tasks: any[]
  treasury: any
  wallets: any[]
  transactions: any[]
  budgetRequests: any[]
  performance: any[]
  reports: any[]
  auditLogs: any[]
  qualityGates: any[]
  securityAlerts: any[]
  testRuns: any[]
  consultancy: any[]
  announcements: any[]
  notifications: any[]
}

const num = (val: unknown, fallback = 0): number => {
  if (val === null || val === undefined || val === '') return fallback
  const n = Number(val)
  return Number.isFinite(n) ? n : fallback
}

const isoDate = (val: unknown, fallback = ''): string => {
  if (!val) return fallback
  const d = new Date(String(val))
  if (Number.isNaN(d.getTime())) return String(val)
  return d.toISOString().split('T')[0]
}

export function mapBackendBundleToSeedData(
  bundle: BackendBundle,
  fallbackPrev?: SeedData,
): SeedData {
  // 1. Employees -> Users
  const users: User[] = (bundle.employees || []).map((emp) => {
    const activeAssignments = (emp.positionAssignments || []).filter((pa: any) => pa.isActive !== false)
    const activeRoles = (emp.employeeRoles || []).filter((er: any) => er.isActive && er.role)
    const activeRoleSlugs = activeRoles.map((er: any) => er.role.slug)
    const activeRoleNames = activeRoles.map((er: any) => er.role.name)

    // Preserve executive core role first
    const execRole = activeRoles.find((er: any) =>
      ['ceo', 'cto', 'cfo', 'chro', 'cpo'].includes(er.role?.slug),
    )
    let coreRole: string | undefined = execRole?.role?.slug

    if (!coreRole) {
      const titleLower = (emp.title || '').toLowerCase()
      if (titleLower.includes('chief executive officer') || titleLower === 'ceo') coreRole = 'ceo'
      else if (titleLower.includes('chief technology officer') || titleLower === 'cto') coreRole = 'cto'
      else if (titleLower.includes('chief financial officer') || titleLower === 'cfo') coreRole = 'cfo'
      else if (titleLower.includes('chief human resources officer') || titleLower === 'chro') coreRole = 'chro'
    }

    if (!coreRole) {
      const isPm =
        activeRoleSlugs.includes('pm') &&
        (emp.title || '').toLowerCase().includes('project manager')
      if (isPm) {
        coreRole = 'pm'
      } else {
        const posRole = activeAssignments[0]?.position?.roleCategory
        if (posRole && posRole !== 'developer') {
          coreRole = posRole
        } else if (activeRoleSlugs.includes('developer')) {
          coreRole = 'developer'
        } else if (activeRoleSlugs.includes('pm')) {
          coreRole = 'pm'
        } else {
          coreRole = posRole || 'developer'
        }
      }
    }

    const normalizedRole = coreRole === 'chro' ? 'cpo' : coreRole || 'developer'
    const rawTeamIds = [
      ...(emp.teamMemberships?.map((tm: any) => tm.teamId).filter(Boolean) || []),
    ]
    const teamId = rawTeamIds[0] || undefined
    const pendingReq = emp.targetedAccessChanges?.[0]
    return {
      id: emp.id,
      name: emp.name,
      email: emp.email,
      role: normalizedRole as any,
      title: emp.title,
      lifetimeXp: num(emp.lifetimeXp, 0),
      teamId,
      teamIds: rawTeamIds,
      avatar: emp.avatarUrl || undefined,
      avatarUrl: emp.avatarUrl || undefined,
      initials: emp.initials,
      status: emp.status || 'online',
      isSuspended: Boolean(emp.isSuspended),
      mfaEnabled: Boolean(emp.mfaEnabled),
      inviteDeliveryStatus: emp.inviteDeliveryStatus || 'sent',
      inviteTokenExpiresAt: emp.inviteTokenExpiresAt || null,
      inviteTokenUsedAt: emp.inviteTokenUsedAt || null,
      activeRoleSlugs,
      activeRoleNames,
      pendingAccessRequest: pendingReq
        ? {
            id: pendingReq.id,
            requestedRoleId: pendingReq.requestedRoleId,
            requestedRoleSlug: pendingReq.requestedRole?.slug || '',
            requestedRoleName: pendingReq.requestedRole?.name || 'Updated Role',
            requesterId: pendingReq.requesterId,
            requesterName: pendingReq.requester?.name || 'C-Level Executive',
            reason: pendingReq.reason || null,
            createdAt: pendingReq.createdAt,
          }
        : null,
    }
  })

  // Also ensure PMs and squad members have teamId and teamIds resolved from bundle.teams
  const memberTeamsByEmployeeId = new Map<string, string[]>()
  const teamProjectMap = new Map<string, string>()
  for (const t of bundle.teams || []) {
    const pmId = t.pm?.id || t.pmPosition?.assignments?.[0]?.employee?.id || t.pmId
    if (pmId) {
      const list = memberTeamsByEmployeeId.get(pmId) || []
      list.push(t.id)
      memberTeamsByEmployeeId.set(pmId, list)
    }
    const members = t.memberships || t.members || []
    for (const m of members) {
      const mId = m.employeeId || m.employee?.id || m.id || (typeof m === 'string' ? m : null)
      if (mId) {
        const list = memberTeamsByEmployeeId.get(mId) || []
        list.push(t.id)
        memberTeamsByEmployeeId.set(mId, list)
      }
    }
    if (Array.isArray(t.memberIds)) {
      for (const mId of t.memberIds) {
        if (mId) {
          const list = memberTeamsByEmployeeId.get(mId) || []
          list.push(t.id)
          memberTeamsByEmployeeId.set(mId, list)
        }
      }
    }
    const projs = t.teamProjects || t.projects || []
    for (const pr of projs) {
      const prId = pr.projectId || pr.project?.id || pr.id || (typeof pr === 'string' ? pr : null)
      if (prId) teamProjectMap.set(prId, t.id)
    }
    if (Array.isArray(t.projectIds)) {
      for (const prId of t.projectIds) {
        if (prId) teamProjectMap.set(prId, t.id)
      }
    }
  }
  for (const u of users) {
    const fromTeams = memberTeamsByEmployeeId.get(u.id) || []
    const allSquadIds = Array.from(new Set([...(u.teamIds || []), ...fromTeams])).filter(Boolean)
    u.teamIds = allSquadIds
    if (!u.teamId && allSquadIds.length > 0) {
      u.teamId = allSquadIds[0]
    }
  }

  // 2. Teams
  const teams: Team[] = (bundle.teams || []).map((t) => {
    const pmId = t.pm?.id || t.pmPosition?.assignments?.[0]?.employee?.id || t.pmId || ''
    const rawMembers = [
      ...(t.memberIds || []),
      ...(t.memberships || t.members || []).map(
        (m: any) => m.employeeId || m.employee?.id || m.id || (typeof m === 'string' ? m : null),
      ),
    ]
    const memberIds = Array.from(new Set(rawMembers)).filter(Boolean) as string[]

    const rawProjects = [
      ...(t.projectIds || []),
      ...(t.teamProjects || t.projects || []).map(
        (p: any) => p.projectId || p.project?.id || p.id || (typeof p === 'string' ? p : null),
      ),
      ...(bundle.projects || [])
        .filter((p: any) => p.teamId === t.id || p.teamProjects?.[0]?.teamId === t.id)
        .map((p: any) => p.id),
    ]
    const projectIds = Array.from(new Set(rawProjects)).filter(Boolean) as string[]

    return {
      id: t.id,
      name: t.name,
      code: t.code,
      focus: t.focus,
      pmId,
      leadDevId: t.leadDev?.id || t.leadDevId || '',
      memberIds,
      projectIds,
      color: t.color || '#38bdf8',
      currentSprintWeek: t.currentSprintWeek ?? 3,
      totalSprintWeeks: t.totalSprintWeeks ?? 5,
      health: t.health || 'on_track',
      weeklyVelocity: t.weeklyVelocity ?? 40,
    }
  })

  // 3. Projects, Milestones & Repositories
  const milestones: Milestone[] = []
  const repositories: Repository[] = []

  const projects: Project[] = (bundle.projects || []).map((p) => {
    const repoId = `repo_${p.id}`
    const projMilestones = (p.milestones || []).map((ms: any) => {
      milestones.push({
        id: ms.id,
        projectId: p.id,
        sprintWeek: ms.sprintWeek ?? undefined,
        title: ms.title,
        dueDate: isoDate(ms.dueDate),
        status: ms.status || 'pending',
        progress:
          ms.progress ?? (ms.status === 'completed' ? 100 : ms.status === 'in_progress' ? 50 : 0),
        deliverablesCount: ms.deliverablesCount ?? 0,
        payoutAmount:
          ms.payoutAmount !== null && ms.payoutAmount !== undefined
            ? num(ms.payoutAmount)
            : undefined,
      })
      return {
        id: ms.id,
        title: ms.title,
        dueDate: isoDate(ms.dueDate),
        status: ms.status || 'pending',
      }
    })

    const repoUrl =
      p.repositoryUrl || `https://github.com/pointfex/${String(p.code || p.id).toLowerCase()}`
    const repoName = repoUrl.replace(/^https?:\/\/github\.com\//, '')
    repositories.push({
      id: repoId,
      projectId: p.id,
      name: repoName,
      url: repoUrl,
      defaultBranch: 'main',
      activeBranch: 'main',
      openPRsCount: 0,
      lastCommit: {
        hash: 'main-head',
        message: `${p.name} sprint sync`,
        author: p.pm?.name || 'Pointfex Squad',
        timestamp: 'Up to date',
      },
      stars: 24,
      forks: 4,
      openIssues: 0,
    })

    const resolvedTeamId =
      p.teamId || p.teamProjects?.[0]?.teamId || teamProjectMap.get(p.id) || ''
    const resolvedPmId =
      p.pm?.id ||
      p.teamProjects?.[0]?.team?.pmPosition?.assignments?.[0]?.employee?.id ||
      ''

    return {
      id: p.id,
      name: p.name,
      code: p.code,
      teamId: resolvedTeamId,
      pmId: resolvedPmId,
      leadDevId: p.assignedDevs?.[0]?.id,
      repoId,
      description: p.description,
      status: p.status || 'in_progress',
      progress: p.progress ?? 0,
      health: p.health || 'on_track',
      startDate: isoDate(p.startDate),
      deadline: isoDate(p.deadline),
      totalWeeks: p.totalWeeks ?? 5,
      currentWeek: p.currentWeek ?? 3,
      budget: num(p.budget),
      allocatedBudget: num(p.allocatedBudget),
      clientRevenue: num(p.clientRevenue),
      client: p.client || undefined,
      priority: p.priority || 'Medium Priority',
      repositoryUrl: repoUrl,
      demoUrl: p.demoUrl || undefined,
      tags: p.tags || [],
      color: p.color || undefined,
      assignedDevIds: (p.assignedDevs || []).map((d: any) => d.id),
      milestones: projMilestones,
      srs: p.srsUrl
        ? {
            documentTitle: p.srsTitle || `${p.code}-SRS.pdf`,
            documentUrl: p.srsUrl,
            version: p.srsVersion || 'v1.0',
            lastUpdated: isoDate(p.srsLastUpdated, isoDate(p.updatedAt)),
            overview: p.srsOverview || p.description,
            requirementsCount: p.srsRequirementsCount ?? 0,
          }
        : undefined,
    }
  })

  // 4. Tasks & Comments
  const comments: TaskComment[] = []
  const tasks: Task[] = (bundle.tasks || []).map((t) => {
    for (const c of t.comments || []) {
      comments.push({
        id: c.id,
        taskId: t.id,
        authorId: c.authorId,
        content: c.content,
        createdAt: c.createdAt,
      })
    }
    return {
      id: t.id,
      title: t.title,
      description: t.description || '',
      projectId: t.projectId,
      assigneeId: t.assigneeId,
      assignedTo: t.assigneeId,
      creatorId: t.creatorId,
      status: t.status || 'todo',
      priority: t.priority || 'medium',
      dueDate: isoDate(t.dueDate),
      estimatedHours: num(t.estimatedHours, 8),
      loggedHours: num(t.loggedHours, 0),
      milestoneId: t.milestoneId || undefined,
      tags: t.tags || [],
      checklist: (t.checklist || []).map((item: any) => ({
        id: item.id,
        text: item.text,
        completed: Boolean(item.completed),
      })),
      createdAt: isoDate(t.createdAt),
      weightCategory: t.weightCategory || undefined,
      weightPoints: t.weightPoints !== undefined && t.weightPoints !== null ? num(t.weightPoints) : undefined,
      weightStatus: t.weightStatus || undefined,
      pmScore: t.pmScore !== undefined && t.pmScore !== null ? num(t.pmScore) : undefined,
      isMainProjectTask: t.isMainProjectTask !== undefined ? Boolean(t.isMainProjectTask) : true,
      projectPercentage: t.projectPercentage !== undefined && t.projectPercentage !== null ? num(t.projectPercentage) : 0,
      ceoFinalized: Boolean(t.ceoFinalized),
    }
  })

  // 5. Wallets
  const wallets: Wallet[] = (bundle.wallets || []).map((w) => ({
    userId: w.employeeId,
    balance: num(w.balance),
    currency: w.currency || 'BDT',
    currencySymbol: w.currencySymbol || '৳',
    pendingEscrow: num(w.pendingEscrow),
    totalEarnedToDate: num(w.totalEarnedToDate),
    totalPenalties: num(w.totalPenalties),
    hourlyRateEquivalent: w.hourlyRateEquivalent ? num(w.hourlyRateEquivalent) : undefined,
    sprintBonusEarned: num(w.sprintBonusEarned),
    totalSpendings: num(w.totalSpendings),
    lastPayoutDate: isoDate(w.lastPayoutDate),
    nextScheduledPayout: isoDate(w.nextScheduledPayout),
  }))

  // 6. Transactions
  const transactions: Transaction[] = (bundle.transactions || []).map((tx) => ({
    id: tx.id,
    userId: tx.employeeId || tx.wallet?.employeeId || '',
    projectId: tx.projectId || undefined,
    milestoneId: tx.milestoneId || undefined,
    amount: num(tx.amount),
    type: tx.type,
    description: tx.description,
    date: isoDate(tx.createdAt),
    status: tx.status || 'completed',
    reason: tx.reason || undefined,
  }))

  // 7. Performance Records
  const performanceRecords: PerformanceRecord[] = (bundle.performance || []).map((p) => ({
    userId: p.employeeId,
    developerId: p.employeeId,
    overallScore: num(p.overallScore, 90),
    onTimeDeliveryRate: num(p.onTimeDeliveryRate ?? p.attendanceRate ?? p.reliability, 96),
    completionRate: num(p.completionRate ?? p.deliverySpeed, 92),
    codeQuality: num(p.codeQuality ?? p.overallScore, 90),
    codeQualityScore: num(p.codeQuality ?? p.overallScore, 90),
    deliverySpeed: num(p.deliverySpeed, 90),
    reliability: num(p.reliability, 92),
    collaboration: num(p.collaboration, 94),
    attendanceRate: num(p.attendanceRate, 96),
    satisfactionIndex: num(p.satisfactionIndex, 4.7),
    performanceTier: p.performanceTier || 'strong_contributor',
    evaluationNotes: p.evaluationNotes || undefined,
    disciplinaryNotes: p.disciplinaryNotes || undefined,
    strengths: p.strengths || [],
    improvementAreas: p.improvements || [],
    improvements: p.improvements || [],
    weeklyHours: p.weeklyHours || [40, 40, 40, 40],
    lastEvaluationDate: isoDate(p.lastEvaluationDate),
  }))

  // 8. Reports + Budget Requests (merged into Report[] so CfoBudgetPage & PmReportsPage work identically)
  const standardReports: Report[] = (bundle.reports || []).map((r) => {
    const authorRole = r.author?.positionAssignments?.[0]?.position?.roleCategory || ''
    return {
      id: r.id,
      userId: r.authorId,
      teamId: r.teamId || undefined,
      projectId: r.projectId || undefined,
      type: r.type,
      category: r.category || undefined,
      title: r.title,
      description: r.description,
      date: isoDate(r.submittedAt),
      status: r.status || 'pending',
      submittedAt: r.submittedAt,
      createdAt: r.submittedAt,
      authorId: r.authorId,
      authorName: r.author?.name,
      authorRole: authorRole.toUpperCase(),
      targetUserId: r.targetUserId || undefined,
      targetUserName: r.targetUser?.name || undefined,
      docsUrl: r.docsUrl || undefined,
      feedback: r.feedback || undefined,
      complainTo: r.complainTo || undefined,
      recipient: r.recipient || undefined,
      forwardedTo: r.forwardedTo || undefined,
      forwardedBy: r.forwardedBy || undefined,
      forwardedAt: r.forwardedAt || undefined,
      pmEndorsement: r.pmEndorsement || undefined,
      isConfidential: Boolean(r.isConfidential || r.confidentialTo),
      confidentialTo: r.confidentialTo || undefined,
      mediationNotes: r.mediationNotes || undefined,
      resolvedAt: r.resolvedAt || undefined,
    }
  })

  const budgetReports: Report[] = (bundle.budgetRequests || []).map((br) => {
    const requester = users.find((u) => u.id === br.requesterId)
    const proj = projects.find((p) => p.id === br.projectId)
    const statusMap: Record<string, string> = {
      pending: 'under_review',
      approved: 'resolved',
      rejected: 'dismissed',
    }
    return {
      id: br.id,
      userId: br.requesterId,
      teamId: proj?.teamId,
      projectId: br.projectId,
      type: 'pm_report',
      category: 'Budget Request',
      recipient: 'Chief Financial Officer (CFO)',
      title: `Budget Increase Request: ${formatBDT(num(br.requestedAmount))} for ${br.project?.name || proj?.name || br.projectId}`,
      description: br.reason,
      date: isoDate(br.requestedAt),
      status: statusMap[br.status] || br.status,
      submittedAt: br.requestedAt,
      createdAt: br.requestedAt,
      authorId: br.requesterId,
      authorName: requester?.name || br.requesterId,
      authorRole: 'PM',
      feedback: br.feedback || undefined,
      resolvedAt: br.reviewedAt || undefined,
    }
  })

  const reports = [...budgetReports, ...standardReports]

  // 9. Audit Logs
  const activityLogs: ActivityLog[] = (bundle.auditLogs || []).map((a) => ({
    id: a.id,
    userId: a.actorId || 'system',
    action: a.action,
    actionCode: a.actionCode,
    severity: a.severity,
    actorName: a.actor?.name || a.actorName,
    actorEmail: a.actor?.email || a.actorEmail,
    actorRole: a.actorRole,
    entityType: a.entityType,
    entityId: a.entityId,
    entityTitle: a.entityTitle || undefined,
    description: a.description,
    timestamp: a.timestamp,
    category: a.category,
    badgeColor: a.badgeColor || undefined,
    payload: a.payload || undefined,
  }))

  // 10. Engineering
  const codeQualityGates: CodeQualityGate[] = (bundle.qualityGates || []).map((q) => ({
    projectId: q.projectId,
    complianceScore: q.complianceScore,
    testCoverage: q.testCoverage,
    techDebtHours: q.techDebtHours,
    codeSmellsCount: q.codeSmellsCount,
    bugsDetected: q.bugsDetected,
    vulnerabilitiesCount: q.vulnerabilitiesCount,
    lastAnalysis: isoDate(q.lastAnalysis),
    status: q.status,
  }))

  const securityAlerts: SecurityAlert[] = (bundle.securityAlerts || []).map((s) => ({
    id: s.id,
    projectId: s.projectId,
    title: s.title,
    severity: s.severity,
    category: s.category,
    status: s.status,
    detectedAt: s.detectedAt,
    resolvedAt: s.resolvedAt || undefined,
    assignedPmId: s.assignedPmId || undefined,
    cveOrPackage: s.cveOrPackage || undefined,
    description: s.description,
    recommendation: s.recommendation,
  }))

  const testingSuites: TestingSuite[] = (bundle.testRuns || []).map((t) => ({
    id: t.id,
    projectId: t.projectId,
    name: t.name,
    totalTests: t.totalTests,
    passed: t.passed,
    failed: t.failed,
    skipped: t.skipped,
    duration: t.duration,
    coveragePercent: num(t.coveragePercent),
    lastRun: isoDate(t.lastRun),
    status: t.status,
  }))

  // 11. Consultancy
  const consultancyRequests: ConsultancyRequest[] = (bundle.consultancy || []).map((c) => ({
    id: c.id,
    title: c.title,
    requesterId: c.requesterId,
    teamId: c.teamId,
    projectId: c.projectId,
    category: c.category,
    description: c.description,
    urgency: c.urgency,
    status: c.status,
    assignedConsultantId: c.assignedConsultantId || undefined,
    assignedConsultantName: c.assignedConsultantName || undefined,
    estimatedHours: c.estimatedHours ? num(c.estimatedHours) : undefined,
    feeBDT: c.feeBDT ? num(c.feeBDT) : c.feeUSD ? num(c.feeUSD) : undefined,
    requestedAt: c.requestedAt,
    targetDate: c.targetDate ? isoDate(c.targetDate) : undefined,
    ctoNotes: c.ctoNotes || undefined,
    completedAt: c.completedAt || undefined,
  }))

  // 12. Announcements & Notifications
  const announcements: Announcement[] = (bundle.announcements || []).map((a) => {
    const author = users.find((u) => u.id === a.authorId)
    return {
      id: a.id,
      title: a.title,
      content: a.content,
      authorId: a.authorId,
      authorName: author?.name || a.authorId,
      category: a.category,
      priority: a.priority,
      date: isoDate(a.createdAt),
      read: false,
      pinned: Boolean(a.pinned),
    }
  })

  const notifications: Notification[] = (bundle.notifications || []).map((n) => ({
    id: n.id,
    userId: n.userId,
    title: n.title,
    message: n.message,
    type: n.type,
    timestamp: isoDate(n.createdAt),
    createdAt: n.createdAt,
    read: Boolean(n.read),
    entityType: n.entityType || undefined,
    entityId: n.entityId || undefined,
  }))

  // 13. Treasury
  const treasury: CompanyTreasury = bundle.treasury
    ? {
        initialCapital: num(bundle.treasury.initialCapital),
        totalApprovedBudgets: num(bundle.treasury.totalApprovedBudgets),
        totalDistributedToDevs: num(bundle.treasury.totalDistributedToDevs),
        totalClientRevenue: num(bundle.treasury.totalClientRevenue),
        unallocatedReserves: num(bundle.treasury.unallocatedReserves),
      }
    : fallbackPrev?.treasury || {
        initialCapital: 0,
        totalApprovedBudgets: 0,
        totalDistributedToDevs: 0,
        totalClientRevenue: 0,
        unallocatedReserves: 0,
      }

  return {
    roles: JSON.parse(JSON.stringify(ROLE_LIST)),
    users,
    teams,
    projects,
    tasks,
    comments,
    attachments: fallbackPrev?.attachments || [],
    wallets,
    transactions,
    performanceRecords,
    reports,
    announcements,
    notifications,
    activityLogs,
    milestones,
    repositories,
    pullRequests: fallbackPrev?.pullRequests || [],
    codeQualityGates,
    securityAlerts,
    testingSuites,
    bugBounties: fallbackPrev?.bugBounties || [],
    consultancyRequests,
    treasury,
  }
}

export interface FinanceV2Account {
  id: string
  code: string
  name: string
  type: 'COMPANY_FUND' | 'SQUAD'
  teamId: string | null
  teamName?: string
  teamCode?: string
  balance: number
  currency: string
  isActive: boolean
}

export interface FinanceV2Config {
  id: string
  payrollRateBDT: number
  commissionRatePct: number
  sprintPoolTotalBDT: number
  squadOpeningSeedBDT: number
  executivePayrollRoles: string[]
  rankWeights: number[]
  bonusTiers: Array<{
    minScore: number
    maxScore: number
    amount: string
    label: string
  }>
  penaltyTable: Record<
    string,
    {
      amount: string
      recipientRole: string | null
      recipientPct: string
      companyPct: string
      requiresCeoApproval?: boolean
      triggersRosterChange?: boolean
    }
  >
  updatedById?: string | null
}

export interface FinanceV2LedgerTx {
  id: string
  referenceNo: string
  idempotencyKey: string
  sprintNumber: number
  type: string
  sourceKind: string
  sourceRefId: string
  destKind: string
  destRefId: string
  grossAmount: number
  deductions: number
  netAmount: number
  teamId: string | null
  employeeId: string | null
  reason: string
  createdById: string
  approvedById: string | null
  approvedAt: string | null
  approvalRef: string | null
  status: string
  reversalOfId: string | null
  reversedBy: { id: string; referenceNo: string; createdAt: string } | null
  direction?: 'CREDIT' | 'DEBIT'
  runningBalance?: number
  createdAt: string
}

export interface FinanceV2AccountStatement {
  account: FinanceV2Account
  openingBalance: number
  totalCredits: number
  totalDebits: number
  closingBalance: number
  currentAccountBalance: number
  entries: FinanceV2LedgerTx[]
}

export interface FinanceV2MoneyRequest {
  id: string
  type: 'ADD_MONEY' | 'POOL_CREDIT' | 'TRANSFER'
  sprintNumber: number
  sourceKind: string
  sourceRefId: string
  destKind: string
  destRefId: string
  teamId: string | null
  amount: number
  reason: string
  purpose: string | null
  status: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'PAID'
  requesterId: string
  approvedById: string | null
  rejectionReason: string | null
  postedById: string | null
  ledgerTransactionId: string | null
  createdAt: string
}

export interface FinanceV2SprintRanking {
  id: string
  sprintNumber: number
  entries: Array<{ teamId: string; rank: number }>
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'
  submittedById: string
  approvedById: string | null
  rejectionReason: string | null
  poolPostedAt: string | null
  createdAt: string
}

export interface FinanceV2PayrollRun {
  id: string
  sprintNumber: number
  kind: 'EXECUTIVE' | 'SQUAD'
  teamId: string | null
  scopeKey: string
  status: 'DRAFT' | 'CONFIRMED' | 'PAID'
  ratePerPerson: number
  headcount: number
  totalAmount: number
  rosterSnapshot: {
    teamName?: string
    members?: Array<{ employeeId: string; employeeName?: string; roleInRun: string }>
    slots?: Array<{ employeeId: string; employeeName?: string; roleSlug: string }>
    pendingRosterChanges?: Array<{ penaltyId: string; category: string; reason: string }>
  }
  rosterChangeFlagConsumed: boolean
  confirmedById: string | null
  executedById: string | null
  createdAt: string
}

export interface FinanceV2BonusAward {
  id: string
  sprintNumber: number
  teamId: string
  employeeId: string
  criteriaScores: Record<string, number>
  totalScore: number
  evidence: string
  tierAmount: number
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'PAID'
  scoredById: string
  approvedById: string | null
  rejectionReason: string | null
  disbursedById: string | null
  createdAt: string
}

export interface FinanceV2PenaltyRecord {
  id: string
  sprintNumber: number
  teamId: string
  category: string
  grossAmount: number
  recipientEmployeeId: string | null
  recipientShare: number
  companyFundShare: number
  reason: string
  status: 'RECORDED' | 'PENDING_CEO_APPROVAL' | 'APPROVED' | 'REJECTED' | 'POSTED'
  recordedById: string
  approvedById: string | null
  rejectionReason: string | null
  postedById: string | null
  triggersRosterChange: boolean
  rosterChangeConsumedByRunId: string | null
  createdAt: string
}

export interface FinanceV2CommissionRecord {
  id: string
  sprintNumber: number
  poolBaseAmount: number
  ratePct: number
  amount: number
  cfoEmployeeId: string
  postedById: string
  ledgerTransactionId: string
  createdAt: string
}

export interface FinanceV2SprintLock {
  id: string
  sprintNumber: number
  status: 'OPEN' | 'PENDING_APPROVAL' | 'LOCKED'
  requestedById: string | null
  approvedById: string | null
  reason: string | null
  createdAt: string
}

export function mapFinanceV2Config(raw: any): FinanceV2Config {
  return {
    id: raw?.id || 'singleton',
    payrollRateBDT: Number(raw?.payrollRateBDT ?? 2500),
    commissionRatePct: Number(raw?.commissionRatePct ?? 5),
    sprintPoolTotalBDT: Number(raw?.sprintPoolTotalBDT ?? 150000),
    squadOpeningSeedBDT: Number(raw?.squadOpeningSeedBDT ?? 100000),
    executivePayrollRoles: Array.isArray(raw?.executivePayrollRoles)
      ? raw.executivePayrollRoles
      : ['cto', 'cpo', 'cfo', 'chro'],
    rankWeights: Array.isArray(raw?.rankWeights) ? raw.rankWeights : [6, 5, 4, 3, 2, 1],
    bonusTiers: Array.isArray(raw?.bonusTiers) ? raw.bonusTiers : [],
    penaltyTable: raw?.penaltyTable && typeof raw.penaltyTable === 'object' ? raw.penaltyTable : {},
    updatedById: raw?.updatedById ?? null,
  }
}

export function mapFinanceV2Account(raw: any): FinanceV2Account {
  return {
    id: raw.id,
    code: raw.code,
    name: raw.name,
    type: raw.type,
    teamId: raw.teamId ?? null,
    teamName: raw.team?.name,
    teamCode: raw.team?.code,
    balance: Number(raw.balance ?? 0),
    currency: raw.currency || 'BDT',
    isActive: Boolean(raw.isActive ?? true),
  }
}

export function mapFinanceV2LedgerTx(raw: any): FinanceV2LedgerTx {
  return {
    id: raw.id,
    referenceNo: raw.referenceNo,
    idempotencyKey: raw.idempotencyKey,
    sprintNumber: Number(raw.sprintNumber ?? 1),
    type: raw.type,
    sourceKind: raw.sourceKind,
    sourceRefId: raw.sourceRefId,
    destKind: raw.destKind,
    destRefId: raw.destRefId,
    grossAmount: Number(raw.grossAmount ?? 0),
    deductions: Number(raw.deductions ?? 0),
    netAmount: Number(raw.netAmount ?? 0),
    teamId: raw.teamId ?? null,
    employeeId: raw.employeeId ?? null,
    reason: raw.reason || '',
    createdById: raw.createdById,
    approvedById: raw.approvedById ?? null,
    approvedAt: raw.approvedAt ?? null,
    approvalRef: raw.approvalRef ?? null,
    status: raw.status || 'PAID',
    reversalOfId: raw.reversalOfId ?? null,
    reversedBy: raw.reversedBy ?? null,
    direction: raw.direction,
    runningBalance:
      raw.runningBalance !== undefined ? Number(raw.runningBalance) : undefined,
    createdAt: raw.createdAt,
  }
}

export function mapFinanceV2MoneyRequest(raw: any): FinanceV2MoneyRequest {
  return {
    id: raw.id,
    type: raw.type,
    sprintNumber: Number(raw.sprintNumber ?? 1),
    sourceKind: raw.sourceKind,
    sourceRefId: raw.sourceRefId,
    destKind: raw.destKind,
    destRefId: raw.destRefId,
    teamId: raw.teamId ?? null,
    amount: Number(raw.amount ?? 0),
    reason: raw.reason || '',
    purpose: raw.purpose ?? null,
    status: raw.status,
    requesterId: raw.requesterId,
    approvedById: raw.approvedById ?? null,
    rejectionReason: raw.rejectionReason ?? null,
    postedById: raw.postedById ?? null,
    ledgerTransactionId: raw.ledgerTransactionId ?? null,
    createdAt: raw.createdAt,
  }
}

export function mapFinanceV2SprintRanking(raw: any): FinanceV2SprintRanking {
  return {
    id: raw.id,
    sprintNumber: Number(raw.sprintNumber ?? 1),
    entries: Array.isArray(raw.entries) ? raw.entries : [],
    status: raw.status,
    submittedById: raw.submittedById,
    approvedById: raw.approvedById ?? null,
    rejectionReason: raw.rejectionReason ?? null,
    poolPostedAt: raw.poolPostedAt ?? null,
    createdAt: raw.createdAt,
  }
}

export function mapFinanceV2PayrollRun(raw: any): FinanceV2PayrollRun {
  return {
    id: raw.id,
    sprintNumber: Number(raw.sprintNumber ?? 1),
    kind: raw.kind,
    teamId: raw.teamId ?? null,
    scopeKey: raw.scopeKey,
    status: raw.status,
    ratePerPerson: Number(raw.ratePerPerson ?? 0),
    headcount: Number(raw.headcount ?? 0),
    totalAmount: Number(raw.totalAmount ?? 0),
    rosterSnapshot: raw.rosterSnapshot || {},
    rosterChangeFlagConsumed: Boolean(raw.rosterChangeFlagConsumed),
    confirmedById: raw.confirmedById ?? null,
    executedById: raw.executedById ?? null,
    createdAt: raw.createdAt,
  }
}

export function mapFinanceV2BonusAward(raw: any): FinanceV2BonusAward {
  return {
    id: raw.id,
    sprintNumber: Number(raw.sprintNumber ?? 1),
    teamId: raw.teamId,
    employeeId: raw.employeeId,
    criteriaScores: raw.criteriaScores || {},
    totalScore: Number(raw.totalScore ?? 0),
    evidence: raw.evidence || '',
    tierAmount: Number(raw.tierAmount ?? 0),
    status: raw.status,
    scoredById: raw.scoredById,
    approvedById: raw.approvedById ?? null,
    rejectionReason: raw.rejectionReason ?? null,
    disbursedById: raw.disbursedById ?? null,
    createdAt: raw.createdAt,
  }
}

export function mapFinanceV2PenaltyRecord(raw: any): FinanceV2PenaltyRecord {
  return {
    id: raw.id,
    sprintNumber: Number(raw.sprintNumber ?? 1),
    teamId: raw.teamId,
    category: raw.category,
    grossAmount: Number(raw.grossAmount ?? 0),
    recipientEmployeeId: raw.recipientEmployeeId ?? null,
    recipientShare: Number(raw.recipientShare ?? 0),
    companyFundShare: Number(raw.companyFundShare ?? 0),
    reason: raw.reason || '',
    status: raw.status,
    recordedById: raw.recordedById,
    approvedById: raw.approvedById ?? null,
    rejectionReason: raw.rejectionReason ?? null,
    postedById: raw.postedById ?? null,
    triggersRosterChange: Boolean(raw.triggersRosterChange),
    rosterChangeConsumedByRunId: raw.rosterChangeConsumedByRunId ?? null,
    createdAt: raw.createdAt,
  }
}

export function mapFinanceV2CommissionRecord(raw: any): FinanceV2CommissionRecord {
  return {
    id: raw.id,
    sprintNumber: Number(raw.sprintNumber ?? 1),
    poolBaseAmount: Number(raw.poolBaseAmount ?? 0),
    ratePct: Number(raw.ratePct ?? 0),
    amount: Number(raw.amount ?? 0),
    cfoEmployeeId: raw.cfoEmployeeId,
    postedById: raw.postedById,
    ledgerTransactionId: raw.ledgerTransactionId,
    createdAt: raw.createdAt,
  }
}

export function mapFinanceV2SprintLock(raw: any): FinanceV2SprintLock {
  return {
    id: raw.id,
    sprintNumber: Number(raw.sprintNumber ?? 1),
    status: raw.status,
    requestedById: raw.requestedById ?? null,
    approvedById: raw.approvedById ?? null,
    reason: raw.reason ?? null,
    createdAt: raw.createdAt,
  }
}
