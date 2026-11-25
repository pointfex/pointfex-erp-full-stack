import {
  LayoutDashboard,
  CheckSquare,
  FolderGit2,
  Users,
  Wallet,
  Send,
  UserCheck,
  BarChart3,
  Coins,
  Settings,
  GitBranch,
  Layers,
  ScrollText,
  GitPullRequest,
  ShieldCheck,
  FileText,
  KeyRound,
  Share2,
  ClipboardCheck,
  Package,
  Inbox,
  History,
  ListFilter,
  Award,
  Handshake,
  Calendar,
  Lightbulb,
  MessageSquarePlus,
} from 'lucide-react'
import type { NavItem } from '../types'
import { WORKSPACES, type WorkspaceId, type WorkspaceMeta } from './workspaces'

export type NavGroupId =
  | 'dashboard'
  | 'organization'
  | 'my_workspace'
  | 'engineering_security'
  | 'consultancy_advisory'
  | 'admin_governance'
  // Legacy aliases for backward compatibility
  | 'home'
  | 'work_ops'
  | 'my_work'
  | 'people'
  | 'projects'
  | 'finance'
  | 'sales'
  | 'governance'
  | 'insights'
  | 'settings'

export interface NavGroupMeta {
  id: NavGroupId
  label: string
}

export const NAV_GROUPS: readonly NavGroupMeta[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'organization', label: 'Organization' },
  { id: 'my_workspace', label: 'My Work' },
  { id: 'engineering_security', label: 'Engineering' },
  { id: 'consultancy_advisory', label: 'Advisory' },
  { id: 'admin_governance', label: 'Governance' },
  // Aliases for legacy groups
  { id: 'home', label: 'Home' },
  { id: 'work_ops', label: 'Work & Operations' },
  { id: 'my_work', label: 'My Work' },
  { id: 'people', label: 'People' },
  { id: 'projects', label: 'Projects & Delivery' },
  { id: 'finance', label: 'Finance' },
  { id: 'sales', label: 'Sales & Clients' },
  { id: 'governance', label: 'Governance & Access' },
  { id: 'insights', label: 'Insights' },
  { id: 'settings', label: 'Settings' },
]

export interface NavRegistryItem extends NavItem {
  route: string
  group: NavGroupId
  workspace: WorkspaceId
  sectionHeading: string
  built: boolean
  requiredPermissions?: {
    any?: string[]
    all?: string[]
  }
  alwaysVisible?: boolean
  badgeSource?: 'pendingApprovals' | 'activeDelegations'
  mobilePriority?: number
  description?: string
}

