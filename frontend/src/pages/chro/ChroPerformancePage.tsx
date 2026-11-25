import { useState, useMemo, useEffect, useCallback } from 'react'
import type React from 'react'
import {
  Search,
  CheckCircle2,
  Clock,
  UserCheck,
  ShieldAlert,
  Heart,
  TrendingUp,
  ChevronRight,
  Scale,
  AlertCircle,
  Settings,
  Calendar,
  Sliders,
  ArrowLeft,
  Plus,
  Award,
} from 'lucide-react'
import { erpApi } from '../../api/client'
import { useExecutiveData } from '../../hooks/useExecutiveData'
import { useApp } from '../../context/AppContext'
import { Modal } from '../../components/common/Modal'
import { Button } from '../../components/common/Button'
import { Avatar } from '../../components/common/Avatar'
import { MfaConfirmModal } from '../../components/common/MfaConfirmModal'

export function ChroPerformancePage() {
  const {
    hrStats,
    performanceRecords,
    developers,
    projectManagers,
    teams,
    projects,
    confidentialComplaints,
  } = useExecutiveData()

  const {
    data,
    recordPerformanceEvaluation,
    issueEmployeeRecognition,
    issueDisciplinaryAction,
    updateConfidentialComplaintStatus,
    showToast,
    setSelectedProfileUser,
  } = useApp()

  // Tab State
  const [activeTab, setActiveTab] = useState<
    'roster' | 'squads' | 'grievances' | 'weight_queue' | 'disciplinary' | 'config' | 'backfill_windows'
  >('roster')

  // ponytail: Squad drill-down & C-level task grading / direct assignment state
  const [selectedSquad, setSelectedSquad] = useState<any | null>(null)
  const [squadTasks, setSquadTasks] = useState<any[]>([])
  const [loadingSquadTasks, setLoadingSquadTasks] = useState(false)
  const [squadTaskFilter, setSquadTaskFilter] = useState<string>('all')
  const [squadTaskSearch, setSquadTaskSearch] = useState<string>('')

  // C-Level direct grading modal
  const [scoringTask, setScoringTask] = useState<any | null>(null)
  const [execScoreInput, setExecScoreInput] = useState<number>(90)
  const [execScoreReason, setExecScoreReason] = useState<string>('')
  const [submittingExecScore, setSubmittingExecScore] = useState(false)

  // C-Level direct task assignment modal
  const [isDirectTaskModalOpen, setIsDirectTaskModalOpen] = useState(false)
  const [directTaskTitle, setDirectTaskTitle] = useState('')
  const [directTaskDesc, setDirectTaskDesc] = useState('')
  const [directTaskAssignee, setDirectTaskAssignee] = useState('')
  const [directTaskProject, setDirectTaskProject] = useState('')
  const [directTaskWeightCat, setDirectTaskWeightCat] = useState<'SMALL' | 'MEDIUM' | 'LARGE' | 'CRITICAL' | 'CUSTOM'>('MEDIUM')
  const [directTaskWeightPoints, setDirectTaskWeightPoints] = useState<number>(3)
  const [directTaskCompletedImmediately, setDirectTaskCompletedImmediately] = useState(true)
  const [directTaskScore, setDirectTaskScore] = useState<number>(92)
  const [submittingDirectTask, setSubmittingDirectTask] = useState(false)

  // ponytail: CHRO Task Weight Modification State
  const [editingWeightTask, setEditingWeightTask] = useState<any | null>(null)
  const [editWeightCategory, setEditWeightCategory] = useState<'SMALL' | 'MEDIUM' | 'LARGE' | 'CRITICAL' | 'CUSTOM'>('MEDIUM')
  const [editWeightPoints, setEditWeightPoints] = useState<number>(3)
  const [editWeightReason, setEditWeightReason] = useState<string>('')
  const [submittingWeightChange, setSubmittingWeightChange] = useState<boolean>(false)

  // ponytail: Auto-populate default selection for C-level direct task creation
  useEffect(() => {
    if (!directTaskAssignee && developers.length > 0) {
      const squadDevs = developers.filter((d: any) => !selectedSquad || d.teamId === selectedSquad.id)
      const match = squadDevs.length > 0 ? squadDevs : developers
      setDirectTaskAssignee(match[0]?.id || '')
    }
  }, [developers, selectedSquad, directTaskAssignee])

  useEffect(() => {
    if (!directTaskProject && projects.length > 0) {
      setDirectTaskProject(projects[0].id)
    }
  }, [projects, directTaskProject])


  // Search and Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'developer' | 'pm'>('all')
  const [tierFilter, setTierFilter] = useState<string>('all')

  // Disciplinary Deductions & Reversals State
  const [isDeductionModalOpen, setIsDeductionModalOpen] = useState(false)
  const [deductionUserId, setDeductionUserId] = useState('')
  const [deductionPoints, setDeductionPoints] = useState(10)
  const [deductionReason, setDeductionReason] = useState('')
  const [deductionRefDoc, setDeductionRefDoc] = useState('')
  const [deductionWeekStart, setDeductionWeekStart] = useState(
    new Date().toISOString().split('T')[0],
  )
  const [reversingDeduction, setReversingDeduction] = useState<any>(null)
  const [reversalReason, setReversalReason] = useState('')

  // Config State
  const [kpiConfig, setKpiConfig] = useState<any>(null)
  const [weightConfigs, setWeightConfigs] = useState<any[]>([])
  const [_loadingConfig, setLoadingConfig] = useState(false)
  const [isConfigMfaOpen, setIsConfigMfaOpen] = useState(false)

  // Backfill Windows State
  const [backfillWindows, setBackfillWindows] = useState<any[]>([])
  const [_loadingWindows, setLoadingWindows] = useState(false)
  const [isCreateWindowModalOpen, setIsCreateWindowModalOpen] = useState(false)
  const [newWindowStartsAt, setNewWindowStartsAt] = useState(new Date().toISOString().split('T')[0])
  const [newWindowEndsAt, setNewWindowEndsAt] = useState('2026-11-19T23:59:59')
  const [newWindowRole, setNewWindowRole] = useState('pm')
  const [newWindowReason, setNewWindowReason] = useState('')
  const [windowToClose, setWindowToClose] = useState<any>(null)

  // Disciplinary & Backfill MFA Type
  const [mfaActionType, setMfaActionType] = useState<'APPLY_DEDUCTION' | 'CREATE_WINDOW' | null>(null)

  // Batch Weight Verification MFA
  const [isBatchApproveMfaOpen, setIsBatchApproveMfaOpen] = useState(false)
  const [rejectingWeightItem, setRejectingWeightItem] = useState<any>(null)
  const [rejectWeightReason, setRejectWeightReason] = useState('')

  // Modals
  const [selectedStaffEval, setSelectedStaffEval] = useState<any>(null)
  const [evalScoreInput, setEvalScoreInput] = useState<number>(92)
  const [evalTierInput, setEvalTierInput] = useState<string>('top_performer')
  const [evalNotesInput, setEvalNotesInput] = useState('')
  const [evalStrengthsInput, setEvalStrengthsInput] = useState('High velocity, team player')
  const [evalImprovementsInput, setEvalImprovementsInput] = useState(
    'Cross-squad architecture sharing',
  )

  const [selectedStaffAction, setSelectedStaffAction] = useState<any>(null)
  const [actionCategory, setActionCategory] = useState<'recognition' | 'disciplinary'>(
    'recognition',
  )
  const [actionTitleInput, setActionTitleInput] = useState('')
  const [actionDescInput, setActionDescInput] = useState('')
  const [actionXpAwardInput, setActionXpAwardInput] = useState<number>(25)
  const [actionKpiDeductionInput, setActionKpiDeductionInput] = useState<number>(0)

  const [selectedComplaint, setSelectedComplaint] = useState<any>(null)
  const [complaintStatusInput, setComplaintStatusInput] = useState<string>('investigating')
  const [complaintMediationInput, setComplaintMediationInput] = useState('')

  // Task Weight Verification Gate State
  const [weightQueue, setWeightQueue] = useState<any[]>([])
  const [loadingWeightQueue, setLoadingWeightQueue] = useState(false)
  const [selectedWeightItem, setSelectedWeightItem] = useState<any>(null)
  const [approvedWeightInput, setApprovedWeightInput] = useState<number>(3)
  const [weightNotesInput, setWeightNotesInput] = useState('')
  const [verifyingWeight, setVerifyingWeight] = useState(false)

  const fetchWeightQueue = useCallback(async () => {
    setLoadingWeightQueue(true)
    try {
      const queue = await erpApi.getChroWeightQueue()
      if (Array.isArray(queue)) setWeightQueue(queue)
    } catch {
      // ignore
    } finally {
      setLoadingWeightQueue(false)
    }
  }, [])

  const fetchConfig = useCallback(async () => {
    setLoadingConfig(true)
    try {
      const cfg = await erpApi.getPerformanceConfig()
      if (cfg) {
        setKpiConfig(cfg.kpiConfig)
        setWeightConfigs(cfg.weightConfigs || [])
      }
    } catch {
      // ignore
    } finally {
      setLoadingConfig(false)
    }
  }, [])

  const fetchBackfillWindows = useCallback(async () => {
    setLoadingWindows(true)
    try {
      const wins = await erpApi.getBackfillWindows()
      if (Array.isArray(wins)) setBackfillWindows(wins)
    } catch {
      // ignore
    } finally {
      setLoadingWindows(false)
    }
  }, [])

  // ponytail: Load squad tasks from backend with local fallback
  const loadSquadTasks = useCallback(
    async (team: any) => {
      setSelectedSquad(team)
      setLoadingSquadTasks(true)
      try {
        const res = await erpApi.getTasksByTeam(team.id)
        if (Array.isArray(res) && res.length > 0) {
          setSquadTasks(res)
        } else {
          const teamDevIds = developers.filter((d: any) => d.teamId === team.id).map((d: any) => d.id)
          const teamProjIds = (team.projectIds || []).concat(team.projects?.map((p: any) => p.id) || [])
          const matched = data.tasks.filter(
            (t: any) =>
              t.teamId === team.id ||
              teamDevIds.includes(t.assigneeId) ||
              teamProjIds.includes(t.projectId),
          )
          setSquadTasks(matched)
        }
      } catch {
        const teamDevIds = developers.filter((d: any) => d.teamId === team.id).map((d: any) => d.id)
        const matched = data.tasks.filter((t: any) => teamDevIds.includes(t.assigneeId))
        setSquadTasks(matched)
      } finally {
        setLoadingSquadTasks(false)
      }
    },
    [developers, data.tasks],
  )

  // ponytail: Open global rich staff profile modal (KPI, deliverables, who marked what, review comments)
  const handleOpenEmployeeProfile = useCallback((emp: any) => {
    setSelectedProfileUser(emp)
  }, [setSelectedProfileUser])

  // ponytail: C-level direct task grading
  const handleAssignExecScore = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!scoringTask) return
    setSubmittingExecScore(true)
    try {
      await erpApi.scoreTaskExec(scoringTask.id, {
        score: execScoreInput,
        reason: execScoreReason.trim() || 'C-Level executive score assignment',
      })
      showToast(
        `Assigned ${execScoreInput}/100 to "${scoringTask.title}". Assignee KPI updated.`,
        'success',
      )
      setScoringTask(null)
      setExecScoreReason('')
      if (selectedSquad) {
        void loadSquadTasks(selectedSquad)
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to assign score', 'error')
    } finally {
      setSubmittingExecScore(false)
    }
  }

  // ponytail: C-level direct task creation & assignment with immediate completion option
  const handleCreateDirectTask = async (e: React.FormEvent) => {
    e.preventDefault()
    const targetAssignee =
      directTaskAssignee ||
      (developers.filter((d: any) => !selectedSquad || d.teamId === selectedSquad.id)[0]?.id ||
        developers[0]?.id)
    const targetProj = directTaskProject || projects[0]?.id

    if (!directTaskTitle.trim() || !targetAssignee || !targetProj) {
      showToast('Please fill in task title, assignee, and project.', 'error')
      return
    }
    setSubmittingDirectTask(true)
    try {
      const pts = Number(directTaskWeightPoints)
      const cat =
        directTaskWeightCat !== 'CUSTOM' && ({ 1: 'SMALL', 3: 'MEDIUM', 5: 'LARGE', 7: 'CRITICAL' } as const)[pts]
          ? ({ 1: 'SMALL', 3: 'MEDIUM', 5: 'LARGE', 7: 'CRITICAL' } as const)[pts]!
          : 'CUSTOM'

      await erpApi.createTask({
        title: directTaskTitle.trim(),
        description: directTaskDesc.trim(),
        assigneeId: targetAssignee,
        projectId: targetProj,
        weightCategory: cat,
        proposedWeight: pts,
        initialStatus: directTaskCompletedImmediately ? 'completed' : 'todo',
        initialScore: directTaskCompletedImmediately ? directTaskScore : undefined,
      })

      showToast(
        directTaskCompletedImmediately
          ? `Direct task created with ${pts} pts (${cat}) & completed with score ${directTaskScore}/100!`
          : `Direct task created with ${pts} pts (${cat}) & assigned successfully!`,
        'success',
      )

      setIsDirectTaskModalOpen(false)
      setDirectTaskTitle('')
      setDirectTaskDesc('')
      if (selectedSquad) {
        void loadSquadTasks(selectedSquad)
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to create direct task', 'error')
    } finally {
      setSubmittingDirectTask(false)
    }
  }

  // ponytail: CHRO direct task weight modification handler
  const handleSaveWeightChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingWeightTask) return
    setSubmittingWeightChange(true)
    try {
      const pts = Number(editWeightPoints)
      if (isNaN(pts) || pts <= 0) {
        showToast('Weight points must be a valid positive number', 'error')
        setSubmittingWeightChange(false)
        return
      }

      const cat =
        editWeightCategory !== 'CUSTOM' && ({ 1: 'SMALL', 3: 'MEDIUM', 5: 'LARGE', 7: 'CRITICAL' } as const)[pts]
          ? ({ 1: 'SMALL', 3: 'MEDIUM', 5: 'LARGE', 7: 'CRITICAL' } as const)[pts]!
          : 'CUSTOM'

      await erpApi.changeTaskWeight(editingWeightTask.id, {
        weightPoints: pts,
        weightCategory: cat,
        reason: editWeightReason.trim() || 'Direct CHRO weight change',
      })

      showToast(`Task weight updated to ${pts} pts (${cat}) successfully!`, 'success')
      setEditingWeightTask(null)

      if (selectedSquad) {
        void loadSquadTasks(selectedSquad)
      }
      void fetchWeightQueue()
    } catch (err: any) {
      showToast(err.message || 'Failed to update task weight', 'error')
    } finally {
      setSubmittingWeightChange(false)
    }
  }

  useEffect(() => {
    void fetchWeightQueue()
    void fetchConfig()
    void fetchBackfillWindows()
  }, [fetchWeightQueue, fetchConfig, fetchBackfillWindows])

  const handleApplyDisciplinary = async (mfaCode: string) => {
    if (!deductionUserId || !deductionReason.trim() || !deductionRefDoc.trim()) {
      showToast('All fields including legal document reference are mandatory.', 'error')
      return
    }

    try {
      await erpApi.createDisciplinaryDeduction(
        {
          userId: deductionUserId,
          points: Number(deductionPoints),
          reason: deductionReason.trim(),
          referenceDocId: deductionRefDoc.trim(),
          targetWeekStart: deductionWeekStart,
        },
        mfaCode,
      )
      showToast('Disciplinary deduction applied successfully with legal reference.', 'success')
      setIsDeductionModalOpen(false)
      setDeductionReason('')
      setDeductionRefDoc('')
    } catch (err: any) {
      showToast(err.message || 'Failed to apply disciplinary deduction', 'error')
    }
  }

  const handleReverseDisciplinary = async (mfaCode: string) => {
    if (!reversingDeduction || !reversalReason.trim()) {
      showToast('Reversal justification is required.', 'error')
      return
    }

    try {
      await erpApi.reverseDisciplinaryDeduction(
        reversingDeduction.id,
        { reason: reversalReason.trim() },
        mfaCode,
      )
      showToast('Disciplinary action reversed and compensating ledger entry posted.', 'success')
      setReversingDeduction(null)
      setReversalReason('')
    } catch (err: any) {
      showToast(err.message || 'Failed to reverse disciplinary deduction', 'error')
    }
  }

  const handleSaveConfig = async (mfaCode: string) => {
    try {
      await erpApi.updatePerformanceConfig(
        {
          kpiConfig,
          weightConfigs,
        },
        mfaCode,
      )
      showToast('Updated KPI & Task Weight configuration successfully.', 'success')
      setIsConfigMfaOpen(false)
      void fetchConfig()
    } catch (err: any) {
      showToast(err.message || 'Failed to update configuration', 'error')
    }
  }

  const handleCreateBackfillWindow = async (mfaCode: string) => {
    if (!newWindowStartsAt || !newWindowEndsAt || !newWindowReason.trim()) {
      showToast('Window schedule dates and reason are mandatory.', 'error')
      return
    }

    try {
      await erpApi.createBackfillWindow(
        {
          startsAt: newWindowStartsAt,
          endsAt: newWindowEndsAt,
          grantedRole: newWindowRole,
          reason: newWindowReason.trim(),
        },
        mfaCode,
      )
      showToast('Backfill window opened successfully.', 'success')
      setIsCreateWindowModalOpen(false)
      setNewWindowReason('')
      void fetchBackfillWindows()
    } catch (err: any) {
      showToast(err.message || 'Failed to create backfill window', 'error')
    }
  }

  const handleCloseBackfillWindow = async (mfaCode: string) => {
    if (!windowToClose) return
    try {
      await erpApi.updateBackfillWindow(
        windowToClose.id,
        { isActive: false, reason: 'CHRO closed backfill window' },
        mfaCode,
      )
      showToast('Backfill window closed and locked.', 'success')
      setWindowToClose(null)
      void fetchBackfillWindows()
    } catch (err: any) {
      showToast(err.message || 'Failed to close window', 'error')
    }
  }

  const handleBatchApproveWeights = async (_mfaCode: string) => {
    const pending = weightQueue.filter((w) => w.status === 'PENDING_CHRO')
    let approvedCount = 0
    for (const item of pending) {
      try {
        await erpApi.verifyTaskWeight(item.id, {
          approvedWeight: Number(item.proposedWeight),
          notes: 'Batch approved by CHRO with MFA verification',
        })
        approvedCount++
      } catch {
        // ignore partial failure
      }
    }
    showToast(`Batch approved ${approvedCount} deliverables.`, 'success')
    setIsBatchApproveMfaOpen(false)
    void fetchWeightQueue()
  }

  const handleRejectWeight = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!rejectingWeightItem || !rejectWeightReason.trim()) return

    try {
      await erpApi.verifyTaskWeight(rejectingWeightItem.id, {
        approvedWeight: 0,
        notes: `REJECTED by CHRO: ${rejectWeightReason.trim()}`,
      })
      showToast('Task weight rejected and returned to PM.', 'success')
      setRejectingWeightItem(null)
      setRejectWeightReason('')
      void fetchWeightQueue()
    } catch (err: any) {
      showToast(err.message || 'Failed to reject weight', 'error')
    }
  }

  const handleVerifyWeight = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedWeightItem) return
    setVerifyingWeight(true)
    try {
      await erpApi.verifyTaskWeight(selectedWeightItem.id, {
        approvedWeight: Number(approvedWeightInput),
        notes: weightNotesInput,
      })
      showToast('Task weight verified and locked successfully.', 'success')
      setSelectedWeightItem(null)
      void fetchWeightQueue()
    } catch (err: any) {
      showToast(err?.message || 'Failed to verify weight.', 'error')
    } finally {
      setVerifyingWeight(false)
    }
  }

  const handleQuickApproveWeight = async (item: any) => {
    try {
      await erpApi.verifyTaskWeight(item.id, {
        approvedWeight: Number(item.proposedWeight),
        notes: 'CHRO verified proposed weight directly',
      })
      showToast(`Weight ${item.proposedWeight} approved for ${item.task?.title || 'task'}.`, 'success')
      void fetchWeightQueue()
    } catch (err: any) {
      showToast(err?.message || 'Failed to approve weight.', 'error')
    }
  }

  const handleConsensusVote = async (verificationId: string, decision: 'APPROVE' | 'REJECT') => {
    try {
      await erpApi.castConsensusVote(verificationId, {
        decision,
        notes: 'C-Level consensus vote cast via HR portal',
      })
      showToast(`Consensus vote (${decision}) recorded.`, 'success')
      void fetchWeightQueue()
    } catch (err: any) {
      showToast(err?.message || 'Failed to record consensus vote.', 'error')
    }
  }

  // Combined staff roster with performance details
  const staffRoster = useMemo(() => {
    const all = [...projectManagers, ...developers].filter(
      (u) => !u.isSuspended && (!u.email || u.email.endsWith('@seu.edu.bd')),
    )
    return all.map((user) => {
      const perf = performanceRecords.find((r) => r.userId === user.id || r.developerId === user.id)
      const userTeam = teams.find((t) => t.id === user.teamId)
      return {
        user,
        perf: perf || {
          userId: user.id,
          developerId: user.id,
          overallScore: 0,
          deliverySpeed: 0,
          codeQuality: 0,
          reliability: 0,
          collaboration: 0,
          attendanceRate: 0,
          satisfactionIndex: 0,
          performanceTier: 'strong_contributor' as const,
          evaluationNotes: 'Pending initial quarterly evaluation.',
          lastEvaluationDate: new Date().toISOString().split('T')[0],
          strengths: [],
          improvements: [],
        },
        team: userTeam,
      }
    })
  }, [projectManagers, developers, performanceRecords, teams])

  // Filtered staff roster
  const filteredRoster = useMemo(() => {
    return staffRoster.filter(({ user, perf }) => {
      if (roleFilter !== 'all' && user.role !== roleFilter) return false
      if (tierFilter !== 'all' && perf.performanceTier !== tierFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        return (
          user.name.toLowerCase().includes(q) ||
          user.title.toLowerCase().includes(q) ||
          user.email.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [staffRoster, roleFilter, tierFilter, searchQuery])

  // Open Evaluation Modal
  const handleOpenEvaluation = (staffItem: any) => {
    setSelectedStaffEval(staffItem)
    setEvalScoreInput(staffItem.perf.overallScore)
    setEvalTierInput(staffItem.perf.performanceTier || 'strong_contributor')
    setEvalNotesInput(staffItem.perf.evaluationNotes || '')
    setEvalStrengthsInput(staffItem.perf.strengths?.join(', ') || 'High velocity, team player')
    setEvalImprovementsInput(staffItem.perf.improvements?.join(', ') || 'Cross-squad documentation')
  }

  const handleSaveEvaluation = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedStaffEval) return
    recordPerformanceEvaluation(selectedStaffEval.user.id, {
      score: Number(evalScoreInput),
      tier: evalTierInput,
      notes: evalNotesInput,
      strengths: evalStrengthsInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      improvementAreas: evalImprovementsInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    })
    setSelectedStaffEval(null)
  }

  // Open Action Modal (Recognition / Disciplinary)
  const handleOpenAction = (staffItem: any, initialType: 'recognition' | 'disciplinary') => {
    setSelectedStaffAction(staffItem)
    setActionCategory(initialType)
    setActionTitleInput(
      initialType === 'recognition'
        ? 'Excellence in Sprint Execution'
        : 'Notice of Code Review SLA Breach',
    )
    setActionDescInput(
      initialType === 'recognition'
        ? 'Consistently delivered flawless milestones with exceptional proactive collaboration.'
        : 'Repeated delays exceeding the 48-hour SLA for mandatory PR reviews.',
    )
    setActionXpAwardInput(initialType === 'recognition' ? 25 : 0)
    setActionKpiDeductionInput(initialType === 'disciplinary' ? 5 : 0)
  }

  const handleSaveAction = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedStaffAction) return
    if (actionCategory === 'recognition') {
      issueEmployeeRecognition(
        selectedStaffAction.user.id,
        actionTitleInput,
        actionDescInput,
      )
      if (actionXpAwardInput > 0) {
        void erpApi
          .overridePerformanceRecord({
            targetEmployeeId: selectedStaffAction.user.id,
            metricType: 'XP',
            deltaXp: actionXpAwardInput,
            reason: `Recognition Award: ${actionTitleInput}`,
          })
          .then(() => {
            showToast(`Awarded ${actionXpAwardInput} XP to ${selectedStaffAction.user.name}.`, 'success')
          })
          .catch((err: any) => {
            showToast(err?.message || 'Failed to append XP ledger entry', 'error')
          })
      }
    } else {
      issueDisciplinaryAction(
        selectedStaffAction.user.id,
        actionTitleInput,
        actionDescInput,
      )
      if (actionKpiDeductionInput > 0) {
        void erpApi
          .applyDisciplinaryDeduction({
            employeeId: selectedStaffAction.user.id,
            deductionPoints: Number(actionKpiDeductionInput),
            reason: `${actionTitleInput}: ${actionDescInput}`,
          })
          .then(() => {
            showToast(`Deducted ${actionKpiDeductionInput} KPI points with cryptographic audit trail.`, 'info')
          })
          .catch((err) => {
            showToast(err?.message || 'Failed to deduct KPI points', 'error')
          })
      }
    }
    setSelectedStaffAction(null)
  }

  // Open Adjudicate Grievance Modal
  const handleOpenGrievance = (complaint: any) => {
    setSelectedComplaint(complaint)
    setComplaintStatusInput(complaint.status || 'investigating')
    setComplaintMediationInput(complaint.mediationNotes || '')
  }

  const handleSaveGrievance = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedComplaint) return
    updateConfidentialComplaintStatus(
      selectedComplaint.id,
      complaintStatusInput,
      complaintMediationInput,
    )
    setSelectedComplaint(null)
  }

  return (
    <div className="space-y-6">
      {/* Top HR Health Scorecards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Performance Score */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Avg Performance
            </span>
            <div className="w-8 h-8 rounded-xl bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {hrStats.avgPerformanceScore}%
          </div>
          <p className="text-[11px] text-sky-600 dark:text-sky-400 mt-1 font-medium">
            30 Monitored Staff
          </p>
        </div>

        {/* Attendance Rate */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Attendance Rate
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {hrStats.avgAttendanceRate}%
          </div>
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 font-medium">
            Daily Standup Compliance
          </p>
        </div>

        {/* Squad Morale Index */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Squad Morale
            </span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <Heart className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">
            {hrStats.avgSatisfactionIndex} / 5.0
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Pulse Survey Health</p>
        </div>

        {/* On-Time Delivery */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              On-Time Delivery
            </span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
            {hrStats.onTimeDeliveryRate}%
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Sprint Milestone Cadence
          </p>
        </div>

        {/* Confidential Grievances */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Confidential Desk
            </span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {confidentialComplaints.length}
          </div>
          <p className="text-[11px] text-purple-600 dark:text-purple-400 mt-1 font-medium">
            CHRO / CEO Restricted
          </p>
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
        {/* Navigation Tabs */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-4 mb-6">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 w-full sm:w-auto">
            <button
              onClick={() => setActiveTab('roster')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'roster'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              Staff Evaluations Roster ({staffRoster.length})
            </button>
            <button
              onClick={() => setActiveTab('squads')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'squads'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              Squad Dynamics & Morale ({teams.length})
            </button>
            <button
              onClick={() => setActiveTab('grievances')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'grievances'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              Confidential Grievance Desk
              {confidentialComplaints.length > 0 && (
                <span className="w-5 h-5 rounded-full bg-purple-600 text-white text-[11px] font-bold flex items-center justify-center">
                  {confidentialComplaints.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('weight_queue')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'weight_queue'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              <Scale className="w-4 h-4 text-amber-500" />
              Weight Queue
              {weightQueue.length > 0 && (
                <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[11px] font-bold flex items-center justify-center">
                  {weightQueue.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('disciplinary')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'disciplinary'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              <ShieldAlert className="w-4 h-4 text-rose-500" />
              Disciplinary &amp; Reversals
            </button>
            <button
              onClick={() => setActiveTab('config')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'config'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              <Settings className="w-4 h-4 text-indigo-500" />
              KPI &amp; Weight Config
            </button>
            <button
              onClick={() => setActiveTab('backfill_windows')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'backfill_windows'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              <Calendar className="w-4 h-4 text-emerald-500" />
              Review Windows
            </button>
          </div>
        </div>

        {/* TAB 1: EVALUATIONS ROSTER */}
        {activeTab === 'roster' && (
          <div className="space-y-4">
            {/* Filter controls */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search employee by name, title..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value as any)}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer"
                >
                  <option value="all">All Roles</option>
                  <option value="developer">Developers (24)</option>
                  <option value="pm">Project Managers (6)</option>
                </select>
                <select
                  value={tierFilter}
                  onChange={(e) => setTierFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer"
                >
                  <option value="all">All Tiers</option>
                  <option value="top_performer">Top Performers</option>
                  <option value="strong_contributor">Strong Contributors</option>
                  <option value="needs_support">Needs Support</option>
                </select>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  variant="primary"
                  size="sm"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
                  icon={Plus}
                  onClick={() => {
                    if (!directTaskAssignee) setDirectTaskAssignee(developers[0]?.id || '')
                    if (!directTaskProject && projects.length > 0) setDirectTaskProject(projects[0].id)
                    setIsDirectTaskModalOpen(true)
                  }}
                >
                  Assign Direct Task (C-Level)
                </Button>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Showing{' '}
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {filteredRoster.length}
                  </span>{' '}
                  staff members
                </div>
              </div>
            </div>

            {/* Roster Table */}
            <div className="overflow-x-auto border border-slate-200/80 dark:border-slate-800 rounded-xl">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/40 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200/80 dark:border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4">Staff Member</th>
                    <th className="py-3.5 px-4">Squad</th>
                    <th className="py-3.5 px-4">Score</th>
                    <th className="py-3.5 px-4">Speed / Quality</th>
                    <th className="py-3.5 px-4">Attendance</th>
                    <th className="py-3.5 px-4">Morale</th>
                    <th className="py-3.5 px-4">Tier Status</th>
                    <th className="py-3.5 px-4 text-right">HR Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredRoster.map(({ user, perf, team }) => (
                    <tr
                      key={user.id}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors"
                    >
                      <td className="py-3.5 px-4">
                        <div
                          className="flex items-center gap-3 cursor-pointer group"
                          onClick={() => handleOpenEmployeeProfile(user)}
                          title="Click to view full performance profile and deliverables"
                        >
                          <Avatar
                            src={user.avatarUrl || user.avatar}
                            name={user.name}
                            initials={user.initials}
                            size="md"
                            className="border border-slate-200 dark:border-slate-700 group-hover:ring-2 group-hover:ring-indigo-500/50 transition-all"
                          />
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                              {user.name}
                              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                {user.role}
                              </span>
                            </div>
                            <div className="text-xs text-slate-400">{user.title}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="text-slate-800 dark:text-slate-200 font-medium">
                          {team?.name || 'Assigned Squad'}
                        </div>
                        <div className="text-xs text-slate-400 font-mono">
                          {team?.code || 'SQ-01'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-bold ${
                            perf.overallScore >= 92
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                              : perf.overallScore >= 80
                                ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400'
                                : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
                          }`}
                        >
                          {perf.overallScore}%
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-300">
                        <div>
                          Speed: <span className="font-semibold">{perf.deliverySpeed}%</span>
                        </div>
                        <div>
                          Quality: <span className="font-semibold">{perf.codeQuality}%</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-800 dark:text-slate-200">
                        {perf.attendanceRate || 96}%
                      </td>
                      <td className="py-3.5 px-4 font-medium text-rose-600 dark:text-rose-400">
                        {perf.satisfactionIndex || 4.7} / 5.0
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                            perf.performanceTier === 'top_performer'
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                              : perf.performanceTier === 'needs_support'
                                ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-800'
                                : 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400 border border-sky-200 dark:border-sky-800'
                          }`}
                        >
                          {(perf.performanceTier || 'strong_contributor').replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            className="text-indigo-600 dark:text-indigo-400 font-medium"
                            onClick={() => handleOpenEmployeeProfile(user)}
                          >
                            Profile
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleOpenEvaluation({ user, perf, team })}
                          >
                            Evaluate
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                            onClick={() => handleOpenAction({ user, perf, team }, 'recognition')}
                          >
                            Award
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-rose-600 hover:text-rose-700 dark:text-rose-400"
                            onClick={() => handleOpenAction({ user, perf, team }, 'disciplinary')}
                          >
                            Discipline
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredRoster.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-xs text-slate-400">
                        No personnel performance records match the current filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: SQUAD MORALE & ATTENDANCE MATRIX */}
        {activeTab === 'squads' && !selectedSquad && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {teams.map((team) => {
              const squadDevs = staffRoster.filter(
                (s) => s.user.teamId === team.id && s.user.role === 'developer',
              )
              const avgScore =
                squadDevs.length > 0
                  ? Math.round(
                      squadDevs.reduce((sum, s) => sum + s.perf.overallScore, 0) / squadDevs.length,
                    )
                  : 90
              const avgAttendance =
                squadDevs.length > 0
                  ? Math.round(
                      squadDevs.reduce((sum, s) => sum + (s.perf.attendanceRate || 95), 0) /
                        squadDevs.length,
                    )
                  : 96
              const avgMorale =
                squadDevs.length > 0
                  ? (
                      squadDevs.reduce((sum, s) => sum + (s.perf.satisfactionIndex || 4.7), 0) /
                      squadDevs.length
                    ).toFixed(1)
                  : '4.8'

              return (
                <div
                  key={team.id}
                  className="p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between hover:border-indigo-400 dark:hover:border-indigo-600 transition-all cursor-pointer group"
                  onClick={() => void loadSquadTasks(team)}
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {team.name}
                        </h4>
                        <p className="text-xs text-slate-400 font-mono">{team.code}</p>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                        Healthy
                      </span>
                    </div>

                    <div className="text-xs text-slate-600 dark:text-slate-300 mb-4 space-y-1">
                      <div>
                        Squad PM:{' '}
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {team.pm?.name || 'Alex Rivera'}
                        </span>
                      </div>
                      <div>
                        Lead Dev:{' '}
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {team.leadDev?.name || 'Marcus Brody'}
                        </span>
                      </div>
                      <div>
                        Staff Count:{' '}
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {squadDevs.length + 1} members
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/60 mb-4 text-center">
                      <div>
                        <div className="text-[10px] uppercase font-semibold text-slate-400">
                          Perf Score
                        </div>
                        <div className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                          {avgScore}%
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase font-semibold text-slate-400">
                          Attendance
                        </div>
                        <div className="text-base font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                          {avgAttendance}%
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase font-semibold text-slate-400">
                          Morale
                        </div>
                        <div className="text-base font-bold text-rose-600 dark:text-rose-400 mt-0.5">
                          {avgMorale} / 5
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-xs text-slate-500">Weekly Retrospective Complete</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        void loadSquadTasks(team)
                      }}
                      className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      Enter Squad &amp; View Tasks <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* TAB 2 - SQUAD DETAIL VIEW (DRILL-DOWN) */}
        {activeTab === 'squads' && selectedSquad && (
          <div className="space-y-5">
            {/* Header bar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSelectedSquad(null)}
                  className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                  title="Back to all squads"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                      {selectedSquad.name}
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400">
                      {selectedSquad.code || 'SQUAD'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Squad PM: <strong className="text-slate-800 dark:text-slate-200">{selectedSquad.pm?.name || 'Assigned PM'}</strong>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button
                  variant="primary"
                  size="sm"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 shadow-sm"
                  onClick={() => {
                    const squadDevs = developers.filter((d: any) => d.teamId === selectedSquad.id)
                    const candidateDevs = squadDevs.length > 0 ? squadDevs : developers
                    setDirectTaskAssignee(candidateDevs[0]?.id || '')

                    const squadProjects = projects.filter(
                      (p: any) =>
                        (selectedSquad.projectIds || []).includes(p.id) ||
                        p.teamId === selectedSquad.id,
                    )
                    if (squadProjects.length > 0) setDirectTaskProject(squadProjects[0].id)
                    else if (projects.length > 0) setDirectTaskProject(projects[0].id)
                    setIsDirectTaskModalOpen(true)
                  }}
                >
                  <Plus className="w-4 h-4" />
                  Assign Direct Task (C-Level)
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void loadSquadTasks(selectedSquad)}
                  disabled={loadingSquadTasks}
                >
                  {loadingSquadTasks ? 'Refreshing...' : 'Refresh Tasks'}
                </Button>
              </div>
            </div>

            {/* Squad Members horizontal pills */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
              <div className="text-xs font-bold uppercase text-slate-500 mb-2">
                Squad Members — Click any member to view full Overall KPI profile:
              </div>
              <div className="flex flex-wrap gap-2">
                {developers
                  .filter((d: any) => d.teamId === selectedSquad.id)
                  .map((dev: any) => {
                    const perf = performanceRecords.find((p: any) => p.employeeId === dev.id)
                    const kpiScore = perf?.overallScore ?? 92
                    return (
                      <button
                        key={dev.id}
                        onClick={() => void handleOpenEmployeeProfile(dev)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-500 transition-all cursor-pointer group shadow-2xs"
                      >
                        <Avatar
                          src={dev.avatarUrl}
                          name={dev.name}
                          initials={dev.initials}
                          className="w-6 h-6 text-[10px]"
                        />
                        <span className="text-xs font-semibold text-slate-900 dark:text-white group-hover:text-indigo-600">
                          {dev.name}
                        </span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold font-mono bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                          {kpiScore}% KPI
                        </span>
                      </button>
                    )
                  })}
              </div>
            </div>

            {/* Tasks Filters & List */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
                  {[
                    { id: 'all', label: 'All Tasks' },
                    { id: 'completed', label: 'Completed' },
                    { id: 'in_progress', label: 'In Progress' },
                    { id: 'in_review', label: 'In Review' },
                    { id: 'todo', label: 'To Do' },
                  ].map((st) => (
                    <button
                      key={st.id}
                      onClick={() => setSquadTaskFilter(st.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                        squadTaskFilter === st.id
                          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {st.id === 'all'
                        ? `All Tasks (${squadTasks.length})`
                        : `${st.label} (${
                            squadTasks.filter((t: any) => t.status === st.id).length
                          })`}
                    </button>
                  ))}
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search squad tasks..."
                    value={squadTaskSearch}
                    onChange={(e) => setSquadTaskSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Tasks List Cards / Rows */}
              {loadingSquadTasks ? (
                <div className="p-12 text-center text-sm text-slate-500">Loading squad tasks...</div>
              ) : squadTasks.length === 0 ? (
                <div className="p-12 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                  <p className="text-sm text-slate-500">No tasks found for this squad yet.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {squadTasks
                    .filter((t: any) => {
                      if (squadTaskFilter !== 'all' && t.status !== squadTaskFilter) return false
                      if (
                        squadTaskSearch &&
                        !t.title.toLowerCase().includes(squadTaskSearch.toLowerCase()) &&
                        !t.assignee?.name?.toLowerCase().includes(squadTaskSearch.toLowerCase())
                      )
                        return false
                      return true
                    })
                    .map((task: any) => {
                      const assigneeUser =
                        task.assignee || developers.find((d: any) => d.id === task.assigneeId)
                      const isCompleted = task.status === 'completed'
                      const weightPts = Number(task.weightPoints || 2)
                      const isWeightVerified = task.weightStatus === 'VERIFIED'
                      const execScore =
                        task.execScores && task.execScores.length > 0
                          ? Number(task.execScores[0].score)
                          : task.pmScore
                            ? Number(task.pmScore)
                            : null

                      return (
                        <div
                          key={task.id}
                          className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-2xs"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1.5">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${
                                  isCompleted
                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                                    : task.status === 'in_progress'
                                      ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-400'
                                      : task.status === 'in_review'
                                        ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
                                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                }`}
                              >
                                {task.status.toUpperCase().replace('_', ' ')}
                              </span>

                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                                Weight: {weightPts} pts ({task.weightCategory || 'MEDIUM'})
                              </span>

                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  isWeightVerified
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                }`}
                              >
                                {isWeightVerified ? 'CHRO VERIFIED' : 'PENDING CHRO'}
                              </span>

                              {task.project?.code && (
                                <span className="text-[10px] font-mono text-slate-400">
                                  {task.project.code}
                                </span>
                              )}
                            </div>

                            <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                              {task.title}
                            </h4>

                            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                              {/* Assignee - Clickable to open Overall KPI profile */}
                              <div
                                onClick={() =>
                                  assigneeUser && void handleOpenEmployeeProfile(assigneeUser)
                                }
                                className="flex items-center gap-1.5 cursor-pointer hover:underline text-indigo-600 dark:text-indigo-400 font-semibold"
                                title="Click to view full overall KPI profile"
                              >
                                <Avatar
                                  src={assigneeUser?.avatarUrl}
                                  name={assigneeUser?.name || 'Assignee'}
                                  initials={assigneeUser?.initials || 'AS'}
                                  className="w-4 h-4 text-[9px]"
                                />
                                <span>{assigneeUser?.name || 'Unassigned'}</span>
                              </div>

                              {task.pmScore && (
                                <span>
                                  PM Score:{' '}
                                  <strong className="text-slate-900 dark:text-white font-mono">
                                    {Number(task.pmScore)}/100
                                  </strong>
                                </span>
                              )}

                              {execScore !== null && (
                                <span>
                                  C-Level Mark:{' '}
                                  <strong className="text-purple-600 dark:text-purple-400 font-mono">
                                    {execScore}/100
                                  </strong>
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Actions: Grade / Assign Mark & Change Weight */}
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              variant="secondary"
                              size="xs"
                              className="bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:bg-amber-100 flex items-center gap-1 text-[11px]"
                              onClick={() => {
                                setEditingWeightTask(task)
                                setEditWeightCategory(task.weightCategory || 'MEDIUM')
                                setEditWeightPoints(Number(task.weightPoints || 3))
                                setEditWeightReason('')
                              }}
                            >
                              <Scale className="w-3.5 h-3.5" />
                              Change Weight
                            </Button>
                            <Button
                              variant="secondary"
                              size="xs"
                              className="bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800 hover:bg-purple-100 flex items-center gap-1 text-[11px]"
                              onClick={() => {
                                setScoringTask(task)
                                setExecScoreInput(execScore ? Number(execScore) : 90)
                                setExecScoreReason('')
                              }}
                            >
                              <Award className="w-3.5 h-3.5" />
                              Grade / Assign Mark
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: CONFIDENTIAL GRIEVANCE DESK */}
        {activeTab === 'grievances' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/30 dark:bg-purple-950/20 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-purple-900 dark:text-purple-300 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  Privileged C-Suite Whistleblower & Grievance Repository
                </h4>
                <p className="text-xs text-purple-700/80 dark:text-purple-400/80 mt-0.5">
                  Restricted strictly to the Chief Human Resources Officer and Chief Executive
                  Officer. Invisible to PMs and CTO.
                </p>
              </div>
            </div>

            {confidentialComplaints.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2 opacity-80" />
                <h4 className="text-base font-semibold text-slate-900 dark:text-white">
                  Grievance Desk Clear
                </h4>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  No open confidential complaints or whistleblower filings requiring adjudication.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {confidentialComplaints.map((c) => (
                  <div
                    key={c.id}
                    className="p-5 rounded-2xl border border-purple-200/80 dark:border-purple-900/40 bg-white dark:bg-slate-900 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
                          CONFIDENTIAL
                        </span>
                        <span className="text-xs text-slate-400 font-mono">{c.id}</span>
                        <span className="text-xs text-slate-400">• {c.date}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            c.status === 'resolved'
                              ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                              : 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400'
                          }`}
                        >
                          {c.status.toUpperCase()}
                        </span>
                      </div>
                      <h4 className="text-base font-bold text-slate-900 dark:text-white mb-1">
                        {c.title}
                      </h4>
                      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-2">
                        {c.description}
                      </p>
                      {c.mediationNotes && (
                        <div className="text-xs p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-100 dark:border-slate-700">
                          <span className="font-semibold text-purple-600 dark:text-purple-400">
                            HR Mediation Notes:{' '}
                          </span>
                          {c.mediationNotes}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0 w-full md:w-auto justify-end">
                      <Button
                        variant="primary"
                        size="sm"
                        className="bg-purple-600 hover:bg-purple-700 text-white"
                        onClick={() => handleOpenGrievance(c)}
                      >
                        Adjudicate Grievance
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: Task Weight Verification Gate */}
        {activeTab === 'weight_queue' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500 text-white shadow-xs">
                  <Scale className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    CHRO Task Weight Verification Gate
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    PMs propose weights; the CHRO holds final authority to verify, modify, or reject. Tasks yield exactly 10x XP.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={weightQueue.filter((w) => w.status === 'PENDING_CHRO').length === 0}
                  onClick={() => setIsBatchApproveMfaOpen(true)}
                >
                  Batch Approve Pending (MFA)
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void fetchWeightQueue()}
                  disabled={loadingWeightQueue}
                >
                  {loadingWeightQueue ? 'Refreshing...' : 'Refresh Queue'}
                </Button>
              </div>
            </div>

            {weightQueue.length === 0 ? (
              <div className="p-12 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                <h4 className="text-base font-semibold text-slate-900 dark:text-white">
                  Verification Queue Clear
                </h4>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  All proposed task and milestone weights have been verified and locked.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
                {weightQueue.map((item) => {
                  const weight = Number(item.approvedWeight || item.proposedWeight)
                  const xpYield = weight * 10
                  const isMassive = item.isMassiveXp || weight >= 50
                  const isPending = item.status === 'PENDING_CHRO'

                  return (
                    <div
                      key={item.id}
                      className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                              isPending
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                            }`}
                          >
                            {item.status.replace('_', ' ')}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                            Category: {item.category}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            Context: {item.context.replace('_', ' ')}
                          </span>
                          {isMassive && (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              Massive XP ({xpYield} XP)
                            </span>
                          )}
                        </div>

                        <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {item.task?.title || item.milestone?.title || 'Untitled Deliverable'}
                        </h4>

                        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400 mt-1">
                          <span>
                            Project:{' '}
                            <strong className="text-slate-700 dark:text-slate-300">
                              {item.task?.project?.name || item.milestone?.project?.name || 'General'}
                            </strong>
                          </span>
                          <span>
                            Proposed by:{' '}
                            <strong className="text-slate-700 dark:text-slate-300">
                              {item.proposer?.name || 'Project Manager'}
                            </strong>
                          </span>
                          <span>
                            Assignee:{' '}
                            <strong className="text-slate-700 dark:text-slate-300">
                              {item.task?.assignee?.name || 'Unassigned'}
                            </strong>
                          </span>
                          <span>
                            Proposed Weight: <strong className="text-amber-600">{item.proposedWeight}</strong>
                          </span>
                          <span>
                            XP Yield: <strong className="text-indigo-600">{xpYield} XP</strong>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 w-full md:w-auto justify-end">
                        {isMassive && item.massiveXpFrozen && (
                          <div className="flex items-center gap-1.5 mr-2">
                            <span className="text-[11px] font-semibold text-purple-600 dark:text-purple-400">
                              {item.consensusVotes?.filter((v: any) => v.decision === 'APPROVE').length || 0}/2 Approvals:
                            </span>
                            <Button
                              variant="secondary"
                              size="xs"
                              className="text-emerald-600 border-emerald-300 hover:bg-emerald-50 text-[11px]"
                              onClick={() => void handleConsensusVote(item.id, 'APPROVE')}
                            >
                              Vote Approve
                            </Button>
                            <Button
                              variant="secondary"
                              size="xs"
                              className="text-rose-600 border-rose-300 hover:bg-rose-50 text-[11px]"
                              onClick={() => void handleConsensusVote(item.id, 'REJECT')}
                            >
                              Vote Reject
                            </Button>
                          </div>
                        )}
                        {isPending && (
                          <>
                            <Button
                              variant="secondary"
                              size="xs"
                              className="text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-[11px] flex items-center gap-1"
                              onClick={() => {
                                const t = item.task || {
                                  id: item.taskId,
                                  title: item.title,
                                  weightPoints: item.proposedWeight,
                                  weightCategory: item.category,
                                }
                                setEditingWeightTask(t)
                                setEditWeightCategory(item.category || 'MEDIUM')
                                setEditWeightPoints(Number(item.approvedWeight || item.proposedWeight || 3))
                                setEditWeightReason('')
                              }}
                            >
                              <Scale className="w-3 h-3" />
                              Change Weight
                            </Button>
                            <Button
                              variant="secondary"
                              size="xs"
                              onClick={() => void handleQuickApproveWeight(item)}
                            >
                              Quick Approve
                            </Button>
                            <Button
                              variant="danger"
                              size="xs"
                              onClick={() => {
                                setRejectingWeightItem(item)
                                setRejectWeightReason('')
                              }}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                        <Button
                          variant="primary"
                          size="xs"
                          onClick={() => {
                            setSelectedWeightItem(item)
                            setApprovedWeightInput(Number(item.proposedWeight))
                            setWeightNotesInput(item.chroNotes || '')
                          }}
                        >
                          Modify / Verify Weight
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: DISCIPLINARY ACTIONS & REVERSALS */}
        {activeTab === 'disciplinary' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-rose-600 text-white shadow-xs">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Disciplinary Deductions &amp; Reversals
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Mandatory legal document reference. Executed via append-only ledger with fresh MFA.
                  </p>
                </div>
              </div>

              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setDeductionUserId(developers[0]?.id || '')
                  setIsDeductionModalOpen(true)
                }}
              >
                Apply Disciplinary Deduction
              </Button>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Staff Governance Roster
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/40 text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Employee</th>
                      <th className="py-2.5 px-3">Role</th>
                      <th className="py-2.5 px-3">Standing</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {staffRoster.map(({ user }) => (
                      <tr key={user.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-white">
                          {user.name} ({user.email})
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 uppercase text-[10px]">
                          {user.role}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Normal
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <Button
                            variant="secondary"
                            size="xs"
                            className="text-rose-600 border-rose-200 hover:bg-rose-50"
                            onClick={() => {
                              setDeductionUserId(user.id)
                              setIsDeductionModalOpen(true)
                            }}
                          >
                            Apply Deduction
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: KPI & WEIGHT CONFIGURATION EDITOR */}
        {activeTab === 'config' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/40">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-600 text-white shadow-xs">
                  <Settings className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    System KPI &amp; Task Weight Configuration
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    CHRO-level configuration. Modifying multipliers and thresholds requires CHRO MFA confirmation.
                  </p>
                </div>
              </div>

              <Button
                variant="primary"
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={() => setIsConfigMfaOpen(true)}
              >
                Save Config (MFA)
              </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* KPI Config Card */}
              <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-indigo-500" />
                  KPI Multipliers &amp; Governance Bounds
                </h4>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">
                      Massive XP Freeze Threshold (Points)
                    </label>
                    <input
                      type="number"
                      value={kpiConfig?.massiveXpThreshold ?? 200}
                      onChange={(e) =>
                        setKpiConfig({
                          ...kpiConfig,
                          massiveXpThreshold: Number(e.target.value),
                        })
                      }
                      className="w-full p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-sm"
                    />
                    <span className="text-[10px] text-slate-400">
                      Standard: 200 XP. Tasks at or above this trigger high-value consensus review.
                    </span>
                  </div>

                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">
                      Inactivity Deduction Rate (Percentage)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={kpiConfig?.inactivityPenalty ?? 0.1}
                      onChange={(e) =>
                        setKpiConfig({
                          ...kpiConfig,
                          inactivityPenalty: Number(e.target.value),
                        })
                      }
                      className="w-full p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-sm"
                    />
                    <span className="text-[10px] text-slate-400">
                      Standard: 0.10 (10% deduction on next deliverable after zero-output week).
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                        Main Squad
                      </label>
                      <input
                        type="number"
                        step="0.05"
                        value={kpiConfig?.mainSquadMultiplier ?? 1.0}
                        onChange={(e) =>
                          setKpiConfig({
                            ...kpiConfig,
                            mainSquadMultiplier: Number(e.target.value),
                          })
                        }
                        className="w-full p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                        Outside Squad
                      </label>
                      <input
                        type="number"
                        step="0.05"
                        value={kpiConfig?.outsideSquadMultiplier ?? 0.7}
                        onChange={(e) =>
                          setKpiConfig({
                            ...kpiConfig,
                            outsideSquadMultiplier: Number(e.target.value),
                          })
                        }
                        className="w-full p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                        Isolated Exec
                      </label>
                      <input
                        type="number"
                        step="0.05"
                        value={kpiConfig?.isolatedExecMultiplier ?? 0.5}
                        onChange={(e) =>
                          setKpiConfig({
                            ...kpiConfig,
                            isolatedExecMultiplier: Number(e.target.value),
                          })
                        }
                        className="w-full p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Task Weight Defaults Card */}
              <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Scale className="w-4 h-4 text-amber-500" />
                  Task Weight Category Points
                </h4>

                <div className="space-y-3 text-xs">
                  {['SMALL', 'MEDIUM', 'LARGE', 'CRITICAL'].map((cat) => {
                    const found = weightConfigs.find((wc) => wc.category === cat)
                    const points =
                      found?.points ??
                      (cat === 'SMALL' ? 1 : cat === 'MEDIUM' ? 2 : cat === 'LARGE' ? 3 : 5)

                    return (
                      <div
                        key={cat}
                        className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                      >
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white">{cat}</div>
                          <div className="text-[10px] text-slate-400">
                            Yields {Number(points) * 10} XP upon completion
                          </div>
                        </div>
                        <input
                          type="number"
                          min="1"
                          max="20"
                          value={points}
                          onChange={(e) => {
                            const newPoints = Number(e.target.value)
                            setWeightConfigs((prev) => {
                              const filtered = prev.filter((wc) => wc.category !== cat)
                              return [...filtered, { category: cat, points: newPoints }]
                            })
                          }}
                          className="w-20 p-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-right font-mono font-bold"
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 7: BACKFILL WINDOWS GOVERNANCE */}
        {activeTab === 'backfill_windows' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-600 text-white shadow-xs">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Review Windows Governance
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Configure time-bound retroactive review periods for PMs. Requires CHRO security verification.
                  </p>
                </div>
              </div>

              <Button
                variant="primary"
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => setIsCreateWindowModalOpen(true)}
              >
                Open New Window
              </Button>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
              {backfillWindows.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  No active or historical backfill windows recorded.
                </div>
              ) : (
                backfillWindows.map((win) => {
                  const isExpired = new Date(win.endsAt).getTime() < Date.now()
                  const isLive = win.isActive && !isExpired

                  return (
                    <div
                      key={win.id}
                      className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/40"
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isLive
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                            }`}
                          >
                            {isLive ? 'ACTIVE' : 'CLOSED'}
                          </span>
                          <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                            Role: {win.grantedRole.toUpperCase()}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500">
                          {new Date(win.startsAt).toLocaleString()} to{' '}
                          <strong className="text-slate-700 dark:text-slate-300">
                            {new Date(win.endsAt).toLocaleString()}
                          </strong>
                        </div>
                      </div>

                      {isLive && (
                        <Button
                          variant="danger"
                          size="xs"
                          onClick={() => setWindowToClose(win)}
                        >
                          Close Window (MFA)
                        </Button>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* MODAL 1: Record Evaluation */}
      {selectedStaffEval && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedStaffEval(null)}
          title={`Performance Evaluation: ${selectedStaffEval.user.name}`}
        >
          <form onSubmit={handleSaveEvaluation} className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
              <Avatar
                src={selectedStaffEval.user.avatarUrl || selectedStaffEval.user.avatar}
                name={selectedStaffEval.user.name}
                initials={selectedStaffEval.user.initials}
                className="w-10 h-10 text-sm"
              />
              <div>
                <div className="font-bold text-slate-900 dark:text-white">
                  {selectedStaffEval.user.name}
                </div>
                <div className="text-xs text-slate-500">
                  {selectedStaffEval.user.title} — {selectedStaffEval.team?.name}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                  Overall Score (0-100%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={evalScoreInput}
                  onChange={(e) => setEvalScoreInput(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                  Performance Tier
                </label>
                <select
                  value={evalTierInput}
                  onChange={(e) => setEvalTierInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer"
                >
                  <option value="top_performer">Top Performer</option>
                  <option value="strong_contributor">Strong Contributor</option>
                  <option value="needs_support">Needs Support</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                Evaluation Notes & Observations
              </label>
              <textarea
                rows={3}
                placeholder="Comprehensive evaluation summary..."
                value={evalNotesInput}
                onChange={(e) => setEvalNotesInput(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                Key Strengths (comma-separated)
              </label>
              <input
                type="text"
                value={evalStrengthsInput}
                onChange={(e) => setEvalStrengthsInput(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                Areas for Development (comma-separated)
              </label>
              <input
                type="text"
                value={evalImprovementsInput}
                onChange={(e) => setEvalImprovementsInput(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <Button variant="secondary" onClick={() => setSelectedStaffEval(null)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit">
                Record Evaluation
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL 2: Award / Disciplinary Action */}
      {selectedStaffAction && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedStaffAction(null)}
          title={
            actionCategory === 'recognition'
              ? `Issue Employee Recognition: ${selectedStaffAction.user.name}`
              : `Issue Disciplinary Action: ${selectedStaffAction.user.name}`
          }
        >
          <form onSubmit={handleSaveAction} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setActionCategory('recognition')}
                className={`py-2 px-3 rounded-xl text-sm font-semibold border transition-all cursor-pointer ${
                  actionCategory === 'recognition'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                Recognition Award
              </button>
              <button
                type="button"
                onClick={() => setActionCategory('disciplinary')}
                className={`py-2 px-3 rounded-xl text-sm font-semibold border transition-all cursor-pointer ${
                  actionCategory === 'disciplinary'
                    ? 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                Formal Disciplinary Action
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                Notice Title / Citation
              </label>
              <input
                type="text"
                value={actionTitleInput}
                onChange={(e) => setActionTitleInput(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                Formal Justification & Documentation
              </label>
              <textarea
                rows={3}
                value={actionDescInput}
                onChange={(e) => setActionDescInput(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                required
              />
            </div>

            {actionCategory === 'recognition' ? (
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                  Commendation Career XP (+XP Points)
                </label>
                <select
                  value={actionXpAwardInput}
                  onChange={(e) => setActionXpAwardInput(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                >
                  <option value={0}>0 XP (Formal Commendation Citation Only)</option>
                  <option value={10}>+10 XP (Sprint Team Support)</option>
                  <option value={25}>+25 XP (Excellence in Execution)</option>
                  <option value={50}>+50 XP (Major Innovation & Leadership)</option>
                  <option value={100}>+100 XP (Supreme Enterprise Achievement)</option>
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Appends cryptographic XP points directly to the employee career ledger. No discretionary cash or wallet mutations.
                </p>
              </div>
            ) : null}

            {actionCategory === 'disciplinary' && (
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                  KPI Percentage Deduction (Pointfex HR Policy: 1–100 Pts)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={actionKpiDeductionInput}
                  onChange={(e) => setActionKpiDeductionInput(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-950/20 text-sm font-bold text-rose-700 dark:text-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Directly reduces active weekly KPI score with an immutable, cryptographic audit log.
                </p>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-3">
              <Button variant="secondary" onClick={() => setSelectedStaffAction(null)}>
                Cancel
              </Button>
              <Button
                variant={actionCategory === 'recognition' ? 'primary' : 'danger'}
                type="submit"
                className={
                  actionCategory === 'recognition'
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : ''
                }
              >
                {actionCategory === 'recognition'
                  ? 'Award Recognition'
                  : 'Record Disciplinary Action'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL 3: Adjudicate Grievance */}
      {selectedComplaint && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedComplaint(null)}
          title="Adjudicate Confidential Grievance"
        >
          <form onSubmit={handleSaveGrievance} className="space-y-4">
            <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900">
              <div className="text-xs font-semibold text-purple-700 dark:text-purple-300">
                Grievance Title
              </div>
              <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                {selectedComplaint.title}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                Adjudication Status
              </label>
              <select
                value={complaintStatusInput}
                onChange={(e) => setComplaintStatusInput(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
              >
                <option value="under_review">Under Review</option>
                <option value="investigating">Active Investigation</option>
                <option value="resolved">Resolved & Closed</option>
                <option value="dismissed">Dismissed (No Action Required)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                Confidential HR Mediation Notes
              </label>
              <textarea
                rows={4}
                placeholder="Document executive findings, restorative mediation steps, or corrective plans..."
                value={complaintMediationInput}
                onChange={(e) => setComplaintMediationInput(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
                required
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <Button variant="secondary" onClick={() => setSelectedComplaint(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                Save HR Resolution
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL 4: Verify / Modify Task Weight & XP Yield */}
      {selectedWeightItem && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedWeightItem(null)}
          title="Verify Task Weight & XP Yield"
        >
          <form onSubmit={handleVerifyWeight} className="space-y-4">
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
              <div className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                Deliverable
              </div>
              <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                {selectedWeightItem.task?.title || selectedWeightItem.milestone?.title || 'Task'}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Proposed Weight: {selectedWeightItem.proposedWeight} (Yields{' '}
                {Number(selectedWeightItem.proposedWeight) * 10} XP)
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                Approved Task Weight (1–100)
              </label>
              <input
                type="number"
                min={1}
                max={100}
                step={0.5}
                required
                value={approvedWeightInput}
                onChange={(e) => setApprovedWeightInput(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm font-bold text-slate-900 dark:text-white"
              />
              <p className="text-xs text-indigo-600 mt-1">
                Will disburse: <strong>{approvedWeightInput * 10} XP</strong> upon completion.
                {approvedWeightInput >= 50 && ' (Triggering Massive XP Consensus Lock)'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                CHRO Verification Notes & Justification
              </label>
              <textarea
                rows={3}
                placeholder="Reason for weight approval or adjustment..."
                value={weightNotesInput}
                onChange={(e) => setWeightNotesInput(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-200"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <Button variant="secondary" onClick={() => setSelectedWeightItem(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={verifyingWeight}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {verifyingWeight ? 'Verifying...' : 'Lock Approved Weight'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL 5: Reject Task Weight */}
      {rejectingWeightItem && (
        <Modal
          isOpen={true}
          onClose={() => setRejectingWeightItem(null)}
          title={`Reject Weight Proposal: ${rejectingWeightItem.task?.title || rejectingWeightItem.milestone?.title || 'Deliverable'}`}
        >
          <form onSubmit={handleRejectWeight} className="space-y-4 text-xs">
            <p className="text-slate-600 dark:text-slate-400">
              Rejecting this weight proposal will notify the PM and request scope or point revisions.
            </p>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                Rejection Reason <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                required
                placeholder="Explain why the proposed weight is excessive or miscategorized..."
                value={rejectWeightReason}
                onChange={(e) => setRejectWeightReason(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="secondary" size="sm" onClick={() => setRejectingWeightItem(null)}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" type="submit">
                Reject Weight Proposal
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL 6: Apply Disciplinary Deduction */}
      {isDeductionModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsDeductionModalOpen(false)}
          title="Issue Formal Disciplinary Deduction"
        >
          <div className="space-y-4 text-xs">
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
              Disciplinary deductions directly reduce KPI percentage standing on the immutable ledger.
              Mandatory legal citation or formal document reference required.
            </p>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Target Staff Member <span className="text-rose-500">*</span>
              </label>
              <select
                value={deductionUserId}
                onChange={(e) => setDeductionUserId(e.target.value)}
                className="w-full p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs cursor-pointer"
              >
                {staffRoster.map(({ user }) => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.title})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Deduction Points (1–100) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={deductionPoints}
                  onChange={(e) => setDeductionPoints(Number(e.target.value))}
                  className="w-full p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Target Week Effective
                </label>
                <input
                  type="date"
                  value={deductionWeekStart}
                  onChange={(e) => setDeductionWeekStart(e.target.value)}
                  className="w-full p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Legal Document Reference / URL <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g., HR-LEGAL-2026-DOC-088 or https://drive.pointfex.com/hr/case-088"
                value={deductionRefDoc}
                onChange={(e) => setDeductionRefDoc(e.target.value)}
                className="w-full p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Factual Justification &amp; Policy Violation <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                placeholder="Describe deliberate security violation, contractual non-performance, or gross negligence..."
                value={deductionReason}
                onChange={(e) => setDeductionReason(e.target.value)}
                className="w-full p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="secondary" size="sm" onClick={() => setIsDeductionModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={!deductionReason.trim() || !deductionRefDoc.trim()}
                onClick={() => {
                  setMfaActionType('APPLY_DEDUCTION')
                }}
              >
                Proceed to MFA Verification
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL 7: Open Backfill Window */}
      {isCreateWindowModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsCreateWindowModalOpen(false)}
          title="Open New Backfill Window"
        >
          <div className="space-y-4 text-xs">
            <p className="text-slate-600 dark:text-slate-400">
              Opening a backfill window allows PMs to submit retroactive historical tasks completed
              within the defined window.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={newWindowStartsAt}
                  onChange={(e) => setNewWindowStartsAt(e.target.value)}
                  className="w-full p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  End Date / Deadline
                </label>
                <input
                  type="date"
                  value={newWindowEndsAt}
                  onChange={(e) => setNewWindowEndsAt(e.target.value)}
                  className="w-full p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Authorized Role
              </label>
              <select
                value={newWindowRole}
                onChange={(e) => setNewWindowRole(e.target.value)}
                className="w-full p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs cursor-pointer"
              >
                <option value="pm">Project Managers (PM)</option>
                <option value="cto">CTO Only</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Executive Justification <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={2}
                placeholder="Reason for opening historical grace window..."
                value={newWindowReason}
                onChange={(e) => setNewWindowReason(e.target.value)}
                className="w-full p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsCreateWindowModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={!newWindowReason.trim()}
                onClick={() => {
                  setMfaActionType('CREATE_WINDOW')
                }}
              >
                Verify &amp; Open Window (MFA)
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* MFA Modals */}
      {mfaActionType === 'APPLY_DEDUCTION' && (
        <MfaConfirmModal
          isOpen={true}
          onClose={() => setMfaActionType(null)}
          title="MFA: Authorize Disciplinary Deduction"
          actionSummary={`Deduct ${deductionPoints} KPI points from employee ${deductionUserId}`}
          isCritical={true}
          onConfirm={async (payload) => {
            await handleApplyDisciplinary(payload.mfaCode)
            setMfaActionType(null)
          }}
        />
      )}

      {mfaActionType === 'CREATE_WINDOW' && (
        <MfaConfirmModal
          isOpen={true}
          onClose={() => setMfaActionType(null)}
          title="MFA: Authorize Backfill Grace Window"
          actionSummary={`Open backfill window until ${newWindowEndsAt}`}
          onConfirm={async (payload) => {
            await handleCreateBackfillWindow(payload.mfaCode)
            setMfaActionType(null)
          }}
        />
      )}

      {isConfigMfaOpen && (
        <MfaConfirmModal
          isOpen={true}
          onClose={() => setIsConfigMfaOpen(false)}
          title="MFA: Update System KPI & Weight Config"
          actionSummary="Update system-wide multiplier bounds and massive-XP threshold"
          onConfirm={async (payload) => {
            await handleSaveConfig(payload.mfaCode)
          }}
        />
      )}

      {isBatchApproveMfaOpen && (
        <MfaConfirmModal
          isOpen={true}
          onClose={() => setIsBatchApproveMfaOpen(false)}
          title="MFA: Batch Approve Deliverable Weights"
          actionSummary={`Batch verify and lock ${weightQueue.filter((w) => w.status === 'PENDING_CHRO').length} pending deliverable weights`}
          onConfirm={async (payload) => {
            await handleBatchApproveWeights(payload.mfaCode)
          }}
        />
      )}

      {reversingDeduction && (
        <MfaConfirmModal
          isOpen={true}
          onClose={() => setReversingDeduction(null)}
          title="MFA: Authorize Disciplinary Reversal"
          actionSummary={`Reverse disciplinary action ${reversingDeduction.id} with compensating credit`}
          isCritical={true}
          onConfirm={async (payload) => {
            await handleReverseDisciplinary(payload.mfaCode)
          }}
        />
      )}

      {windowToClose && (
        <MfaConfirmModal
          isOpen={true}
          onClose={() => setWindowToClose(null)}
          title="MFA: Close Backfill Window"
          actionSummary="Immediately deactivate backfill window and lock retroactive submissions"
          onConfirm={async (payload) => {
            await handleCloseBackfillWindow(payload.mfaCode)
          }}
        />
      )}

      {/* MODAL: C-Level Direct Task Grading / Mark Assignment */}
      {scoringTask && (
        <Modal
          isOpen={true}
          onClose={() => setScoringTask(null)}
          title={`Assign C-Level Mark: ${scoringTask.title}`}
        >
          <form onSubmit={handleAssignExecScore} className="space-y-4 text-xs">
            <p className="text-slate-600 dark:text-slate-400">
              Assign or adjust the official C-Level executive mark for this task. This directly recalculates the assignee&apos;s Weekly KPI.
            </p>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1">
              <div><strong>Task:</strong> {scoringTask.title}</div>
              <div><strong>Assignee:</strong> {scoringTask.assignee?.name || 'Squad Member'}</div>
              <div><strong>Weight:</strong> {scoringTask.weightPoints || 2} pts</div>
              <div><strong>PM Score:</strong> {scoringTask.pmScore ? `${scoringTask.pmScore}/100` : 'Not scored'}</div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  C-Level Executive Mark (0-100)
                </label>
                <span className="font-mono text-base font-extrabold text-purple-600 dark:text-purple-400">
                  {execScoreInput} / 100
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={execScoreInput}
                onChange={(e) => setExecScoreInput(Number(e.target.value))}
                className="w-full accent-purple-600 cursor-pointer"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Evaluation Justification &amp; Notes
              </label>
              <textarea
                rows={2}
                value={execScoreReason}
                onChange={(e) => setExecScoreReason(e.target.value)}
                placeholder="Notes on architecture quality, delivery speed, or executive feedback..."
                className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="secondary" size="sm" onClick={() => setScoringTask(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                size="sm"
                className="bg-purple-600 hover:bg-purple-700 text-white"
                disabled={submittingExecScore}
              >
                {submittingExecScore ? 'Assigning...' : 'Save & Update Assignee KPI'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL: C-Level Direct Task Creation & Completion */}
      {isDirectTaskModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsDirectTaskModalOpen(false)}
          title="Direct C-Level Task Assignment"
        >
          <form onSubmit={handleCreateDirectTask} className="space-y-4 text-xs">
            <p className="text-slate-600 dark:text-slate-400">
              Assign a new deliverable directly to a squad member. Optionally mark it completed immediately and assign its official executive score.
            </p>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Task Title *
              </label>
              <input
                type="text"
                required
                value={directTaskTitle}
                onChange={(e) => setDirectTaskTitle(e.target.value)}
                placeholder="e.g. Implement security sandbox bypass mitigation"
                className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Task Description
              </label>
              <textarea
                rows={2}
                value={directTaskDesc}
                onChange={(e) => setDirectTaskDesc(e.target.value)}
                placeholder="Detailed acceptance criteria..."
                className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Assignee (Anyone in Organization) *
                </label>
                <select
                  required
                  value={directTaskAssignee}
                  onChange={(e) => setDirectTaskAssignee(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs focus:outline-none cursor-pointer"
                >
                  <optgroup label="Engineers &amp; Developers">
                    {(developers.length > 0 ? developers : data.users.filter((u: any) => u.role === 'developer')).map((dev: any) => (
                      <option key={dev.id} value={dev.id}>
                        {dev.name} ({dev.title || 'Developer'})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Project Managers &amp; Team Leads">
                    {(projectManagers.length > 0 ? projectManagers : data.users.filter((u: any) => u.role === 'pm')).map((pm: any) => (
                      <option key={pm.id} value={pm.id}>
                        {pm.name} ({pm.title || 'Project Manager'})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="All Other Staff &amp; Executives">
                    {data.users
                      .filter(
                        (u: any) =>
                          !developers.some((d: any) => d.id === u.id) &&
                          !projectManagers.some((p: any) => p.id === u.id),
                      )
                      .map((u: any) => (
                        <option key={u.id} value={u.id}>
                          {u.name} — {u.title || u.role?.toUpperCase()}
                        </option>
                      ))}
                  </optgroup>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Project *
                </label>
                <select
                  required
                  value={directTaskProject}
                  onChange={(e) => setDirectTaskProject(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs focus:outline-none cursor-pointer"
                >
                  {projects.map((proj: any) => (
                    <option key={proj.id} value={proj.id}>
                      {proj.name} ({proj.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Deliverable Weight &amp; XP Yield
                </label>
                <span className="text-[11px] font-mono font-bold text-indigo-600 dark:text-indigo-400">
                  {directTaskWeightPoints} pts = {Number(directTaskWeightPoints || 0) * 10} XP
                  {Number(directTaskWeightPoints) >= 20 ? ' (Massive XP)' : ''}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1.5 mb-2">
                {[
                  { cat: 'SMALL', pts: 1, label: '1 pt' },
                  { cat: 'MEDIUM', pts: 3, label: '3 pts' },
                  { cat: 'LARGE', pts: 5, label: '5 pts' },
                  { cat: 'CRITICAL', pts: 7, label: '7 pts' },
                  { cat: 'CUSTOM', pts: directTaskWeightPoints, label: 'Custom' },
                ].map((item) => {
                  const isSel =
                    item.cat === 'CUSTOM'
                      ? directTaskWeightCat === 'CUSTOM' || ![1, 3, 5, 7].includes(directTaskWeightPoints)
                      : directTaskWeightCat === item.cat && directTaskWeightPoints === item.pts
                  return (
                    <button
                      key={item.cat}
                      type="button"
                      onClick={() => {
                        setDirectTaskWeightCat(item.cat as any)
                        if (item.cat !== 'CUSTOM') {
                          setDirectTaskWeightPoints(item.pts)
                        }
                      }}
                      className={`p-1.5 rounded-xl text-center border text-xs cursor-pointer transition-all ${
                        isSel
                          ? 'bg-indigo-500/10 border-indigo-500 text-indigo-700 dark:text-indigo-300 font-bold'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      {item.label}
                    </button>
                  )
                })}
              </div>
              <input
                type="number"
                min="0.5"
                max="100"
                step="0.5"
                value={directTaskWeightPoints}
                onChange={(e) => {
                  const val = Number(e.target.value)
                  setDirectTaskWeightPoints(val)
                  if (![1, 2, 3, 5].includes(val)) {
                    setDirectTaskWeightCat('CUSTOM')
                  }
                }}
                className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white"
                placeholder="Enter custom points (e.g. 7, 10, 15)..."
              />
            </div>

            {/* Checkbox: Mark as Completed Immediately */}
            <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/40 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={directTaskCompletedImmediately}
                  onChange={(e) => setDirectTaskCompletedImmediately(e.target.checked)}
                  className="rounded text-indigo-600 accent-indigo-600 cursor-pointer"
                />
                <span>Mark as Completed Immediately &amp; Assign Score</span>
              </label>

              {directTaskCompletedImmediately && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                      Assigned Score (0-100)
                    </span>
                    <span className="font-mono text-sm font-bold text-indigo-600 dark:text-indigo-400">
                      {directTaskScore} / 100
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={directTaskScore}
                    onChange={(e) => setDirectTaskScore(Number(e.target.value))}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="secondary" size="sm" onClick={() => setIsDirectTaskModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
                disabled={submittingDirectTask}
              >
                {submittingDirectTask ? 'Creating...' : 'Create & Assign Task'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL: CHRO Direct Task Weight Modification */}
      {editingWeightTask && (
        <Modal
          isOpen={true}
          onClose={() => setEditingWeightTask(null)}
          title={`Change Task Weight (CHRO): ${editingWeightTask.title || 'Task'}`}
        >
          <form onSubmit={handleSaveWeightChange} className="space-y-4 text-xs">
            <p className="text-slate-600 dark:text-slate-400">
              As CHRO, you can modify the deliverable weight category and XP yield at any time. This immediately updates the task, verifies the weight, and recalculates the developer&apos;s Weekly KPI if already completed.
            </p>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Current Task:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[280px]">
                  {editingWeightTask.title}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Current Weight:</span>
                <span className="font-bold text-amber-600">
                  {Number(editingWeightTask.weightPoints || editingWeightTask.proposedWeight || 3)} pts (
                  {editingWeightTask.weightCategory || editingWeightTask.category || 'MEDIUM'})
                </span>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Weight Preset / Category
              </label>
              <div className="grid grid-cols-5 gap-1.5 mb-3">
                {[
                  { cat: 'SMALL', pts: 1, label: '1 pt', sub: '10 XP' },
                  { cat: 'MEDIUM', pts: 3, label: '3 pts', sub: '30 XP' },
                  { cat: 'LARGE', pts: 5, label: '5 pts', sub: '50 XP' },
                  { cat: 'CRITICAL', pts: 7, label: '7 pts', sub: '70 XP' },
                  { cat: 'CUSTOM', pts: editWeightPoints, label: 'Custom', sub: '10x XP' },
                ].map((item) => {
                  const isSelected =
                    item.cat === 'CUSTOM'
                      ? editWeightCategory === 'CUSTOM' || ![1, 3, 5, 7].includes(editWeightPoints)
                      : editWeightCategory === item.cat && editWeightPoints === item.pts
                  return (
                    <button
                      key={item.cat}
                      type="button"
                      onClick={() => {
                        setEditWeightCategory(item.cat as any)
                        if (item.cat !== 'CUSTOM') {
                          setEditWeightPoints(item.pts)
                        }
                      }}
                      className={`p-2 rounded-xl text-center border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-amber-500/10 border-amber-500 text-amber-700 dark:text-amber-300 font-bold shadow-xs'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      <div className="text-xs font-bold">{item.label}</div>
                      <div className="text-[10px] opacity-75">{item.sub}</div>
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-semibold text-slate-700 dark:text-slate-300">
                  Custom Weight Points *
                </label>
                <span className="text-[11px] font-mono font-bold text-amber-600 dark:text-amber-400">
                  Yields {Number(editWeightPoints || 0) * 10} XP
                  {Number(editWeightPoints) >= 20 ? ' (Massive XP)' : ''}
                </span>
              </div>
              <input
                type="number"
                min={0.5}
                max={100}
                step={0.5}
                required
                value={editWeightPoints}
                onChange={(e) => {
                  const val = Number(e.target.value)
                  setEditWeightPoints(val)
                  if (![1, 2, 3, 5].includes(val)) {
                    setEditWeightCategory('CUSTOM')
                  }
                }}
                className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                placeholder="Enter custom points (e.g. 7, 10, 15)..."
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Category:{' '}
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {![1, 2, 3, 5].includes(editWeightPoints) || editWeightCategory === 'CUSTOM'
                    ? 'CUSTOM'
                    : editWeightCategory}
                </span>
                {' · '}
                Every point awards 10 XP upon completion and recalculates Weekly KPI proportionally.
              </p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                CHRO Adjustment Reason / Justification
              </label>
              <input
                type="text"
                value={editWeightReason}
                onChange={(e) => setEditWeightReason(e.target.value)}
                placeholder="Reason for weight adjustment (e.g. complexity re-evaluated, sprint priority shift)..."
                className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="secondary" size="sm" onClick={() => setEditingWeightTask(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white"
                disabled={submittingWeightChange}
              >
                {submittingWeightChange ? 'Saving...' : 'Save Weight Changes'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
