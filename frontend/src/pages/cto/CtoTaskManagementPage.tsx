import { useState, useMemo, useEffect } from 'react'
import { Badge } from '../../components/common/Badge'
import { Button } from '../../components/common/Button'
import { Modal } from '../../components/common/Modal'
import { Avatar } from '../../components/common/Avatar'
import { useCtoData } from '../../hooks/useCtoData'
import { useApp } from '../../context/AppContext'
import { formatDate } from '../../utils/formatters'
import type { TaskPriority, TaskStatus, EnrichedTask, User } from '../../types'
import { Plus, Search, CheckCircle2, XCircle, Clock, Users, Send } from 'lucide-react'

interface ColumnDef {
  id: TaskStatus
  label: string
  dot: string
  isReview?: boolean
}

export function CtoTaskManagementPage() {
  const { ctoEngineeringTasks, projects, projectManagers, developers } = useCtoData()
  const {
    data,
    createCtoEngineeringTask,
    reviewCtoTaskSubmission,
    updateTaskStatus,
    setSelectedTaskModal,
    showToast,
  } = useApp()

  const allActiveAssignees = useMemo(() => {
    const cLevelUsers = (data?.users || []).filter((u) =>
      ['ceo', 'cto', 'cfo', 'chro', 'cpo'].includes((u.role || '').toLowerCase()),
    )
    const list = [
      ...cLevelUsers,
      ...projectManagers,
      ...ctoEngineeringTasks.map((t) => t.assignee).filter((u): u is User => u != null),
    ]
    return Array.from(new Map(list.map((u) => [u.id, u])).values())
  }, [data?.users, projectManagers, ctoEngineeringTasks])

  // Filters (Assignee filter on left + Search on right)
  const [selectedPmId, setSelectedPmId] = useState<string>('all')
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false)
  const [reviewingTask, setReviewingTask] = useState<EnrichedTask | null>(null)
  const [feedbackNotes, setFeedbackNotes] = useState<string>('')

  // Drag and drop state
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [dragOverColId, setDragOverColId] = useState<string | null>(null)

  // New Directive form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState(projects[0]?.id || '')
  const [assigneeId, setAssigneeId] = useState(
    developers[0]?.id || projectManagers[0]?.id || '',
  )
  const [priority, setPriority] = useState<TaskPriority>('high')
  const [deadline, setDeadline] = useState('')
  const [tagsInput, setTagsInput] = useState('Architecture, Security')
  const [weightCategory, setWeightCategory] = useState<
    'SMALL' | 'MEDIUM' | 'LARGE' | 'CRITICAL' | 'CUSTOM'
  >('MEDIUM')
  const [customWeightPoints, setCustomWeightPoints] = useState<number>(2)
  const [completedImmediately, setCompletedImmediately] = useState<boolean>(false)
  const [assignedScore, setAssignedScore] = useState<number>(95)

  useEffect(() => {
    if (!assigneeId && (developers.length > 0 || projectManagers.length > 0)) {
      setAssigneeId(developers[0]?.id || projectManagers[0]?.id || '')
    }
  }, [developers, projectManagers, assigneeId])

  useEffect(() => {
    if (!projectId && projects.length > 0) {
      setProjectId(projects[0].id)
    }
  }, [projects, projectId])

  const columns: ColumnDef[] = [
    { id: 'todo', label: 'To Do', dot: 'bg-slate-400 dark:bg-slate-500' },
    { id: 'in_progress', label: 'In Progress', dot: 'bg-sky-500' },
    { id: 'in_review', label: 'In Review', dot: 'bg-purple-500', isReview: true },
    { id: 'completed', label: 'Completed', dot: 'bg-emerald-500' },
    { id: 'blocked', label: 'Blocked', dot: 'bg-rose-500' },
  ]

  // Filter tasks based on PM selection + Project selection + search
  const filteredTasks = useMemo(() => {
    return ctoEngineeringTasks.filter((task) => {
      if (selectedPmId !== 'all' && task.assigneeId !== selectedPmId) return false
      if (selectedProjectId !== 'all' && task.projectId !== selectedProjectId) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const titleMatch = task.title.toLowerCase().includes(q)
        const descMatch = task.description?.toLowerCase().includes(q)
        const tagMatch = task.tags?.some((t) => t.toLowerCase().includes(q))
        if (!titleMatch && !descMatch && !tagMatch) return false
      }
      return true
    })
  }, [ctoEngineeringTasks, selectedPmId, selectedProjectId, searchQuery])

  // Overall stats
  const totalCount = ctoEngineeringTasks.length
  const completedCount = ctoEngineeringTasks.filter((t) => t.status === 'completed').length
  const inReviewCount = ctoEngineeringTasks.filter((t) => t.status === 'in_review').length
  const activeCount = totalCount - completedCount
  const overallProgress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, taskId: string) => {
    setDraggedTaskId(taskId)
    e.dataTransfer.setData('text/plain', taskId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragEnd = () => {
    setDraggedTaskId(null)
    setDragOverColId(null)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, colId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverColId !== colId) {
      setDragOverColId(colId)
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetColId: TaskStatus) => {
    e.preventDefault()
    setDragOverColId(null)
    const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId
    if (!taskId) return

    const task = ctoEngineeringTasks.find((t) => t.id === taskId)
    if (!task || task.status === targetColId) return

    const statusLabels: Record<string, string> = {
      todo: 'To Do',
      in_progress: 'In Progress',
      in_review: 'In Review',
      completed: 'Completed',
      blocked: 'Blocked',
    }
    updateTaskStatus(taskId, targetColId)
    showToast(`Task status updated to ${statusLabels[targetColId] || targetColId}`, 'success')
    setDraggedTaskId(null)
  }

  // Handle create directive
  const handleCreateDirective = (e: React.FormEvent) => {
    e.preventDefault()
    const targetAssigneeId = assigneeId || developers[0]?.id || projectManagers[0]?.id || ''
    if (!title.trim() || !projectId || !targetAssigneeId) {
      showToast('Please fill in all required fields.', 'error')
      return
    }

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)

    const weightPts =
      ({ SMALL: 1, MEDIUM: 3, LARGE: 5, CRITICAL: 7 } as const)[weightCategory as 'SMALL' | 'MEDIUM' | 'LARGE' | 'CRITICAL'] ?? customWeightPoints

    createCtoEngineeringTask({
      projectId,
      assigneeId: targetAssigneeId,
      title: title.trim(),
      description: description.trim(),
      priority,
      dueDate: deadline || new Date(Date.now() + 14 * 86400000).toISOString(),
      tags,
      weightCategory,
      weightPoints: weightPts,
      initialStatus: completedImmediately ? 'completed' : 'todo',
      initialScore: completedImmediately ? assignedScore : undefined,
    })

    showToast(
      completedImmediately
        ? `Directive assigned & completed directly with score ${assignedScore}/100.`
        : 'C-Level directive assigned successfully.',
      'success',
    )
    setTitle('')
    setDescription('')
    setCompletedImmediately(false)
    setIsCreateModalOpen(false)
  }

  // Handle deliverable review (Approve / Reject)
  const handleReviewAction = (approved: boolean) => {
    if (!reviewingTask) return
    reviewCtoTaskSubmission(reviewingTask.id, approved, feedbackNotes.trim() || undefined)
    setReviewingTask(null)
    setFeedbackNotes('')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white font-display">
            Directives &amp; Tasks (C-Level)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            C-Level executive directive board — assign tasks to anyone in the organization.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {inReviewCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200/80 dark:border-purple-800/60">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
              {inReviewCount} Deliverable{inReviewCount > 1 ? 's' : ''} Awaiting Review
            </span>
          )}
          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={() => setIsCreateModalOpen(true)}
          >
            Assign Directive (C-Level)
          </Button>
        </div>
      </div>

      {/* Main Layout: Left PM Filter Column + Right Kanban Board */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (3 cols): PM Cards */}
        <div className="lg:col-span-4 xl:col-span-3 space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Assignees &amp; Staff
            </span>
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
              {allActiveAssignees.length} Staff
            </span>
          </div>

          {/* "All Assignees" Card */}
          <div
            onClick={() => setSelectedPmId('all')}
            className={`p-3.5 rounded-2xl cursor-pointer transition-all duration-150 border ${
              selectedPmId === 'all'
                ? 'bg-lime-50/70 dark:bg-lime-950/20 border-lime-300 dark:border-lime-700/60 shadow-xs'
                : 'bg-white dark:bg-slate-800/70 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-xl flex items-center justify-center ${
                    selectedPmId === 'all'
                      ? 'bg-lime-500 text-slate-950'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                    All Directives &amp; Tasks
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    {activeCount} Active • {completedCount} Completed
                  </span>
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Completion</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {overallProgress}%
                </span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-lime-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
            </div>
          </div>

          {/* Individual Assignee Cards */}
          {allActiveAssignees.map((emp) => {
            const isSelected = selectedPmId === emp.id
            const empTasks = ctoEngineeringTasks.filter((t) => t.assigneeId === emp.id)
            const empCompleted = empTasks.filter((t) => t.status === 'completed').length
            const empProgress =
              empTasks.length > 0 ? Math.round((empCompleted / empTasks.length) * 100) : 0

            return (
              <div
                key={emp.id}
                onClick={() => setSelectedPmId(emp.id)}
                className={`p-3 rounded-2xl cursor-pointer transition-all duration-150 border ${
                  isSelected
                    ? 'bg-lime-50/70 dark:bg-lime-950/20 border-lime-300 dark:border-lime-700/60 shadow-xs'
                    : 'bg-white dark:bg-slate-800/70 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Avatar
                      src={emp.avatarUrl || emp.avatar}
                      name={emp.name}
                      initials={emp.initials}
                      size="sm"
                      className="border border-slate-200 dark:border-slate-700"
                    />
                    <div>
                      <h4 className="font-semibold text-xs text-slate-900 dark:text-slate-100">
                        {emp.name}
                      </h4>
                      <span className="text-[10px] text-slate-400 block truncate max-w-[130px]">
                        {emp.title || emp.role}
                      </span>
                    </div>
                  </div>
                  <Badge variant={empProgress === 100 ? 'success' : 'slate'} size="xs">
                    {empCompleted}/{empTasks.length}
                  </Badge>
                </div>
              </div>
            )
          })}
        </div>

        {/* Right Column (9 cols): Search bar + Kanban Columns */}
        <div className="lg:col-span-8 xl:col-span-9 space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900/60 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search directives by title, description, or tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-lime-500"
              />
            </div>

            {/* Project Filter Dropdown */}
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-lime-500"
            >
              <option value="all">All Projects ({projects.length})</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Kanban Board */}
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-4 items-start min-w-[1150px]">
              {columns.map((col) => {
                const colTasks = filteredTasks.filter((t) => t.status === col.id)
                const isOver = dragOverColId === col.id

                return (
                  <div
                    key={col.id}
                    onDragOver={(e) => handleDragOver(e, col.id)}
                    onDrop={(e) => handleDrop(e, col.id)}
                    className={`flex-1 min-w-[220px] rounded-2xl p-3.5 border transition-colors min-h-[500px] flex flex-col ${
                      isOver
                        ? 'border-lime-500 bg-lime-50/20 dark:bg-lime-950/20'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40'
                    }`}
                  >
                    {/* Column Header */}
                    <div className="flex items-center justify-between mb-3 px-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                        <span className="font-semibold text-xs text-slate-900 dark:text-slate-100">
                          {col.label}
                        </span>
                      </div>
                      <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700">
                        {colTasks.length}
                      </span>
                    </div>

                    {/* Tasks List */}
                    <div className="space-y-2.5 flex-1">
                      {colTasks.length === 0 ? (
                        <div className="h-32 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-center p-3 text-center">
                          <span className="text-[11px] text-slate-400">No directives</span>
                        </div>
                      ) : (
                        colTasks.map((task) => (
                          <div
                            key={task.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, task.id)}
                            onDragEnd={handleDragEnd}
                            onClick={() => setSelectedTaskModal(task)}
                            className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700/70 hover:border-lime-400 dark:hover:border-lime-500 hover:shadow-xs transition-all duration-150 cursor-grab active:cursor-grabbing group space-y-2"
                          >
                            {/* Top Row: Project code & Priority */}
                            <div className="flex items-center justify-between gap-1">
                              <Badge variant="indigo" size="xs">
                                {task.project?.code || 'TECH'}
                              </Badge>
                              {task.priority && (
                                <span
                                  className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                    task.priority === 'urgent'
                                      ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                                      : task.priority === 'high'
                                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                                        : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                                  }`}
                                >
                                  {task.priority}
                                </span>
                              )}
                            </div>

                            {/* Task Title */}
                            <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100 group-hover:text-lime-600 dark:group-hover:text-lime-400 transition-colors line-clamp-2">
                              {task.title}
                            </h4>

                            {/* Description snippet */}
                            {task.description && (
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">
                                {task.description}
                              </p>
                            )}

                            {/* Assignee PM pill */}
                            {task.assignee && (
                              <div className="flex items-center gap-1.5 pt-1">
                                <Avatar
                                  src={task.assignee.avatarUrl || task.assignee.avatar}
                                  name={task.assignee.name}
                                  initials={task.assignee.initials}
                                  className="w-4 h-4 text-[9px]"
                                />
                                <span className="text-[11px] text-slate-600 dark:text-slate-300 font-medium truncate">
                                  {task.assignee.name}
                                </span>
                              </div>
                            )}

                            {/* In-Review Actions: Approve / Request Changes */}
                            {col.isReview && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="pt-2 border-t border-purple-100 dark:border-purple-900/40 flex items-center gap-1.5"
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    reviewCtoTaskSubmission(task.id, true)
                                    showToast(
                                      'Directive deliverable approved & verified.',
                                      'success',
                                    )
                                  }}
                                  className="flex-1 py-1.5 px-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors whitespace-nowrap cursor-pointer shadow-2xs"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                  <span>Approve</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReviewingTask(task)
                                    setFeedbackNotes('')
                                  }}
                                  className="flex-1 py-1.5 px-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 border border-rose-200/60 dark:border-rose-900/40 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors whitespace-nowrap cursor-pointer shadow-2xs"
                                >
                                  <XCircle className="w-3.5 h-3.5 shrink-0" />
                                  <span>Changes</span>
                                </button>
                              </div>
                            )}

                            {/* Footer */}
                            <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-[10px] text-slate-400">
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3 text-slate-400" />
                                <span>{formatDate(task.dueDate, 'short')}</span>
                              </div>
                              <span className="font-mono">{task.project?.code}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Modal: Create Technical Directive / C-Level Task */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Assign Directive / Task (C-Level)"
      >
        <form onSubmit={handleCreateDirective} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Directive / Task Title *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Implement Distributed Redis Cache Layer & Tenant Nonce Guard"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-lime-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Target Project *
              </label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-lime-500 cursor-pointer"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Assignee (Anyone in Org) *
              </label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-lime-500 cursor-pointer"
              >
                <optgroup label="Developers">
                  {developers.map((dev) => (
                    <option key={dev.id} value={dev.id}>
                      {dev.name} ({dev.title || 'Developer'})
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Project Managers &amp; Team Leads">
                  {(projectManagers.length > 0
                    ? projectManagers
                    : data.users.filter((u) => u.role === 'pm')
                  ).map((pm) => (
                    <option key={pm.id} value={pm.id}>
                      {pm.name} ({pm.title || 'Project Manager'})
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Other Staff &amp; Executives">
                  {data.users
                    .filter(
                      (u) =>
                        !developers.some((d) => d.id === u.id) &&
                        !projectManagers.some((p) => p.id === u.id),
                    )
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} — {u.title || u.role?.toUpperCase()}
                      </option>
                    ))}
                </optgroup>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Weight Category
              </label>
              <select
                value={weightCategory}
                onChange={(e) => setWeightCategory(e.target.value as any)}
                className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-lime-500 cursor-pointer"
              >
                <option value="SMALL">SMALL (1 pt / 10 XP)</option>
                <option value="MEDIUM">MEDIUM (3 pts / 30 XP)</option>
                <option value="LARGE">LARGE (5 pts / 50 XP)</option>
                <option value="CRITICAL">CRITICAL (7 pts / 70 XP)</option>
                <option value="CUSTOM">CUSTOM (10x approved weight)</option>
              </select>
            </div>

            {weightCategory === 'CUSTOM' ? (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Custom Weight Points
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={customWeightPoints}
                  onChange={(e) => setCustomWeightPoints(Number(e.target.value))}
                  className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-lime-500"
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                  className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-lime-500 cursor-pointer"
                >
                  <option value="urgent">Urgent (Immediate sprint focus)</option>
                  <option value="high">High (Sprint milestone)</option>
                  <option value="medium">Medium (Standard directive)</option>
                  <option value="low">Low (Backlog refinement)</option>
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Target Deadline
            </label>
            <input
              type="date"
              min={new Date().toISOString().split('T')[0]}
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-lime-500 cursor-pointer"
            />
          </div>

          {/* Immediate completion & score by C-Level */}
          <div className="p-3 rounded-xl bg-lime-50/70 dark:bg-lime-950/30 border border-lime-200 dark:border-lime-900/40 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-slate-800 dark:text-slate-200">
              <input
                type="checkbox"
                checked={completedImmediately}
                onChange={(e) => setCompletedImmediately(e.target.checked)}
                className="rounded text-lime-600 accent-lime-600 cursor-pointer"
              />
              <span>Mark as Completed Immediately &amp; Assign C-Level Score</span>
            </label>

            {completedImmediately && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    Assigned Score (0-100)
                  </span>
                  <span className="font-mono text-sm font-bold text-lime-600 dark:text-lime-400">
                    {assignedScore} / 100
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={assignedScore}
                  onChange={(e) => setAssignedScore(Number(e.target.value))}
                  className="w-full accent-lime-600 cursor-pointer"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Technical Specification / Acceptance Criteria
            </label>
            <textarea
              rows={3}
              placeholder="Outline architecture requirements, quality gates, test coverage thresholds, and security deliverables..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full text-xs p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-lime-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Tags (comma separated)
            </label>
            <input
              type="text"
              placeholder="Architecture, Security, Docker, Redis"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-lime-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Button variant="ghost" size="sm" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" icon={Send}>
              Assign Directive (C-Level)
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Request Changes Feedback */}
      <Modal
        isOpen={!!reviewingTask}
        onClose={() => setReviewingTask(null)}
        title="Request Changes on PM Deliverable"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Provide technical feedback or specify unresolved security/architecture requirements for{' '}
            <strong className="text-slate-800 dark:text-slate-200">{reviewingTask?.title}</strong>.
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Feedback & Required Changes *
            </label>
            <textarea
              rows={4}
              required
              placeholder="e.g. Unit test coverage is below 90% threshold. Please add regression tests for tenant isolation."
              value={feedbackNotes}
              onChange={(e) => setFeedbackNotes(e.target.value)}
              className="w-full text-xs p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-rose-500 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Button variant="ghost" size="sm" onClick={() => setReviewingTask(null)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={() => handleReviewAction(false)}>
              Send Feedback
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