export const NAV_REGISTRY: readonly NavRegistryItem[] = [
  // ==========================================
  // Workspace 1: Dashboard
  // ==========================================
  {
    id: 'dashboard',
    route: 'dashboard',
    label: 'My Day',
    group: 'dashboard',
    workspace: 'dashboard',
    sectionHeading: 'Overview',
    built: true,
    icon: LayoutDashboard,
    isImplemented: true,
    alwaysVisible: true,
    mobilePriority: 1,
    description: 'Daily focus, attendance, priorities, and role-aware widgets',
  },

  // ==========================================
  // Workspace 2: Organization (Clean, inspect-first org directory)
  // OVERVIEW: Leaderboard, Projects
  // DIRECTORY: People, Squads
  // ==========================================
  {
    id: 'leaderboard',
    route: 'leaderboard',
    label: 'Leaderboard',
    group: 'organization',
    workspace: 'organization',
    sectionHeading: 'Overview',
    built: true,
    icon: Award,
    isImplemented: true,
    alwaysVisible: true,
    mobilePriority: 2,
    description: 'Company-wide XP and KPI rankings with squad filters and 4-week trends',
  },
  {
    id: 'projects',
    route: 'projects',
    label: 'Projects',
    group: 'organization',
    workspace: 'organization',
    sectionHeading: 'Overview',
    built: true,
    icon: FolderGit2,
    isImplemented: true,
    alwaysVisible: true,
    description: 'Active client and internal projects, milestones, repositories, and squad assignments',
  },
  {
    id: 'people',
    route: 'people',
    label: 'People',
    group: 'organization',
    workspace: 'organization',
    sectionHeading: 'Directory',
    built: true,
    icon: Users,
    isImplemented: true,
    alwaysVisible: true,
    description: 'Company-wide directory, roles, and profiles',
  },
  {
    id: 'teams',
    route: 'teams',
    label: 'Squads',
    group: 'organization',
    workspace: 'organization',
    sectionHeading: 'Directory',
    built: true,
    icon: FolderGit2,
    isImplemented: true,
    alwaysVisible: true,
    description: 'Squad engineering roster, assigned PMs, and managed projects',
  },

  // ==========================================
  // Workspace 3: My Work (Personal & Squad Hub)
  // DAILY WORK: My Tasks, My Squads
  // GROWTH & PAY: Wallet & XP
  // ==========================================
  {
    id: 'tasks',
    route: 'tasks',
    label: 'My Tasks',
    group: 'my_workspace',
    workspace: 'my_workspace',
    sectionHeading: 'Daily Work',
    built: true,
    icon: CheckSquare,
    isImplemented: true,
    alwaysVisible: true,
    mobilePriority: 2,
    description: 'Assigned sprint work, status updates, and deliverables',
  },
  {
    id: 'my-squads',
    route: 'my-squads',
    label: 'My Squads',
    group: 'my_workspace',
    workspace: 'my_workspace',
    sectionHeading: 'Daily Work',
    built: true,
    icon: UserCheck,
    isImplemented: true,
    alwaysVisible: true,
    description: 'Active squad memberships, scoped tasks, and squad PM task management',
  },
  {
    id: 'earnings',
    route: 'earnings',
    label: 'Wallet & XP',
    group: 'my_workspace',
    workspace: 'my_workspace',
    sectionHeading: 'Growth & Pay',
    built: true,
    icon: Wallet,
    isImplemented: true,
    alwaysVisible: true,
    mobilePriority: 4,
    description: 'Compensation payouts, live XP/KPI, and itemized deliverable ledger',
  },

  // ==========================================
  // Workspace 4: Engineering (Engineering & Security)
  // Code Quality, Security Testing, Submissions & Leave, Idea Submissions, Company Suggestions, Reports
  // ==========================================
  {
    id: 'code-quality',
    route: 'code-quality',
    label: 'Code Quality',
    group: 'engineering_security',
    workspace: 'engineering_security',
    sectionHeading: 'Engineering',
    built: true,
    icon: GitBranch,
    isImplemented: true,
    requiredPermissions: {
      any: ['quality_gates:read', 'code_quality:view_gates', 'system:root'],
    },
    description: 'Static analysis, test coverage, and automated code quality gates',
  },
  {
    id: 'security-testing',
    route: 'security-testing',
    label: 'Security Testing',
    group: 'engineering_security',
    workspace: 'engineering_security',
    sectionHeading: 'Engineering',
    built: true,
    icon: ShieldCheck,
    isImplemented: true,
    requiredPermissions: {
      any: ['security_alerts:read', 'security:view_alerts', 'security_alerts:create', 'test_runs:read', 'system:root'],
    },
    description: 'Security vulnerability scans, dependency audits, and automated test runs',
  },
  {
    id: 'submissions-leave',
    route: 'submissions-leave',
    label: 'Submissions & Leave',
    group: 'engineering_security',
    workspace: 'engineering_security',
    sectionHeading: 'Submissions & Ideas',
    built: true,
    icon: Calendar,
    isImplemented: true,
    alwaysVisible: true,
    description: 'Personal deliverable submissions, time-off requests, and leave approvals (CEO/CHRO)',
  },
  {
    id: 'idea-submissions',
    route: 'idea-submissions',
    label: 'Idea Submissions',
    group: 'engineering_security',
    workspace: 'engineering_security',
    sectionHeading: 'Submissions & Ideas',
    built: true,
    icon: Lightbulb,
    isImplemented: true,
    alwaysVisible: true,
    description: 'Project proposals, architecture ideas, and engineering initiatives',
  },
  {
    id: 'company-suggestions',
    route: 'company-suggestions',
    label: 'Company Suggestions',
    group: 'engineering_security',
    workspace: 'engineering_security',
    sectionHeading: 'Submissions & Ideas',
    built: true,
    icon: MessageSquarePlus,
    isImplemented: true,
    alwaysVisible: true,
    description: 'Workplace suggestions, company improvements, and feedback',
  },
  {
    id: 'reports',
    route: 'reports',
    label: 'Reports',
    group: 'engineering_security',
    workspace: 'engineering_security',
    sectionHeading: 'Engineering',
    built: true,
    icon: FileText,
    isImplemented: true,
    alwaysVisible: true,
    description: 'Universal grievance, issue, and misconduct reporting with authority routing',
  },

  // ==========================================
  // Workspace 5: Advisory (Technical Advisory & Consultancy)
  // Client Advisory, Project Requests, Client Proposals
  // ==========================================
  {
    id: 'consultancy',
    route: 'consultancy',
    label: 'Consultations & Advisory',
    group: 'consultancy_advisory',
    workspace: 'consultancy_advisory',
    sectionHeading: 'Advisory',
    built: true,
    icon: Handshake,
    isImplemented: true,
    requiredPermissions: {
      any: ['consultancy:read', 'consultancy:manage', 'consultancy:create', 'consultancy:view_all', 'system:root'],
    },
    description: 'Peer-to-peer technical consultation network and executive learning notes',
  },
  {
    id: 'project-requests',
    route: 'project-requests',
    label: 'Project Requests',
    group: 'consultancy_advisory',
    workspace: 'consultancy_advisory',
    sectionHeading: 'Advisory',
    built: true,
    icon: GitPullRequest,
    isImplemented: true,
    requiredPermissions: {
      any: ['projects:request', 'projects:create', 'projects:create_assign', 'votes:cast', 'sales:create', 'system:root'],
    },
    description: 'Incoming client project intake, scope review, and scoping approvals',
  },
  {
    id: 'proposals',
    route: 'proposals',
    label: 'Client Proposals',
    group: 'consultancy_advisory',
    workspace: 'consultancy_advisory',
    sectionHeading: 'Advisory',
    built: true,
    icon: ScrollText,
    isImplemented: true,
    requiredPermissions: {
      any: ['sales:create', 'sales:read_all', 'consultancy:read', 'consultancy:manage', 'system:root'],
    },
    description: 'Client proposals, engagement terms, and statement of work drafts',
  },

  // ==========================================
  // Workspace 6: Governance (Admin, Reviews & Executive Control)
  // OPERATIONS: Approvals & Inbox, Performance Reviews, Treasury & Finance
  // ACCESS & AUDIT: Role Matrix, Login Access, Delegations, Audit Trail, Access History, Security & MFA
  // ==========================================
  {
    id: 'inbox',
    route: 'inbox',
    label: 'Approvals & Inbox',
    group: 'admin_governance',
    workspace: 'admin_governance',
    sectionHeading: 'Operations',
    built: true,
    icon: Inbox,
    isImplemented: true,
    badgeSource: 'pendingApprovals',
    mobilePriority: 3,
    requiredPermissions: {
      any: [
        'approvals:approve',
        'governance:approve_request',
        'budgets:approve_request',
        'payroll:approve_batch',
        'system:root',
      ],
    },
    description: 'Executive pending role requests, budget requests, and task deliverable approvals',
  },
  {
    id: 'performance',
    route: 'performance',
    label: 'Performance Reviews',
    group: 'admin_governance',
    workspace: 'admin_governance',
    sectionHeading: 'Operations',
    built: true,
    icon: BarChart3,
    isImplemented: true,
    requiredPermissions: {
      any: [
        'performance:read_all',
        'system:root',
      ],
    },
    description: 'Executive quarterly reviews, 360 evaluations, and KPI calibrations',
  },
  {
    id: 'budget',
    route: 'budget',
    label: 'Treasury & Finance',
    group: 'admin_governance',
    workspace: 'admin_governance',
    sectionHeading: 'Operations',
    built: true,
    icon: Coins,
    isImplemented: true,
    requiredPermissions: {
      any: [
        'treasury:read',
        'wallets:read_all',
        'transactions:read_all',
        'budgets:approve_request',
        'budgets:reject_request',
        'budgets:allocate_project',
        'finance:issue_adjustment',
        'revenue_share:process',
        'finance:view_budget',
        'performance:evaluate',
        'finance_ledger:read_all',
        'money_requests:create',
        'money_requests:approve',
        'money_requests:post',
        'system:root',
      ],
    },
    description: 'Company reserves, project budgets, payroll, and developer payouts in BDT',
  },
  {
    id: 'access-control',
    route: 'access-control',
    label: 'Roles & Access',
    group: 'admin_governance',
    workspace: 'admin_governance',
    sectionHeading: 'Access & Audit',
    built: true,
    icon: KeyRound,
    isImplemented: true,
    requiredPermissions: {
      any: [
        'roles:read',
        'roles:create',
        'roles:update',
        'roles:delete',
        'users:assign_role',
        'permissions:read',
        'governance:manage_roles',
        'system:root',
      ],
    },
    description: 'Roles & access, dynamic custom roles, and fine-grained access rules',
  },
  {
    id: 'login-access',
    route: 'login-access',
    label: 'Login Access',
    group: 'admin_governance',
    workspace: 'admin_governance',
    sectionHeading: 'Access & Audit',
    built: true,
    icon: ShieldCheck,
    isImplemented: true,
    requiredPermissions: {
      any: ['login_allowlist:manage', 'login_allowlist:read', 'system:root'],
    },
    description: 'CEO-only allowlist of verified emails permitted to sign in or be onboarded',
  },
  {
    id: 'delegations',
    route: 'delegations',
    label: 'Delegations',
    group: 'admin_governance',
    workspace: 'admin_governance',
    sectionHeading: 'Access & Audit',
    built: true,
    icon: Share2,
    isImplemented: true,
    badgeSource: 'activeDelegations',
    requiredPermissions: {
      any: [
        'permissions:delegate',
        'delegations:manage',
        'delegations:create',
        'system:root',
      ],
    },
    description: 'Time-bounded delegated permissions and revocation controls',
  },
  {
    id: 'audit-log',
    route: 'audit-log',
    label: 'Activity History',
    group: 'admin_governance',
    workspace: 'admin_governance',
    sectionHeading: 'Access & Audit',
    built: true,
    icon: ScrollText,
    isImplemented: true,
    requiredPermissions: {
      any: ['audit_logs:read', 'audit_logs:read_confidential', 'audit_logs:verify', 'system:root'],
    },
    description: 'Tamper-evident hash-chained governance and security log',
  },
  {
    id: 'access-history',
    route: 'access-history',
    label: 'Access History',
    group: 'admin_governance',
    workspace: 'admin_governance',
    sectionHeading: 'Access & Audit',
    built: true,
    icon: History,
    isImplemented: true,
    requiredPermissions: {
      any: ['audit_logs:read_confidential', 'system:root'],
    },
    description: 'Immutable ledger of permission grants, role adjustments, and delegations',
  },
  {
    id: 'security-overview',
    route: 'security-overview',
    label: 'Security & Verification',
    group: 'admin_governance',
    workspace: 'admin_governance',
    sectionHeading: 'Access & Audit',
    built: true,
    icon: ShieldCheck,
    isImplemented: true,
    requiredPermissions: {
      any: ['mfa:manage', 'system:root'],
    },
    description: 'Organization security verification status, administrative resets, and security posture',
  },

  // ==========================================
  // Auxiliary & Legacy Routes (Accessible via URL & Search, not duplicated in Workspaces)
  // ==========================================
  {
    id: 'settings',
    route: 'settings',
    label: 'Profile & Settings',
    group: 'settings',
    workspace: 'my_work',
    sectionHeading: 'Preferences',
    built: true,
    icon: Settings,
    isImplemented: true,
    alwaysVisible: true,
    mobilePriority: 5,
    description: 'Profile, MFA status, theme, language, and personal preferences',
  },
  {
    id: 'my-performance',
    route: 'my-performance',
    label: 'My Performance & XP',
    group: 'my_work',
    workspace: 'my_work',
    sectionHeading: 'Performance',
    built: true,
    icon: BarChart3,
    isImplemented: true,
    alwaysVisible: true,
    description: 'Personal weekly KPI breakdown, XP standing, visual trends, and itemized event ledger',
  },
  {
    id: 'performance-ledger',
    route: 'performance-ledger',
    label: 'XP Ledger',
    group: 'my_work',
    workspace: 'my_work',
    sectionHeading: 'Performance',
    built: true,
    icon: History,
    isImplemented: true,
    alwaysVisible: true,
    description: 'Append-only audit trail of XP awards, freezes, releases, and reversals',
  },
  {
    id: 'performance-logs',
    route: 'performance-logs',
    label: 'Performance & XP Logs',
    group: 'work_ops',
    workspace: 'work_ops',
    sectionHeading: 'Logs',
    built: true,
    icon: Award,
    isImplemented: true,
    alwaysVisible: true,
    description: 'Itemized XP ledger, task KPI scores, and performance standing audit log',
  },
  {
    id: 'approvals-control',
    route: 'approvals-control',
    label: 'Approvals & Task Control',
    group: 'work_ops',
    workspace: 'work_ops',
    sectionHeading: 'Approvals',
    built: true,
    icon: ClipboardCheck,
    isImplemented: true,
    requiredPermissions: {
      any: [
        'audit_logs:read',
        'governance:approve_request',
        'budgets:approve_request',
        'system:root',
      ],
    },
    description: 'Executive task reviews, weight proposals, and final approvals',
  },

  // ==========================================
  // Legacy / Direct Auxiliary Routes
  // ==========================================
  {
    id: 'projects-repos',
    route: 'projects-repos',
    label: 'Projects & Repositories',
    group: 'projects',
    workspace: 'delivery',
    sectionHeading: 'Projects',
    built: true,
    icon: GitBranch,
    isImplemented: true,
    requiredPermissions: {
      any: ['projects:read_all', 'projects:create', 'projects:update', 'projects:assign_team'],
    },
    description: 'All active projects, milestones, and repositories',
  },
  {
    id: 'task-management',
    route: 'task-management',
    label: 'Task Operations',
    group: 'projects',
    workspace: 'delivery',
    sectionHeading: 'Tasks',
    built: true,
    icon: Layers,
    isImplemented: true,
    requiredPermissions: {
      any: [
        'tasks:create_assign',
        'tasks:approve',
        'tasks:reject',
        'tasks:reassign',
        'directives:dispatch',
      ],
    },
    description: 'Assign work, approve milestones, and track sprint velocity',
  },
  {
    id: 'budget-finance',
    route: 'budget-finance',
    label: 'Budget Requests',
    group: 'finance',
    workspace: 'finance',
    sectionHeading: 'Finance',
    built: true,
    icon: Coins,
    isImplemented: true,
    requiredPermissions: {
      any: ['budgets:read_requests', 'budgets:request_increase', 'budgets:allocate_developer'],
    },
    description: 'Allocate squad funds and submit BDT budget requests',
  },
  {
    id: 'procurement-ops',
    route: 'procurement-ops',
    label: 'Procurement & Assets',
    group: 'finance',
    workspace: 'finance',
    sectionHeading: 'Procurement',
    built: false,
    icon: Package,
    isImplemented: false,
    requiredPermissions: { any: ['purchase_orders:read', 'vendors:read', 'assets:read'] },
    description: 'Vendors, purchase orders, inventory, and company assets',
  },
  {
    id: 'approvals',
    route: 'approvals',
    label: 'Inbox & Approvals',
    group: 'governance',
    workspace: 'admin',
    sectionHeading: 'Approvals',
    built: false,
    icon: ClipboardCheck,
    isImplemented: false,
    badgeSource: 'pendingApprovals',
    mobilePriority: 3,
    requiredPermissions: {
      any: [
        'approvals:read',
        'approvals:create',
        'approvals:approve',
        'approvals:reject',
        'governance:approve_request',
        'payroll:approve_batch',
        'budgets:approve_request',
        'tasks:approve',
      ],
    },
    description: 'Pending multi-step approvals and action queue',
  },
  {
    id: 'my-requests',
    route: 'my-requests',
    label: 'My Requests',
    group: 'my_work',
    workspace: 'my_work',
    sectionHeading: 'Requests',
    built: true,
    icon: ListFilter,
    isImplemented: true,
    alwaysVisible: true,
    description: 'Live timeline tracking all your access, project, and budget requests',
  },
  {
    id: 'report',
    route: 'report',
    label: 'Submissions & Grievances',
    group: 'my_work',
    workspace: 'my_work',
    sectionHeading: 'Grievances',
    built: true,
    icon: Send,
    isImplemented: true,
    alwaysVisible: true,
    description: 'Submit leave notices, ideas, or confidential grievances',
  },
]

