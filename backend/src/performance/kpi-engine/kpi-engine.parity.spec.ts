/**
 * KPI & XP Engine Parity Test Suite
 *
 * Verifies mathematical parity where legacy v3.14.0 and SRS specifications align,
 * and asserts exact, documented intentional divergences where v3.14.0 contradicted
 * the CHRO memorandum (12 Nov 2026).
 *
 * Reference: docs/kpi-xp/ENGINE_PARITY.md
 */

import {
  xpForTask,
  taskScoreDeveloper,
  weeklyKpiDeveloper,
  weeklyKpiPm,
  weeklyKpiCLevel,
  weeklyKpiCeo,
} from './index'

describe('KPI & XP Engine Parity & Intentional Divergences (v3.14.0 Legacy vs Pure SRS Engine)', () => {
  // ==========================================================================
  // 1. XP YIELD: Volume Metric Invariant
  // ==========================================================================
  describe('1. XP Yield Parity & Intentional Divergences', () => {
    // Legacy helper logic from KpiEngineService.verifyTaskWeight / releaseFrozenXp:
    // const xpYield = Math.round(approvedWeight * squadMultiplier * 10)
    const legacyCalculateXp = (weight: number, squadMultiplier: number): number => {
      return Math.round(weight * squadMultiplier * 10)
    }

    it('maintains PARITY on standard MAIN_SQUAD tasks (multiplier = 1.0)', () => {
      const weights = [1, 2, 3, 5, 10]
      for (const w of weights) {
        const legacyXp = legacyCalculateXp(w, 1.0)
        const pureXp = xpForTask({ weightPoints: w, weightStatus: 'VERIFIED' })
        expect(pureXp.xp).toBe(legacyXp)
        expect(pureXp.xp).toBe(w * 10)
      }
    })

    it('INTENTIONAL DIVERGENCE: XP yield is invariant to squad context (OUTSIDE_SQUAD)', () => {
      // Legacy: 3 points * 0.7 * 10 = 21 XP (developer XP erroneously docked for helping another squad)
      const legacyXp = legacyCalculateXp(3, 0.7)
      expect(legacyXp).toBe(21)

      // SRS: XP is lifetime volume metric = weightPoints * 10, strictly invariant to context
      const pureXp = xpForTask({ weightPoints: 3, weightStatus: 'VERIFIED' })
      expect(pureXp.xp).toBe(30)
      expect(pureXp.xp).not.toBe(legacyXp)
    })

    it('INTENTIONAL DIVERGENCE: XP yield is invariant to squad context (ISOLATED_EXECUTIVE)', () => {
      // Legacy: 5 points * 0.5 * 10 = 25 XP (developer XP cut in half for executive direct assignment)
      const legacyXp = legacyCalculateXp(5, 0.5)
      expect(legacyXp).toBe(25)

      // SRS: XP is volume metric = 5 * 10 = 50 XP
      const pureXp = xpForTask({ weightPoints: 5, weightStatus: 'VERIFIED' })
      expect(pureXp.xp).toBe(50)
      expect(pureXp.xp).not.toBe(legacyXp)
    })
  })

  // ==========================================================================
  // 2. MASSIVE XP THRESHOLD: Quorum Freezing
  // ==========================================================================
  describe('2. Massive XP Threshold Parity & Intentional Divergences', () => {
    // Legacy v3.14.0 hardcoded threshold: weight >= 50 (500 XP)
    const legacyIsMassive = (weight: number): boolean => weight >= 50

    it('maintains PARITY for massive tasks >= 500 XP (both freeze)', () => {
      const weight = 50 // 500 XP
      expect(legacyIsMassive(weight)).toBe(true)

      const pureResult = xpForTask({ weightPoints: weight, weightStatus: 'VERIFIED' })
      expect(pureResult.state).toBe('FROZEN')
      expect(pureResult.xp).toBe(500)
    })

    it('INTENTIONAL DIVERGENCE: SRS default threshold is 200 XP (weight >= 20) instead of 500 XP', () => {
      const weight = 25 // 250 XP
      // Legacy erroneously allowed 250 XP without quorum review
      expect(legacyIsMassive(weight)).toBe(false)

      // SRS freezes any task yield >= 200 XP
      const pureResult = xpForTask({ weightPoints: weight, weightStatus: 'VERIFIED' })
      expect(pureResult.state).toBe('FROZEN')
      expect(pureResult.xp).toBe(250)
    })
  })

  // ==========================================================================
  // 3. TASK LEVEL SCORING & INACTIVITY PENALTY
  // ==========================================================================
  describe('3. Developer Task Scoring & Inactivity Return Penalty', () => {
    // Legacy v3.14.0 logic from KpiEngineService.evaluateTaskScore:
    // let score = pm * 0.5 + cto * 0.15 + cpo * 0.15 + cfo * 0.1 + chro * 0.1
    // if (penalty) score = Math.max(0, score - 10)
    const legacyComposite = (pm: number, cto: number, cpo: number, cfo: number, chro: number, penalty: boolean) => {
      let score = pm * 0.5 + cto * 0.15 + cpo * 0.15 + cfo * 0.1 + chro * 0.1
      if (penalty) score = Math.max(0, score - 10)
      return score
    }

    it('maintains PARITY on unpenalized composite task evaluations', () => {
      const legacyScore = legacyComposite(90, 85, 95, 80, 80, false)
      // 90*0.5 (45) + 85*0.15 (12.75) + 95*0.15 (14.25) + 80*0.1 (8) + 80*0.1 (8) = 88.0
      expect(legacyScore).toBe(88.0)

      const pureResult = taskScoreDeveloper({
        pm: { score: 90 },
        cto: { score: 85, status: 'CONFIRMED' },
        cpo: { score: 95, status: 'CONFIRMED' },
        cfo: { score: 80, status: 'CONFIRMED' },
        chro: { score: 80, status: 'CONFIRMED' },
        weights: { pm: 0.50, cto: 0.15, cpo: 0.15, cfo: 0.10, chro: 0.10 },
      })
      expect(pureResult.baseScore).toBe(88.0)
      expect(pureResult.finalScore).toBe(88.0)
      expect(pureResult.isProvisional).toBe(false)
    })

    it('INTENTIONAL DIVERGENCE: CHRO v4.2 assigns 40% PM and 15% each to CTO, CPO, CFO, CHRO', () => {
      const v42Result = taskScoreDeveloper({
        pm: { score: 90 },
        cto: { score: 85, status: 'CONFIRMED' },
        cpo: { score: 95, status: 'CONFIRMED' },
        cfo: { score: 80, status: 'CONFIRMED' },
        chro: { score: 80, status: 'CONFIRMED' },
      })
      // 90*0.40 (36) + 85*0.15 (12.75) + 95*0.15 (14.25) + 80*0.15 (12) + 80*0.15 (12) = 87.0
      expect(v42Result.baseScore).toBe(87.0)
      expect(v42Result.finalScore).toBe(87.0)
      expect(v42Result.isProvisional).toBe(false)
    })

    it('INTENTIONAL DIVERGENCE: Inactivity penalty is multiplicative (score * 0.90) rather than flat (-10 points)', () => {
      // Base score 90:
      // Legacy: flat subtraction: 90 - 10 = 80.0
      const legacyPenalized = legacyComposite(90, 90, 90, 90, 90, true)
      expect(legacyPenalized).toBe(80.0)

      // SRS: multiplicative 10% reduction: 90 * 0.90 = 81.0
      const purePenalized = taskScoreDeveloper({
        pm: { score: 90 },
        cto: { score: 90, status: 'CONFIRMED' },
        cpo: { score: 90, status: 'CONFIRMED' },
        cfo: { score: 90, status: 'CONFIRMED' },
        chro: { score: 90, status: 'CONFIRMED' },
        penaltyToApply: { penaltyRate: 0.10 },
      })
      expect(purePenalized.finalScore).toBe(81.0)
      expect(purePenalized.finalScore).not.toBe(legacyPenalized)
    })

    it('INTENTIONAL DIVERGENCE: Proportional penalty prevents complete wipe-out on low base scores', () => {
      // Base score 8.0:
      // Legacy: Math.max(0, 8.0 - 10) = 0.0 (wipes out employee deliverable entirely)
      const legacyPenalized = legacyComposite(8, 8, 8, 8, 8, true)
      expect(legacyPenalized).toBe(0.0)

      // SRS: 8.0 * (1 - 0.10) = 7.20 (proportional 10% penalty, preserves merit)
      const purePenalized = taskScoreDeveloper({
        pm: { score: 8 },
        penaltyToApply: { penaltyRate: 0.10 },
      })
      expect(purePenalized.finalScore).toBe(7.2)
    })
  })

  // ==========================================================================
  // 4. ZERO TASK WEEKLY CYCLE (N/A vs DEFAULT 85)
  // ==========================================================================
  describe('4. Zero Deliverables Inactivity Handling', () => {
    it('INTENTIONAL DIVERGENCE: Zero completed tasks yields N/A (null) rather than arbitrary 85.0', () => {
      // Legacy v3.14.0 calculateDeveloperWeeklyKpi line 144:
      // const pmScore = totalWeightMultiplier > 0 ? (totalWeightedScore / totalWeightMultiplier) : 85
      const legacyZeroTasksScore = 85.0

      // SRS: Zero deliverables = inactive week, score is null, status is NA, reason INACTIVE
      const pureResult = weeklyKpiDeveloper({ tasks: [] })
      expect(pureResult.value).toBeNull()
      expect(pureResult.status).toBe('NA')
      expect(pureResult.reason).toBe('INACTIVE')
      expect(pureResult.value).not.toBe(legacyZeroTasksScore)
    })
  })

  // ==========================================================================
  // 5. EXECUTIVE LEVELS (L2 PM, L3 C-LEVEL, L4 CEO) PARITY
  // ==========================================================================
  describe('5. Higher Level Formulas PARITY', () => {
    it('maintains PARITY on Level 2 PM weekly composite evaluation (30/30/20/20)', () => {
      // Legacy calculatePmWeeklyKpi:
      // cto * 0.3 + cpo * 0.3 + cfo * 0.2 + chro * 0.2
      const cto = 88, cpo = 92, cfo = 85, chro = 85
      const legacyPm = cto * 0.3 + cpo * 0.3 + cfo * 0.2 + chro * 0.2
      expect(legacyPm).toBe(88.0)

      const purePm = weeklyKpiPm({
        hasCompletions: true,
        cto: { score: cto, status: 'CONFIRMED' },
        cpo: { score: cpo, status: 'CONFIRMED' },
        cfo: { score: cfo, status: 'CONFIRMED' },
        chro: { score: chro, status: 'CONFIRMED' },
      })
      expect(purePm.value).toBe(88.0)
      expect(purePm.status).toBe('OFFICIAL')
    })

    it('maintains PARITY on Level 3 C-Level composite evaluation (40/30/20/10)', () => {
      // Legacy calculateCLevelWeeklyKpi:
      // 0.40 * goal + 0.30 * domain + 0.20 * ceo + 0.10 * peer
      const goal = 90, domain = 85, ceo = 95, peer = 80
      const legacyCLevel = goal * 0.4 + domain * 0.3 + ceo * 0.2 + peer * 0.1
      expect(legacyCLevel).toBe(88.5)

      const pureCLevel = weeklyKpiCLevel({
        companyGoal: goal,
        domainExecution: domain,
        ceoReview: ceo,
        peerSynergy: peer,
      })
      expect(pureCLevel.value).toBe(88.5)
      expect(pureCLevel.status).toBe('OFFICIAL')
    })

    it('maintains PARITY on Level 4 CEO composite evaluation (60/40)', () => {
      // Legacy calculateCeoWeeklyKpi:
      // 0.60 * company + 0.40 * cLevelAvg
      const company = 94, cLevelAvg = 88
      const legacyCeo = company * 0.6 + cLevelAvg * 0.4
      expect(legacyCeo).toBe(91.6)

      const pureCeo = weeklyKpiCeo({
        companyPerformance: company,
        cLevelFinalKpis: [{ score: cLevelAvg, isInactive: false }],
      })
      expect(pureCeo.value).toBe(91.6)
      expect(pureCeo.status).toBe('OFFICIAL')
    })
  })
})
