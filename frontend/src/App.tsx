import { lazy, Suspense, useEffect } from 'react'
import { AppProvider, useApp } from './context/AppContext'
import { Shell } from './components/layout/Shell'
import { LoginPage } from './pages/auth/LoginPage'
import { FirstLoginSecurityPage } from './pages/auth/FirstLoginSecurityPage'
import { DesktopNoticeModal } from './components/common/DesktopNoticeModal'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { SkeletonCard } from './components/common/Skeleton'
import { IdleTimeoutModal } from './components/common/IdleTimeoutModal'
import { usePermissions } from './hooks/usePermissions'
import { canAccessRoute } from './config/nav-registry'

const DeveloperTasksPage = lazy(() =>
  import('./pages/developer/DeveloperTasksPage').then((m) => ({ default: m.DeveloperTasksPage })),
)
const DeveloperTeamPage = lazy(() =>
  import('./pages/developer/DeveloperTeamPage').then((m) => ({ default: m.DeveloperTeamPage })),
)
const DeveloperEarningsPage = lazy(() =>
  import('./pages/developer/DeveloperEarningsPage').then((m) => ({
    default: m.DeveloperEarningsPage,
  })),
)
const DeveloperReportPage = lazy(() =>
  import('./pages/developer/DeveloperReportPage').then((m) => ({ default: m.DeveloperReportPage })),
)
const PmTasksPage = lazy(() =>
  import('./pages/pm/PmTasksPage').then((m) => ({ default: m.PmTasksPage })),
)
const PmTaskManagementPage = lazy(() =>
  import('./pages/pm/PmTaskManagementPage').then((m) => ({ default: m.PmTaskManagementPage })),
)
const PmTeamManagementPage = lazy(() =>
  import('./pages/pm/PmTeamManagementPage').then((m) => ({ default: m.PmTeamManagementPage })),
)
const PmBudgetFinancePage = lazy(() =>
  import('./pages/pm/PmBudgetFinancePage').then((m) => ({ default: m.PmBudgetFinancePage })),
)
const PmEarningsPage = lazy(() =>
  import('./pages/pm/PmEarningsPage').then((m) => ({ default: m.PmEarningsPage })),
)
const PmReportsPage = lazy(() =>
  import('./pages/pm/PmReportsPage').then((m) => ({ default: m.PmReportsPage })),
)
const CtoTasksPage = lazy(() =>
  import('./pages/cto/CtoTasksPage').then((m) => ({ default: m.CtoTasksPage })),
)
const CtoTaskManagementPage = lazy(() =>
  import('./pages/cto/CtoTaskManagementPage').then((m) => ({ default: m.CtoTaskManagementPage })),
)
const CtoTeamManagementPage = lazy(() =>
  import('./pages/cto/CtoTeamManagementPage').then((m) => ({ default: m.CtoTeamManagementPage })),
)
const CtoAuditLogPage = lazy(() =>
  import('./pages/cto/CtoAuditLogPage').then((m) => ({ default: m.CtoAuditLogPage })),
)
const CtoPeoplePage = lazy(() =>
  import('./pages/cto/CtoPeoplePage').then((m) => ({ default: m.CtoPeoplePage })),
)
const CtoProjectsReposPage = lazy(() =>
  import('./pages/cto/CtoProjectsReposPage').then((m) => ({ default: m.CtoProjectsReposPage })),
)
const CtoCodeQualityPage = lazy(() =>
  import('./pages/cto/CtoCodeQualityPage').then((m) => ({ default: m.CtoCodeQualityPage })),
)
const CtoSecurityTestingPage = lazy(() =>
  import('./pages/cto/CtoSecurityTestingPage').then((m) => ({
    default: m.CtoSecurityTestingPage,
  })),
)
const CtoConsultancyPage = lazy(() =>
  import('./pages/cto/CtoConsultancyPage').then((m) => ({ default: m.CtoConsultancyPage })),
)
const CtoEarningsPage = lazy(() =>
  import('./pages/cto/CtoEarningsPage').then((m) => ({ default: m.CtoEarningsPage })),
)
const MyAccountPage = lazy(() =>
  import('./pages/account/MyAccountPage').then((m) => ({ default: m.MyAccountPage })),
)
const LoginAccessPage = lazy(() =>
  import('./pages/admin/LoginAccessPage').then((m) => ({ default: m.LoginAccessPage })),
)
const SecurityOverviewPage = lazy(() =>
  import('./pages/admin/SecurityOverviewPage').then((m) => ({
    default: m.SecurityOverviewPage,
  })),
)
const DynamicDashboardPage = lazy(() =>
  import('./pages/dashboard/DynamicDashboardPage').then((m) => ({
    default: m.DynamicDashboardPage,
  })),
)
const CfoBudgetPage = lazy(() =>
  import('./pages/cfo/CfoBudgetPage').then((m) => ({ default: m.CfoBudgetPage })),
)
const ChroPerformancePage = lazy(() =>
  import('./pages/chro/ChroPerformancePage').then((m) => ({ default: m.ChroPerformancePage })),
)
const CeoRoleMatrixPage = lazy(() =>
  import('./pages/ceo/CeoRoleMatrixPage').then((m) => ({ default: m.CeoRoleMatrixPage })),
)
const AccessHistoryPage = lazy(() =>
  import('./pages/admin/AccessHistoryPage').then((m) => ({ default: m.AccessHistoryPage })),
)
const ProjectRequestsPage = lazy(() =>
  import('./pages/projects/ProjectRequestsPage').then((m) => ({ default: m.ProjectRequestsPage })),
)
const ProposalsPage = lazy(() =>
  import('./pages/projects/ProposalsPage').then((m) => ({ default: m.ProposalsPage })),
)
const MyRequestsPage = lazy(() =>
  import('./pages/projects/MyRequestsPage').then((m) => ({ default: m.MyRequestsPage })),
)
const DelegationCenterPage = lazy(() =>
  import('./pages/security/DelegationCenterPage').then((m) => ({
    default: m.DelegationCenterPage,
  })),
)
const UnifiedInboxPage = lazy(() =>
  import('./pages/security/UnifiedInboxPage').then((m) => ({ default: m.UnifiedInboxPage })),
)
const MyPerformancePage = lazy(() =>
  import('./pages/performance/MyPerformancePage').then((m) => ({ default: m.MyPerformancePage })),
)
const LeaderboardPage = lazy(() =>
  import('./pages/performance/LeaderboardPage').then((m) => ({ default: m.LeaderboardPage })),
)
const AccessDeniedPage = lazy(() =>
  import('./pages/security/AccessDeniedPage').then((m) => ({ default: m.AccessDeniedPage })),
)
const MySquadsPage = lazy(() =>
  import('./pages/operations/MySquadsPage').then((m) => ({ default: m.MySquadsPage })),
)
const PerformanceXpLogsPage = lazy(() =>
  import('./pages/operations/PerformanceXpLogsPage').then((m) => ({
    default: m.PerformanceXpLogsPage,
  })),
)
const ApprovalsTaskControlPage = lazy(() =>
  import('./pages/operations/ApprovalsTaskControlPage').then((m) => ({
    default: m.ApprovalsTaskControlPage,
  })),
)
const SubmissionsLeavePage = lazy(() =>
  import('./pages/operations/SubmissionsLeavePage').then((m) => ({
    default: m.SubmissionsLeavePage,
  })),
)
const EngineeringReportsPage = lazy(() =>
  import('./pages/engineering/EngineeringReportsPage').then((m) => ({
    default: m.EngineeringReportsPage,
  })),
)
const CtoReportsPage = lazy(() =>
  import('./pages/cto/CtoReportsPage').then((m) => ({
    default: m.CtoReportsPage,
  })),
)