export function canAccessRoute(
  routeId: string,
  effectivePermissions: readonly string[] | ReadonlySet<string>,
): boolean {
  const item = findNavItemByRoute(routeId)
  if (!item || !item.built) return false
  if (item.alwaysVisible) return true

  const permSet =
    effectivePermissions instanceof Set
      ? (effectivePermissions as Set<string>)
      : new Set(effectivePermissions)
  if (permSet.has('system:root')) return true

  // Strict check: Only C-Suite executives with explicit executive authority can access Admin & Governance
  const isExecutiveUser =
    permSet.has('system:root') ||
    permSet.has('governance:read') ||
    permSet.has('governance:manage_roles') ||
    permSet.has('governance:approve_request') ||
    permSet.has('governance:transfer_ceo') ||
    permSet.has('audit_logs:read') ||
    permSet.has('audit_logs:read_confidential') ||
    permSet.has('login_allowlist:read') ||
    permSet.has('login_allowlist:manage') ||
    permSet.has('mfa:manage') ||
    permSet.has('treasury:read') ||
    permSet.has('performance:read_all') ||
    permSet.has('performance:discipline')

  const isGovernanceWorkspaceRoute =
    item.workspace === 'admin_governance' ||
    item.workspace === 'admin' ||
    item.workspace === 'finance' ||
    item.group === 'admin_governance' ||
    item.group === 'governance' ||
    item.group === 'finance'

  // Non-executive users (Developers and PMs) can never access Governance workspace routes
  if (isGovernanceWorkspaceRoute && !isExecutiveUser) {
    return false
  }

  // Governance workspace route guards:
  // 1. Delegations: strictly C-Suite executives with delegation authority
  if (item.id === 'delegations') {
    if (!isExecutiveUser) return false
    if (
      !permSet.has('system:root') &&
      !permSet.has('permissions:delegate') &&
      !permSet.has('delegations:manage') &&
      !permSet.has('delegations:create') &&
      !permSet.has('delegations:read_own')
    ) {
      return false
    }
  }

  // 2. Security & MFA: administrative oversight strictly for CHRO and CEO
  if (item.id === 'security-overview') {
    if (!isExecutiveUser) return false
    if (!permSet.has('system:root') && !permSet.has('mfa:manage')) {
      return false
    }
  }

  // 3. Performance Reviews: strictly C-Suite executive oversight (CEO, CTO, CFO, CHRO, CPO)
  if (item.id === 'performance') {
    if (!isExecutiveUser) return false
    if (
      !permSet.has('system:root') &&
      !permSet.has('performance:read_all') &&
      !permSet.has('performance:discipline') &&
      !permSet.has('kpi:verify_weight')
    ) {
      return false
    }
  }

  // 4. Budget & Treasury under Governance: strictly CFO, CEO, COO
  if (item.id === 'budget' || item.id === 'budget-finance') {
    if (isGovernanceWorkspaceRoute && !isExecutiveUser) return false
  }

  // 5. Approvals & Inbox under Governance: strictly C-Level
  if (item.id === 'inbox' && isGovernanceWorkspaceRoute && !isExecutiveUser) {
    return false
  }

  const req = item.requiredPermissions
  if (!req) return true
  if (req.all && !req.all.every((c) => permSet.has(c))) return false
  if (req.any && !req.any.some((c) => permSet.has(c))) return false
  return true
}

