/**
 * Domain types for Pointfex Pure KPI & XP Calculation Engine.
 */

export type WeightStatus = 'PENDING_CHRO_VERIFICATION' | 'VERIFIED' | 'REJECTED'
export type SquadContext = 'MAIN_SQUAD' | 'OUTSIDE_SQUAD' | 'ISOLATED_EXECUTIVE'
export type ExecRoleType = 'CTO' | 'CPO' | 'CFO' | 'CHRO'
export type ExecScoreStatusType = 'UNREAD' | 'CONFIRMED' | 'ADJUSTED'
export type TaskWeightCategoryType = 'SMALL' | 'MEDIUM' | 'LARGE' | 'CRITICAL' | 'CUSTOM'

export interface XpCalculationInput {
  weightPoints: number
  weightStatus: WeightStatus
  isFrozenThresholdXp?: number // default 200 from config
}

export interface XpCalculationResult {
  xp: number
  state: 'PENDING' | 'FROZEN' | 'POSTABLE'
  thresholdUsed: number
}

export interface DeveloperTaskScoringInput {
  pm: { score: number }
  cto?: { score?: number; status?: ExecScoreStatusType }
  cpo?: { score?: number; status?: ExecScoreStatusType }
  cfo?: { score?: number; status?: ExecScoreStatusType }
  chro?: { score?: number; status?: ExecScoreStatusType }
  weights?: {
    pm?: number
    cto?: number
    cpo?: number
    cfo?: number
    chro?: number
  }
  penaltyToApply?: {
    penaltyRate: number // deprecated per CHRO Requirements §2.1/§2.4
  }
}

export interface DeveloperTaskScoringResult {
  baseScore: number
  finalScore: number
  isProvisional: boolean
  penaltyApplied: boolean
  penaltyRate: number
  execScores: {
    cto: { score: number; status: ExecScoreStatusType }
    cpo: { score: number; status: ExecScoreStatusType }
    cfo: { score: number; status: ExecScoreStatusType }
    chro: { score: number; status: ExecScoreStatusType }
  }
}

export interface DeveloperCompletedTaskInput {
  score: number
  weightPoints: number
  context?: SquadContext
}

export interface DeveloperWeeklyKpiInput {
  tasks: DeveloperCompletedTaskInput[]
  multipliers?: {
    MAIN_SQUAD?: number
    OUTSIDE_SQUAD?: number
    ISOLATED_EXECUTIVE?: number
  }
}

export interface SquadWeeklyKpiInput {
  squadId: string
  kpi: number | null
  isInactive?: boolean
}

export interface WeeklyKpiResult {
  value: number | null
  status: 'OFFICIAL' | 'PROVISIONAL' | 'PENDING' | 'NA' | 'INCOMPLETE'
  reason?: string
  taskCount?: number
  totalWeight?: number
}

export interface PmWeeklyKpiInput {
  pm?: { score?: number; status?: ExecScoreStatusType } // 40% PM Self-Evaluation (§4.1)
  cto?: { score?: number; status?: ExecScoreStatusType; suggestedScore?: number }
  cpo?: { score?: number; status?: ExecScoreStatusType; suggestedScore?: number }
  cfo?: { score?: number; status?: ExecScoreStatusType; suggestedScore?: number }
  chro?: { score?: number; status?: ExecScoreStatusType; suggestedScore?: number }
  hasCompletions: boolean // PM completed >= 1 project milestone/deliverable review
  weights?: {
    pm?: number
    cto?: number
    cpo?: number
    cfo?: number
    chro?: number
  }
}

export interface CLevelWeeklyKpiInput {
  executiveRole?: ExecRoleType // role of the executive being evaluated
  ceoReview?: { score?: number; status?: ExecScoreStatusType } | number // 60% CEO (§4.2)
  cto?: { score?: number; status?: ExecScoreStatusType } // 10% CTO
  cfo?: { score?: number; status?: ExecScoreStatusType } // 10% CFO
  chro?: { score?: number; status?: ExecScoreStatusType } // 10% CHRO
  cpo?: { score?: number; status?: ExecScoreStatusType } // 10% CPO
  weights?: {
    ceo?: number
    cto?: number
    cfo?: number
    chro?: number
    cpo?: number
    companyGoal?: number
    domainExecution?: number
    ceoReview?: number
    peerSynergy?: number
  }
  // Legacy fields preserved for backward compatibility
  companyGoal?: number
  domainExecution?: number | null
  peerSynergy?: number | null
}

export interface CeoWeeklyKpiInput {
  companyPerformance: number
  cLevelFinalKpis: Array<{ score: number | null; isInactive?: boolean }>
  weights?: {
    companyPerformance?: number
    cLevelAggregate?: number
  }
}

export interface InactivityDetectionInput {
  completedCount: number
  weekStart: Date
  queuePenalty?: boolean
  excusedWeek?: {
    isExcused: boolean
    reason?: string
  }
}

export interface InactivityDetectionResult {
  isInactive: boolean
  isExcused: boolean
  penaltyQueued: boolean
  reason?: string
}

export interface QueuedPenalty {
  id: string
  weekStart: Date | string
  consumed: boolean
}

export interface DisciplinaryDeductionInput {
  weeklyValue: number | null
  points: number // 0 < points <= 100
}

export interface DisciplinaryDeductionResult {
  value: number | null
  previousValue: number | null
  deductionPoints: number
  deductionApplied: boolean
  note?: string
}

export interface BackfillActor {
  role: string
  userId: string
  squadMemberIds?: string[]
}

export interface BackfillWindowRecord {
  id: string
  startsAt: Date
  endsAt: Date
  grantedRole: string
  isActive: boolean
}

export interface DecideBackfillInput {
  actor: BackfillActor
  subjectUserId: string
  effectiveAt: Date
  now: Date
  windows: BackfillWindowRecord[]
  mfaFresh?: boolean
  reasonProvided?: boolean
}

export interface DecideBackfillResult {
  allowed: boolean
  via?: 'STANDARD_REALTIME' | 'PM_WINDOW' | 'CHRO' | 'CEO'
  windowId?: string
  denyReason?: string
}

export interface XpLedgerEntryInput {
  delta: number
  category: TaskWeightCategoryType
  entryType?: string // 'AWARD' | 'REVERSAL' | 'ADJUSTMENT'
  status?: string // 'POSTED' | 'PENDING' | 'FROZEN'
}

export interface LeaderboardUser {
  userId: string
  name: string
  kpiScore: number | null // null = N/A
  lifetimeXp: number
  joinedAt: Date | string
  role?: string
  squadId?: string
}
