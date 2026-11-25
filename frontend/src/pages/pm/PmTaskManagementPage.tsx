import React, { useState, useMemo, useEffect } from 'react'
import { Badge } from '../../components/common/Badge'
import { Button } from '../../components/common/Button'
import { Modal } from '../../components/common/Modal'
import { usePmData } from '../../hooks/usePmData'
import { useApp } from '../../context/AppContext'
import { formatDate } from '../../utils/formatters'
import type { Task, TaskPriority, TaskStatus } from '../../types'
import { erpApi } from '../../api/client'
import {
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  FolderGit2,
  Layers,
  Clock,
  AlertTriangle,
  Scale,
  RotateCcw,
  Award,
} from 'lucide-react'

interface ColumnDef {
  id: TaskStatus
  label: string
  dot: string
  isReview?: boolean
  isApproval?: boolean
}

// Deadline: Nov 19, 2026 23:59:59 Asia/Dhaka = 2026-11-19T17:59:59.999Z
const BACKFILL_DEADLINE_MS = new Date('2026-11-19T17:59:59.999Z').getTime()

export function PmTaskManagementPage() {
  const { teamTasks, teamProjects, teamMembers, team } = usePmData()
  const {
    createTask,
    approveTask,
    rejectTask,
    scoreCompletedTask,
    updateTaskStatus,
    setSelectedTaskModal,
    setSelectedProfileUser,
    currentUser,
    showToast,
  } = useApp()

  // Filters (Left Column Project Selection + Right Column Dev & Search Filter)
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all')
  const [selectedDevId, setSelectedDevId] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false)
  const [rejectingTask, setRejectingTask] = useState<Task | null>(null)
  const [rejectFeedback, setRejectFeedback] = useState<string>('')

  // Cancellation Modal state (Mandatory prompt)
  const [cancellingTask, setCancellingTask] = useState<Task | null>(null)
  const [cancellationReason, setCancellationReason] = useState<string>('')

  // Satisfaction Review Modal state
  const [completingTask, setCompletingTask] = useState<Task | null>(null)
  const [pmScore, setPmScore] = useState<number>(85)
  const [pmScoreFeedback, setPmScoreFeedback] = useState<string>('')

  // Returned Task Revision Modal state
  const [revisingTask, setRevisingTask] = useState<Task | null>(null)
  const [revisedWeight, setRevisedWeight] = useState<number>(3)
  const [revisionNotes, setRevisionNotes] = useState<string>('')

  // Drag and drop state
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [dragOverColId, setDragOverColId] = useState<string | null>(null)

  // New task form state
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDesc, setNewTaskDesc] = useState('')
  const [newTaskProject, setNewTaskProject] = useState(teamProjects[0]?.id || '')
  const [newTaskDev, setNewTaskDev] = useState(teamMembers[0]?.id || '')
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>('medium')
  const [newTaskDueDate, setNewTaskDueDate] = useState('')
  const newTaskHours = '8'
  const [newTaskTags, setNewTaskTags] = useState('')

  // CHRO Weight & Backfill State
  const [newTaskWeightCategory, setNewTaskWeightCategory] = useState<
    'SMALL' | 'MEDIUM' | 'LARGE' | 'CRITICAL' | 'CUSTOM'
  >('MEDIUM')
  const [newTaskCustomPoints, setNewTaskCustomPoints] = useState<number>(6)
  const [newTaskContext, setNewTaskContext] = useState<
    'MAIN_SQUAD' | 'OUTSIDE_SQUAD' | 'ISOLATED_EXECUTIVE'
  >('MAIN_SQUAD')
  const [newTaskIsBackfill, setNewTaskIsBackfill] = useState(false)
  const [newTaskEffectiveDate, setNewTaskEffectiveDate] = useState('')

  // Live countdown to Backfill Window closing (Nov 19, 2026 23:59:59 Asia/Dhaka)
  const [nowMs, setNowMs] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 10000)
    return () => clearInterval(timer)
  }, [])

  // ponytail: Auto-populate default selection once async team data resolves
  useEffect(() => {
    if (!newTaskDev && teamMembers.length > 0) {
      setNewTaskDev(teamMembers[0].id)
    }
  }, [teamMembers, newTaskDev])

  useEffect(() => {
    if (!newTaskProject && teamProjects.length > 0) {
      setNewTaskProject(teamProjects[0].id)
    }
  }, [teamProjects, newTaskProject])

  const backfillMsRemaining = BACKFILL_DEADLINE_MS - nowMs
  const isBackfillWindowOpen = backfillMsRemaining > 0

  const backfillCountdownText = useMemo(() => {
    if (!isBackfillWindowOpen) {
      return 'CLOSED on Nov 19, 2026 23:59 Asia/Dhaka'
    }
    const totalSecs = Math.floor(backfillMsRemaining / 1000)
    const days = Math.floor(totalSecs / 86400)
    const hours = Math.floor((totalSecs % 86400) / 3600)
    const mins = Math.floor((totalSecs % 3600) / 60)
    return `${days}d ${hours}h ${mins}m remaining (closes Nov 19 23:59 Asia/Dhaka)`
  }, [backfillMsRemaining, isBackfillWindowOpen])

  const columns: ColumnDef[] = [
    { id: 'todo', label: 'To Do', dot: 'bg-slate-400 dark:bg-slate-500' },
    { id: 'in_progress', label: 'In Progress', dot: 'bg-sky-500' },
    { id: 'in_review', label: 'In Review', dot: 'bg-purple-500', isReview: true },
    { id: 'completed', label: 'Completed', dot: 'bg-emerald-500', isApproval: true },
    { id: 'cancelled', label: 'Cancelled', dot: 'bg-slate-500' },
    { id: 'blocked', label: 'Blocked', dot: 'bg-rose-500' },
  ]

  // Filter tasks based on left-side project selection + right-side dev & search
  const filteredTasks = useMemo(() => {
    return teamTasks.filter((task) => {
      if (selectedProjectId !== 'all' && task.projectId !== selectedProjectId) return false
      if (selectedDevId !== 'all' && task.assigneeId !== selectedDevId) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const titleMatch = task.title.toLowerCase().includes(q)
        const descMatch = task.description?.toLowerCase().includes(q)
        const tagMatch = task.tags?.some((t) => t.toLowerCase().includes(q))
        if (!titleMatch && !descMatch && !tagMatch) return false
      }
      return true
    })
  }, [teamTasks, selectedProjectId, selectedDevId, searchQuery])

  // Drag handlers
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, taskId: string) => {
    setDraggedTaskId(taskId)
    e.dataTransfer.setData('text/plain', taskId)
    e.dataTransfer.effectAllowed = 'move'
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

    const task = teamTasks.find((t) => t.id === taskId)
    if (!task || task.status === targetColId) return

    if (targetColId === 'cancelled') {
      setCancellingTask(task)
      setCancellationReason('')
    } else if (targetColId === 'completed') {
      setCompletingTask(task)
      setPmScore(85)
      setPmScoreFeedback('')
    } else {
      updateTaskStatus(taskId, targetColId)
    }
    setDraggedTaskId(null)
  }

  const handleConfirmCancel = (e: React.FormEvent) => {
    e.preventDefault()
    if (!cancellingTask) return
    if (!cancellationReason.trim()) {
      showToast('Mandatory cancellation reason required', 'error')
      return
    }
    updateTaskStatus(cancellingTask.id, 'cancelled', {
      cancellationReason: cancellationReason.trim(),
    })
    showToast(`Task "${cancellingTask.title}" cancelled`, 'success')
    setCancellingTask(null)
    setCancellationReason('')
  }

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const targetProject = newTaskProject || teamProjects[0]?.id || ''
    const targetDev = newTaskDev || teamMembers[0]?.id || ''

    if (!newTaskTitle.trim()) {
      showToast('Task title is required', 'error')
      return
    }
    if (!targetProject) {
      showToast('Project selection is required', 'error')
      return
    }
    if (!targetDev) {
      showToast('Assignee developer is required', 'error')
      return
    }

    const tagList = newTaskTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)

    const points =
      newTaskWeightCategory === 'SMALL'
        ? 1
        : newTaskWeightCategory === 'MEDIUM'
          ? 3
          : newTaskWeightCategory === 'LARGE'
            ? 5
            : newTaskWeightCategory === 'CRITICAL'
              ? 7
              : Number(newTaskCustomPoints) || 3

    try {
      await createTask({
        title: newTaskTitle.trim(),
        description: newTaskDesc.trim(),
        projectId: targetProject,
        assigneeId: targetDev,
        priority: newTaskPriority,
        dueDate: newTaskDueDate || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
        estimatedHours: Number(newTaskHours) || 8,
        tags: tagList,
        weightCategory: newTaskWeightCategory,
        proposedWeight: points,
        effectiveAt: newTaskIsBackfill && newTaskEffectiveDate ? newTaskEffectiveDate : undefined,
      })

      showToast(
        points >= 6
          ? 'Task created with custom weight. Queued for CHRO verification.'
          : 'Task created successfully with standard weight.',
        'success',
      )

      setNewTaskTitle('')
      setNewTaskDesc('')
      setNewTaskTags('')
      setIsCreateModalOpen(false)
    } catch (err: any) {
      showToast(err.message || 'Failed to create task', 'error')
    }
  }

  const handleConfirmCompletion = (e: React.FormEvent) => {
    e.preventDefault()
    if (!completingTask) return

    // Validate mandatory comments for extreme scores
    if ((pmScore < 70 || pmScore > 90) && !pmScoreFeedback.trim()) {
      showToast('Mandatory written justification required for scores < 70 or > 90', 'error')
      return
    }

    // If task is already completed, update KPI score directly
    if (completingTask.status === 'completed') {
      void scoreCompletedTask(
        completingTask.id,
        pmScore,
        pmScoreFeedback.trim() || `PM KPI score: ${pmScore}/100`,
      )
      showToast(`Satisfaction score ${pmScore}/100 recorded for task`, 'success')
    } else {
      // Pass pmScore to approveTask so it marks completed and records initial PM score
      approveTask(
        completingTask.id,
        pmScoreFeedback.trim() || `Approved with PM Satisfaction Score ${pmScore}/100`,
        pmScore,
      )
      showToast(`Task approved with PM Satisfaction Score: ${pmScore}/100`, 'success')
    }
    setCompletingTask(null)
    setPmScore(85)
    setPmScoreFeedback('')
  }

  const handleConfirmReject = (e: React.FormEvent) => {
    e.preventDefault()
    if (!rejectingTask || !rejectFeedback.trim()) return

    rejectTask(rejectingTask.id, rejectFeedback.trim())
    setRejectingTask(null)
    setRejectFeedback('')
  }

  const handleRevisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!revisingTask) return

    try {
      await erpApi.proposeTaskWeight({
        taskId: revisingTask.id,
        proposedWeight: Number(revisedWeight),
        category: revisedWeight >= 6 ? 'CUSTOM' : 'MEDIUM',
      })
      showToast('Revised weight submitted for CHRO verification', 'success')
      setRevisingTask(null)
    } catch (err: any) {
      showToast(err.message || 'Failed to submit revision', 'error')
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white font-display">
            Team Task Management
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            5-Column Kanban Board · Manage, assign, and approve tasks for{' '}
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {team?.name || 'Squad'}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button
            variant="lime"
            size="sm"
            icon={Plus}
            onClick={() => {
              const defaultProj = selectedProjectId !== 'all' ? selectedProjectId : (teamProjects[0]?.id || '')
              setNewTaskProject(defaultProj)
              if (teamMembers.length > 0 && !newTaskDev) {
                setNewTaskDev(teamMembers[0].id)
              }
              setIsCreateModalOpen(true)
            }}
          >
            Create Task
          </Button>
        </div>
      </div>

      {/* Review Countdown Ticker Banner */}
      <div
        className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs ${
          !isBackfillWindowOpen
            ? 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
            : backfillMsRemaining <= 24 * 3600 * 1000
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300 animate-pulse'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <Clock className="w-4 h-4 shrink-0" />
          <div>
            <span className="font-bold">
              {isBackfillWindowOpen
                ? 'Review Window Active:'
                : 'Review Window Expired:'}{' '}
            </span>
            <span>{backfillCountdownText}</span>
          </div>
        </div>
        <Badge variant={isBackfillWindowOpen ? 'success' : 'danger'}>
          {isBackfillWindowOpen ? 'REVIEW WINDOW OPEN' : 'REVIEW WINDOW CLOSED'}
        </Badge>
      </div>

      {/* Main Grid: Projects Sidebar (Left) + 5-Column Kanban (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Side (3 cols): Project Cards Filter Sidebar */}
        <div className="lg:col-span-3 space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <FolderGit2 className="w-3.5 h-3.5 text-slate-400" />
              Project Filter
            </span>
            <span className="text-[11px] text-slate-400">{teamProjects.length + 1} views</span>
          </div>

          {/* "All Projects" Card */}
          <button
            type="button"
            onClick={() => setSelectedProjectId('all')}
            className={`w-full text-left p-3.5 rounded-2xl transition-all cursor-pointer border ${
              selectedProjectId === 'all'
                ? 'bg-white dark:bg-slate-900 border-lime-400 dark:border-lime-400/80 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.06)] ring-1 ring-lime-400'
                : 'bg-white/80 dark:bg-slate-900/60 border-slate-200/80 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300">
                  <Layers className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="font-bold text-xs text-slate-900 dark:text-white">All Projects</h4>
                  <p className="text-[10px] text-slate-400">Total team tasks</p>
                </div>
              </div>
              <Badge variant="slate" size="xs">
                {teamTasks.length}
              </Badge>
            </div>
          </button>

          {/* Individual Project Cards */}
          {teamProjects.map((project) => {
            const count = teamTasks.filter((t) => t.projectId === project.id).length
            const isSelected = selectedProjectId === project.id

            return (
              <button
                key={project.id}
                type="button"
                onClick={() => setSelectedProjectId(project.id)}
                className={`w-full text-left p-3.5 rounded-2xl transition-all cursor-pointer border ${
                  isSelected
                    ? 'bg-white dark:bg-slate-900 border-lime-400 dark:border-lime-400/80 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.06)] ring-1 ring-lime-400'
                    : 'bg-white/80 dark:bg-slate-900/60 border-slate-200/80 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-mono text-[10px] font-bold text-slate-400">
                      {project.code}
                    </span>
                    <h4 className="font-bold text-xs text-slate-900 dark:text-white truncate">
                      {project.name}
                    </h4>
                  </div>
                  <Badge variant="slate" size="xs">
                    {count}
                  </Badge>
                </div>
              </button>
            )
          })}
        </div>

        {/* Right Side (9 cols): Kanban Board */}
        <div className="lg:col-span-9 space-y-4">
          {/* Search & Dev filter */}
          <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search team tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-[11px] text-slate-400 shrink-0">Assignee:</span>
              <select
                value={selectedDevId}
                onChange={(e) => setSelectedDevId(e.target.value)}
                className="w-full sm:w-44 px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none cursor-pointer"
              >
                <option value="all">All Developers ({teamMembers.length})</option>
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 5-Column Kanban Board */}
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-4 items-start min-w-[1150px]">
              {columns.map((col) => {
                const colTasks = filteredTasks.filter((t) => t.status === col.id)
                const isDragOver = dragOverColId === col.id

                return (
                  <div
                    key={col.id}
                    onDragOver={(e) => handleDragOver(e, col.id)}
                    onDrop={(e) => handleDrop(e, col.id)}
                    className={`flex-1 min-w-[220px] rounded-2xl p-3.5 min-h-[500px] flex flex-col transition-colors border ${
                      isDragOver
                        ? 'bg-lime-50/50 dark:bg-lime-950/20 border-lime-400'
                        : 'bg-slate-50/80 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60'
                    }`}
                  >
                    {/* Column Header */}
                    <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-200/60 dark:border-slate-800/80">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                        <span className="font-bold text-xs text-slate-800 dark:text-slate-200">
                          {col.label}
                        </span>
                      </div>
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-white dark:bg-slate-800 text-slate-500 shadow-2xs">
                        {colTasks.length}
                      </span>
                    </div>

                    {/* Tasks List */}
                    <div className="space-y-2.5 flex-1">
                      {colTasks.length === 0 ? (
                        <div className="py-10 text-center text-[11px] text-slate-400/80">
                          Drop task here
                        </div>
                      ) : (
                        colTasks.map((task) => {
                          const isDragging = draggedTaskId === task.id
                          const assignee = task.assignee
                          const isReturned =
                            (task as any).weightStatus === 'REJECTED' ||
                            (task as any).weightStatus === 'PENDING_CHRO_VERIFICATION'

                          return (
                            <div
                              key={task.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, task.id)}
                              onClick={() => setSelectedTaskModal(task)}
                              className={`p-3 rounded-xl bg-white dark:bg-slate-850 border border-slate-200/70 dark:border-slate-750 shadow-2xs hover:shadow-xs transition-all cursor-pointer group space-y-2.5 ${
                                isDragging ? 'opacity-40 scale-95' : ''
                              }`}
                            >
                              {/* Card Top: Project Code & Priority */}
                              <div className="flex items-center justify-between gap-1 text-[10px]">
                                <span className="font-mono text-slate-400">
                                  {task.project?.code || 'SQUAD'}
                                </span>
                                <div className="flex items-center gap-1">
                                  {(task as any).isBackfilled && (
                                    <span className="px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 font-mono text-[9px] font-bold">
                                      BACKFILL
                                    </span>
                                  )}
                                  <Badge
                                    variant={
                                      task.priority === 'urgent'
                                        ? 'rose'
                                        : task.priority === 'high'
                                          ? 'amber'
                                          : 'slate'
                                    }
                                    size="xs"
                                  >
                                    {task.priority}
                                  </Badge>
                                </div>
                              </div>

                              {/* Task Title */}
                              <div className="font-semibold text-xs text-slate-900 dark:text-white leading-snug line-clamp-2">
                                {task.title}
                              </div>

                              {/* Returned Task Warning Pill */}
                              {isReturned && (
                                <div
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setRevisingTask(task)
                                    setRevisedWeight(Number((task as any).weightPoints) || 3)
                                  }}
                                  className="p-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-[10px] text-amber-700 dark:text-amber-300 flex items-center justify-between gap-1"
                                >
                                  <span className="flex items-center gap-1 font-bold">
                                    <Scale className="w-3 h-3" />
                                    CHRO Weight Gate
                                  </span>
                                  <span className="underline font-semibold cursor-pointer">
                                    Revise
                                  </span>
                                </div>
                              )}

                              {/* Assignee & Due Date */}
                              <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (assignee) setSelectedProfileUser(assignee)
                                  }}
                                  className="flex items-center gap-1 truncate font-medium text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer group"
                                  title="View assignee performance profile & deliverables"
                                >
                                  <span className="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[9px] font-bold group-hover:ring-1 group-hover:ring-indigo-500">
                                    {assignee?.initials || 'D'}
                                  </span>
                                  <span className="truncate group-hover:underline">
                                    {assignee?.name?.split(' ')[0] || 'Dev'}
                                  </span>
                                </button>
                                <span className="flex items-center gap-1 shrink-0">
                                  <Clock className="w-3 h-3 text-slate-400" />
                                  {formatDate(task.dueDate, 'short')}
                                </span>
                              </div>

                              {/* Todo quick action */}
                              {col.id === 'todo' && (
                                <div
                                  className="flex items-center gap-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    onClick={() => updateTaskStatus(task.id, 'in_progress')}
                                    className="flex-1 py-1 px-2 rounded-lg bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 text-sky-600 dark:text-sky-400 border border-sky-200/60 dark:border-sky-900/40 text-[10px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                                  >
                                    Start Work
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCompletingTask(task)
                                      setPmScore(85)
                                      setPmScoreFeedback('')
                                    }}
                                    className="py-1 px-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition-colors shadow-2xs"
                                  >
                                    <CheckCircle2 className="w-3 h-3" />
                                    Complete &amp; Score
                                  </button>
                                </div>
                              )}

                              {/* In-Progress quick action */}
                              {col.id === 'in_progress' && (
                                <div
                                  className="flex items-center gap-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    onClick={() => updateTaskStatus(task.id, 'in_review')}
                                    className="flex-1 py-1 px-2 rounded-lg bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-100 text-purple-600 dark:text-purple-400 border border-purple-200/60 dark:border-purple-900/40 text-[10px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                                  >
                                    Ready for Review
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCompletingTask(task)
                                      setPmScore(85)
                                      setPmScoreFeedback('')
                                    }}
                                    className="py-1 px-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition-colors shadow-2xs"
                                  >
                                    <CheckCircle2 className="w-3 h-3" />
                                    Complete &amp; Score
                                  </button>
                                </div>
                              )}

                              {/* Completed Badge & Score info */}
                              {col.id === 'completed' && (
                                <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800 text-[10px]">
                                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" />
                                    Completed
                                  </span>
                                  <div className="flex items-center gap-1.5">
                                    {Boolean((task as any).pmScore || (task as any).score) && (
                                      <span className="font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                        KPI: {Number((task as any).pmScore || (task as any).score)}/100
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setCompletingTask(task)
                                        setPmScore(Number((task as any).pmScore || (task as any).score) || 85)
                                        setPmScoreFeedback('')
                                      }}
                                      className="py-0.5 px-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-900/40 text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                                    >
                                      <Award className="w-3 h-3" />
                                      <span>{Boolean((task as any).pmScore || (task as any).score) ? 'Edit KPI' : 'Assign KPI'}</span>
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* In-Review PM Action Buttons */}
                              {col.id === 'in_review' && (
                                <div
                                  className="flex items-center gap-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCompletingTask(task)
                                      setPmScore(85)
                                      setPmScoreFeedback('')
                                    }}
                                    className="flex-1 py-1.5 px-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition-colors whitespace-nowrap shadow-2xs"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                    <span>Approve &amp; Score</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setRejectingTask(task)
                                      setRejectFeedback('')
                                    }}
                                    className="flex-1 py-1.5 px-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-rose-600 dark:text-rose-400 border border-rose-200/60 dark:border-rose-900/40 text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition-colors whitespace-nowrap shadow-2xs"
                                  >
                                    <XCircle className="w-3.5 h-3.5 shrink-0" />
                                    <span>Reject</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Modal: Create New Task with CHRO Weight Selector */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create New Sprint Task"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Task Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g., Integrate Canvas 2D fallback for unsupported WebGL clients"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Project <span className="text-rose-500">*</span>
              </label>
              <select
                value={newTaskProject}
                onChange={(e) => setNewTaskProject(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none cursor-pointer"
              >
                {teamProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Assignee Developer <span className="text-rose-500">*</span>
              </label>
              <select
                value={newTaskDev}
                onChange={(e) => setNewTaskDev(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none cursor-pointer"
              >
                {currentUser && !teamMembers.some((m) => m.id === currentUser.id) && (
                  <option value={currentUser.id}>
                    {currentUser.name} (You / Self-Assignment)
                  </option>
                )}
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.title})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* CHRO Weight Category & Multiplier Context */}
          <div className="p-3 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/50 dark:border-indigo-900/50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5">
                <Scale className="w-4 h-4 text-indigo-500" />
                CHRO Weight Category (10x XP Rate)
              </span>
              {newTaskWeightCategory === 'CUSTOM' ? (
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold text-[10px]">
                  Requires CHRO Verification
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold text-[10px]">
                  Standard Auto-Approved
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1">
                  Weight Category
                </label>
                <select
                  value={newTaskWeightCategory}
                  onChange={(e) => {
                    const val = e.target.value as any
                    setNewTaskWeightCategory(val)
                    if (val === 'CUSTOM' && newTaskCustomPoints === 6) {
                      setNewTaskCustomPoints(10)
                    }
                  }}
                  className="w-full p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white cursor-pointer"
                >
                  <option value="SMALL">SMALL (1 pt / 10 XP · Minor)</option>
                  <option value="MEDIUM">MEDIUM (3 pts / 30 XP · Standard)</option>
                  <option value="LARGE">LARGE (5 pts / 50 XP · Complex)</option>
                  <option value="CRITICAL">CRITICAL (7 pts / 70 XP · Core/Urgent)</option>
                  <option value="CUSTOM">CUSTOM (10x approved weight · Manual)</option>
                </select>
              </div>

              {newTaskWeightCategory === 'CUSTOM' ? (
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1">
                    Custom Points (Min 6)
                  </label>
                  <input
                    type="number"
                    min="6"
                    max="100"
                    value={newTaskCustomPoints}
                    onChange={(e) => setNewTaskCustomPoints(Number(e.target.value))}
                    className="w-full p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-mono"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1">
                    Squad Context Multiplier
                  </label>
                  <select
                    value={newTaskContext}
                    onChange={(e) => setNewTaskContext(e.target.value as any)}
                    className="w-full p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white cursor-pointer"
                  >
                    <option value="MAIN_SQUAD">Main Squad (1.00x)</option>
                    <option value="OUTSIDE_SQUAD">Outside Squad (0.70x)</option>
                    <option value="ISOLATED_EXECUTIVE">Isolated Executive (0.50x)</option>
                  </select>
                </div>
              )}
            </div>

            {/* Backfill Checkbox */}
            <div className="pt-2 border-t border-indigo-200/40 dark:border-indigo-900/40">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!isBackfillWindowOpen}
                  checked={newTaskIsBackfill}
                  onChange={(e) => setNewTaskIsBackfill(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 disabled:opacity-50"
                />
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  Backfill historical deliverable (prior to Nov 12, 2026)
                </span>
              </label>
              {!isBackfillWindowOpen && (
                <p className="text-[10px] text-rose-500 mt-1">
                  Backfill grace window closed on Nov 19 23:59 Asia/Dhaka.
                </p>
              )}
              {newTaskIsBackfill && (
                <div className="mt-2">
                  <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                    Historical Effective Date
                  </label>
                  <input
                    type="date"
                    required={newTaskIsBackfill}
                    value={newTaskEffectiveDate}
                    onChange={(e) => setNewTaskEffectiveDate(e.target.value)}
                    className="p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Priority
              </label>
              <select
                value={newTaskPriority}
                onChange={(e) => setNewTaskPriority(e.target.value as TaskPriority)}
                className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none cursor-pointer"
              >
                <option value="low">Low Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="high">High Priority</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Due Date
              </label>
              <input
                type="date"
                min={new Date().toISOString().split('T')[0]}
                value={newTaskDueDate}
                onChange={(e) => setNewTaskDueDate(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Description &amp; Requirements
            </label>
            <textarea
              rows={3}
              value={newTaskDesc}
              onChange={(e) => setNewTaskDesc(e.target.value)}
              placeholder="Technical specifications, deliverable requirements, or acceptance criteria..."
              className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none resize-none leading-relaxed"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Tags (comma separated)
            </label>
            <input
              type="text"
              placeholder="e.g., frontend, canvas, fallback, perf"
              value={newTaskTags}
              onChange={(e) => setNewTaskTags(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsCreateModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="lime" size="sm" icon={Plus}>
              Create Task
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Mandatory Cancellation Reason Prompt */}
      {cancellingTask && (
        <Modal
          isOpen={Boolean(cancellingTask)}
          onClose={() => setCancellingTask(null)}
          title={`Cancel Task — ${cancellingTask.title}`}
        >
          <form onSubmit={handleConfirmCancel} className="space-y-4 text-xs">
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
              Please provide a mandatory written reason for cancelling this task. This reason will be permanently recorded in the organizational audit trail.
            </p>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Cancellation Reason <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                placeholder="Explain why this deliverable was cancelled..."
                rows={3}
                required
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-rose-400"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <Button type="button" variant="secondary" size="sm" onClick={() => setCancellingTask(null)}>
                Abort
              </Button>
              <Button type="submit" variant="danger" size="sm">
                Confirm Cancellation
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: PM Satisfaction Score Review (0–100 Slider) */}
      <Modal
        isOpen={Boolean(completingTask)}
        onClose={() => setCompletingTask(null)}
        title={`Approve & Score Deliverable: ${completingTask?.title || ''}`}
      >
        <form onSubmit={handleConfirmCompletion} className="space-y-4 text-xs">
          <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
            Rate developer delivery on a 0–100 scale. This constitutes 50% of their weekly KPI score.
            Scores below 70 or above 90 require detailed technical justifications.
          </p>

          <div className="p-4 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-[var(--text)]">PM Satisfaction Score</span>
              <span
                className={`text-xl font-extrabold font-mono ${
                  pmScore < 70
                    ? 'text-rose-500'
                    : pmScore > 90
                      ? 'text-emerald-500'
                      : 'text-indigo-600 dark:text-indigo-400'
                }`}
              >
                {pmScore} / 100
              </span>
            </div>

            <input
              type="range"
              min="0"
              max="100"
              value={pmScore}
              onChange={(e) => setPmScore(Number(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer"
            />

            <div className="flex justify-between text-[10px] text-[var(--muted)]">
              <span>0 (Unacceptable)</span>
              <span>70 (Baseline)</span>
              <span>85 (Target)</span>
              <span>100 (Exceptional)</span>
            </div>
          </div>

          {/* Justification Warning Alerts */}
          {pmScore < 70 && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Sub-70 Score Notice: </span>
                You must document specific architectural defects, test omissions, or missed deadlines
                below to justify this rating.
              </div>
            </div>
          )}

          {pmScore > 90 && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Exceptional Score Notice: </span>
                You must document macro impact or outstanding technical execution below to justify a
                score exceeding 90.
              </div>
            </div>
          )}

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Feedback &amp; Justification{' '}
              {pmScore < 70 || pmScore > 90 ? (
                <span className="text-rose-500">* (Mandatory)</span>
              ) : (
                '(Optional)'
              )}
            </label>
            <textarea
              rows={3}
              required={pmScore < 70 || pmScore > 90}
              value={pmScoreFeedback}
              onChange={(e) => setPmScoreFeedback(e.target.value)}
              placeholder={
                pmScore < 70
                  ? 'Explain defect rate, unhandled edge cases, or SLA breach...'
                  : pmScore > 90
                    ? 'Explain extraordinary delivery speed, zero defect rate, or leadership...'
                    : 'Notes on delivery quality...'
              }
              className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none resize-none leading-relaxed"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setCompletingTask(null)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" icon={CheckCircle2}>
              Approve &amp; Commit Score
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Returned Task Revision */}
      <Modal
        isOpen={Boolean(revisingTask)}
        onClose={() => setRevisingTask(null)}
        title="Revise Task Weight Proposal"
      >
        <form onSubmit={handleRevisionSubmit} className="space-y-4 text-xs">
          <p className="text-slate-600 dark:text-slate-400">
            The CHRO modified or rejected the initial weight proposal for{' '}
            <strong>{revisingTask?.title}</strong>. You may adjust the points and resubmit.
          </p>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Adjusted Weight Points
            </label>
            <input
              type="number"
              min="1"
              max="100"
              value={revisedWeight}
              onChange={(e) => setRevisedWeight(Number(e.target.value))}
              className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Revision Notes for CHRO
            </label>
            <textarea
              rows={3}
              value={revisionNotes}
              onChange={(e) => setRevisionNotes(e.target.value)}
              placeholder="Explain the scope reduction or additional technical complexity..."
              className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none resize-none leading-relaxed"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setRevisingTask(null)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" icon={RotateCcw}>
              Resubmit to CHRO
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Reject with Feedback */}
      <Modal
        isOpen={Boolean(rejectingTask)}
        onClose={() => setRejectingTask(null)}
        title={`Reject Deliverable: ${rejectingTask?.title || 'Task'}`}
      >
        <form onSubmit={handleConfirmReject} className="space-y-4 text-xs">
          <p className="text-slate-600 dark:text-slate-400">
            This task will be returned to <strong>In Progress</strong> for developer revision.
            Please provide specific technical feedback or missing acceptance criteria.
          </p>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Review Feedback <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={4}
              value={rejectFeedback}
              onChange={(e) => setRejectFeedback(e.target.value)}
              placeholder="e.g. PR was missing automated tests for error boundary handling on network disconnect. Please add coverage and resubmit."
              className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none resize-none leading-relaxed"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setRejectingTask(null)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="danger" size="sm" icon={XCircle}>
              Return to In Progress
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default PmTaskManagementPage