const DUPLICATE_WORKSPACE_ITEMS = new Set<string>([
  'idea-submissions',
  'company-suggestions',
  'approvals',
  'budget-finance',
  'my-performance',
  'performance-ledger',
  'performance-logs',
  'approvals-control',
  'projects-repos',
  'task-management',
])

export function checkItemVisibility(
  item: NavRegistryItem,
  effectivePermissions: readonly string[],
  alreadyVisibleIds?: ReadonlySet<string>,
): boolean {
  if (!item.built) return false
  if (item.id === 'performance-ledger') return false
  if (item.id === 'team' && alreadyVisibleIds?.has('team-management')) return false
  return canAccessRoute(item.route, effectivePermissions)
}

export interface VisibleNavGroup {
  id: NavGroupId
  label: string
  items: NavRegistryItem[]
}

export interface WorkspaceSection {
  heading: string
  items: NavRegistryItem[]
}

export interface VisibleWorkspace {
  workspace: WorkspaceMeta
  items: NavRegistryItem[]
  /** At most 4 short section headings per workspace */
  sections: WorkspaceSection[]
}

export function resolveVisibleNavigation(effectivePermissions: readonly string[]): {
  groups: VisibleNavGroup[]
  visibleItems: NavRegistryItem[]
  mobileItems: NavRegistryItem[]
  settingsItem: NavRegistryItem | null
} {
  const visibleItems: NavRegistryItem[] = []
  const seenIds = new Set<string>()

  for (const item of NAV_REGISTRY) {
    if (checkItemVisibility(item, effectivePermissions, seenIds)) {
      visibleItems.push(item)
      seenIds.add(item.id)
    }
  }

  const nonEmptyGroups = NAV_GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    items: visibleItems.filter((item) => item.group === g.id),
  })).filter((g) => g.items.length > 0)

  let settingsItem: NavRegistryItem | null = null
  let groups = nonEmptyGroups
  if (nonEmptyGroups.length > 8) {
    const settingsGroup = nonEmptyGroups.find((g) => g.id === 'settings')
    settingsItem = settingsGroup?.items[0] || null
    groups = nonEmptyGroups.filter((g) => g.id !== 'settings').slice(0, 8)
  }

  const mobileItems = visibleItems
    .filter((i) => typeof i.mobilePriority === 'number')
    .sort((a, b) => (a.mobilePriority ?? 99) - (b.mobilePriority ?? 99))
    .slice(0, 4)

  return { groups, visibleItems, mobileItems, settingsItem }
}