function PageRouteFallback() {
  return (
    <div className="space-y-4">
      <SkeletonCard />
      <SkeletonCard />
    </div>
  )
}

function MainContentRouter() {
  const { currentRoute, currentRole, can, canAny, isSquadPm, currentUser } = useApp()
  const { permissions, authzSnapshot } = usePermissions()
  const effectivePermissions = authzSnapshot?.effectiveCodes ?? permissions

  if (currentRoute !== 'dashboard' && !canAccessRoute(currentRoute, effectivePermissions)) {
    return <AccessDeniedPage routeId={currentRoute} />
  }

  if (currentRoute === 'delegations') {
    const role = (currentUser?.role || '').toLowerCase()
    const isCLevelOrCeo = ['ceo', 'cto', 'chro', 'cfo', 'cpo'].includes(role) || can('system:root')
    if (
      isCLevelOrCeo &&
      (canAny([
        'permissions:delegate',
        'delegations:create',
        'delegations:manage',
        'system:root',
      ]) || isCLevelOrCeo)
    ) {
      return <DelegationCenterPage />
    }
    return <AccessDeniedPage routeId="delegations" />
  }
  if (currentRoute === 'inbox' || currentRoute === 'approvals') {
    const role = (currentUser?.role || '').toLowerCase()
    const isCLevelOrCeo = ['ceo', 'cto', 'chro', 'cfo', 'cpo'].includes(role) || can('system:root')
    if (
      isCLevelOrCeo &&
      canAny([
        'approvals:approve',
        'governance:approve_request',
        'budgets:approve_request',
        'payroll:approve_batch',
        'system:root',
      ])
    ) {
      return <UnifiedInboxPage />
    }
    return <AccessDeniedPage routeId="inbox" />
  }

  // Work & Operations Workspace (Unified Organization, Squads, Tasks & Approvals)
  if (currentRoute === 'people') {
    return <CtoPeoplePage />
  }
  if (currentRoute === 'teams' || currentRoute === 'team-management') {
    return <CtoTeamManagementPage />
  }
  if (currentRoute === 'my-squads' || currentRoute === 'team') {
    return <MySquadsPage />
  }
  if (currentRoute === 'performance-logs') {
    return <PerformanceXpLogsPage />
  }
  if (currentRoute === 'approvals-control') {
    const role = (currentUser?.role || '').toLowerCase()
    const activeRoles = (currentUser?.activeRoleSlugs || []).map((r) => r.toLowerCase())
    const title = (currentUser?.title || '').toLowerCase()
    const isCLevelOrCeo =
      ['ceo', 'cto', 'chro', 'cfo', 'cpo'].includes(role) ||
      activeRoles.some((r) => ['ceo', 'cto', 'chro', 'cfo', 'cpo'].includes(r)) ||
      title.includes('chief') ||
      can('system:root')
    if (isCLevelOrCeo) {
      return <ApprovalsTaskControlPage />
    }
    return <AccessDeniedPage routeId="approvals-control" />
  }
  if (
    currentRoute === 'task-management' &&
    (isSquadPm ||
      canAny([
        'tasks:create_assign',
        'tasks:approve',
        'tasks:reject',
        'tasks:reassign',
        'directives:read',
        'directives:dispatch',
      ]))
  ) {
    return can('projects:read_all') || can('directives:dispatch') ? (
      <CtoTaskManagementPage />
    ) : (
      <PmTaskManagementPage />
    )
  }
  if (
    currentRoute === 'access-control' &&
    (canAny([
      'roles:read',
      'roles:create',
      'roles:update',
      'roles:delete',
      'users:assign_role',
      'permissions:read',
    ]) ||
      can('system:root'))
  ) {
    return <CeoRoleMatrixPage />
  }
  if (
    currentRoute === 'budget' &&
    canAny([
      'treasury:read',
      'wallets:read_all',
      'transactions:read_all',
      'budgets:approve_request',
      'budgets:reject_request',
      'budgets:allocate_project',
      'finance:issue_adjustment',
      'revenue_share:process',
      'performance:evaluate',
      'finance_ledger:read_all',
      'money_requests:create',
      'money_requests:approve',
      'money_requests:post',
    ])
  ) {
    return <CfoBudgetPage />
  }
  if (
    currentRoute === 'budget-finance' &&
    canAny(['budgets:read_requests', 'budgets:request_increase', 'budgets:allocate_developer'])
  ) {
    return <PmBudgetFinancePage />
  }
  if (currentRoute === 'performance') {
    const role = (currentUser?.role || '').toLowerCase()
    const isCLevelOrCeo = ['ceo', 'cto', 'chro', 'cfo', 'cpo'].includes(role) || can('system:root')
    if (
      isCLevelOrCeo &&
      (can('system:root') ||
        canAny([
          'performance:read_all',
          'performance:evaluate',
          'performance:recognize',
          'performance:discipline',
          'grievances:read_confidential',
          'grievances:adjudicate_confidential',
        ]))
    ) {
      return <ChroPerformancePage />
    }
    return <AccessDeniedPage routeId="performance" />
  }
  if (currentRoute === 'reports') {
    if (currentRole === 'cto') {
      return <CtoReportsPage />
    }
    return <EngineeringReportsPage />
  }
  if (currentRoute === 'code-quality' && can('quality_gates:read')) {
    return <CtoCodeQualityPage />
  }
  if (
    currentRoute === 'security-testing' &&
    canAny([
      'security_alerts:read',
      'security_alerts:create',
      'security_alerts:update_status',
      'test_runs:read',
    ])
  ) {
    return <CtoSecurityTestingPage />
  }
  if (currentRoute === 'consultancy') {
    return <CtoConsultancyPage />
  }
  if (currentRoute === 'audit-log') {
    const role = (currentUser?.role || '').toLowerCase()
    const isCLevelOrCeo = ['ceo', 'cto', 'chro', 'cfo', 'cpo'].includes(role) || can('system:root')
    if (isCLevelOrCeo && canAny(['audit_logs:read', 'audit_logs:read_confidential', 'audit_logs:verify', 'system:root'])) {
      return <CtoAuditLogPage />
    }
    return <AccessDeniedPage routeId="audit-log" />
  }
  if (
    currentRoute === 'team-management' &&
    canAny(['teams:create', 'teams:update', 'teams:manage_members', 'teams:read_all'])
  ) {
    return can('teams:read_all') ? <CtoTeamManagementPage /> : <PmTeamManagementPage />
  }
  if (
    currentRoute === 'projects-repos' &&
    canAny([
      'projects:read_all',
      'projects:create',
      'projects:update',
      'projects:assign_team',
      'milestones:create',
      'milestones:update',
    ])
  ) {
    return <CtoProjectsReposPage />
  }
  if (currentRoute === 'projects' || currentRoute === 'projects-repos') {
    return <CtoProjectsReposPage />
  }
  if (currentRoute === 'submissions-leave') {
    return <SubmissionsLeavePage initialTab="leave" />
  }
  if (currentRoute === 'idea-submissions') {
    return <SubmissionsLeavePage initialTab="ideas" />
  }
  if (currentRoute === 'company-suggestions') {
    return <SubmissionsLeavePage initialTab="suggestions" />
  }
  if (currentRoute === 'team' && can('teams:read_own')) {
    return <DeveloperTeamPage />
  }
  // My Work routes available to every employee (alwaysVisible)
  if (currentRoute === 'tasks') {
    if (can('projects:read_all')) return <CtoTasksPage />
    if (isSquadPm || can('tasks:read_team')) return <PmTasksPage />
    return <DeveloperTasksPage />
  }
  if (currentRoute === 'earnings') {
    const role = (currentUser?.role || '').toLowerCase()
    const isExecutive =
      ['ceo', 'cfo', 'chro', 'cto', 'cpo'].includes(role) ||
      can('system:root') ||
      can('projects:read_all')
    if (isExecutive) return <CtoEarningsPage />
    if (isSquadPm || can('budgets:allocate_developer')) return <PmEarningsPage />
    return <DeveloperEarningsPage />
  }
  if (currentRoute === 'report') {
    if (currentRole === 'cto') return <CtoReportsPage />
    return can('reports:triage') ? <PmReportsPage /> : <DeveloperReportPage />
  }
  if (currentRoute === 'settings' || currentRoute === 'my-account') {
    return <MyAccountPage />
  }
  if (currentRoute === 'my-performance' || currentRoute === 'performance-ledger') {
    return <MyPerformancePage />
  }
  if (currentRoute === 'leaderboard') {
    return <LeaderboardPage />
  }
  if (currentRoute === 'login-access') {
    return <LoginAccessPage />
  }
  if (currentRoute === 'security-overview') {
    const role = (currentUser?.role || '').toLowerCase()
    const isChroOrCeo =
      role === 'ceo' ||
      role === 'chro' ||
      can('system:root') ||
      (can('mfa:manage') && !['cto', 'cfo', 'pm', 'developer'].includes(role))
    if (isChroOrCeo) {
      return <SecurityOverviewPage />
    }
    return <AccessDeniedPage routeId="security-overview" />
  }
  if (currentRoute === 'access-history') {
    const role = (currentUser?.role || '').toLowerCase()
    const isCLevelOrCeo = ['ceo', 'cto', 'chro', 'cfo', 'cpo'].includes(role) || can('system:root')
    if (isCLevelOrCeo && canAny(['audit_logs:read_confidential', 'system:root'])) {
      return <AccessHistoryPage />
    }
    return <AccessDeniedPage routeId="access-history" />
  }
  if (currentRoute === 'project-requests') {
    return <ProjectRequestsPage />
  }
  if (currentRoute === 'proposals') {
    return <ProposalsPage />
  }
  if (currentRoute === 'my-requests') {
    return <MyRequestsPage />
  }

  // Dashboard resolved via declarative widget registry (never role switches)
  if (currentRoute === 'dashboard') {
    return <DynamicDashboardPage />
  }

  return <AccessDeniedPage routeId={currentRoute} />
}

