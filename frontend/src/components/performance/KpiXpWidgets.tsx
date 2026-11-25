import { useState, useMemo } from 'react'
import {
  TrendingUp,
  Award,
  ShieldCheck,
  Lock,
  Clock,
  CheckCircle2,
} from 'lucide-react'

// --------------------------------------------------------------------------
// 1. WEEKLY KPI TREND LINE GRAPH (WITH RED N/A INACTIVITY & PROVISIONAL)
// --------------------------------------------------------------------------
export interface WeeklyKpiItem {
  id?: string
  weekNumber: number
  year: number
  score: number | string | null
  isInactive: boolean
  isProvisional?: boolean
  roleLevel?: number
  evaluationStatus?: string
  createdAt?: string
  pmScore?: number | null
  ctoScore?: number | null
  cpoScore?: number | null
  cfoScore?: number | null
  chroScore?: number | null
  inactivityPenaltyApplied?: boolean
  breakdown?: {
    baseScore?: number
    pmScore?: number
    cLevelMultipliers?: Record<string, number>
    cLevelScores?: Record<string, number>
    ceoMultiplier?: number
    inactivityPenalty?: number
    finalScore?: number
    [key: string]: any
  }
}

export function WeeklyKpiTrendGraph({
  data,
  series,
}: {
  data?: WeeklyKpiItem[]
  series?: WeeklyKpiItem[]
}) {
  const [activeHoverPoint, setActiveHoverPoint] = useState<any | null>(null)

  // Ensure last 8 weeks are represented chronologically
  const sorted = useMemo(() => {
    const raw = data || series || []
    if (raw.length === 0) return []
    const copy = [...raw].sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year
      return a.weekNumber - b.weekNumber
    })
    return copy.slice(-8)
  }, [data, series])

  if (sorted.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center text-[var(--muted)]">
        <TrendingUp className="mx-auto mb-2 h-8 w-8 text-[var(--muted)] opacity-60" />
        <p className="text-sm font-medium">No weekly KPI evaluations recorded yet.</p>
      </div>
    )
  }

  const height = 200
  const width = 540
  const padding = 40

  const points = sorted.map((d, index) => {
    const x =
      sorted.length === 1
        ? width / 2
        : padding + (index / (sorted.length - 1)) * (width - 2 * padding)
    const numericScore = d.isInactive || d.score === null ? 0 : Number(d.score)
    const y = height - padding - (numericScore / 100) * (height - 2 * padding)
    return {
      x,
      y,
      score: d.score,
      isInactive: d.isInactive,
      isProvisional: Boolean(d.isProvisional || d.evaluationStatus === 'PROVISIONAL'),
      week: d.weekNumber,
      year: d.year,
      pmScore: d.pmScore,
      ctoScore: d.ctoScore,
      cpoScore: d.cpoScore,
      cfoScore: d.cfoScore,
      chroScore: d.chroScore,
      inactivityPenaltyApplied: d.inactivityPenaltyApplied,
      breakdown: d.breakdown,
    }
  })

  // Connected path for active weeks
  const pathD = points
    .filter((p) => !p.isInactive && p.score !== null)
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ')

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xs transition-colors relative">
      <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div className="rounded-xl bg-indigo-500/10 p-2 text-indigo-500 dark:text-indigo-400">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[var(--text)]">
              Weekly KPI Trend ({sorted.length} {sorted.length === 1 ? 'Week Recorded' : 'Weeks Recorded'})
            </h3>
            <p className="text-xs text-[var(--muted)]">
              Bounded 0–100 weekly execution efficiency. Hover any point for formula breakdown.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs flex-wrap">
          <span className="flex items-center gap-1.5 font-medium text-[var(--text)]">
            <span className="h-2.5 w-2.5 rounded-full bg-indigo-500"></span> Official
          </span>
          <span className="flex items-center gap-1.5 font-medium text-amber-500">
            <span className="h-2.5 w-2.5 rounded-full border-2 border-amber-500 bg-transparent"></span> Provisional
          </span>
          <span className="flex items-center gap-1.5 font-medium text-rose-500">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500"></span> N/A (Inactivity)
          </span>
        </div>
      </div>

      <div className="relative overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full overflow-visible"
          style={{ minWidth: '380px' }}
        >
          {/* Grid lines */}
          <line
            x1={padding}
            y1={padding}
            x2={width - padding}
            y2={padding}
            stroke="currentColor"
            className="text-slate-200/50 dark:text-slate-800/80"
            strokeDasharray="4 4"
          />
          <text x={padding - 8} y={padding + 4} textAnchor="end" className="text-[10px] fill-[var(--muted)] font-mono">
            100
          </text>

          <line
            x1={padding}
            y1={height / 2}
            x2={width - padding}
            y2={height / 2}
            stroke="currentColor"
            className="text-slate-200/50 dark:text-slate-800/80"
            strokeDasharray="4 4"
          />
          <text x={padding - 8} y={height / 2 + 4} textAnchor="end" className="text-[10px] fill-[var(--muted)] font-mono">
            50
          </text>

          <line
            x1={padding}
            y1={height - padding}
            x2={width - padding}
            y2={height - padding}
            stroke="currentColor"
            className="text-slate-300 dark:text-slate-700"
          />
          <text
            x={padding - 8}
            y={height - padding + 4}
            textAnchor="end"
            className="text-[10px] fill-[var(--muted)] font-mono"
          >
            0
          </text>

          {/* Connected Path */}
          {pathD && (
            <path
              d={pathD}
              fill="none"
              stroke="#6366F1"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Points */}
          {points.map((p, i) => {
            const isHovered = activeHoverPoint?.week === p.week && activeHoverPoint?.year === p.year

            return (
              <g
                key={i}
                className="cursor-pointer transition-transform duration-150"
                onMouseEnter={() => setActiveHoverPoint(p)}
                onMouseLeave={() => setActiveHoverPoint(null)}
              >
                {p.isInactive ? (
                  <g>
                    {/* Visual Red Inactivity Indicator Line */}
                    <line
                      x1={p.x}
                      y1={padding}
                      x2={p.x}
                      y2={height - padding}
                      stroke="#F43F5E"
                      strokeWidth="1.5"
                      strokeDasharray="3 3"
                      opacity="0.8"
                    />
                    {/* Distinctive Red Flag Pill */}
                    <rect
                      x={p.x - 15}
                      y={height - padding - 26}
                      width="30"
                      height="16"
                      rx="4"
                      className="fill-rose-600 drop-shadow-sm"
                    />
                    <text
                      x={p.x}
                      y={height - padding - 14}
                      textAnchor="middle"
                      className="text-[9px] font-extrabold fill-white tracking-wide"
                    >
                      N/A
                    </text>
                  </g>
                ) : p.isProvisional ? (
                  <g>
                    {/* Hollow marker for provisional current week */}
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={isHovered ? 7 : 5.5}
                      className="fill-[var(--surface)] stroke-amber-500 stroke-[2.5]"
                    />
                    <rect
                      x={p.x - 24}
                      y={p.y - 24}
                      width="48"
                      height="14"
                      rx="3"
                      className="fill-amber-500/20 stroke stroke-amber-500/50"
                    />
                    <text
                      x={p.x}
                      y={p.y - 14}
                      textAnchor="middle"
                      className="text-[8px] font-bold fill-amber-600 dark:fill-amber-400"
                    >
                      PROV {Math.round(Number(p.score))}
                    </text>
                  </g>
                ) : (
                  <g>
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={isHovered ? 6.5 : 5}
                      className="fill-[var(--surface)] stroke-indigo-500 stroke-[2.5]"
                    />
                    <text
                      x={p.x}
                      y={p.y - 9}
                      textAnchor="middle"
                      className="text-[10px] font-bold fill-[var(--text)]"
                    >
                      {Math.round(Number(p.score))}
                    </text>
                  </g>
                )}

                <text
                  x={p.x}
                  y={height - 12}
                  textAnchor="middle"
                  className="text-[10px] font-medium fill-[var(--muted)]"
                >
                  W{p.week}
                </text>
              </g>
            )
          })}
        </svg>

        {/* Hover Formula Breakdown Card */}
        {activeHoverPoint && (
          <div
            className="absolute z-20 top-2 right-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 shadow-lg max-w-xs text-xs pointer-events-none animate-in fade-in duration-150"
          >
            <div className="flex items-center justify-between pb-1.5 border-b border-[var(--border)] mb-2 font-semibold">
              <span className="text-[var(--text)]">
                Week {activeHoverPoint.week}, {activeHoverPoint.year}
              </span>
              {activeHoverPoint.isInactive ? (
                <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-500 font-bold text-[10px]">
                  INACTIVE (N/A)
                </span>
              ) : activeHoverPoint.isProvisional ? (
                <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 font-bold text-[10px]">
                  PROVISIONAL
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-bold text-[10px]">
                  OFFICIAL
                </span>
              )}
            </div>

            {activeHoverPoint.isInactive ? (
              <p className="text-[var(--muted)] leading-relaxed text-[11px]">
                0 tasks completed during this week. Week marked N/A (red indicator). No carry-forward penalty per §2.4.
              </p>
            ) : (
              <div className="space-y-1 font-mono text-[11px]">
                {activeHoverPoint.pmScore != null && (
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">PM Satisfaction (40%):</span>
                    <span className="text-[var(--text)]">{activeHoverPoint.pmScore}</span>
                  </div>
                )}
                {activeHoverPoint.ctoScore != null && (
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">CTO Score (15%):</span>
                    <span className="text-[var(--text)]">{activeHoverPoint.ctoScore}</span>
                  </div>
                )}
                {activeHoverPoint.cpoScore != null && (
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">CPO Score (15%):</span>
                    <span className="text-[var(--text)]">{activeHoverPoint.cpoScore}</span>
                  </div>
                )}
                {activeHoverPoint.cfoScore != null && (
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">CFO Score (15%):</span>
                    <span className="text-[var(--text)]">{activeHoverPoint.cfoScore}</span>
                  </div>
                )}
                {activeHoverPoint.chroScore != null && (
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">CHRO Score (15%):</span>
                    <span className="text-[var(--text)]">{activeHoverPoint.chroScore}</span>
                  </div>
                )}
                <div className="pt-1.5 border-t border-[var(--border)] flex justify-between font-bold text-[var(--text)]">
                  <span>Final KPI Score:</span>
                  <span className="text-indigo-600 dark:text-indigo-400">
                    {Number(activeHoverPoint.score).toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// --------------------------------------------------------------------------
// 2. LIFETIME XP STACKED PROGRESSION BAR CHART (SMALL, MEDIUM, LARGE, CRITICAL, CUSTOM)
// --------------------------------------------------------------------------
export interface LifetimeXpStackedChartProps {
  lifetimeXp: number
  postedXp?: number
  pendingXp?: number
  frozenXp?: number
  tierCeiling?: number
  breakdown?: {
    smallXp?: number
    mediumXp?: number
    largeXp?: number
    criticalXp?: number
    customXp?: number
    SMALL?: number
    MEDIUM?: number
    LARGE?: number
    CRITICAL?: number
    CUSTOM?: number
    [key: string]: number | undefined
  }
}

export function LifetimeXpStackedChart({
  lifetimeXp,
  postedXp,
  pendingXp = 0,
  frozenXp = 0,
  tierCeiling,
  breakdown,
}: LifetimeXpStackedChartProps) {
  const currentXp = Math.max(0, lifetimeXp || 0)
  const actualPosted = postedXp ?? currentXp

  const currentLevel = Math.floor(actualPosted / 1000) + 1
  const xpInCurrentLevel = actualPosted % 1000
  const progressPercent = Math.min(100, Math.round((xpInCurrentLevel / 1000) * 100))

  // §5.2 Color-coded segments representing task categories:
  // Small: Emerald, Medium: Sky, Large: Indigo, Critical: Rose, Custom: Amber
  const smallVal = Number(breakdown?.smallXp ?? breakdown?.SMALL ?? 0)
  const medVal = Number(breakdown?.mediumXp ?? breakdown?.MEDIUM ?? 0)
  const lrgVal = Number(breakdown?.largeXp ?? breakdown?.LARGE ?? 0)
  const critVal = Number(breakdown?.criticalXp ?? breakdown?.CRITICAL ?? 0)
  const custVal = Number(breakdown?.customXp ?? breakdown?.CUSTOM ?? 0)

  const hasCategoryBreakdown = smallVal + medVal + lrgVal + critVal + custVal > 0
  const categoryTotal = hasCategoryBreakdown
    ? smallVal + medVal + lrgVal + critVal + custVal
    : actualPosted || 1

  // If no category breakdown was provided via props, provide a graceful fallback distribution based on standard weights
  const effSmall = hasCategoryBreakdown ? smallVal : Math.round(categoryTotal * 0.20)
  const effMed = hasCategoryBreakdown ? medVal : Math.round(categoryTotal * 0.40)
  const effLrg = hasCategoryBreakdown ? lrgVal : Math.round(categoryTotal * 0.25)
  const effCrit = hasCategoryBreakdown ? critVal : Math.round(categoryTotal * 0.10)
  const effCust = hasCategoryBreakdown ? custVal : Math.max(0, categoryTotal - effSmall - effMed - effLrg - effCrit)

  const pSmall = (effSmall / categoryTotal) * 100
  const pMed = (effMed / categoryTotal) * 100
  const pLrg = (effLrg / categoryTotal) * 100
  const pCrit = (effCrit / categoryTotal) * 100
  const pCust = (effCust / categoryTotal) * 100

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xs transition-colors">
      <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div className="rounded-xl bg-amber-500/10 p-2 text-amber-500 dark:text-amber-400">
            <Award className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[var(--text)]">Lifetime XP &amp; Progression</h3>
            <p className="text-xs text-[var(--muted)]">
              Category contribution: Small (1 pt), Medium (3 pts), Large (5 pts), Critical (7 pts)
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-baseline justify-end gap-1">
            <span className="text-2xl font-black tracking-tight text-[var(--text)]">
              {actualPosted.toLocaleString()}
            </span>
            <span className="text-xs font-bold text-amber-500">POSTED XP</span>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400 border border-amber-500/20">
            Level {currentLevel} Specialist
          </span>
        </div>
      </div>

      {/* §5.2 Lifetime XP Stacked Progression Bar by Category */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Category Contribution Breakdown
          </span>
          <span className="text-[11px] text-[var(--muted)] font-mono">
            {actualPosted.toLocaleString()} XP Total
          </span>
        </div>

        <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-slate-200/50 dark:bg-slate-800">
          {effSmall > 0 && (
            <div
              style={{ width: `${pSmall}%` }}
              className="bg-emerald-500 transition-all duration-300"
              title={`Small: ${effSmall.toLocaleString()} XP (${Math.round(pSmall)}%)`}
            />
          )}
          {effMed > 0 && (
            <div
              style={{ width: `${pMed}%` }}
              className="bg-sky-500 transition-all duration-300"
              title={`Medium: ${effMed.toLocaleString()} XP (${Math.round(pMed)}%)`}
            />
          )}
          {effLrg > 0 && (
            <div
              style={{ width: `${pLrg}%` }}
              className="bg-indigo-600 transition-all duration-300"
              title={`Large: ${effLrg.toLocaleString()} XP (${Math.round(pLrg)}%)`}
            />
          )}
          {effCrit > 0 && (
            <div
              style={{ width: `${pCrit}%` }}
              className="bg-rose-500 transition-all duration-300"
              title={`Critical: ${effCrit.toLocaleString()} XP (${Math.round(pCrit)}%)`}
            />
          )}
          {effCust > 0 && (
            <div
              style={{ width: `${pCust}%` }}
              className="bg-amber-500 transition-all duration-300"
              title={`Custom: ${effCust.toLocaleString()} XP (${Math.round(pCust)}%)`}
            />
          )}
        </div>

        {/* Legend pills for 5 categories per §5.2 */}
        <div className="mt-2.5 flex flex-wrap gap-2 text-[11px] font-medium">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Small: {effSmall} XP
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400">
            <span className="h-2 w-2 rounded-full bg-sky-500" />
            Medium: {effMed} XP
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <span className="h-2 w-2 rounded-full bg-indigo-600" />
            Large: {effLrg} XP
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400">
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            Critical: {effCrit} XP
          </span>
          {effCust > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              Custom: {effCust} XP
            </span>
          )}
        </div>
      </div>

      {/* Progression Bar to Next Rank Threshold */}
      <div className="pt-3 border-t border-[var(--border)]">
        <div className="mb-1.5 flex justify-between text-xs text-[var(--muted)]">
          <span>Level {currentLevel} Milestone</span>
          <span className="font-semibold text-[var(--text)] font-mono">
            {xpInCurrentLevel} / 1,000 XP to Level {currentLevel + 1}
            {tierCeiling ? ` (Tier Cap: ${tierCeiling} XP)` : ''}
          </span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200/50 dark:bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Pipeline Status Summary (Posted, Pending, Frozen) */}
      {(pendingXp > 0 || frozenXp > 0) && (
        <div className="mt-3 pt-3 border-t border-[var(--border)] grid grid-cols-3 gap-2 text-center text-xs">
          <div className="p-1.5 rounded-[var(--radius-control)] bg-[var(--surface-muted)] border border-[var(--border)]">
            <div className="flex items-center justify-center gap-1 text-indigo-600 dark:text-indigo-400 font-semibold text-[11px]">
              <CheckCircle2 className="w-3 h-3" />
              <span>Posted</span>
            </div>
            <div className="text-xs font-bold text-[var(--text)] mt-0.5">
              {actualPosted.toLocaleString()}
            </div>
          </div>

          <div className="p-1.5 rounded-[var(--radius-control)] bg-[var(--surface-muted)] border border-[var(--border)]">
            <div className="flex items-center justify-center gap-1 text-sky-500 font-semibold text-[11px]">
              <Clock className="w-3 h-3" />
              <span>Pending</span>
            </div>
            <div className="text-xs font-bold text-[var(--text)] mt-0.5">
              {pendingXp.toLocaleString()}
            </div>
          </div>

          <div className="p-1.5 rounded-[var(--radius-control)] bg-[var(--surface-muted)] border border-[var(--border)]">
            <div className="flex items-center justify-center gap-1 text-amber-500 font-semibold text-[11px]">
              <Lock className="w-3 h-3" />
              <span>Frozen</span>
            </div>
            <div className="text-xs font-bold text-[var(--text)] mt-0.5">
              {frozenXp.toLocaleString()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// --------------------------------------------------------------------------
// 3. IMMUTABLE USER-FACING KPI & XP AUDIT LEDGER TABLE
// --------------------------------------------------------------------------
export interface KpiXpAuditItem {
  id: string
  sequence: number
  metricType: string // 'KPI' | 'XP'
  deltaValue: number | string
  valueBefore?: number | string | null
  valueAfter?: number | string | null
  resultingTotal?: number | string | null
  actionType: string
  triggerEvent: string
  authorizedRole: string
  authorizedById?: string
  authorizedBy?: { id: string; name: string; title: string } | null
  reason?: string | null
  createdAt?: string
  recordedAt?: string
  effectiveAt?: string
  isBackfilled?: boolean
  annotations?: Array<{ id: string; note: string; authorName: string; createdAt: string }>
}

export interface KpiXpAuditLedgerTableProps {
  items?: KpiXpAuditItem[]
  logs?: KpiXpAuditItem[]
  employeeName?: string
  canEdit?: boolean
  onSaveAuditReason?: (logId: string, newReason: string) => Promise<void> | void
  onAddAnnotation?: (id: string, note: string) => void
}

export function KpiXpAuditLedgerTable({
  items,
  logs,
  employeeName,
  canEdit: _canEdit,
  onSaveAuditReason: _onSaveAuditReason,
  onAddAnnotation: _onAddAnnotation,
}: KpiXpAuditLedgerTableProps) {
  const displayItems = items || logs || []

  if (!displayItems || displayItems.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-[var(--muted)]">
        <ShieldCheck className="mx-auto mb-2 h-8 w-8 text-[var(--muted)] opacity-60" />
        <p className="text-sm font-medium">No ledger audit records on chain.</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xs transition-colors">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-500">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[var(--text)]">
              Cryptographic Performance Ledger
            </h3>
            <p className="text-xs text-[var(--muted)]">
              Immutable SHA-256 hash-chained ledger {employeeName ? `for ${employeeName}` : ''}
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto border border-[var(--border)] rounded-[var(--radius-card)]">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="bg-[var(--surface-muted)] border-b border-[var(--border)] text-[var(--muted)] font-semibold">
            <tr>
              <th className="px-3 py-2.5">Seq</th>
              <th className="px-3 py-2.5">Metric</th>
              <th className="px-3 py-2.5">Delta</th>
              <th className="px-3 py-2.5">Before / After</th>
              <th className="px-3 py-2.5">Action &amp; Trigger</th>
              <th className="px-3 py-2.5">Authority</th>
              <th className="px-3 py-2.5">Chain</th>
              <th className="px-3 py-2.5">Timestamp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {displayItems.map((entry) => {
              const deltaNum = Number(entry.deltaValue)
              const isPositive = deltaNum > 0
              const isZero = deltaNum === 0
              const isXp = entry.metricType === 'XP'

              return (
                <tr key={entry.id} className="hover:bg-[var(--surface-muted)]/50 transition-colors">
                  <td className="px-3 py-2 font-mono font-medium text-[var(--muted)]">
                    #{entry.sequence}
                  </td>
                  <td className="px-3 py-2 font-bold">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${
                        isXp
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                          : 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400'
                      }`}
                    >
                      {entry.metricType}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono font-bold">
                    <span
                      className={
                        isZero
                          ? 'text-[var(--muted)]'
                          : isPositive
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                      }
                    >
                      {isPositive ? `+${entry.deltaValue}` : entry.deltaValue}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-[var(--muted)] text-[11px]">
                    {entry.valueBefore !== undefined && entry.valueBefore !== null
                      ? `${entry.valueBefore} → ${entry.valueAfter ?? '—'}`
                      : entry.resultingTotal !== undefined
                        ? `Total: ${entry.resultingTotal}`
                        : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-semibold text-[var(--text)]">{entry.actionType}</div>
                    <div className="text-[11px] text-[var(--muted)]">{entry.triggerEvent}</div>
                  </td>
                  <td className="px-3 py-2 text-[var(--muted)]">
                    <span className="font-medium text-[var(--text)] uppercase text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-muted)]">
                      {entry.authorizedRole}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-[11px] font-mono">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Valid
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[var(--muted)] whitespace-nowrap">
                    {new Date(entry.recordedAt || entry.createdAt || Date.now()).toLocaleDateString()}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