export function resolveVisibleWorkspaces(effectivePermissions: readonly string[]): VisibleWorkspace[] {
  const permSet = new Set(effectivePermissions)
  const isExecutiveUser =
    permSet.has('system:root') ||
    permSet.has('governance:read') ||
    permSet.has('governance:manage_roles') ||
    permSet.has('governance:approve_request') ||
    permSet.has('governance:transfer_ceo') ||
    permSet.has('audit_logs:read') ||
    permSet.has('audit_logs:read_confidential') ||
    permSet.has('login_allowlist:read') ||
    permSet.has('login_allowlist:manage') ||
    permSet.has('mfa:manage') ||
    permSet.has('treasury:read') ||
    permSet.has('performance:read_all') ||
    permSet.has('performance:discipline')

  const { visibleItems } = resolveVisibleNavigation(effectivePermissions)

  return WORKSPACES.map((ws) => {
    if (ws.id === 'admin_governance' && !isExecutiveUser) {
      return null
    }
    const items = visibleItems.filter((item) => {
      if (DUPLICATE_WORKSPACE_ITEMS.has(item.id)) return false
      const itemWs = item.workspace
      return (
        itemWs === ws.id ||
        (ws.id === 'dashboard' && itemWs === 'home') ||
        (ws.id === 'organization' && (itemWs === 'work_ops' || itemWs === 'people' || itemWs === 'delivery' || itemWs === 'company_hub')) ||
        (ws.id === 'my_workspace' && itemWs === 'my_work') ||
        (ws.id === 'engineering_security' && itemWs === 'engineering') ||
        (ws.id === 'consultancy_advisory' && itemWs === 'product_clients') ||
        (ws.id === 'admin_governance' && itemWs === 'admin_governance')
      )
    })
    if (items.length === 0) return null

    const sectionMap = new Map<string, NavRegistryItem[]>()
    for (const item of items) {
      const heading = item.sectionHeading || 'Pages'
      const list = sectionMap.get(heading) || []
      list.push(item)
      sectionMap.set(heading, list)
    }

    const sections: WorkspaceSection[] = Array.from(sectionMap.entries())
      .slice(0, 4)
      .map(([heading, sectionItems]) => ({ heading, items: sectionItems }))

    return {
      workspace: ws,
      items,
      sections,
    }
  }).filter((w): w is VisibleWorkspace => w !== null)
}

export function findNavItemByRoute(routeId: string): NavRegistryItem | undefined {
  return NAV_REGISTRY.find((item) => item.route === routeId || item.id === routeId)
}

export function findWorkspaceByRoute(routeId: string): WorkspaceId {
  const item = findNavItemByRoute(routeId)
  if (!item) return 'dashboard'
  const ws = item.workspace
  if (ws === 'home') return 'dashboard'
  if (ws === 'work_ops' || ws === 'people' || ws === 'delivery' || ws === 'company_hub') return 'organization'
  if (ws === 'my_work') return 'my_workspace'
  if (ws === 'engineering') return 'engineering_security'
  if (ws === 'product_clients') return 'consultancy_advisory'
  if (ws === 'admin' || ws === 'finance' || ws === 'operations' || ws === 'admin_governance') return 'admin_governance'
  return ws
}
