import React, { useState, useMemo, useEffect } from 'react'
import {
  Users,
  FolderGit2,
  Plus,
  Shield,
  Award,
  Percent,
  Layers,
  Edit2,
  Clock,
  CheckCircle2,
  DollarSign,
  Sparkles,
  Link2,
  ExternalLink,
} from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { usePermissions } from '../../hooks/usePermissions'
import { useCtoData, type TeamWithDetails } from '../../hooks/useCtoData'
import { Badge } from '../../components/common/Badge'
import { Button } from '../../components/common/Button'
import { Modal } from '../../components/common/Modal'
import { Avatar } from '../../components/common/Avatar'
import { formatDate, formatCurrency } from '../../utils/formatters'
import { erpApi } from '../../api/client'
import { formatPlainEnglishLog } from '../../utils/plain-english-logs'
import type { Task, TaskPriority, TaskStatus } from '../../types'

export function MySquadsPage() {
  const {
    data,
    currentUser,
    currentRole,
    createTask,
    scoreCompletedTask,
    updateTaskStatus,
    setSelectedTaskModal,
    showToast,
  } = useApp()
  const { teams } = useCtoData()
  const { hasPermission } = usePermissions()

  const isExecutive = useMemo(() => {
    const role = (currentUser?.role || currentRole || '').toLowerCase()
    const title = (currentUser?.title || '').toLowerCase()
    const activeRoles = currentUser?.activeRoleSlugs || []
    return (
      role === 'ceo' ||
      ['cto', 'cfo', 'chro', 'cpo', 'coo', 'cmo', 'cro'].includes(role) ||
      activeRoles.some((r) =>
        ['ceo', 'cto', 'cfo', 'chro', 'cpo', 'coo', 'cmo', 'cro'].includes(r.toLowerCase()),
      ) ||
      title.includes('chief')
    )
  }, [currentUser, currentRole])

  // Multi-squad membership resolution
  const userSquads = useMemo<TeamWithDetails[]>(() => {
    if (!currentUser) return []
    const myTeams = teams.filter((t) => {
      const isPm = t.pmId === currentUser.id
      const isMember = t.memberIds?.includes(currentUser.id)
      const inMembersList = t.members?.some((m) => m.id === currentUser.id)
      const inUserTeamIds = currentUser.teamIds?.includes(t.id) || currentUser.teamId === t.id
      return isPm || isMember || inMembersList || inUserTeamIds
    })

    // If executive or no squad assigned, show all squads so leadership has complete visibility
    if (myTeams.length === 0 && (isExecutive || hasPermission('teams:read_all'))) {
      return teams
    }
    return myTeams.length > 0 ? myTeams : teams
  }, [teams, currentUser, isExecutive, hasPermission])

  const [selectedSquadId, setSelectedSquadId] = useState<string>(
    userSquads[0]?.id || teams[0]?.id || '',
  )

  const activeSquad = useMemo<TeamWithDetails | null>(() => {
    return (
      userSquads.find((s) => s.id === selectedSquadId) ||
      teams.find((s) => s.id === selectedSquadId) ||
      userSquads[0] ||
      teams[0] ||
      null
    )
  }, [userSquads, teams, selectedSquadId])

  // Resolve user's squad-specific role
  const squadRole = useMemo(() => {
    if (!activeSquad || !currentUser) return 'Squad Member'
    if (activeSquad.pmId === currentUser.id) return 'Squad PM'
    if (activeSquad.leadDevId === currentUser.id) return 'Lead Engineer'
    if (isExecutive) return 'Executive Overseer'
    return 'Squad Member'
  }, [activeSquad, currentUser, isExecutive])

  const isSquadPmOrLeader = useMemo(() => {
    if (!activeSquad || !currentUser) return false
    return activeSquad.pmId === currentUser.id || isExecutive
  }, [activeSquad, currentUser, isExecutive])

  // Scoped projects & tasks
  const squadProjects = useMemo(() => {
    if (!activeSquad) return []
    return data.projects.filter(
      (p) =>
        activeSquad.projectIds?.includes(p.id) ||
        p.teamId === activeSquad.id ||
        (activeSquad.projects && activeSquad.projects.some((sp) => sp.id === p.id)),
    )
  }, [activeSquad, data.projects])

  const squadTotalBudget = useMemo(() => {
    return squadProjects.reduce((acc, p) => acc + (p.budget || p.allocatedBudget || 0), 0)
  }, [squadProjects])

  const squadTasks = useMemo(() => {
    if (!activeSquad) return []
    const projectIds = squadProjects.map((p) => p.id)
    const memberIds = activeSquad.memberIds || activeSquad.members?.map((m) => m.id) || []
    return data.tasks.filter((t) => {
      const matchProject = projectIds.includes(t.projectId)
      const matchAssignee = memberIds.includes(t.assigneeId)
      return matchProject || matchAssignee
    })
  }, [activeSquad, squadProjects, data.tasks])

  // Progress metrics
  const completedCount = squadTasks.filter((t) => t.status === 'completed').length
  const totalCount = squadTasks.length
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  // Task creation modal state
  const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDescription, setTaskDescription] = useState('')
  const [taskProjectId, setTaskProjectId] = useState(squadProjects[0]?.id || '')
  const [taskAssigneeId, setTaskAssigneeId] = useState(activeSquad?.memberIds?.[0] || '')
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('medium')
  const [taskXp, setTaskXp] = useState<number>(30)
  const [isCustomXp, setIsCustomXp] = useState<boolean>(false)
  const [customXpInput, setCustomXpInput] = useState<number>(30)
  const [taskDueDate] = useState(
    new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
  )
  const [taskEstimatedHours, setTaskEstimatedHours] = useState(8)
  const [isMainProjectTask, setIsMainProjectTask] = useState(true)
  const [projectPercentage, setProjectPercentage] = useState<number>(10)

  // KPI Scoring modal state
  const [scoringTask, setScoringTask] = useState<Task | null>(null)
  const [kpiScore, setKpiScore] = useState<number>(90)
  const [kpiReason, setKpiReason] = useState<string>('Deliverable completed to specifications')

  // Edit Task modal state
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [editTaskTitle, setEditTaskTitle] = useState('')
  const [editTaskPriority, setEditTaskPriority] = useState<TaskPriority>('medium')
  const [editTaskXp, setEditTaskXp] = useState<number>(30)
  const [editIsCustomXp, setEditIsCustomXp] = useState<boolean>(false)
  const [editCustomXpInput, setEditCustomXpInput] = useState<number>(30)
  const [editIsMainProjectTask, setEditIsMainProjectTask] = useState(true)
  const [editProjectPercentage, setEditProjectPercentage] = useState<number>(10)

  // Squad Resources state
  const [squadResources, setSquadResources] = useState<any[]>([])
  const [isAddResourceModalOpen, setIsAddResourceModalOpen] = useState(false)
  const [resourceLink, setResourceLink] = useState('')
  const [resourceDescription, setResourceDescription] = useState('')
  const [isSavingResource, setIsSavingResource] = useState(false)

  // Fetch squad resources whenever activeSquad changes
  useEffect(() => {
    if (!activeSquad?.id) {
      setSquadResources([])
      return
    }
    let isSubscribed = true
    erpApi.getTeamResources(activeSquad.id)
      .then((res) => {
        if (isSubscribed && Array.isArray(res)) {
          setSquadResources(res)
        }
      })
      .catch(() => {
        if (isSubscribed) setSquadResources([])
      })
    return () => {
      isSubscribed = false
    }
  }, [activeSquad?.id])

  const handleSaveResource = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeSquad?.id) return
    if (!resourceLink.trim()) {
      showToast('Resource link is required', 'error')
      return
    }
    if (!resourceDescription.trim()) {
      showToast('Resource description / purpose is required', 'error')
      return
    }
    setIsSavingResource(true)
    try {
      const created = await erpApi.addTeamResource(activeSquad.id, {
        url: resourceLink.trim(),
        description: resourceDescription.trim(),
        title: resourceDescription.trim(),
      })
      setSquadResources((prev) => [created, ...prev])
      showToast('Squad resource added successfully', 'success')
      setResourceLink('')
      setResourceDescription('')
      setIsAddResourceModalOpen(false)
    } catch (err: any) {
      showToast(err.message || 'Failed to add squad resource', 'error')
    } finally {
      setIsSavingResource(false)
    }
  }

  const handleOpenEditTask = (task: Task) => {
    setEditingTask(task)
    setEditTaskTitle(task.title)
    setEditTaskPriority(task.priority)
    const points = Number(task.weightPoints) || 3
    const currentXp = Math.round(points * 10)
    setEditTaskXp(currentXp)
    if ([10, 30, 50, 100].includes(currentXp)) {
      setEditIsCustomXp(false)
      setEditCustomXpInput(currentXp)
    } else {
      setEditIsCustomXp(true)
      setEditCustomXpInput(currentXp)
    }
    setEditIsMainProjectTask(task.isMainProjectTask !== false)
    setEditProjectPercentage(Number(task.projectPercentage) || 0)
  }

  const handleSaveEditTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingTask) return

    if (editIsMainProjectTask) {
      const otherTasksTotal = data.tasks
        .filter(
          (t) =>
            t.projectId === editingTask.projectId &&
            t.isMainProjectTask &&
            t.id !== editingTask.id,
        )
        .reduce((sum, t) => sum + (Number(t.projectPercentage) || 0), 0)

      if (otherTasksTotal + Number(editProjectPercentage) > 100) {
        showToast(
          `Project percentage cannot exceed 100%. Other tasks allocate ${otherTasksTotal}%, maximum allowed is ${100 - otherTasksTotal}%.`,
          'error',
        )
        return
      }
    }

    const finalXp = editIsCustomXp ? Math.max(1, editCustomXpInput) : editTaskXp
    const finalPoints = Math.round((finalXp / 10) * 100) / 100
    try {
      await erpApi.updateTask(editingTask.id, {
        title: editTaskTitle,
        priority: editTaskPriority,
        weightPoints: finalPoints,
        proposedWeight: finalPoints,
        isMainProjectTask: editIsMainProjectTask,
        projectPercentage: editIsMainProjectTask ? editProjectPercentage : 0,
      } as any)
      showToast('Task updated successfully', 'success')
      setEditingTask(null)
    } catch (err: any) {
      showToast(err?.message || 'Failed to update task', 'error')
    }
  }

  // Squad Activity & Progress Log resolution (strictly scoped to active squad)
  const squadActivityLogs = useMemo(() => {
    if (!activeSquad) return []
    const squadTaskIds = new Set(squadTasks.map((t) => t.id))
    const squadProjectIds = new Set(squadProjects.map((p) => p.id))
    const squadNameLower = activeSquad.name.toLowerCase()
    const squadCodeLower = activeSquad.code.toLowerCase()

    return (data.activityLogs || [])
      .filter((log: any) => {
        // 1. Direct squad match via payload
        if (log.payload?.teamName && log.payload.teamName.toLowerCase() === squadNameLower) {
          return true
        }
        if (log.entityType === 'team' && log.entityId === activeSquad.id) {
          return true
        }

        // 2. Task belongs to this squad
        if (log.entityType === 'task') {
          if (squadTaskIds.has(log.entityId)) return true
          const task = data.tasks.find((t) => t.id === log.entityId)
          if (task && squadProjectIds.has(task.projectId)) return true
        }

        // 3. Squad name or code explicitly in title or description
        const desc = (log.description || '').toLowerCase()
        const title = (log.entityTitle || '').toLowerCase()
        if (
          desc.includes(`(squad: ${squadNameLower})`) ||
          desc.includes(`[${squadNameLower}]`) ||
          desc.includes(`[${squadCodeLower}]`) ||
          title.includes(`[${squadNameLower}]`) ||
          title.includes(`[${squadCodeLower}]`)
        ) {
          return true
        }

        return false
      })
      .slice(0, 15)
  }, [activeSquad, squadTasks, squadProjects, data.activityLogs, data.tasks])

  // Drag and drop state
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [dragOverColId, setDragOverColId] = useState<string | null>(null)

  // PM drag-to-complete mandatory satisfaction score modal state
  const [completingTask, setCompletingTask] = useState<Task | null>(null)
  const [pmScore, setPmScore] = useState<number>(85)
  const [pmScoreFeedback, setPmScoreFeedback] = useState<string>('')

  // PM drag-to-cancel mandatory reason modal state
  const [cancellingTask, setCancellingTask] = useState<Task | null>(null)
  const [cancellationReason, setCancellationReason] = useState<string>('')

  const isDeveloper = !isSquadPmOrLeader

  const canDragTask = (task: Task) => {
    if (isSquadPmOrLeader) return true
    return task.assigneeId === currentUser?.id
  }

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, task: Task) => {
    if (!canDragTask(task)) {
      e.preventDefault()
      return
    }
    setDraggedTaskId(task.id)
    e.dataTransfer.setData('text/plain', task.id)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, colId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverColId !== colId) {
      setDragOverColId(colId)
    }
  }

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>, targetColId: TaskStatus) => {
    e.preventDefault()
    setDragOverColId(null)
    const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId
    if (!taskId) return

    const task = squadTasks.find((t) => t.id === taskId)
    if (!task || task.status === targetColId) {
      setDraggedTaskId(null)
      return
    }

    // Role-based restrictions:
    if (isDeveloper) {
      if (task.assigneeId !== currentUser?.id) {
        showToast('You can only update deliverables assigned to you.', 'error')
        setDraggedTaskId(null)
        return
      }
      if (targetColId === 'completed' || targetColId === 'cancelled') {
        showToast('Only Squad PM or Leadership can complete or cancel squad deliverables.', 'warning')
        setDraggedTaskId(null)
        return
      }
      await updateTaskStatus(taskId, targetColId)
      showToast(`Task moved to ${targetColId.replace('_', ' ').toUpperCase()}`, 'success')
      setDraggedTaskId(null)
      return
    }

    // Squad PM / Leadership
    if (targetColId === 'completed') {
      setCompletingTask(task)
      setPmScore(task.pmScore ?? 85)
      setPmScoreFeedback('')
    } else if (targetColId === 'cancelled') {
      setCancellingTask(task)
      setCancellationReason('')
    } else {
      await updateTaskStatus(taskId, targetColId)
      showToast(`Task moved to ${targetColId.replace('_', ' ').toUpperCase()}`, 'success')
    }
    setDraggedTaskId(null)
  }

  const handleConfirmCompletion = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!completingTask) return
    if (pmScore < 1 || pmScore > 100) {
      showToast('PM satisfaction score must be between 1 and 100', 'error')
      return
    }
    try {
      await updateTaskStatus(completingTask.id, 'completed', {
        pmScore,
        cancellationReason: pmScoreFeedback.trim() || undefined,
      })
      showToast(`Task "${completingTask.title}" completed with score ${pmScore}/100`, 'success')
      setCompletingTask(null)
      setPmScore(85)
      setPmScoreFeedback('')
    } catch (err: any) {
      showToast(err?.message || 'Failed to complete deliverable', 'error')
    }
  }

  const handleConfirmCancel = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cancellingTask) return
    if (!cancellationReason.trim()) {
      showToast('Mandatory cancellation reason required', 'error')
      return
    }
    try {
      await updateTaskStatus(cancellingTask.id, 'cancelled', {
        cancellationReason: cancellationReason.trim(),
      })
      showToast(`Task "${cancellingTask.title}" cancelled`, 'success')
      setCancellingTask(null)
      setCancellationReason('')
    } catch (err: any) {
      showToast(err?.message || 'Failed to cancel deliverable', 'error')
    }
  }

  // Calculate current percentage sum for selected project
  const currentProjectPercentageAllocated = useMemo(() => {
    if (!taskProjectId) return 0
    return data.tasks
      .filter((t) => t.projectId === taskProjectId && t.isMainProjectTask)
      .reduce((sum, t) => sum + (Number(t.projectPercentage) || 0), 0)
  }, [data.tasks, taskProjectId])

  const handleOpenCreateModal = () => {
    if (squadProjects.length > 0) setTaskProjectId(squadProjects[0].id)
    const members = activeSquad?.members || []
    if (members.length > 0) setTaskAssigneeId(members[0].id)
    setTaskTitle('')
    setTaskDescription('')
    setTaskXp(30)
    setIsCustomXp(false)
    setCustomXpInput(30)
    setIsMainProjectTask(true)
    setProjectPercentage(10)
    setIsCreateTaskModalOpen(true)
  }

  const handleSaveTask = (e: React.FormEvent) => {
    e.preventDefault()
    if (!taskTitle.trim()) {
      showToast('Task title is required', 'error')
      return
    }
    if (!taskProjectId) {
      showToast('Project selection is required', 'error')
      return
    }
    if (!taskAssigneeId) {
      showToast('Assignee selection is required', 'error')
      return
    }

    if (isMainProjectTask) {
      const newTotal = currentProjectPercentageAllocated + Number(projectPercentage)
      if (newTotal > 100) {
        showToast(
          `Project percentage cannot exceed 100%. Currently allocated: ${currentProjectPercentageAllocated}%, trying to add: ${projectPercentage}%`,
          'error',
        )
        return
      }
    }

    const finalXp = isCustomXp ? Math.max(1, customXpInput) : taskXp
    const finalPoints = Math.round((finalXp / 10) * 100) / 100

    createTask({
      title: taskTitle.trim(),
      description: taskDescription.trim(),
      projectId: taskProjectId,
      assigneeId: taskAssigneeId,
      priority: taskPriority,
      dueDate: taskDueDate,
      estimatedHours: taskEstimatedHours,
      proposedWeight: finalPoints,
      weightCategory:
        finalXp >= 100
          ? 'CRITICAL'
          : finalXp >= 50
            ? 'HIGH'
            : finalXp >= 30
              ? 'MEDIUM'
              : 'LOW',
      isMainProjectTask,
      projectPercentage: isMainProjectTask ? Number(projectPercentage) : 0,
    })

    setIsCreateTaskModalOpen(false)
  }

  const handleSaveKpiScore = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!scoringTask) return
    await scoreCompletedTask(scoringTask.id, kpiScore, kpiReason)
    setScoringTask(null)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white font-display">
            My Squads
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Collaborative multi-squad hub, active roster memberships, and PM percentage task controls
          </p>
        </div>

        {/* Multi-Squad Switcher Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto bg-slate-100 dark:bg-slate-800/60 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs">
          {userSquads.map((squad) => (
            <button
              key={squad.id}
              type="button"
              onClick={() => setSelectedSquadId(squad.id)}
              className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-all cursor-pointer ${
                activeSquad?.id === squad.id
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200 dark:border-slate-700'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {squad.code} — {squad.name}
            </button>
          ))}
        </div>
      </div>

      {!activeSquad ? (
        <div className="p-12 text-center rounded-3xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
          <Users className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
            No Squad Assigned
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            You are not currently assigned to any engineering squad.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Squad Banner Card */}
          <div className="p-6 rounded-3xl bg-gradient-to-br from-indigo-900/90 via-slate-900 to-slate-950 text-white shadow-xl relative overflow-hidden border border-indigo-900/40">
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2.5">
                  <span className="px-2.5 py-0.5 rounded-lg bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 text-[11px] font-bold tracking-wider">
                    {activeSquad.code}
                  </span>
                  <Badge variant="indigo" size="xs">
                    Your Role: {squadRole}
                  </Badge>
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-white font-display">
                  {activeSquad.name}
                </h1>
                <p className="text-xs text-slate-300 max-w-xl">
                  {activeSquad.focus || 'Primary software engineering and delivery squad'}
                </p>
              </div>

              {/* Progress & Quick Stats */}
              <div className="flex flex-wrap items-center gap-4 bg-white/5 backdrop-blur-md p-4 rounded-2xl border border-white/10">
                <div className="text-center px-2">
                  <div className="text-2xl font-bold text-white font-mono">{progressPercent}%</div>
                  <div className="text-[10px] text-slate-300 uppercase tracking-wider">Progress</div>
                </div>
                <div className="h-8 w-px bg-white/10" />
                <div className="text-center px-2">
                  <div className="text-2xl font-bold text-white font-mono">{completedCount}/{totalCount}</div>
                  <div className="text-[10px] text-slate-300 uppercase tracking-wider">Completed</div>
                </div>
                <div className="h-8 w-px bg-white/10" />
                <div className="text-center px-2">
                  <div className="text-2xl font-bold text-indigo-300 font-mono">
                    {activeSquad.members?.length || activeSquad.memberIds?.length || 0}
                  </div>
                  <div className="text-[10px] text-slate-300 uppercase tracking-wider">Members</div>
                </div>

                {isSquadPmOrLeader && (
                  <Button
                    variant="primary"
                    size="sm"
                    icon={Plus}
                    onClick={handleOpenCreateModal}
                    className="ml-2 bg-indigo-500 hover:bg-indigo-600 text-white shadow-lg"
                  >
                    Create Task
                  </Button>
                )}
              </div>
            </div>

            {/* Overall Progress Bar */}
            <div className="mt-5 w-full bg-white/10 h-2 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-indigo-400 to-emerald-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Grid: PM & Members Column + Scoped Tasks Column */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Squad Roster & Projects Card */}
            <div className="space-y-6">
              {/* Assigned PM */}
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
                <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <Shield className="w-4 h-4 text-indigo-500" />
                  Assigned Project Manager
                </h3>
                {activeSquad.pm ? (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60">
                    <Avatar
                      src={activeSquad.pm.avatarUrl || activeSquad.pm.avatar}
                      name={activeSquad.pm.name}
                      initials={activeSquad.pm.initials}
                      className="w-10 h-10 ring-2 ring-indigo-500/30"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {activeSquad.pm.name}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {activeSquad.pm.title || 'Project Manager'}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 text-xs text-slate-400 italic bg-slate-50 dark:bg-slate-800/40 rounded-xl">
                    Unassigned
                  </div>
                )}
              </div>

              {/* Members List */}
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <Users className="w-4 h-4 text-indigo-500" />
                    Squad Members ({activeSquad.members?.length || activeSquad.memberIds?.length || 0})
                  </h3>
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {(activeSquad.members || []).map((m) => {
                    const isLead = activeSquad.leadDevId === m.id
                    const isSelf = currentUser?.id === m.id
                    return (
                      <div
                        key={m.id}
                        className={`flex items-center justify-between p-2.5 rounded-xl border text-xs ${
                          isSelf
                            ? 'bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800/60'
                            : 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Avatar
                            src={m.avatarUrl || m.avatar}
                            name={m.name}
                            initials={m.initials}
                            className="w-7 h-7"
                          />
                          <div className="truncate">
                            <span className="font-medium text-slate-900 dark:text-white">
                              {m.name}
                            </span>
                            {isSelf && <span className="ml-1 text-[10px] text-indigo-600 font-bold">(You)</span>}
                            <div className="text-[10px] text-slate-400 truncate">
                              {m.title || 'Software Engineer'}
                            </div>
                          </div>
                        </div>
                        {isLead && (
                          <Badge variant="indigo" size="xs">
                            LEAD
                          </Badge>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Managed Projects */}
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
                <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <FolderGit2 className="w-4 h-4 text-indigo-500" />
                  Managed Projects ({squadProjects.length})
                </h3>
                <div className="space-y-2">
                  {squadProjects.map((p) => (
                    <div
                      key={p.id}
                      className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {p.code} — {p.name}
                        </span>
                        <span className="text-[11px] font-mono font-bold text-indigo-600 dark:text-indigo-400">
                          {p.progress || 0}%
                        </span>
                      </div>
                      <div className="mt-2 w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-indigo-600 h-full rounded-full"
                          style={{ width: `${p.progress || 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Squad Resources (Links & Purpose) */}
              <div
                data-testid="squad-resources-section"
                className="p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-indigo-500" />
                    Squad Resources ({squadResources.length})
                  </h3>
                  {isSquadPmOrLeader && (
                    <Button
                      variant="secondary"
                      size="xs"
                      icon={Plus}
                      onClick={() => setIsAddResourceModalOpen(true)}
                    >
                      Add Resource
                    </Button>
                  )}
                </div>

                {squadResources.length === 0 ? (
                  <p className="text-xs text-slate-400 italic bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl">
                    No resources added for this squad yet.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {squadResources.map((res: any) => (
                      <div
                        key={res.id}
                        className="p-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <a
                            href={res.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 truncate max-w-[200px]"
                          >
                            <ExternalLink className="w-3 h-3 shrink-0" />
                            <span className="truncate">{res.title || res.url}</span>
                          </a>
                          <span className="text-[10px] text-slate-400 shrink-0">
                            {formatDate(res.createdAt, 'short')}
                          </span>
                        </div>
                        {res.description && (
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-tight">
                            {res.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Squad Budget & CFO Payout (Read-Only) - PM & Executive Only */}
              {isSquadPmOrLeader && (
                <div
                  data-testid="squad-budget-section"
                  className="p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-emerald-500" />
                      Squad Budget (Read-Only)
                    </h3>
                    <Badge variant="emerald" size="xs">
                      CFO Disbursed
                    </Badge>
                  </div>

                  <div className="p-3.5 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 dark:text-slate-400">Allocated Project Budget:</span>
                      <span className="font-bold font-mono text-emerald-700 dark:text-emerald-400 text-sm">
                        {formatCurrency(squadTotalBudget)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 dark:text-slate-400">CFO Payout Status:</span>
                      <span className="font-medium text-emerald-600 dark:text-emerald-400">
                        Disbursed & Active
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-emerald-100 dark:border-emerald-900/30">
                      Disbursed project-by-project per milestone completion by Chief Financial Officer.
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Scoped Deliverables Kanban Board */}
            <div className="lg:col-span-2 min-w-0 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-500" />
                    Squad Tasks &amp; Execution Board ({squadTasks.length})
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {isDeveloper
                      ? 'Drag your assigned tasks across To Do, In Progress, and In Review.'
                      : 'Role-based execution board · Drag tasks to progress, sign-off, or cancel.'}
                  </p>
                </div>
                {isSquadPmOrLeader && (
                  <Button variant="primary" size="xs" icon={Plus} onClick={handleOpenCreateModal}>
                    New Task
                  </Button>
                )}
              </div>

              {/* 5-Column Role-Based Kanban Board */}
              <div className="overflow-x-auto pb-3">
                <div className="flex gap-3 items-start min-w-[980px]">
                  {[
                    { id: 'todo' as TaskStatus, label: 'To Do', dot: 'bg-slate-400' },
                    { id: 'in_progress' as TaskStatus, label: 'In Progress', dot: 'bg-indigo-500' },
                    { id: 'in_review' as TaskStatus, label: 'In Review', dot: 'bg-amber-500' },
                    { id: 'completed' as TaskStatus, label: 'Completed', dot: 'bg-emerald-500' },
                    { id: 'cancelled' as TaskStatus, label: 'Cancelled', dot: 'bg-rose-500' },
                  ].map((col) => {
                    const colTasks = squadTasks.filter((t) => t.status === col.id)
                    const isDragOver = dragOverColId === col.id

                    return (
                      <div
                        key={col.id}
                        onDragOver={(e) => handleDragOver(e, col.id)}
                        onDrop={(e) => void handleDrop(e, col.id)}
                        className={`flex-1 min-w-[185px] rounded-2xl p-3 min-h-[420px] flex flex-col transition-colors border ${
                          isDragOver
                            ? 'bg-indigo-50/60 dark:bg-indigo-950/30 border-indigo-400 ring-2 ring-indigo-400/20'
                            : 'bg-slate-50/80 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60'
                        }`}
                      >
                        {/* Column Header */}
                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200/60 dark:border-slate-800/80">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                            <span className="font-bold text-xs text-slate-800 dark:text-slate-200">
                              {col.label}
                            </span>
                          </div>
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-white dark:bg-slate-800 text-slate-500 shadow-2xs">
                            {colTasks.length}
                          </span>
                        </div>

                        {/* Task Cards */}
                        <div className="space-y-2.5 flex-1">
                          {colTasks.length === 0 ? (
                            <div className="py-12 text-center text-[11px] text-slate-400/80 italic">
                              Drop deliverable here
                            </div>
                          ) : (
                            colTasks.map((task) => {
                              const assignee = data.users.find((u) => u.id === task.assigneeId)
                              const project = data.projects.find((p) => p.id === task.projectId)
                              const isDraggable = canDragTask(task)
                              const isBeingDragged = draggedTaskId === task.id
                              const isPercentageLinked = task.isMainProjectTask !== false
                              const isCompleted = task.status === 'completed'

                              return (
                                <div
                                  key={task.id}
                                  draggable={isDraggable}
                                  onDragStart={(e) => handleDragStart(e, task)}
                                  onClick={() => setSelectedTaskModal(task)}
                                  className={`p-3 rounded-xl bg-surface border border-border shadow-2xs hover:shadow-xs transition-all space-y-2 select-none ${
                                    isDraggable
                                      ? 'cursor-grab active:cursor-grabbing hover:border-indigo-300 dark:hover:border-indigo-600'
                                      : 'cursor-pointer hover:border-slate-300'
                                  } ${isBeingDragged ? 'opacity-40 scale-95' : ''}`}
                                >
                                  {/* Top: Project Code & Priority */}
                                  <div className="flex items-center justify-between gap-1 text-[10px]">
                                    <span className="font-mono text-slate-400 truncate max-w-[85px]">
                                      {project?.code || 'SQUAD'}
                                    </span>
                                    <div className="flex items-center gap-1">
                                      {isPercentageLinked && (
                                        <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono text-[9px] font-semibold">
                                          {task.projectPercentage || 0}%
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

                                  {/* Title */}
                                  <div className="font-semibold text-xs text-slate-900 dark:text-white line-clamp-2">
                                    {task.title}
                                  </div>

                                  {/* Assignee & Weight */}
                                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1.5 border-t border-slate-100 dark:border-slate-800">
                                    <span className="truncate max-w-[90px] font-medium text-slate-600 dark:text-slate-300">
                                      {assignee
                                        ? assignee.id === currentUser?.id
                                          ? 'You'
                                          : assignee.name
                                        : 'Unassigned'}
                                    </span>
                                    <span className="font-mono text-amber-500 font-semibold shrink-0">
                                      ⚡ {Math.round(Number(task.weightPoints || 2) * 10)} XP
                                    </span>
                                  </div>

                                  {/* KPI Score if completed */}
                                  {task.pmScore !== undefined && (
                                    <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center justify-between">
                                      <span>PM Score:</span>
                                      <span className="font-mono">{task.pmScore}/100</span>
                                    </div>
                                  )}

                                  {/* Actions for PM / Leader */}
                                  {isSquadPmOrLeader && (
                                    <div
                                      className="flex items-center justify-end gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-800/80"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEditTask(task)}
                                        className="text-[10px] font-medium text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 cursor-pointer"
                                      >
                                        <Edit2 className="w-2.5 h-2.5" />
                                        <span>Edit</span>
                                      </button>
                                      {isCompleted && task.pmScore === undefined && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setScoringTask(task)
                                            setKpiScore(90)
                                            setKpiReason('Verified deliverable meets quality threshold')
                                          }}
                                          className="text-[10px] font-semibold text-amber-600 hover:text-amber-700 flex items-center gap-0.5 cursor-pointer"
                                        >
                                          <Award className="w-2.5 h-2.5" />
                                          <span>Score</span>
                                        </button>
                                      )}
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

          {/* Squad Activity & Progress Log (Strictly Squad-Scoped & Plain English) */}
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-500" />
                  Squad Activity &amp; Progress Log
                </h3>
                <p className="text-xs text-slate-400">
                  Strictly squad-scoped deliverable updates and milestone transitions in plain English
                </p>
              </div>
              <Badge variant="indigo" size="xs">
                {squadActivityLogs.length} Events
              </Badge>
            </div>

            {squadActivityLogs.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs italic">
                No recent activity recorded for {activeSquad.name}.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {squadActivityLogs.map((log: any) => {
                  const { sentence, relativeTime } = formatPlainEnglishLog(
                    log,
                    data.tasks,
                    currentUser?.id,
                  )
                  return (
                    <div key={log.id} className="py-3 flex items-start gap-3 text-xs">
                      <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-slate-800 dark:text-slate-200 text-xs leading-relaxed">
                          {sentence}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {relativeTime}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Task Modal */}
      {isCreateTaskModalOpen && (
        <Modal
          isOpen={isCreateTaskModalOpen}
          onClose={() => setIsCreateTaskModalOpen(false)}
          title="Create Squad Deliverable"
        >
          <form onSubmit={handleSaveTask} className="space-y-4 text-xs">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Task Title *
              </label>
              <input
                type="text"
                required
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="e.g. Implement Prisma Multi-Squad Relations"
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Details & Description
              </label>
              <textarea
                rows={3}
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
                placeholder="Provide execution guidelines and acceptance criteria..."
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Project *
                </label>
                <select
                  required
                  value={taskProjectId}
                  onChange={(e) => setTaskProjectId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  {squadProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Squad Assignee *
                </label>
                <select
                  required
                  value={taskAssigneeId}
                  onChange={(e) => setTaskAssigneeId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  {(activeSquad?.members || []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.title || 'Engineer'})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Priority
                </label>
                <select
                  value={taskPriority}
                  onChange={(e) => setTaskPriority(e.target.value as TaskPriority)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="low">Low Priority</option>
                  <option value="medium">Medium Priority</option>
                  <option value="high">High Priority</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Estimated Hours
                </label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={taskEstimatedHours}
                  onChange={(e) => setTaskEstimatedHours(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Task Weight & XP Yield Selector */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  Task Weight (XP Yield)
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 font-bold text-[11px] flex items-center gap-1">
                  <span>⚡</span>
                  <span>{isCustomXp ? customXpInput : taskXp} XP</span>
                  <span className="text-slate-400 font-normal">
                    ({((isCustomXp ? customXpInput : taskXp) / 10).toFixed(1)} pts)
                  </span>
                </span>
              </div>

              {/* 10, 30, 50, 100 & Custom Preset Pills */}
              <div className="grid grid-cols-5 gap-2">
                {[
                  { xp: 10, label: '10 XP', desc: 'Minor · 1 pt' },
                  { xp: 30, label: '30 XP', desc: 'Standard · 3 pts' },
                  { xp: 50, label: '50 XP', desc: 'Complex · 5 pts' },
                  { xp: 100, label: '100 XP', desc: 'Critical · 10 pts' },
                ].map((item) => {
                  const isSelected = !isCustomXp && taskXp === item.xp
                  return (
                    <button
                      key={item.xp}
                      type="button"
                      onClick={() => {
                        setIsCustomXp(false)
                        setTaskXp(item.xp)
                      }}
                      className={`py-2 px-1.5 rounded-xl border text-center transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="font-bold text-xs">{item.label}</div>
                      <div
                        className={`text-[9px] truncate ${
                          isSelected ? 'text-indigo-100' : 'text-slate-400'
                        }`}
                      >
                        {item.desc}
                      </div>
                    </button>
                  )
                })}

                {/* Custom Option Button */}
                <button
                  type="button"
                  onClick={() => setIsCustomXp(true)}
                  className={`py-2 px-1.5 rounded-xl border text-center transition-all cursor-pointer ${
                    isCustomXp
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="font-bold text-xs">Custom</div>
                  <div
                    className={`text-[9px] truncate ${
                      isCustomXp ? 'text-indigo-100' : 'text-slate-400'
                    }`}
                  >
                    Manual
                  </div>
                </button>
              </div>

              {/* Custom XP Manual Input */}
              {isCustomXp && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60 flex items-center gap-2">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                    Set Custom XP:
                  </span>
                  <div className="relative flex-1">
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={customXpInput}
                      onChange={(e) => {
                        const val = Math.max(1, Number(e.target.value))
                        setCustomXpInput(val)
                      }}
                      className="w-full pl-3 pr-10 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-indigo-500 text-xs font-mono font-semibold text-slate-900 dark:text-white focus:outline-none"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-indigo-500 uppercase">
                      XP
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400 shrink-0">
                    = {(customXpInput / 10).toFixed(1)} pts
                  </span>
                </div>
              )}
            </div>

            {/* Task Scope Toggle: Main Project Task vs Standalone */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Percent className="w-3.5 h-3.5 text-indigo-500" />
                    Task Scope & Progress Linking
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Choose whether this task contributes directly toward project completion percentage
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsMainProjectTask(true)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${
                      isMainProjectTask
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    Main Project (Linked)
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsMainProjectTask(false)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${
                      !isMainProjectTask
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    Standalone (0%)
                  </button>
                </div>
              </div>

              {isMainProjectTask ? (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 dark:text-slate-400">
                      Project Percentage Share (% of 100%):
                    </span>
                    <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      {projectPercentage}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={Math.max(1, 100 - currentProjectPercentageAllocated)}
                    value={projectPercentage}
                    onChange={(e) => setProjectPercentage(Number(e.target.value))}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Already allocated: {currentProjectPercentageAllocated}%</span>
                    <span>Remaining capacity: {Math.max(0, 100 - currentProjectPercentageAllocated)}%</span>
                  </div>
                </div>
              ) : (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60 text-[11px] text-slate-500 italic">
                  Standalone tasks award XP and KPI upon completion as usual, but do not alter the main project completion percentage.
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setIsCreateTaskModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" type="submit">
                Create Deliverable
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Task Modal */}
      {editingTask && (
        <Modal
          isOpen={!!editingTask}
          onClose={() => setEditingTask(null)}
          title={`Edit Squad Deliverable — ${editingTask.title}`}
        >
          <form onSubmit={handleSaveEditTask} className="space-y-4 text-xs">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Task Title *
              </label>
              <input
                type="text"
                required
                value={editTaskTitle}
                onChange={(e) => setEditTaskTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Priority
              </label>
              <select
                value={editTaskPriority}
                onChange={(e) => setEditTaskPriority(e.target.value as TaskPriority)}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 cursor-pointer"
              >
                <option value="low">Low Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="high">High Priority</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            {/* Edit Task Weight & XP Yield Selector */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  Task Weight (XP Yield)
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 font-bold text-[11px] flex items-center gap-1">
                  <span>⚡</span>
                  <span>{editIsCustomXp ? editCustomXpInput : editTaskXp} XP</span>
                  <span className="text-slate-400 font-normal">
                    ({((editIsCustomXp ? editCustomXpInput : editTaskXp) / 10).toFixed(1)} pts)
                  </span>
                </span>
              </div>

              {/* 10, 30, 50, 100 & Custom Preset Pills */}
              <div className="grid grid-cols-5 gap-2">
                {[
                  { xp: 10, label: '10 XP', desc: 'Minor · 1 pt' },
                  { xp: 30, label: '30 XP', desc: 'Standard · 3 pts' },
                  { xp: 50, label: '50 XP', desc: 'Complex · 5 pts' },
                  { xp: 100, label: '100 XP', desc: 'Critical · 10 pts' },
                ].map((item) => {
                  const isSelected = !editIsCustomXp && editTaskXp === item.xp
                  return (
                    <button
                      key={item.xp}
                      type="button"
                      onClick={() => {
                        setEditIsCustomXp(false)
                        setEditTaskXp(item.xp)
                      }}
                      className={`py-2 px-1.5 rounded-xl border text-center transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="font-bold text-xs">{item.label}</div>
                      <div
                        className={`text-[9px] truncate ${
                          isSelected ? 'text-indigo-100' : 'text-slate-400'
                        }`}
                      >
                        {item.desc}
                      </div>
                    </button>
                  )
                })}

                <button
                  type="button"
                  onClick={() => setEditIsCustomXp(true)}
                  className={`py-2 px-1.5 rounded-xl border text-center transition-all cursor-pointer ${
                    editIsCustomXp
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="font-bold text-xs">Custom</div>
                  <div
                    className={`text-[9px] truncate ${
                      editIsCustomXp ? 'text-indigo-100' : 'text-slate-400'
                    }`}
                  >
                    Manual
                  </div>
                </button>
              </div>

              {editIsCustomXp && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60 flex items-center gap-2">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                    Set Custom XP:
                  </span>
                  <div className="relative flex-1">
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={editCustomXpInput}
                      onChange={(e) => {
                        const val = Math.max(1, Number(e.target.value))
                        setEditCustomXpInput(val)
                      }}
                      className="w-full pl-3 pr-10 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-indigo-500 text-xs font-mono font-semibold text-slate-900 dark:text-white focus:outline-none"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-indigo-500 uppercase">
                      XP
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400 shrink-0">
                    = {(editCustomXpInput / 10).toFixed(1)} pts
                  </span>
                </div>
              )}
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Project Link Type
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditIsMainProjectTask(true)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                      editIsMainProjectTask
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    Main Project % Share
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditIsMainProjectTask(false)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                      !editIsMainProjectTask
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    Standalone (0%)
                  </button>
                </div>
              </div>

              {editIsMainProjectTask && (() => {
                const otherTasksTotal = data.tasks
                  .filter(
                    (t) =>
                      t.projectId === editingTask.projectId &&
                      t.isMainProjectTask &&
                      t.id !== editingTask.id,
                  )
                  .reduce((sum, t) => sum + (Number(t.projectPercentage) || 0), 0)
                const maxAvailable = Math.max(1, 100 - otherTasksTotal)

                return (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 dark:text-slate-400">
                        Project Percentage Share (% of 100%):
                      </span>
                      <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        {editProjectPercentage}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={maxAvailable}
                      value={Math.min(editProjectPercentage, maxAvailable)}
                      onChange={(e) => setEditProjectPercentage(Number(e.target.value))}
                      className="w-full accent-indigo-600 cursor-pointer"
                    />
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>Already allocated: {otherTasksTotal}%</span>
                      <span>Remaining capacity: {100 - otherTasksTotal}%</span>
                    </div>
                  </div>
                )
              })()}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" type="button" onClick={() => setEditingTask(null)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white">
                Save Task Changes
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* KPI Evaluation Modal */}
      {scoringTask && (
        <Modal
          isOpen={!!scoringTask}
          onClose={() => setScoringTask(null)}
          title="Evaluate Deliverable & Score KPI"
        >
          <form onSubmit={handleSaveKpiScore} className="space-y-4 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-1">
              <div className="font-semibold text-slate-900 dark:text-white">
                {scoringTask.title}
              </div>
              <div className="text-[11px] text-slate-400">
                Weight: {scoringTask.weightPoints || 2} pts • Assignee:{' '}
                {data.users.find((u) => u.id === scoringTask.assigneeId)?.name || 'Unknown'}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  KPI Score (0–100) *
                </label>
                <span className="font-mono font-bold text-amber-500 text-sm">{kpiScore}/100</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={kpiScore}
                onChange={(e) => setKpiScore(Number(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Evaluation Notes / Feedback *
              </label>
              <textarea
                required
                rows={3}
                value={kpiReason}
                onChange={(e) => setKpiReason(e.target.value)}
                placeholder="Explain the score based on delivery speed, code quality, and test coverage..."
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-500 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setScoringTask(null)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" type="submit" className="bg-amber-600 hover:bg-amber-700 text-white">
                Record KPI Score
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {/* Add Squad Resource Modal */}
      {isAddResourceModalOpen && (
        <Modal
          isOpen={isAddResourceModalOpen}
          onClose={() => setIsAddResourceModalOpen(false)}
          title={`Add Squad Resource — ${activeSquad?.name || 'Squad'}`}
        >
          <form onSubmit={handleSaveResource} className="space-y-4 text-xs">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Resource Link (URL) *
              </label>
              <input
                type="url"
                required
                value={resourceLink}
                onChange={(e) => setResourceLink(e.target.value)}
                placeholder="https://github.com/... or https://figma.com/..."
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-400"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Description / Purpose *
              </label>
              <textarea
                required
                rows={3}
                value={resourceDescription}
                onChange={(e) => setResourceDescription(e.target.value)}
                placeholder="Explain what this link is for (e.g. Squad API specs, sprint repository, UI mockups)..."
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-400 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setIsAddResourceModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={isSavingResource}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {isSavingResource ? 'Saving...' : 'Add Resource'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {/* PM Mandatory Satisfaction Score Modal upon Drag-to-Completed */}
      {completingTask && (
        <Modal
          isOpen={!!completingTask}
          onClose={() => setCompletingTask(null)}
          title={`Deliverable Sign-Off — ${completingTask.title}`}
        >
          <form onSubmit={handleConfirmCompletion} className="space-y-4 text-xs">
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-800 dark:text-emerald-300">
              <div className="font-bold flex items-center gap-1.5 mb-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>Mandatory PM Satisfaction Score</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300">
                Sign off on deliverable completion and record the PM satisfaction score (1–100) to credit the developer's KPI and XP.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  PM Satisfaction Score (1–100) *
                </label>
                <span className="font-mono font-bold text-amber-500 text-sm">{pmScore}/100</span>
              </div>
              <input
                type="range"
                min={1}
                max={100}
                value={pmScore}
                onChange={(e) => setPmScore(Number(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Review Comments / Acceptance Notes
              </label>
              <textarea
                rows={3}
                value={pmScoreFeedback}
                onChange={(e) => setPmScoreFeedback(e.target.value)}
                placeholder="Optional sign-off notes on code quality, speed, and sprint impact..."
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-500 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <Button variant="ghost" size="sm" type="button" onClick={() => setCompletingTask(null)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                Confirm &amp; Complete
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* PM Mandatory Cancellation Reason Modal upon Drag-to-Cancelled */}
      {cancellingTask && (
        <Modal
          isOpen={!!cancellingTask}
          onClose={() => setCancellingTask(null)}
          title={`Cancel Deliverable — ${cancellingTask.title}`}
        >
          <form onSubmit={handleConfirmCancel} className="space-y-4 text-xs">
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-800 dark:text-rose-300">
              <div className="font-bold flex items-center gap-1.5 mb-1">
                <span>Mandatory Cancellation Justification</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300">
                Provide a mandatory reason for cancelling this deliverable. This action will be recorded in the squad activity log.
              </p>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Cancellation Reason *
              </label>
              <textarea
                required
                rows={3}
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                placeholder="Explain why this deliverable is being cancelled (e.g. Deprecated requirements, duplicate task, shifted priority)..."
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-rose-500 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <Button variant="ghost" size="sm" type="button" onClick={() => setCancellingTask(null)}>
                Keep Deliverable
              </Button>
              <Button variant="primary" size="sm" type="submit" className="bg-rose-600 hover:bg-rose-700 text-white">
                Confirm Cancellation
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
