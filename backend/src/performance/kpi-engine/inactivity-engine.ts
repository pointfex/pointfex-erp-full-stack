import {
  InactivityDetectionInput,
  InactivityDetectionResult,
  QueuedPenalty,
} from './types'

/**
 * Evaluates whether an employee had zero activity during a weekly cycle and queues an inactivity penalty.
 *
 * Rules:
 * 1. If completedCount === 0 and week is NOT excused, flag as INACTIVE (N/A) and queue a return penalty.
 * 2. Excused weeks (e.g. approved leave, CHRO documented exemption) are skipped and not penalized.
 */
export function detectInactivity(input: InactivityDetectionInput): InactivityDetectionResult {
  if (input.completedCount < 0) {
    throw new Error(`completedCount cannot be negative: ${input.completedCount}`)
  }

  if (input.excusedWeek?.isExcused) {
    return {
      isInactive: false,
      isExcused: true,
      penaltyQueued: false,
      reason: input.excusedWeek.reason || 'Excused absence / approved leave',
    }
  }

  if (input.completedCount === 0) {
    return {
      isInactive: true,
      isExcused: false,
      penaltyQueued: input.queuePenalty ?? true,
      reason: 'Inactivity: Zero deliverables or reviews completed during weekly cycle',
    }
  }

  return {
    isInactive: false,
    isExcused: false,
    penaltyQueued: false,
  }
}

export interface NextPenaltyOptions {
  allowStacking?: boolean // default false: exactly one penalty per task
}

export interface NextPenaltyResult {
  penaltyToConsume: QueuedPenalty | null
  remainingUnconsumedCount: number
}

/**
 * Determines which queued inactivity penalty to consume next for a newly evaluated task.
 *
 * Rules:
 * 1. FIFO selection by weekStart.
 * 2. Exactly one penalty is consumed per evaluated task (never stacked unless allowStacking = true).
 */
export function nextPenaltyToConsume(
  queue: QueuedPenalty[],
  options?: NextPenaltyOptions,
): NextPenaltyResult {
  const unconsumed = queue
    .filter((p) => !p.consumed)
    .sort((a, b) => new Date(a.weekStart).getTime() - new Date(b.weekStart).getTime())

  if (unconsumed.length === 0) {
    return {
      penaltyToConsume: null,
      remainingUnconsumedCount: 0,
    }
  }

  const penaltyToConsume = unconsumed[0]
  const remainingUnconsumedCount = unconsumed.length - 1

  return {
    penaltyToConsume,
    remainingUnconsumedCount,
  }
}

