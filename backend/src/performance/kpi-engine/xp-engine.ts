import { round2 } from './math.util'
import {
  XpCalculationInput,
  XpCalculationResult,
  XpLedgerEntryInput,
  TaskWeightCategoryType,
} from './types'

/**
 * Standard task weight point schedule per CHRO Requirements §1.
 * Small: 1, Medium: 3, Large: 5, Critical: 7
 */
export const STANDARD_TASK_WEIGHTS: Record<Exclude<TaskWeightCategoryType, 'CUSTOM'>, number> = {
  SMALL: 1,
  MEDIUM: 3,
  LARGE: 5,
  CRITICAL: 7,
}

/**
 * Standard task XP schedule per CHRO Requirements §1 (10 × approved weight).
 * Small: 10, Medium: 30, Large: 50, Critical: 70
 */
export const STANDARD_TASK_XP: Record<Exclude<TaskWeightCategoryType, 'CUSTOM'>, number> = {
  SMALL: 10,
  MEDIUM: 30,
  LARGE: 50,
  CRITICAL: 70,
}

/**
 * Calculates XP adjustment for an already rewarded task when approved weight changes (§3.3).
 * XP adjustment = 10 × (new approved weight − previous approved weight).
 * Returns the signed difference as a separate audit transaction.
 */
export function calculateXpAdjustment(newApprovedWeight: number, previousApprovedWeight: number): number {
  if (!Number.isFinite(newApprovedWeight) || !Number.isFinite(previousApprovedWeight)) {
    throw new Error(`Invalid weights for adjustment: new=${newApprovedWeight}, prev=${previousApprovedWeight}`)
  }
  return round2(10 * (newApprovedWeight - previousApprovedWeight))
}

/**
 * Derives pure XP yield from verified task weight points.
 *
 * Rules:
 * 1. XP Yield = verifiedWeightPoints * 10, exactly (§1).
 * 2. XP NEVER depends on PM satisfaction score or squad context multipliers.
 * 3. Status is PENDING if weightStatus !== 'VERIFIED'.
 * 4. Status is FROZEN if xp >= threshold (default 200).
 * 5. Status is POSTABLE otherwise.
 */
export function xpForTask(input: XpCalculationInput): XpCalculationResult {
  if (input.weightPoints < 0 || !Number.isFinite(input.weightPoints)) {
    throw new Error(`Invalid weightPoints: ${input.weightPoints}. Must be non-negative finite number.`)
  }

  const threshold = input.isFrozenThresholdXp ?? 200
  const xp = round2(input.weightPoints * 10)

  let state: 'PENDING' | 'FROZEN' | 'POSTABLE' = 'POSTABLE'

  if (input.weightStatus !== 'VERIFIED') {
    state = 'PENDING'
  } else if (xp >= threshold) {
    state = 'FROZEN'
  } else {
    state = 'POSTABLE'
  }

  return {
    xp,
    state,
    thresholdUsed: threshold,
  }
}

export interface CumulativeCategoryBreakdown {
  totalXp: number
  byCategory: {
    smallXp: number
    mediumXp: number
    largeXp: number
    criticalXp: number
    customXp: number
  }
}

/**
 * Aggregates lifetime career XP composition by task weight category for the stacked progression chart.
 *
 * Rules:
 * 1. Only considers active/posted entries (status is undefined or 'POSTED').
 * 2. Respects reversals by reducing the respective category.
 * 3. Returns non-negative category breakdown.
 */
export function cumulativeXpByCategory(
  entries: XpLedgerEntryInput[],
): CumulativeCategoryBreakdown {
  let smallXp = 0
  let mediumXp = 0
  let largeXp = 0
  let criticalXp = 0
  let customXp = 0

  for (const entry of entries) {
    // Only count POSTED entries (or untagged awards); ignore PENDING or FROZEN entries
    if (entry.status && entry.status !== 'POSTED') {
      continue
    }

    const delta = entry.delta
    const category: TaskWeightCategoryType = entry.category || 'MEDIUM'

    switch (category) {
      case 'SMALL':
        smallXp += delta
        break
      case 'MEDIUM':
        mediumXp += delta
        break
      case 'LARGE':
        largeXp += delta
        break
      case 'CRITICAL':
        criticalXp += delta
        break
      case 'CUSTOM':
      default:
        customXp += delta
        break
    }
  }

  // Categories cannot be negative in career display
  smallXp = Math.max(0, round2(smallXp))
  mediumXp = Math.max(0, round2(mediumXp))
  largeXp = Math.max(0, round2(largeXp))
  criticalXp = Math.max(0, round2(criticalXp))
  customXp = Math.max(0, round2(customXp))

  const totalXp = round2(smallXp + mediumXp + largeXp + criticalXp + customXp)

  return {
    totalXp,
    byCategory: {
      smallXp,
      mediumXp,
      largeXp,
      criticalXp,
      customXp,
    },
  }
}

