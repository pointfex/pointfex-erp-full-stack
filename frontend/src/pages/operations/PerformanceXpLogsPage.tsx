import { useState, useMemo } from 'react'
import {
  Award,
  TrendingUp,
  Search,
  Filter,
  CheckCircle2,
  Zap,
} from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { Badge } from '../../components/common/Badge'

export function PerformanceXpLogsPage() {
  const { data, currentUser } = useApp()

  const [selectedUserId, setSelectedUserId] = useState<string>(currentUser?.id || '')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterProject, setFilterProject] = useState('all')

  const inspectedEmployee = useMemo(() => {
    return data.users.find((u) => u.id === selectedUserId) || currentUser || data.users[0]
  }, [data.users, selectedUserId, currentUser])

  // Get all completed/scored tasks for this employee
  const employeeTasks = useMemo(() => {
    if (!inspectedEmployee) return []
    return data.tasks.filter((t) => t.assigneeId === inspectedEmployee.id)
  }, [data.tasks, inspectedEmployee])

  const completedTasks = useMemo(() => {
    return employeeTasks.filter((t) => t.status === 'completed')
  }, [employeeTasks])

  // Resolve employee metrics
  const lifetimeXp = inspectedEmployee?.lifetimeXp || completedTasks.length * 50 || 0
  const averageKpi = useMemo(() => {
    const scored = completedTasks.filter((t) => t.pmScore !== undefined)
    if (scored.length === 0) return 92
    const sum = scored.reduce((acc, t) => acc + (t.pmScore || 0), 0)
    return Math.round(sum / scored.length)
  }, [completedTasks])

  // Rank calculation based on lifetime XP
  const rank = useMemo(() => {
    const sorted = [...data.users].sort((a, b) => (b.lifetimeXp || 0) - (a.lifetimeXp || 0))
    const index = sorted.findIndex((u) => u.id === inspectedEmployee?.id)
    return index >= 0 ? index + 1 : 1
  }, [data.users, inspectedEmployee])

  // Itemized XP / KPI audit log entries
  const auditEntries = useMemo(() => {
    return completedTasks
      .map((t) => {
        const project = data.projects.find((p) => p.id === t.projectId)
        const xpEarned = (t.weightPoints || 3) * 10
        const date = t.createdAt || '2026-11-20'

        return {
          id: t.id,
          date,
          projectCode: project?.code || 'GEN',
          projectName: project?.name || 'Cross-Squad Initiative',
          taskTitle: t.title,
          isMainProjectTask: t.isMainProjectTask !== false,
          projectPercentage: t.projectPercentage || 0,
          xpEarned,
          kpiScore: t.pmScore !== undefined ? t.pmScore : 90,
          weightPoints: t.weightPoints || 3,
          status: 'COMPLETED & VERIFIED',
          approvedBy: t.creatorId ? data.users.find((u) => u.id === t.creatorId)?.name || 'Project Manager' : 'Executive Lead',
          ceoFinalized: t.ceoFinalized || false,
        }
      })
      .filter((entry) => {
        if (filterProject !== 'all' && entry.projectCode !== filterProject) return false
        if (!searchQuery.trim()) return true
        const q = searchQuery.toLowerCase()
        return (
          entry.taskTitle.toLowerCase().includes(q) ||
          entry.projectName.toLowerCase().includes(q) ||
          entry.projectCode.toLowerCase().includes(q)
        )
      })
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [completedTasks, data.projects, data.users, filterProject, searchQuery])

  const uniqueProjects = useMemo(() => {
    const projects = data.projects
    return projects.map((p) => ({ code: p.code, name: p.name }))
  }, [data.projects])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white font-display">
            Performance & XP Logs
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Itemized XP audit trail, task-level KPI scoring records, and performance rankings across projects
          </p>
        </div>

        {/* User Switcher Dropdown (Open for all to audit any employee's XP & KPI logs) */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium whitespace-nowrap">
            Audit Employee:
          </span>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 font-medium focus:outline-none focus:border-indigo-500 shadow-2xs cursor-pointer"
          >
            {data.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.title || u.role})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Standing Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-2xs flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono">
              {lifetimeXp.toLocaleString()} <span className="text-xs font-normal text-slate-400">XP</span>
            </div>
            <div className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">
              Lifetime Earned XP
            </div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-2xs flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono">
              #{rank} <span className="text-xs font-normal text-slate-400">of {data.users.length}</span>
            </div>
            <div className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">
              Organization Rank
            </div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-2xs flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono">
              {averageKpi}/100
            </div>
            <div className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">
              Average Task KPI
            </div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-2xs flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono">
              {completedTasks.length}
            </div>
            <div className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">
              Scored Deliverables
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900/60 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search logs by task title or project..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All Projects</option>
            {uniqueProjects.map((p) => (
              <option key={p.code} value={p.code}>
                {p.code} — {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Itemized Audit Log Table */}
      <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Project</th>
                <th className="py-3 px-4">Task Title & Scope</th>
                <th className="py-3 px-4 text-center">XP Awarded</th>
                <th className="py-3 px-4 text-center">KPI Score</th>
                <th className="py-3 px-4">Status & Approval</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {auditEntries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 italic">
                    No performance and XP records found for this criteria.
                  </td>
                </tr>
              ) : (
                auditEntries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {entry.date}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {entry.projectCode}
                      </span>
                      <div className="text-[10px] text-slate-400 truncate max-w-[140px]">
                        {entry.projectName}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-900 dark:text-white">
                        {entry.taskTitle}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {entry.isMainProjectTask ? (
                          <span className="inline-flex items-center text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                            Linked ({entry.projectPercentage}% project share)
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-[10px] text-slate-400 italic">
                            Standalone task (0% project impact)
                          </span>
                        )}
                        <span className="text-[10px] text-slate-300">•</span>
                        <span className="text-[10px] text-slate-400">
                          Weight: {entry.weightPoints} pts
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      +{entry.xpEarned} XP
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="px-2 py-0.5 rounded-md font-mono font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">
                        {entry.kpiScore}/100
                      </span>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {entry.status}
                        </span>
                        {entry.ceoFinalized && (
                          <Badge variant="ceo" size="xs">
                            CEO FINALIZED
                          </Badge>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Approved by {entry.approvedBy}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
