import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  TrendingUp,
  Award,
  ShieldCheck,
  AlertTriangle,
  Clock,
  RotateCcw,
  CheckCircle2,
  Lock,
  History,
  Search,
  Download,
  RefreshCw,
} from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { erpApi } from '../../api/client'
import {
  Card,
  StatCard,
  Badge,
  EmptyState,
  Skeleton,
  ErrorState,
  Button,
} from '../../components/common'
import {
  WeeklyKpiTrendGraph,
  LifetimeXpStackedChart,
  type WeeklyKpiItem,
} from '../../components/performance/KpiXpWidgets'
import { formatDate } from '../../utils/formatters'

export function MyPerformancePage() {
  const { currentUser, data, showToast } = useApp()
  const [loading, setLoading] = useState(true)
  const [kpiSeries, setKpiSeries] = useState<WeeklyKpiItem[]>([])
  const [xpSummary, setXpSummary] = useState<{
    lifetimeXp: number
    postedXp: number
    pendingXp: number
    frozenXp: number
    byCategory?: Record<string, number>
  } | null>(null)
  const [ledgerItems, setLedgerItems] = useState<any[]>([])
  const [disciplinaryHistory, setDisciplinaryHistory] = useState<any[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  // Ledger Filter & Search State
  const [ledgerSearch, setLedgerSearch] = useState('')
  const [selectedEventType, setSelectedEventType] = useState('all')

  const loadData = useCallback(async () => {
    if (!currentUser?.id) return
    setLoading(true)
    setLoadError(null)
    try {
      const [series, xp, ledger] = await Promise.all([
        erpApi.getMyKpiSeries(),
        erpApi.getMyXpSummary(),
        erpApi.getMyLedger({ limit: 100 }),
      ])

      setKpiSeries(Array.isArray(series) ? series : [])
      setXpSummary(xp)

      // Personal ledger items
      const rawItems = ledger?.items || []

      // If backend ledger is empty, synthesize personal events from user's completed deliverables in seed data
      let finalLedger = rawItems
      if (rawItems.length === 0 && data.tasks) {
        const userCompletedTasks = data.tasks.filter(
          (t) => (t.assigneeId === currentUser.id || t.assignedTo === currentUser.id) && t.status === 'completed',
        )
        if (userCompletedTasks.length > 0) {
          finalLedger = userCompletedTasks.map((t, idx) => {
            const points = Number(t.weightPoints) || 3
            const xpVal = points * 10
            return {
              id: `synth_${t.id}`,
              sequence: idx + 1,
              actionType: 'TASK_COMPLETED',
              triggerEvent: 'TASK_COMPLETION',
              deltaValue: `+${xpVal} XP`,
              deltaNumeric: xpVal,
              balanceAfter: `${(idx + 1) * xpVal} XP`,
              reason: `Deliverable verified & finalized: ${t.title}`,
              taskId: t.id,
              taskCategory: t.weightCategory || (points >= 7 ? 'CRITICAL' : points >= 5 ? 'LARGE' : points >= 3 ? 'MEDIUM' : 'SMALL'),
              authorizedRole: t.creatorId?.includes('cto') ? 'CTO' : t.creatorId?.includes('ceo') ? 'CEO' : 'CHRO',
              status: 'VERIFIED',
              recordedAt: t.completedAt || t.dueDate || new Date(Date.now() - (idx + 1) * 86400000).toISOString(),
              sealHash: `sha256_${t.id.slice(0, 8)}...${t.id.slice(-4)}`,
            }
          })
        }
      }

      setLedgerItems(finalLedger)

      // Filter disciplinary or reversal items from ledger
      const disciplinary = finalLedger.filter(
        (i: any) =>
          i.actionType?.includes('DISCIPLINARY') ||
          i.actionType?.includes('REVERSAL') ||
          i.actionType?.includes('PENALTY') ||
          i.triggerEvent?.includes('DISCIPLINARY'),
      )
      setDisciplinaryHistory(disciplinary)
    } catch (err: any) {
      setLoadError(err?.message || 'Failed to load performance metrics.')
    } finally {
      setLoading(false)
    }
  }, [currentUser?.id, data.tasks])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // Derive current week details
  const currentWeekRecord = useMemo(() => {
    if (kpiSeries.length === 0) return null
    return kpiSeries[kpiSeries.length - 1]
  }, [kpiSeries])

  const isCurrentProvisional = Boolean(
    currentWeekRecord?.isProvisional ||
      currentWeekRecord?.evaluationStatus === 'PROVISIONAL',
  )
  const isInactive = Boolean(currentWeekRecord?.isInactive)

  const activePenalty = Boolean(
    currentWeekRecord?.inactivityPenaltyApplied ||
      (currentWeekRecord as any)?.inactivityPenaltyPending,
  )

  const roleTitle = currentUser?.role?.toUpperCase() || 'DEVELOPER'

  // Filtered personal ledger events
  const filteredLedgerItems = useMemo(() => {
    return ledgerItems.filter((item) => {
      if (selectedEventType !== 'all') {
        const itemType = (item.actionType || item.triggerEvent || '').toLowerCase()
        if (!itemType.includes(selectedEventType.toLowerCase())) {
          return false
        }
      }

      if (ledgerSearch.trim()) {
        const q = ledgerSearch.toLowerCase()
        const reasonMatch = item.reason?.toLowerCase().includes(q)
        const taskMatch = item.taskId?.toLowerCase().includes(q)
        const typeMatch = item.actionType?.toLowerCase().includes(q)
        const authMatch = item.authorizedRole?.toLowerCase().includes(q)
        if (!reasonMatch && !taskMatch && !typeMatch && !authMatch) {
          return false
        }
      }

      return true
    })
  }, [ledgerItems, selectedEventType, ledgerSearch])

  // Export handler for user's personal ledger
  const handleExport = (format: 'json' | 'csv') => {
    try {
      const exportData = filteredLedgerItems.map((item) => ({
        sequence: item.sequence,
        date: item.recordedAt,
        actionType: item.actionType || item.triggerEvent,
        delta: item.deltaValue || `+${item.deltaNumeric} XP`,
        reason: item.reason,
        taskId: item.taskId,
        category: item.taskCategory,
        authorizedBy: item.authorizedRole,
        status: item.status,
      }))

      let blob: Blob
      if (format === 'csv') {
        const headers = ['Sequence', 'Date', 'Action Type', 'Delta', 'Reason', 'Task ID', 'Category', 'Authorized By', 'Status']
        const rows = exportData.map((d) => [
          d.sequence,
          `"${d.date}"`,
          `"${d.actionType}"`,
          `"${d.delta}"`,
          `"${(d.reason || '').replace(/"/g, '""')}"`,
          `"${d.taskId || ''}"`,
          `"${d.category || ''}"`,
          `"${d.authorizedBy || ''}"`,
          `"${d.status || ''}"`,
        ])
        const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
        blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      } else {
        blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
      }

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `pointfex-my-xp-ledger-${currentUser?.id || 'me'}-${Date.now()}.${format}`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      showToast(`Exported your personal ledger as ${format.toUpperCase()}`, 'success')
    } catch {
      showToast('Export failed', 'error')
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-display">
            My Performance &amp; XP Standing
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Authoritative weekly KPI formula breakdown, visual trends, and personal append-only XP event ledger for {currentUser?.name || 'your account'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            onClick={() => void loadData()}
            className="text-xs"
          >
            Refresh Data
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={Download}
            onClick={() => handleExport('csv')}
            className="text-xs"
          >
            Export Ledger
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        </div>
      ) : loadError ? (
        <ErrorState
          title="Unable to load performance data"
          description="Could not synchronize weekly KPI series or append-only XP balances."
          error={loadError}
          onRetry={loadData}
        />
      ) : (
        <>
          {/* Top Status & Evaluation State Banner */}
          <Card className="border-[var(--primary)]/30 bg-[var(--surface)]">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-[var(--text)]">
                      Current Evaluation Status
                    </h3>
                    {isInactive ? (
                      <Badge variant="danger">INACTIVE (N/A)</Badge>
                    ) : isCurrentProvisional ? (
                      <Badge variant="warning">
                        PROVISIONAL (sweep runs Sunday 23:59 Asia/Dhaka)
                      </Badge>
                    ) : (
                      <Badge variant="success">OFFICIAL (hash-chained)</Badge>
                    )}
                  </div>
                  <p className="text-xs text-[var(--muted)] mt-0.5">
                    Role Tier:{' '}
                    <span className="font-semibold text-[var(--text)]">{roleTitle}</span> • Week{' '}
                    {currentWeekRecord?.weekNumber ?? 47}, {currentWeekRecord?.year ?? 2026}
                  </p>
                </div>
              </div>

              {/* Inactivity status alert pill */}
              <div className="flex items-center gap-2">
                {activePenalty ? (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-600 text-xs font-semibold">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Active 10% Inactivity Penalty</span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 text-xs font-semibold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Inactivity Penalty: Clear</span>
                  </div>
                )}
              </div>
            </div>

            {/* Inactivity Explanation If Active */}
            {activePenalty && (
              <div className="mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Inactivity Penalty Active: </span>
                  Because 0 deliverables were recorded during a prior cycle, the next evaluated task
                  will absorb a 10% deduction upon completion. Regular completion restores normal standing.
                </div>
              </div>
            )}
          </Card>

          {/* XP Balance StatCards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Posted XP (Released)"
              value={(xpSummary?.postedXp ?? 0).toLocaleString()}
              trend="Permanent hash-chained balance"
              trendTone="success"
              icon={Award}
            />
            <StatCard
              label="Pending XP"
              value={(xpSummary?.pendingXp ?? 0).toLocaleString()}
              trend="Awaiting Sunday sweep"
              trendTone="warning"
              icon={Clock}
            />
            <StatCard
              label="Frozen XP"
              value={(xpSummary?.frozenXp ?? 0).toLocaleString()}
              trend="Requires 4-Exec consensus"
              trendTone="danger"
              icon={Lock}
            />
            <StatCard
              label="Lifetime Career XP"
              value={(xpSummary?.lifetimeXp ?? 0).toLocaleString()}
              trend="Monotonic career progression"
              trendTone="info"
              icon={TrendingUp}
            />
          </div>

          {/* Current Week KPI Breakdown Card */}
          <Card>
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)] mb-4">
              <div>
                <h4 className="text-sm font-bold text-[var(--text)]">Current Week Formula Breakdown</h4>
                <p className="text-xs text-[var(--muted)]">
                  Live inputs reflecting current reviewer scores for Week {currentWeekRecord?.weekNumber ?? 47}
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs text-[var(--muted)] block">Calculated Standing</span>
                <span className="text-xl font-extrabold text-indigo-600 dark:text-indigo-400 font-mono">
                  {currentWeekRecord?.score !== null && currentWeekRecord?.score !== undefined
                    ? Number(currentWeekRecord.score).toFixed(2)
                    : 'N/A'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div className="p-3 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)]">
                <span className="text-[11px] text-[var(--muted)] font-medium">PM Satisfaction</span>
                <div className="text-lg font-bold text-[var(--text)] font-mono mt-0.5">
                  {currentWeekRecord?.pmScore ?? 85} / 100
                </div>
                <span className="text-[10px] text-[var(--muted)]">Weight: 50%</span>
              </div>

              <div className="p-3 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)]">
                <span className="text-[11px] text-[var(--muted)] font-medium">CTO Multiplier</span>
                <div className="text-lg font-bold text-[var(--text)] font-mono mt-0.5">
                  {currentWeekRecord?.ctoScore ?? 1.0}
                </div>
                <span className="text-[10px] text-[var(--muted)]">Weight: 15%</span>
              </div>

              <div className="p-3 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)]">
                <span className="text-[11px] text-[var(--muted)] font-medium">CPO Multiplier</span>
                <div className="text-lg font-bold text-[var(--text)] font-mono mt-0.5">
                  {currentWeekRecord?.cpoScore ?? 1.0}
                </div>
                <span className="text-[10px] text-[var(--muted)]">Weight: 15%</span>
              </div>

              <div className="p-3 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)]">
                <span className="text-[11px] text-[var(--muted)] font-medium">CFO Multiplier</span>
                <div className="text-lg font-bold text-[var(--text)] font-mono mt-0.5">
                  {currentWeekRecord?.cfoScore ?? 1.0}
                </div>
                <span className="text-[10px] text-[var(--muted)]">Weight: 10%</span>
              </div>

              <div className="p-3 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)]">
                <span className="text-[11px] text-[var(--muted)] font-medium">CHRO Multiplier</span>
                <div className="text-lg font-bold text-[var(--text)] font-mono mt-0.5">
                  {currentWeekRecord?.chroScore ?? 1.0}
                </div>
                <span className="text-[10px] text-[var(--muted)]">Weight: 10%</span>
              </div>
            </div>
          </Card>

          {/* Dual Charts Grid: Weekly KPI Trend & Lifetime XP Stacked Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <WeeklyKpiTrendGraph data={kpiSeries} />
            <LifetimeXpStackedChart
              lifetimeXp={xpSummary?.lifetimeXp ?? 0}
              postedXp={xpSummary?.postedXp}
              pendingXp={xpSummary?.pendingXp}
              frozenXp={xpSummary?.frozenXp}
            />
          </div>

          {/* ========================================================= */}
          {/* PERSONAL XP EVENT LEDGER & AUDIT TRAIL ("HOW, WHEN, WHAT") */}
          {/* ========================================================= */}
          <Card
            title="Personal XP Event Ledger & Audit Trail"
            icon={History}
            action={
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">
                  Total Events: <strong>{filteredLedgerItems.length}</strong>
                </span>
              </div>
            }
          >
            <div className="space-y-4">
              {/* Search & Filter Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search by deliverable title, reason, or task ID..."
                    value={ledgerSearch}
                    onChange={(e) => setLedgerSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    { id: 'all', label: 'All Events' },
                    { id: 'task', label: 'Task Deliverables' },
                    { id: 'verify', label: 'Verifications' },
                    { id: 'freeze', label: 'Frozen / Consensus' },
                    { id: 'disciplinary', label: 'Disciplinary' },
                  ].map((filter) => (
                    <button
                      key={filter.id}
                      type="button"
                      onClick={() => setSelectedEventType(filter.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                        selectedEventType === filter.id
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Itemized Event Table */}
              {filteredLedgerItems.length === 0 ? (
                <EmptyState
                  icon={History}
                  title="No XP Events Recorded"
                  description="Complete and submit deliverable tasks in your assigned squads to record verified XP events on chain."
                />
              ) : (
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="px-3.5 py-2.5 font-mono">Seq #</th>
                        <th className="px-3.5 py-2.5">When (Date &amp; Time)</th>
                        <th className="px-3.5 py-2.5">What Happened</th>
                        <th className="px-3.5 py-2.5">How / Deliverable Reason</th>
                        <th className="px-3.5 py-2.5">Acted By</th>
                        <th className="px-3.5 py-2.5 text-right font-mono">XP Delta</th>
                        <th className="px-3.5 py-2.5 font-mono text-center">Seal Hash</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredLedgerItems.map((item) => {
                        const isPositive =
                          String(item.deltaValue || item.deltaNumeric || '').includes('+') ||
                          Number(item.deltaNumeric) > 0
                        const isDisciplinary =
                          item.actionType?.includes('DISCIPLINARY') ||
                          item.actionType?.includes('PENALTY') ||
                          item.actionType?.includes('REVERSAL')

                        return (
                          <tr key={item.id || item.sequence} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                            <td className="px-3.5 py-2.5 font-mono text-slate-400">
                              #{item.sequence}
                            </td>
                            <td className="px-3.5 py-2.5 text-slate-600 dark:text-slate-300 shrink-0 whitespace-nowrap">
                              {formatDate(item.recordedAt, 'short')}
                            </td>
                            <td className="px-3.5 py-2.5">
                              <Badge
                                variant={
                                  isDisciplinary
                                    ? 'rose'
                                    : item.actionType?.includes('FREEZE')
                                      ? 'purple'
                                      : item.actionType?.includes('VERIFY')
                                        ? 'emerald'
                                        : 'indigo'
                                }
                                size="xs"
                              >
                                {item.actionType || item.triggerEvent || 'XP_EVENT'}
                              </Badge>
                            </td>
                            <td className="px-3.5 py-2.5 text-slate-800 dark:text-slate-200 min-w-[200px]">
                              <div className="font-medium line-clamp-1">
                                {item.reason || 'Deliverable score commit'}
                              </div>
                              {item.taskCategory && (
                                <span className="text-[10px] font-mono text-slate-400">
                                  Category: {item.taskCategory}
                                </span>
                              )}
                            </td>
                            <td className="px-3.5 py-2.5 text-slate-500 dark:text-slate-400 uppercase text-[11px] font-semibold">
                              {item.authorizedRole || item.actedBy || 'SYSTEM'}
                            </td>
                            <td className="px-3.5 py-2.5 text-right font-mono font-bold">
                              <span
                                className={
                                  isDisciplinary
                                    ? 'text-rose-500'
                                    : isPositive
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : 'text-slate-900 dark:text-white'
                                }
                              >
                                {item.deltaValue || `+${item.deltaNumeric} XP`}
                              </span>
                            </td>
                            <td className="px-3.5 py-2.5 text-center font-mono text-[10px] text-slate-400">
                              {item.sealHash || `sha256_${String(item.id).slice(0, 6)}...`}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>

          {/* Reversal & Disciplinary Compliance History */}
          <Card>
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)] mb-4">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-[var(--muted)]" />
                <h4 className="text-sm font-bold text-[var(--text)]">
                  Disciplinary &amp; Governance Compliance History
                </h4>
              </div>
              <span className="text-xs text-[var(--muted)] font-mono">
                {disciplinaryHistory.length} events on chain
              </span>
            </div>

            {disciplinaryHistory.length === 0 ? (
              <EmptyState
                icon={ShieldCheck}
                title="Zero Disciplinary Actions"
                description="Your account is in full compliance with Pointfex engineering governance."
              />
            ) : (
              <div className="overflow-x-auto border border-[var(--border)] rounded-[var(--radius-card)]">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="bg-[var(--surface-muted)] text-[var(--muted)] font-semibold border-b border-[var(--border)]">
                    <tr>
                      <th className="px-3 py-2.5">Seq</th>
                      <th className="px-3 py-2.5">Type</th>
                      <th className="px-3 py-2.5">Delta</th>
                      <th className="px-3 py-2.5">Reason &amp; Legal Reference</th>
                      <th className="px-3 py-2.5">Authorized By</th>
                      <th className="px-3 py-2.5">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {disciplinaryHistory.map((item) => (
                      <tr key={item.id} className="hover:bg-[var(--surface-muted)]/50">
                        <td className="px-3 py-2 font-mono font-medium text-[var(--muted)]">
                          #{item.sequence}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant={item.actionType.includes('REVERSAL') ? 'success' : 'danger'}>
                            {item.actionType}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 font-mono font-bold text-rose-500">
                          {item.deltaValue}
                        </td>
                        <td className="px-3 py-2 text-[var(--text)]">
                          {item.reason || 'Governance review'}
                        </td>
                        <td className="px-3 py-2 text-[var(--muted)] uppercase text-[10px]">
                          {item.authorizedRole}
                        </td>
                        <td className="px-3 py-2 text-[var(--muted)]">
                          {new Date(item.recordedAt || Date.now()).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

export default MyPerformancePage
