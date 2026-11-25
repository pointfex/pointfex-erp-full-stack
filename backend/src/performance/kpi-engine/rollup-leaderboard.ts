import { round2 } from './math.util'
import { LeaderboardUser } from './types'
import { getDhakaWeekBoundaries, DhakaWeekRange } from '../../common/dhaka-time.util'

export interface TrendPoint {
  weekNumber: number
  year: number
  score: number | null
  isInactive: boolean
  isProvisional: boolean
  statusDisplay: string // e.g. "85.50", "N/A", "Provisional (85.50)"
  pmScore?: number | null
  ctoScore?: number | null
  cpoScore?: number | null
  cfoScore?: number | null
  chroScore?: number | null
  inactivityPenaltyApplied?: boolean
  breakdown?: Record<string, any>
}

/**
 * Transforms historical weekly records into a standardized, chronologically sorted trend line series.
 */
export function kpiTrendSeries(
  weeks: Array<{
    weekNumber: number
    year: number
    score: number | null
    isInactive: boolean
    isProvisional?: boolean
    pmScore?: number | null
    ctoScore?: number | null
    cpoScore?: number | null
    cfoScore?: number | null
    chroScore?: number | null
    inactivityPenaltyApplied?: boolean
    breakdown?: Record<string, any>
  }>,
): TrendPoint[] {
  const sorted = [...weeks].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year
    return a.weekNumber - b.weekNumber
  })

  return sorted.map((w) => {
    let statusDisplay = 'N/A'
    if (w.isInactive) {
      statusDisplay = 'N/A'
    } else if (w.score !== null) {
      statusDisplay = round2(w.score).toFixed(2)
      if (w.isProvisional) {
        statusDisplay = `Provisional (${statusDisplay})`
      }
    } else {
      statusDisplay = 'Pending'
    }

    return {
      weekNumber: w.weekNumber,
      year: w.year,
      score: w.isInactive || w.score === null ? null : round2(w.score),
      isInactive: Boolean(w.isInactive),
      isProvisional: Boolean(w.isProvisional),
      statusDisplay,
      pmScore: w.pmScore ?? null,
      ctoScore: w.ctoScore ?? null,
      cpoScore: w.cpoScore ?? null,
      cfoScore: w.cfoScore ?? null,
      chroScore: w.chroScore ?? null,
      inactivityPenaltyApplied: false,
      breakdown: w.breakdown,
    }
  })
}

export interface RankedLeaderboardEntry extends LeaderboardUser {
  rank: number
}

/**
 * Produces a stable, deterministic ranking of users for the company leaderboard.
 *
 * Sorting Rules:
 * 1. If sortBy === 'XP':
 *    - Primary: lifetimeXp descending
 *    - Tie-break 1: kpiScore descending (numeric > null/NA)
 *    - Tie-break 2: joinedAt ascending (earlier tenure)
 *    - Tie-break 3: userId ascending (lexicographical)
 *
 * 2. If sortBy === 'KPI':
 *    - Primary: kpiScore descending (all numeric scores rank above any null/NA score)
 *    - Tie-break 1: lifetimeXp descending
 *    - Tie-break 2: joinedAt ascending (earlier tenure)
 *    - Tie-break 3: userId ascending (lexicographical)
 */
export function rankLeaderboard(
  users: LeaderboardUser[],
  sortBy: 'XP' | 'KPI' = 'XP',
): RankedLeaderboardEntry[] {
  const sorted = [...users].sort((a, b) => {
    if (sortBy === 'XP') {
      // 1. Primary: XP descending
      if (a.lifetimeXp !== b.lifetimeXp) {
        return b.lifetimeXp - a.lifetimeXp
      }

      // 2. Tie-break 1: KPI score descending (numeric > null)
      const aKpi = a.kpiScore ?? -1
      const bKpi = b.kpiScore ?? -1
      if (aKpi !== bKpi) {
        return bKpi - aKpi
      }
    } else {
      // 1. Primary: KPI descending (numeric > null)
      const aHasKpi = a.kpiScore !== null && Number.isFinite(a.kpiScore)
      const bHasKpi = b.kpiScore !== null && Number.isFinite(b.kpiScore)

      if (aHasKpi && !bHasKpi) return -1
      if (!aHasKpi && bHasKpi) return 1
      if (aHasKpi && bHasKpi && a.kpiScore !== b.kpiScore) {
        return (b.kpiScore as number) - (a.kpiScore as number)
      }

      // 2. Tie-break 1: XP descending
      if (a.lifetimeXp !== b.lifetimeXp) {
        return b.lifetimeXp - a.lifetimeXp
      }
    }

    // Common Tie-break 2: joinedAt ascending (earlier join date ranks higher)
    const aJoined = new Date(a.joinedAt).getTime()
    const bJoined = new Date(b.joinedAt).getTime()
    if (aJoined !== bJoined) {
      return aJoined - bJoined
    }

    // Common Tie-break 3: userId ascending (lexicographical)
    return a.userId.localeCompare(b.userId)
  })

  return sorted.map((user, index) => ({
    ...user,
    rank: index + 1,
  }))
}

export interface WeekRollupTask {
  id: string
  completedAt: Date
  score: number
  weightPoints: number
  context: 'MAIN_SQUAD' | 'OUTSIDE_SQUAD' | 'ISOLATED_EXECUTIVE'
}

/**
 * Partitions and rolls up tasks that fall into a specific calendar week in Asia/Dhaka.
 */
export function weekRollup(
  tasks: WeekRollupTask[],
  year: number,
  weekNumber: number,
): {
  range: DhakaWeekRange
  matchedTasks: WeekRollupTask[]
  taskCount: number
} {
  const range = getDhakaWeekBoundaries(year, weekNumber)

  const startMs = range.weekStartUtc.getTime()
  const endMs = range.weekEndUtc.getTime()

  const matchedTasks = tasks.filter((t) => {
    const compMs = new Date(t.completedAt).getTime()
    return compMs >= startMs && compMs <= endMs
  })

  return {
    range,
    matchedTasks,
    taskCount: matchedTasks.length,
  }
}