function AppRoot() {
  const { isAuthenticated, isAuthChecking, mustChangePassword, mustEnrollMfa, logout } = useApp()

  useEffect(() => {
    if (!isAuthChecking) {
      if (!isAuthenticated) {
        // Unauthenticated users visiting anything other than login/reset get hard-redirected to /login
        if (
          window.location.pathname !== '/login' &&
          !window.location.pathname.startsWith('/reset-password')
        ) {
          window.location.replace('/login' + window.location.search)
        }
      } else {
        // Authenticated users visiting the root URL (/) get redirected to their dashboard
        if (window.location.pathname === '/') {
          window.history.replaceState(null, '', '/dashboard')
        }
      }
    }
  }, [isAuthChecking, isAuthenticated])

  if (isAuthChecking) {
    return (
      <>
        <DesktopNoticeModal />
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-3 text-slate-300">
          <img src="/Logo.png" alt="Pointfex" className="w-11 h-11 object-contain animate-pulse" />
          <p className="text-xs font-medium tracking-wide text-slate-400">
            Verifying secure session...
          </p>
        </div>
      </>
    )
  }

  if (!isAuthenticated) {
    return (
      <>
        <DesktopNoticeModal />
        <LoginPage />
      </>
    )
  }

  if (mustChangePassword || mustEnrollMfa) {
    return (
      <>
        <DesktopNoticeModal />
        <FirstLoginSecurityPage />
      </>
    )
  }

  return (
    <>
      <DesktopNoticeModal />
      <IdleTimeoutModal isAuthenticated={isAuthenticated} onLogout={logout} />
      <Shell>
        <Suspense fallback={<PageRouteFallback />}>
          <MainContentRouter />
        </Suspense>
      </Shell>
    </>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <AppRoot />
      </AppProvider>
    </ErrorBoundary>
  )
}
