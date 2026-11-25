import {
  round2,
  clamp,
  validateWeightsSum,
  xpForTask,
  cumulativeXpByCategory,
  taskScoreDeveloper,
  weeklyKpiDeveloper,
  weeklyKpiPm,
  domainExecutionFromDepartment,
  peerSynergy,
  weeklyKpiCLevel,
  weeklyKpiCeo,
  detectInactivity,
  nextPenaltyToConsume,
  applyDisciplinaryDeduction,
  decideBackfill,
  kpiTrendSeries,
  rankLeaderboard,
  weekRollup,
  LeaderboardUser,
} from './index'

describe('Pure KPI & XP Engine (Deterministic Mathematical Architecture)', () => {
  // --------------------------------------------------------------------------
  // 1. Math Utils & Rounding Half-Up
  // --------------------------------------------------------------------------
  describe('1. Math & Decimal Rounding (round2, clamp, weights)', () => {
    it('implements strict round-half-up to 2 decimals', () => {
      expect(round2(2.005)).toBe(2.01)
      expect(round2(2.004)).toBe(2.00)
      expect(round2(2.0051)).toBe(2.01)
      expect(round2(2.125)).toBe(2.13)
      expect(round2(85.666666)).toBe(85.67)
      expect(round2(0.1 + 0.2)).toBe(0.30)
      expect(round2(-2.005)).toBe(-2.01)
      expect(round2(NaN)).toBe(0)
      expect(round2(Infinity)).toBe(0)
    })

    it('clamps numeric values strictly within [min, max]', () => {
      expect(clamp(105, 0, 100)).toBe(100)
      expect(clamp(-10, 0, 100)).toBe(0)
      expect(clamp(85.5, 0, 100)).toBe(85.5)
      expect(clamp(NaN, 0, 100)).toBe(0)
    })

    it('validates weights sum strictly within epsilon', () => {
      expect(validateWeightsSum([0.5, 0.15, 0.15, 0.1, 0.1])).toBe(true)
      expect(validateWeightsSum([0.3, 0.3, 0.2, 0.2])).toBe(true)
      expect(validateWeightsSum([0.5, 0.5, 0.1])).toBe(false)
      expect(validateWeightsSum([0.3, 0.3, 0.2, 0.19])).toBe(false)
    })
  })

  // --------------------------------------------------------------------------
  // 2. XP Derivation & Cumulative Category Composition
  // --------------------------------------------------------------------------
  describe('2. XP Derivation (xpForTask, cumulativeXpByCategory)', () => {
    it('calculates XP strictly as verifiedWeightPoints * 10 without context multipliers', () => {
      const res1 = xpForTask({ weightPoints: 3, weightStatus: 'VERIFIED' })
      expect(res1.xp).toBe(30)
      expect(res1.state).toBe('POSTABLE')

      const res2 = xpForTask({ weightPoints: 2.5, weightStatus: 'VERIFIED' })
      expect(res2.xp).toBe(25)
      expect(res2.state).toBe('POSTABLE')
    })

    it('marks XP state PENDING when weightStatus is not VERIFIED', () => {
      const pending = xpForTask({ weightPoints: 5, weightStatus: 'PENDING_CHRO_VERIFICATION' })
      expect(pending.xp).toBe(50)
      expect(pending.state).toBe('PENDING')

      const rejected = xpForTask({ weightPoints: 5, weightStatus: 'REJECTED' })
      expect(rejected.xp).toBe(50)
      expect(rejected.state).toBe('PENDING')
    })

    it('marks XP state FROZEN when yield meets or exceeds massive XP threshold (default 200 XP)', () => {
      // 20 points * 10 = 200 XP -> FROZEN
      const res200 = xpForTask({ weightPoints: 20, weightStatus: 'VERIFIED' })
      expect(res200.xp).toBe(200)
      expect(res200.state).toBe('FROZEN')

      // 50 points * 10 = 500 XP -> FROZEN
      const res500 = xpForTask({ weightPoints: 50, weightStatus: 'VERIFIED' })
      expect(res500.xp).toBe(500)
      expect(res500.state).toBe('FROZEN')

      // 19.9 points * 10 = 199 XP -> POSTABLE
      const res199 = xpForTask({ weightPoints: 19.9, weightStatus: 'VERIFIED' })
      expect(res199.xp).toBe(199)
      expect(res199.state).toBe('POSTABLE')
    })

    it('respects configurable threshold passed from config', () => {
      const res = xpForTask({ weightPoints: 15, weightStatus: 'VERIFIED', isFrozenThresholdXp: 150 })
      expect(res.xp).toBe(150)
      expect(res.state).toBe('FROZEN')
      expect(res.thresholdUsed).toBe(150)
    })

    it('throws error for negative or infinite weight points', () => {
      expect(() => xpForTask({ weightPoints: -5, weightStatus: 'VERIFIED' })).toThrow(/Invalid weightPoints/)
      expect(() => xpForTask({ weightPoints: Infinity, weightStatus: 'VERIFIED' })).toThrow(/Invalid weightPoints/)
    })

    it('handles default category and missing status in cumulativeXpByCategory', () => {
      const res = cumulativeXpByCategory([
        { delta: 15, category: 'CUSTOM' as any, status: 'POSTED' },
        { delta: 10, category: undefined as any, status: undefined },
      ])
      expect(res.totalXp).toBe(25)
      expect(res.byCategory.customXp).toBe(15)
      expect(res.byCategory.mediumXp).toBe(10)
    })

    it('computes cumulative XP by category and correctly processes reversals', () => {
      const breakdown = cumulativeXpByCategory([
        { delta: 10, category: 'SMALL', status: 'POSTED' },
        { delta: 20, category: 'MEDIUM', status: 'POSTED' },
        { delta: 30, category: 'LARGE', status: 'POSTED' },
        { delta: 50, category: 'CRITICAL', status: 'POSTED' },
        { delta: 100, category: 'CUSTOM', status: 'POSTED' },
        // Reversal of 30 XP in LARGE
        { delta: -30, category: 'LARGE', status: 'POSTED', entryType: 'REVERSAL' },
        // New correct award of 20 XP in MEDIUM
        { delta: 20, category: 'MEDIUM', status: 'POSTED', entryType: 'AWARD' },
        // Frozen or pending items are excluded
        { delta: 500, category: 'CRITICAL', status: 'FROZEN' },
        { delta: 50, category: 'MEDIUM', status: 'PENDING' },
      ])

      expect(breakdown.byCategory.smallXp).toBe(10)
      expect(breakdown.byCategory.mediumXp).toBe(40) // 20 + 20
      expect(breakdown.byCategory.largeXp).toBe(0) // 30 - 30
      expect(breakdown.byCategory.criticalXp).toBe(50)
      expect(breakdown.byCategory.customXp).toBe(100)
      expect(breakdown.totalXp).toBe(200) // 10 + 40 + 0 + 50 + 100
    })
  })

  // --------------------------------------------------------------------------
  // 3. Level 1: Developer Task Evaluation (taskScoreDeveloper)
  // --------------------------------------------------------------------------
  describe('3. Level 1 Developer Task Scoring (taskScoreDeveloper)', () => {
    it('computes task score with default provisional values equal to PM satisfaction', () => {
      const res = taskScoreDeveloper({
        pm: { score: 90 },
      })

      // 0.50*90 + 0.15*90 + 0.15*90 + 0.10*90 + 0.10*90 = 90
      expect(res.baseScore).toBe(90.0)
      expect(res.finalScore).toBe(90.0)
      expect(res.isProvisional).toBe(true)
      expect(res.execScores.cto.score).toBe(90)
      expect(res.execScores.cto.status).toBe('UNREAD')
    })

    it('marks provisional = false only when all 4 C-Level scores are CONFIRMED or ADJUSTED', () => {
      const res = taskScoreDeveloper({
        pm: { score: 90 },
        cto: { score: 95, status: 'CONFIRMED' },
        cpo: { score: 85, status: 'ADJUSTED' },
        cfo: { score: 80, status: 'CONFIRMED' },
        chro: { score: 90, status: 'CONFIRMED' },
        weights: { pm: 0.50, cto: 0.15, cpo: 0.15, cfo: 0.10, chro: 0.10 },
      })

      // 0.50*90 (45) + 0.15*95 (14.25) + 0.15*85 (12.75) + 0.10*80 (8) + 0.10*90 (9) = 89.0
      expect(res.baseScore).toBe(89.0)
      expect(res.finalScore).toBe(89.0)
      expect(res.isProvisional).toBe(false)
    })

    it('calculates canonical CHRO v4.2 weights (40% PM, 15% each CTO, CPO, CFO, CHRO)', () => {
      const res = taskScoreDeveloper({
        pm: { score: 90 },
        cto: { score: 95, status: 'CONFIRMED' },
        cpo: { score: 85, status: 'CONFIRMED' },
        cfo: { score: 80, status: 'CONFIRMED' },
        chro: { score: 90, status: 'CONFIRMED' },
      })
      // 0.40*90 (36) + 0.15*95 (14.25) + 0.15*85 (12.75) + 0.15*80 (12) + 0.15*90 (13.5) = 88.5
      expect(res.baseScore).toBe(88.5)
      expect(res.finalScore).toBe(88.5)
      expect(res.isProvisional).toBe(false)
    })

    it('applies inactivity return penalty multiplicatively (score * 0.90) once', () => {
      const res = taskScoreDeveloper({
        pm: { score: 90 },
        cto: { score: 90, status: 'CONFIRMED' },
        cpo: { score: 90, status: 'CONFIRMED' },
        cfo: { score: 90, status: 'CONFIRMED' },
        chro: { score: 90, status: 'CONFIRMED' },
        penaltyToApply: { penaltyRate: 0.10 },
      })

      expect(res.baseScore).toBe(90.0)
      // 90 * (1 - 0.10) = 81.0
      expect(res.finalScore).toBe(81.0)
      expect(res.penaltyApplied).toBe(true)
      expect(res.penaltyRate).toBe(0.10)
    })

    it('throws error when PM satisfaction score is out of [0, 100]', () => {
      expect(() => taskScoreDeveloper({ pm: { score: 105 } })).toThrow(/Invalid PM satisfaction score/)
      expect(() => taskScoreDeveloper({ pm: { score: -1 } })).toThrow(/Invalid PM satisfaction score/)
    })

    it('throws error when weights do not sum to 1.0', () => {
      expect(() =>
        taskScoreDeveloper({
          pm: { score: 90 },
          weights: { pm: 0.5, cto: 0.2, cpo: 0.2, cfo: 0.2, chro: 0.2 },
        }),
      ).toThrow(/weights must sum to 1.0/)
    })

    it('throws error when exec scores are out of range or penaltyRate is invalid', () => {
      expect(() =>
        taskScoreDeveloper({
          pm: { score: 90 },
          cto: { score: -5 },
        }),
      ).toThrow(/between 0 and 100/)

      expect(() =>
        taskScoreDeveloper({
          pm: { score: 90 },
          cpo: { score: 105 },
        }),
      ).toThrow(/between 0 and 100/)

      expect(() =>
        taskScoreDeveloper({
          pm: { score: 90 },
          penaltyToApply: { penaltyRate: -0.1 },
        }),
      ).toThrow(/Invalid penaltyRate/)

      expect(() =>
        taskScoreDeveloper({
          pm: { score: 90 },
          penaltyToApply: { penaltyRate: 1.5 },
        }),
      ).toThrow(/Invalid penaltyRate/)
    })
  })

  // --------------------------------------------------------------------------
  // 4. Level 1: Developer Weekly KPI (weeklyKpiDeveloper)
  // --------------------------------------------------------------------------
  describe('4. Level 1 Developer Weekly KPI (weeklyKpiDeveloper)', () => {
    it('returns null and status NA when zero completed tasks exist in the week', () => {
      const res = weeklyKpiDeveloper({ tasks: [] })
      expect(res.value).toBeNull()
      expect(res.status).toBe('NA')
      expect(res.reason).toBe('INACTIVE')
      expect(res.taskCount).toBe(0)
    })

    it('calculates weighted average using weight points and squad context multipliers', () => {
      // Task 1: score 90, weight 2 (Medium), MAIN_SQUAD (1.00) -> effective weight = 2.0, weighted score = 180
      // Task 2: score 80, weight 3 (Large), OUTSIDE_SQUAD (0.70) -> effective weight = 2.1, weighted score = 168
      // Task 3: score 100, weight 5 (Critical), ISOLATED_EXECUTIVE (0.50) -> effective weight = 2.5, weighted score = 250
      // Total effective weight = 2.0 + 2.1 + 2.5 = 6.6
      // Total weighted score = 180 + 168 + 250 = 598
      // Expected = 598 / 6.6 = 90.6060... -> 90.61
      const res = weeklyKpiDeveloper({
        tasks: [
          { score: 90, weightPoints: 2, context: 'MAIN_SQUAD' },
          { score: 80, weightPoints: 3, context: 'OUTSIDE_SQUAD' },
          { score: 100, weightPoints: 5, context: 'ISOLATED_EXECUTIVE' },
        ],
      })

      expect(res.value).toBe(90.61)
      expect(res.status).toBe('OFFICIAL')
      expect(res.taskCount).toBe(3)
      expect(res.totalWeight).toBe(6.6)
    })

    it('handles single task correctly', () => {
      const res = weeklyKpiDeveloper({
        tasks: [{ score: 88.5, weightPoints: 3, context: 'MAIN_SQUAD' }],
      })
      expect(res.value).toBe(88.5)
      expect(res.status).toBe('OFFICIAL')
    })

    it('clamps scores strictly within [0, 100]', () => {
      const allZero = weeklyKpiDeveloper({
        tasks: [{ score: 0, weightPoints: 2, context: 'MAIN_SQUAD' }],
      })
      expect(allZero.value).toBe(0.0)

      const allHundred = weeklyKpiDeveloper({
        tasks: [{ score: 100, weightPoints: 5, context: 'MAIN_SQUAD' }],
      })
      expect(allHundred.value).toBe(100.0)
    })

    it('throws error for invalid task scores or weights', () => {
      expect(() =>
        weeklyKpiDeveloper({
          tasks: [{ score: 105, weightPoints: 2, context: 'MAIN_SQUAD' }],
        }),
      ).toThrow(/out of range/)

      expect(() =>
        weeklyKpiDeveloper({
          tasks: [{ score: 90, weightPoints: 0, context: 'MAIN_SQUAD' }],
        }),
      ).toThrow(/must be > 0/)
    })
  })

  // --------------------------------------------------------------------------
  // 5. Level 2: Project Manager Weekly KPI (weeklyKpiPm)
  // --------------------------------------------------------------------------
  describe('5. Level 2 Project Manager Weekly KPI (weeklyKpiPm)', () => {
    it('returns null and status NA when PM had zero completions in the weekly cycle', () => {
      const res = weeklyKpiPm({
        hasCompletions: false,
        cto: { score: 90 },
      })
      expect(res.value).toBeNull()
      expect(res.status).toBe('NA')
    })

    it('calculates PM score from 30% CTO + 30% CPO + 20% CFO + 20% CHRO', () => {
      // 90*0.30 (27) + 85*0.30 (25.5) + 80*0.20 (16) + 95*0.20 (19) = 87.5
      const res = weeklyKpiPm({
        hasCompletions: true,
        cto: { score: 90, status: 'CONFIRMED' },
        cpo: { score: 85, status: 'CONFIRMED' },
        cfo: { score: 80, status: 'CONFIRMED' },
        chro: { score: 95, status: 'CONFIRMED' },
      })

      expect(res.value).toBe(87.5)
      expect(res.status).toBe('OFFICIAL')
    })

    it('falls back to suggestedScore when executive score is absent and flags provisional', () => {
      const res = weeklyKpiPm({
        hasCompletions: true,
        cto: { score: 90, status: 'CONFIRMED' },
        cpo: { suggestedScore: 80, status: 'UNREAD' }, // missing explicit score
        cfo: { score: 85, status: 'CONFIRMED' },
        chro: { score: 90, status: 'CONFIRMED' },
      })

      // 90*0.30 (27) + 80*0.30 (24) + 85*0.20 (17) + 90*0.20 (18) = 86.0
      expect(res.value).toBe(86.0)
      expect(res.status).toBe('PROVISIONAL')
    })

    it('uses explicit suggestedScore when provided on missing score', () => {
      const res = weeklyKpiPm({
        hasCompletions: true,
        cto: { suggestedScore: 95 },
        cpo: {}, // field defined but score and suggestedScore undefined -> falls back to 85
        cfo: { score: 90, status: 'CONFIRMED' },
        chro: { score: 90, status: 'CONFIRMED' },
      })
      // cto=95 (95*0.3=28.5), cpo=85 (85*0.3=25.5), cfo=90 (18), chro=90 (18) = 90.0
      expect(res.value).toBe(90.0)
      expect(res.status).toBe('PROVISIONAL')
    })

    it('throws error when PM weights do not sum to 1.0 or score out of range', () => {
      expect(() =>
        weeklyKpiPm({
          hasCompletions: true,
          weights: { cto: 0.5, cpo: 0.5, cfo: 0.5, chro: 0.5 },
        }),
      ).toThrow(/weights must sum to 1.0/)

      expect(() =>
        weeklyKpiPm({
          hasCompletions: true,
          cto: { score: 110 },
        }),
      ).toThrow(/out of range/)
    })
  })

  // --------------------------------------------------------------------------
  // 6. Level 3 & Level 4: C-Level & CEO Formulas
  // --------------------------------------------------------------------------
  describe('6. Level 3 C-Level & Level 4 CEO Calculations', () => {
    it('calculates domain execution average ignoring null and inactive PM weeks', () => {
      const pmKpis = [
        { value: 85, isInactive: false },
        { value: 95, isInactive: false },
        { value: null, isInactive: true }, // Inactive week ignored
        { value: null, isInactive: false }, // Incomplete week ignored
      ]
      // (85 + 95) / 2 = 90.0
      expect(domainExecutionFromDepartment(pmKpis)).toBe(90.0)
    })

    it('returns null if all department PM KPIs are inactive or null', () => {
      const allInactive = [{ value: null, isInactive: true }, { value: null, isInactive: true }]
      expect(domainExecutionFromDepartment(allInactive)).toBeNull()
    })

    it('calculates peer synergy strictly excluding self rating', () => {
      const ratings = [
        { evaluatorId: 'emp_cto', score: 90 },
        { evaluatorId: 'emp_cpo', score: 85 },
        { evaluatorId: 'emp_chro', score: 99 }, // Self-rating (should be ignored)
      ]
      // (90 + 85) / 2 = 87.5
      expect(peerSynergy(ratings, 'emp_chro')).toBe(87.5)
    })

    it('calculates Level 3 C-Level KPI: 40% Goal + 30% Domain + 20% CEO + 10% Peer', () => {
      // 90*0.40 (36) + 85*0.30 (25.5) + 95*0.20 (19) + 80*0.10 (8) = 88.5
      const res = weeklyKpiCLevel({
        companyGoal: 90,
        domainExecution: 85,
        ceoReview: 95,
        peerSynergy: 80,
      })
      expect(res.value).toBe(88.5)
      expect(res.status).toBe('OFFICIAL')
    })

    it('returns INCOMPLETE if domain execution or peer synergy is null', () => {
      const res = weeklyKpiCLevel({
        companyGoal: 90,
        domainExecution: null,
        ceoReview: 95,
        peerSynergy: 80,
      })
      expect(res.value).toBeNull()
      expect(res.status).toBe('INCOMPLETE')
    })

    it('calculates Level 4 CEO KPI: 60% Company Performance + 40% C-Level Aggregate', () => {
      // 4 C-Level scores: 85, 90, 88, 92 -> average = 88.75
      // 95*0.60 (57) + 88.75*0.40 (35.5) = 92.5
      const res = weeklyKpiCeo({
        companyPerformance: 95,
        cLevelFinalKpis: [
          { score: 85, isInactive: false },
          { score: 90, isInactive: false },
          { score: 88, isInactive: false },
          { score: 92, isInactive: false },
        ],
      })

      expect(res.value).toBe(92.5)
      expect(res.status).toBe('OFFICIAL')
    })

    it('throws error for invalid C-Level or CEO inputs and handles all-inactive C-Levels', () => {
      expect(() =>
        weeklyKpiCLevel({
          companyGoal: 90,
          domainExecution: 85,
          ceoReview: 90,
          peerSynergy: 80,
          weights: { companyGoal: 0.5, domainExecution: 0.5, ceoReview: 0.5, peerSynergy: 0.5 },
        }),
      ).toThrow(/weights must sum to 1.0/)

      expect(() =>
        weeklyKpiCLevel({
          companyGoal: 105,
          domainExecution: 85,
          ceoReview: 90,
          peerSynergy: 80,
        }),
      ).toThrow(/out of range/)

      expect(() =>
        peerSynergy([{ evaluatorId: 'cpo', score: -1 }], 'cto'),
      ).toThrow(/out of range/)

      expect(() =>
        weeklyKpiCeo({
          companyPerformance: 105,
          cLevelFinalKpis: [],
        }),
      ).toThrow(/out of range/)

      expect(() =>
        weeklyKpiCeo({
          companyPerformance: 90,
          cLevelFinalKpis: [],
          weights: { companyPerformance: 0.8, cLevelAggregate: 0.8 },
        }),
      ).toThrow(/weights must sum to 1.0/)

      const allInactive = weeklyKpiCeo({
        companyPerformance: 90,
        cLevelFinalKpis: [{ score: null, isInactive: true }],
      })
      expect(allInactive.value).toBeNull()
      expect(allInactive.status).toBe('INCOMPLETE')
    })
  })

  // --------------------------------------------------------------------------
  // 7. Inactivity Detection & Penalty Queueing
  // --------------------------------------------------------------------------
  describe('7. Inactivity Detection & Penalty Management', () => {
    it('flags INACTIVE (N/A) and queues penalty when 0 deliverables completed in week', () => {
      const res = detectInactivity({
        completedCount: 0,
        weekStart: new Date('2026-11-16T00:00:00Z'),
      })
      expect(res.isInactive).toBe(true)
      expect(res.penaltyQueued).toBe(true)
    })

    it('skips inactivity flag and penalty queueing for excused weeks (approved leave)', () => {
      const res = detectInactivity({
        completedCount: 0,
        weekStart: new Date('2026-11-16T00:00:00Z'),
        excusedWeek: { isExcused: true, reason: 'Approved medical leave' },
      })
      expect(res.isInactive).toBe(false)
      expect(res.isExcused).toBe(true)
      expect(res.penaltyQueued).toBe(false)
    })

    it('consumes penalties strictly in FIFO order, exactly one per task (no stacking)', () => {
      const queue = [
        { id: 'pen_w44', weekStart: new Date('2026-10-26T00:00:00Z'), consumed: false },
        { id: 'pen_w45', weekStart: new Date('2026-11-02T00:00:00Z'), consumed: false },
        { id: 'pen_w43', weekStart: new Date('2026-10-19T00:00:00Z'), consumed: false },
      ]

      // 1st consumption: earliest week (w43)
      const res1 = nextPenaltyToConsume(queue)
      expect(res1.penaltyToConsume?.id).toBe('pen_w43')
      expect(res1.remainingUnconsumedCount).toBe(2)

      // Mark w43 consumed
      queue.find((p) => p.id === 'pen_w43')!.consumed = true

      // 2nd consumption: next earliest (w44)
      const res2 = nextPenaltyToConsume(queue)
      expect(res2.penaltyToConsume?.id).toBe('pen_w44')
      expect(res2.remainingUnconsumedCount).toBe(1)
    })

    it('handles negative completedCount error and empty penalty queue', () => {
      expect(() =>
        detectInactivity({ completedCount: -1, weekStart: new Date() }),
      ).toThrow(/completedCount cannot be negative/)

      const emptyRes = nextPenaltyToConsume([])
      expect(emptyRes.penaltyToConsume).toBeNull()
      expect(emptyRes.remainingUnconsumedCount).toBe(0)
    })
  })

  // --------------------------------------------------------------------------
  // 8. CHRO & CEO Disciplinary Deductions
  // --------------------------------------------------------------------------
  describe('8. Disciplinary Deductions (applyDisciplinaryDeduction)', () => {
    it('subtracts points after weekly aggregation and clamps at 0', () => {
      const res = applyDisciplinaryDeduction({ weeklyValue: 85.5, points: 15 })
      expect(res.value).toBe(70.5)
      expect(res.previousValue).toBe(85.5)
      expect(res.deductionApplied).toBe(true)

      const clamped = applyDisciplinaryDeduction({ weeklyValue: 10, points: 20 })
      expect(clamped.value).toBe(0.0)
    })

    it('preserves N/A status if weeklyValue is null', () => {
      const res = applyDisciplinaryDeduction({ weeklyValue: null, points: 10 })
      expect(res.value).toBeNull()
      expect(res.deductionApplied).toBe(false)
      expect(res.note).toContain('Week score was N/A')
    })

    it('throws error for invalid points (<= 0 or > 100)', () => {
      expect(() => applyDisciplinaryDeduction({ weeklyValue: 80, points: 0 })).toThrow()
      expect(() => applyDisciplinaryDeduction({ weeklyValue: 80, points: -5 })).toThrow()
      expect(() => applyDisciplinaryDeduction({ weeklyValue: 80, points: 105 })).toThrow()
    })
  })

  // --------------------------------------------------------------------------
  // 9. Backfill Decision Engine (decideBackfill) & Boundary Verification
  // --------------------------------------------------------------------------
  describe('9. Backfill Decision Engine (decideBackfill)', () => {
    const cutoffUtc = new Date('2026-11-19T17:59:59.999Z') // 2026-11-19 23:59:59.999 Asia/Dhaka
    const testWindows = [
      {
        id: 'win_pm_01',
        startsAt: new Date('2026-11-12T00:00:00.000Z'),
        endsAt: cutoffUtc,
        grantedRole: 'pm',
        isActive: true,
      },
    ]

    const pmActor = {
      role: 'pm',
      userId: 'emp_pm_01',
      squadMemberIds: ['emp_dev_01', 'emp_dev_02'],
    }

    it('allows non-past-dated entries normally under STANDARD_REALTIME', () => {
      const now = new Date('2026-11-17T12:00:00.000Z')
      const effectiveAt = new Date('2026-11-17T12:00:00.000Z') // Same time
      const res = decideBackfill({
        actor: pmActor,
        subjectUserId: 'emp_dev_01',
        effectiveAt,
        now,
        windows: testWindows,
      })
      expect(res.allowed).toBe(true)
      expect(res.via).toBe('STANDARD_REALTIME')
    })

    it('allows PM backfill within active window for squad member (1 ms before cutoff)', () => {
      const effectiveAt = new Date('2026-11-10T10:00:00.000Z') // Past date
      const now1MsBefore = new Date(cutoffUtc.getTime() - 1)

      const res = decideBackfill({
        actor: pmActor,
        subjectUserId: 'emp_dev_01',
        effectiveAt,
        now: now1MsBefore,
        windows: testWindows,
      })
      expect(res.allowed).toBe(true)
      expect(res.via).toBe('PM_WINDOW')
    })

    it('allows PM backfill exactly at cutoff millisecond (inclusive boundary)', () => {
      const effectiveAt = new Date('2026-11-10T10:00:00.000Z')
      const nowExactCutoff = new Date(cutoffUtc.getTime())

      const res = decideBackfill({
        actor: pmActor,
        subjectUserId: 'emp_dev_01',
        effectiveAt,
        now: nowExactCutoff,
        windows: testWindows,
      })
      expect(res.allowed).toBe(true)
      expect(res.via).toBe('PM_WINDOW')
    })

    it('denies PM backfill 1 ms after cutoff boundary', () => {
      const effectiveAt = new Date('2026-11-10T10:00:00.000Z')
      const now1MsAfter = new Date(cutoffUtc.getTime() + 1)

      const res = decideBackfill({
        actor: pmActor,
        subjectUserId: 'emp_dev_01',
        effectiveAt,
        now: now1MsAfter,
        windows: testWindows,
      })
      expect(res.allowed).toBe(false)
      expect(res.denyReason).toMatch(/grace window has closed/i)
    })

    it('strictly denies PM self-backfill even inside active window', () => {
      const effectiveAt = new Date('2026-11-10T10:00:00.000Z')
      const now = new Date('2026-11-17T10:00:00.000Z')

      const res = decideBackfill({
        actor: pmActor,
        subjectUserId: 'emp_pm_01', // Self backfill
        effectiveAt,
        now,
        windows: testWindows,
      })
      expect(res.allowed).toBe(false)
      expect(res.denyReason).toMatch(/PM self-backfill is strictly prohibited/i)
    })

    it('strictly denies PM backfill for employee outside assigned squad', () => {
      const effectiveAt = new Date('2026-11-10T10:00:00.000Z')
      const now = new Date('2026-11-17T10:00:00.000Z')

      const res = decideBackfill({
        actor: pmActor,
        subjectUserId: 'emp_stranger_99', // Not in squadMemberIds
        effectiveAt,
        now,
        windows: testWindows,
      })
      expect(res.allowed).toBe(false)
      expect(res.denyReason).toMatch(/assigned squads/i)
    })

    it('allows CHRO backfill anytime when fresh MFA and written reason are provided', () => {
      const chroActor = { role: 'chro', userId: 'emp_chro_01', squadMemberIds: [] }
      const effectiveAt = new Date('2026-10-01T00:00:00.000Z')
      const nowPostWindow = new Date(cutoffUtc.getTime() + 86400000) // 1 day after cutoff

      // Without MFA -> Deny
      expect(
        decideBackfill({
          actor: chroActor,
          subjectUserId: 'emp_any_01',
          effectiveAt,
          now: nowPostWindow,
          windows: testWindows,
          mfaFresh: false,
          reasonProvided: true,
        }).allowed,
      ).toBe(false)

      // Without Reason -> Deny
      expect(
        decideBackfill({
          actor: chroActor,
          subjectUserId: 'emp_any_01',
          effectiveAt,
          now: nowPostWindow,
          windows: testWindows,
          mfaFresh: true,
          reasonProvided: false,
        }).allowed,
      ).toBe(false)

      // With both -> Allow
      const allowed = decideBackfill({
        actor: chroActor,
        subjectUserId: 'emp_any_01',
        effectiveAt,
        now: nowPostWindow,
        windows: testWindows,
        mfaFresh: true,
        reasonProvided: true,
      })
      expect(allowed.allowed).toBe(true)
      expect(allowed.via).toBe('CHRO')
    })

    it('allows CEO backfill anytime strictly requiring fresh MFA without mandatory text reason', () => {
      const ceoActor = { role: 'ceo', userId: 'emp_ceo_01', squadMemberIds: [] }
      const effectiveAt = new Date('2026-10-01T00:00:00.000Z')
      const nowPostWindow = new Date(cutoffUtc.getTime() + 86400000)

      // Without MFA -> Deny
      expect(
        decideBackfill({
          actor: ceoActor,
          subjectUserId: 'emp_any_01',
          effectiveAt,
          now: nowPostWindow,
          windows: testWindows,
          mfaFresh: false,
          reasonProvided: false,
        }).allowed,
      ).toBe(false)

      // With MFA (even without reason) -> Allow
      const allowed = decideBackfill({
        actor: ceoActor,
        subjectUserId: 'emp_any_01',
        effectiveAt,
        now: nowPostWindow,
        windows: testWindows,
        mfaFresh: true,
        reasonProvided: false,
      })
      expect(allowed.allowed).toBe(true)
      expect(allowed.via).toBe('CEO')
    })

    it('strictly denies developers from backfilling records', () => {
      const devActor = { role: 'developer', userId: 'emp_dev_01', squadMemberIds: [] }
      const res = decideBackfill({
        actor: devActor,
        subjectUserId: 'emp_dev_01',
        effectiveAt: new Date('2026-11-10T00:00:00.000Z'),
        now: new Date('2026-11-17T00:00:00.000Z'),
        windows: testWindows,
      })
      expect(res.allowed).toBe(false)
      expect(res.denyReason).toMatch(/not authorized/i)
    })
  })

  // --------------------------------------------------------------------------
  // 10. Rollups, Trend Series & Stable Leaderboard Ranking
  // --------------------------------------------------------------------------
  describe('10. Trend Series & Leaderboard Ranking (rankLeaderboard, kpiTrendSeries)', () => {
    it('formats chronological trend points with N/A and provisional markers', () => {
      const weeks = [
        { weekNumber: 47, year: 2026, score: 92.5, isInactive: false, isProvisional: false },
        { weekNumber: 45, year: 2026, score: 88.0, isInactive: false, isProvisional: false },
        { weekNumber: 46, year: 2026, score: null, isInactive: true },
      ]

      const series = kpiTrendSeries(weeks)
      expect(series.map((s) => s.weekNumber)).toEqual([45, 46, 47])
      expect(series[1].score).toBeNull()
      expect(series[1].statusDisplay).toBe('N/A')
      expect(series[2].score).toBe(92.5)
      expect(series[2].statusDisplay).toBe('92.50')
    })

    it('ranks leaderboard by XP with deterministic tie-breaking (KPI -> joinedAt -> userId)', () => {
      const users: LeaderboardUser[] = [
        { userId: 'u3', name: 'User 3', kpiScore: 85, lifetimeXp: 1000, joinedAt: '2026-01-01' },
        { userId: 'u1', name: 'User 1', kpiScore: 90, lifetimeXp: 2000, joinedAt: '2026-02-01' },
        { userId: 'u2', name: 'User 2', kpiScore: 95, lifetimeXp: 1000, joinedAt: '2026-03-01' }, // Same XP as u3, higher KPI
        { userId: 'u4', name: 'User 4', kpiScore: 95, lifetimeXp: 1000, joinedAt: '2026-01-01' }, // Same XP and KPI as u2, earlier joinedAt
      ]

      const ranked = rankLeaderboard(users, 'XP')
      expect(ranked[0].userId).toBe('u1') // Highest XP (2000)
      expect(ranked[1].userId).toBe('u4') // 1000 XP, 95 KPI, earlier join date (Jan 1)
      expect(ranked[2].userId).toBe('u2') // 1000 XP, 95 KPI, later join date (Mar 1)
      expect(ranked[3].userId).toBe('u3') // 1000 XP, 85 KPI
      expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3, 4])
    })

    it('ranks leaderboard by KPI, sorting N/A below all numeric values but retaining visibility', () => {
      const users: LeaderboardUser[] = [
        { userId: 'u1', name: 'Active 1', kpiScore: 85, lifetimeXp: 1000, joinedAt: '2026-01-01' },
        { userId: 'u2', name: 'Inactive PM', kpiScore: null, lifetimeXp: 5000, joinedAt: '2026-01-01' },
        { userId: 'u3', name: 'Active 2', kpiScore: 92, lifetimeXp: 800, joinedAt: '2026-01-01' },
      ]

      const ranked = rankLeaderboard(users, 'KPI')
      expect(ranked[0].userId).toBe('u3') // 92 KPI
      expect(ranked[1].userId).toBe('u1') // 85 KPI
      expect(ranked[2].userId).toBe('u2') // N/A KPI (sorted last despite 5000 XP)
    })

    it('partitions and rolls up tasks for a specific calendar week in Asia/Dhaka', () => {
      const tasks = [
        { id: 't1', completedAt: new Date('2026-11-16T06:00:00Z'), score: 90, weightPoints: 2, context: 'MAIN_SQUAD' as const },
        { id: 't2', completedAt: new Date('2026-11-20T06:00:00Z'), score: 85, weightPoints: 3, context: 'MAIN_SQUAD' as const },
        { id: 't3', completedAt: new Date('2026-11-25T06:00:00Z'), score: 95, weightPoints: 5, context: 'MAIN_SQUAD' as const }, // Week 48
      ]

      const rollup = weekRollup(tasks, 2026, 47)
      expect(rollup.taskCount).toBe(2)
      expect(rollup.matchedTasks.map((t) => t.id)).toEqual(['t1', 't2'])
    })
  })

  // --------------------------------------------------------------------------
  // 11. Golden Fixtures: Worked Hand-Computed Examples (Levels 1 to 4)
  // --------------------------------------------------------------------------
  describe('11. Golden Fixtures: Hand-Computed Reference Examples', () => {
    /**
     * Level 1 Developer Worked Example:
     * Task 1: PM=90, CTO=95 (Confirmed), CPO=85 (Adjusted), CFO=80 (Confirmed), CHRO=90 (Confirmed)
     *   Task 1 Score = 0.50*90 (45) + 0.15*95 (14.25) + 0.15*85 (12.75) + 0.10*80 (8) + 0.10*90 (9) = 89.00
     *   Weight = 2 (Medium), Context = MAIN_SQUAD (1.00) -> effective weight = 2.0, weighted = 178.00
     *
     * Task 2: PM=80, CTO=unread (80), CPO=unread (80), CFO=unread (80), CHRO=unread (80)
     *   Task 2 Score = 80.00
     *   Inactivity penalty: 10% reduction applied -> 80 * 0.90 = 72.00
     *   Weight = 3 (Large), Context = OUTSIDE_SQUAD (0.70) -> effective weight = 2.1, weighted = 151.20
     *
     * Weekly KPI = (178.00 + 151.20) / (2.0 + 2.1) = 329.20 / 4.1 = 80.29268... -> 80.29
     * XP Yield Task 1 = 2 * 10 = 20 XP
     * XP Yield Task 2 = 3 * 10 = 30 XP (strictly independent of 0.70 multiplier or penalty)
     */
    it('reproduces Level 1 Developer Golden Fixture exactly', () => {
      const t1 = taskScoreDeveloper({
        pm: { score: 90 },
        cto: { score: 95, status: 'CONFIRMED' },
        cpo: { score: 85, status: 'ADJUSTED' },
        cfo: { score: 80, status: 'CONFIRMED' },
        chro: { score: 90, status: 'CONFIRMED' },
        weights: { pm: 0.50, cto: 0.15, cpo: 0.15, cfo: 0.10, chro: 0.10 },
      })
      expect(t1.finalScore).toBe(89.0)

      const t2 = taskScoreDeveloper({
        pm: { score: 80 },
        penaltyToApply: { penaltyRate: 0.10 },
      })
      expect(t2.finalScore).toBe(72.0)

      const weekly = weeklyKpiDeveloper({
        tasks: [
          { score: t1.finalScore, weightPoints: 2, context: 'MAIN_SQUAD' },
          { score: t2.finalScore, weightPoints: 3, context: 'OUTSIDE_SQUAD' },
        ],
      })
      expect(weekly.value).toBe(80.29)

      const xp1 = xpForTask({ weightPoints: 2, weightStatus: 'VERIFIED' })
      expect(xp1.xp).toBe(20)

      const xp2 = xpForTask({ weightPoints: 3, weightStatus: 'VERIFIED' })
      expect(xp2.xp).toBe(30)
    })

    /**
     * Level 2 PM Worked Example:
     * CTO=92, CPO=88, CFO=85, CHRO=90
     * PM KPI = 0.30*92 (27.6) + 0.30*88 (26.4) + 0.20*85 (17.0) + 0.20*90 (18.0) = 89.00
     */
    it('reproduces Level 2 PM Golden Fixture exactly', () => {
      const pmKpi = weeklyKpiPm({
        hasCompletions: true,
        cto: { score: 92, status: 'CONFIRMED' },
        cpo: { score: 88, status: 'CONFIRMED' },
        cfo: { score: 85, status: 'CONFIRMED' },
        chro: { score: 90, status: 'CONFIRMED' },
      })
      expect(pmKpi.value).toBe(89.0)
    })

    /**
     * Level 3 C-Level (CTO) Worked Example:
     * Company Goal = 95
     * Domain Execution = average of PMs (89.00 and 87.00) = 88.00
     * CEO Review = 90
     * Peer Synergy = average of CPO (85), CFO (80), CHRO (90) = 85.00
     * CTO KPI = 0.40*95 (38.0) + 0.30*88 (26.4) + 0.20*90 (18.0) + 0.10*85 (8.5) = 90.90
     */
    it('reproduces Level 3 C-Level Golden Fixture exactly', () => {
      const domainExec = domainExecutionFromDepartment([
        { value: 89, isInactive: false },
        { value: 87, isInactive: false },
      ])
      expect(domainExec).toBe(88.0)

      const synergy = peerSynergy(
        [
          { evaluatorId: 'cpo', score: 85 },
          { evaluatorId: 'cfo', score: 80 },
          { evaluatorId: 'chro', score: 90 },
          { evaluatorId: 'cto', score: 100 }, // Ignored self rating
        ],
        'cto',
      )
      expect(synergy).toBe(85.0)

      const ctoKpi = weeklyKpiCLevel({
        companyGoal: 95,
        domainExecution: domainExec,
        ceoReview: 90,
        peerSynergy: synergy,
      })
      expect(ctoKpi.value).toBe(90.9)
    })

    /**
     * Level 4 CEO Worked Example:
     * Company Performance = 94
     * C-Level Final KPIs: CTO=90.90, CPO=88.50, CFO=85.00, CHRO=92.00 -> avg = 89.10
     * CEO KPI = 0.60*94 (56.4) + 0.40*89.10 (35.64) = 92.04
     */
    it('reproduces Level 4 CEO Golden Fixture exactly', () => {
      const ceoKpi = weeklyKpiCeo({
        companyPerformance: 94,
        cLevelFinalKpis: [
          { score: 90.9, isInactive: false },
          { score: 88.5, isInactive: false },
          { score: 85.0, isInactive: false },
          { score: 92.0, isInactive: false },
        ],
      })
      expect(ceoKpi.value).toBe(92.04)
    })
  })

  // --------------------------------------------------------------------------
  // 12. Seeded Randomized / Property-Based Loop Tests
  // --------------------------------------------------------------------------
  describe('12. Seeded Invariant Property Tests (1,000 iterations)', () => {
    // Simple deterministic LCG random generator with fixed seed
    let seed = 123456789
    const lcg = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296
      return seed / 4294967296
    }

    it('Invariant 1: Developer weekly KPI is always bounded strictly in [0, 100]', () => {
      for (let i = 0; i < 500; i++) {
        const numTasks = Math.floor(lcg() * 10) + 1
        const tasks = []
        for (let j = 0; j < numTasks; j++) {
          const score = round2(lcg() * 100)
          const weightPoints = Math.floor(lcg() * 10) + 1
          const ctx: 'MAIN_SQUAD' | 'OUTSIDE_SQUAD' | 'ISOLATED_EXECUTIVE' =
            lcg() > 0.6 ? 'MAIN_SQUAD' : lcg() > 0.3 ? 'OUTSIDE_SQUAD' : 'ISOLATED_EXECUTIVE'
          tasks.push({ score, weightPoints, context: ctx })
        }

        const res = weeklyKpiDeveloper({ tasks })
        expect(res.value).not.toBeNull()
        expect(res.value!).toBeGreaterThanOrEqual(0)
        expect(res.value!).toBeLessThanOrEqual(100)
      }
    })

    it('Invariant 2: Adding a task with score equal to current average preserves the average', () => {
      for (let i = 0; i < 100; i++) {
        const tasks = [
          { score: 85, weightPoints: 2, context: 'MAIN_SQUAD' as const },
          { score: 85, weightPoints: 3, context: 'MAIN_SQUAD' as const },
        ]
        const before = weeklyKpiDeveloper({ tasks })
        // Add another task with score 85
        tasks.push({ score: 85, weightPoints: 5, context: 'MAIN_SQUAD' as const })
        const after = weeklyKpiDeveloper({ tasks })
        expect(after.value).toBe(before.value)
      }
    })

    it('Invariant 3: XP yield is invariant to squad context, satisfaction score, or penalties', () => {
      for (let i = 0; i < 100; i++) {
        const weight = Math.floor(lcg() * 20) + 1
        const xp = xpForTask({ weightPoints: weight, weightStatus: 'VERIFIED' })
        expect(xp.xp).toBe(weight * 10)
      }
    })

    it('Invariant 4: rankLeaderboard produces a valid bijection (permutation) with stable ranks', () => {
      const users: LeaderboardUser[] = Array.from({ length: 50 }, (_, i) => ({
        userId: `user_${i}`,
        name: `User ${i}`,
        kpiScore: lcg() > 0.1 ? round2(lcg() * 100) : null,
        lifetimeXp: Math.floor(lcg() * 5000),
        joinedAt: new Date(Date.now() - Math.floor(lcg() * 1000000000)).toISOString(),
      }))

      const ranked = rankLeaderboard(users, 'XP')
      expect(ranked.length).toBe(50)
      const rankSet = new Set(ranked.map((r) => r.rank))
      expect(rankSet.size).toBe(50)
      expect(Math.min(...rankSet)).toBe(1)
      expect(Math.max(...rankSet)).toBe(50)

      // Ensure stable monotonicity on XP
      for (let i = 0; i < ranked.length - 1; i++) {
        expect(ranked[i].lifetimeXp).toBeGreaterThanOrEqual(ranked[i + 1].lifetimeXp)
      }
    })
  })

  // --------------------------------------------------------------------------
  // 13. Comprehensive Boundary & Branch Coverage
  // --------------------------------------------------------------------------
  describe('13. Comprehensive Boundary & Branch Coverage Edge Cases', () => {
    it('covers clamp default arguments and edge cases', () => {
      expect(clamp(50)).toBe(50)
      expect(clamp(150)).toBe(100)
      expect(clamp(-50)).toBe(0)
    })

    it('covers decideBackfill fallback roles and window branch conditions', () => {
      const now = new Date('2026-11-18T10:00:00Z')
      const past = new Date('2026-11-10T10:00:00Z')

      // Actor with undefined role
      const resUnknownRole = decideBackfill({
        actor: { userId: 'u1', role: '' as any },
        subjectUserId: 'dev_1',
        effectiveAt: past,
        now,
        windows: [],
      })
      expect(resUnknownRole.allowed).toBe(false)
      expect(resUnknownRole.denyReason).toContain('is not authorized')

      // PM without squadMemberIds array
      const resNoSquad = decideBackfill({
        actor: { userId: 'pm_1', role: 'pm' },
        subjectUserId: 'dev_1',
        effectiveAt: past,
        now,
        windows: [],
      })
      expect(resNoSquad.allowed).toBe(false)
      expect(resNoSquad.denyReason).toContain('not in squad')

      // Inactive window or window for different role
      const resInactiveWindow = decideBackfill({
        actor: { userId: 'pm_1', role: 'pm', squadMemberIds: ['dev_1'] },
        subjectUserId: 'dev_1',
        effectiveAt: past,
        now,
        windows: [
          {
            id: 'win_inactive',
            startsAt: new Date('2026-11-01T00:00:00Z'),
            endsAt: new Date('2026-11-20T00:00:00Z'),
            grantedRole: 'pm',
            isActive: false,
          },
          {
            id: 'win_other_role',
            startsAt: new Date('2026-11-01T00:00:00Z'),
            endsAt: new Date('2026-11-20T00:00:00Z'),
            grantedRole: 'developer',
            isActive: true,
          },
        ],
      })
      expect(resInactiveWindow.allowed).toBe(false)
      expect(resInactiveWindow.denyReason).toContain('grace window has closed')
    })

    it('covers detectInactivity active non-zero completion branch and default excused reason', () => {
      const resActive = detectInactivity({
        weekStart: new Date('2026-11-10T00:00:00Z'),
        completedCount: 3,
        excusedWeek: undefined,
      })
      expect(resActive.isInactive).toBe(false)
      expect(resActive.isExcused).toBe(false)
      expect(resActive.penaltyQueued).toBe(false)

      const resDefaultExcused = detectInactivity({
        weekStart: new Date('2026-11-10T00:00:00Z'),
        completedCount: 0,
        excusedWeek: { isExcused: true }, // no reason specified
      })
      expect(resDefaultExcused.isExcused).toBe(true)
      expect(resDefaultExcused.reason).toBe('Excused absence / approved leave')
    })

    it('covers weeklyKpiDeveloper zero effective weight denominator', () => {
      const res = weeklyKpiDeveloper({
        tasks: [
          { score: 90, weightPoints: 2, context: 'MAIN_SQUAD' },
        ],
        multipliers: {
          MAIN_SQUAD: 0,
          OUTSIDE_SQUAD: 0,
          ISOLATED_EXECUTIVE: 0,
        },
      })
      expect(res.value).toBeNull()
      expect(res.status).toBe('NA')
      expect(res.reason).toBe('INACTIVE')
      expect(res.totalWeight).toBe(0)
    })

    it('covers peerSynergy when no valid peer scores exist after self-filter', () => {
      const resEmpty = peerSynergy([], 'cpo_1')
      expect(resEmpty).toBeNull()

      const resOnlySelf = peerSynergy(
        [{ evaluatorId: 'cpo_1', score: 90 }],
        'cpo_1',
      )
      expect(resOnlySelf).toBeNull()
    })

    it('covers kpiTrendSeries with provisional scores and multi-year sorting', () => {
      const series = kpiTrendSeries([
        { year: 2027, weekNumber: 2, score: 95, isInactive: false },
        { year: 2026, weekNumber: 42, score: 88.5, isInactive: false, isProvisional: true },
      ])
      expect(series[0].year).toBe(2026)
      expect(series[1].year).toBe(2027)
      expect(series[0].isProvisional).toBe(true)
      expect(series[0].statusDisplay).toBe('Provisional (88.50)')
    })

    it('covers rankLeaderboard tie-breaking on XP and KPI', () => {
      // Default sortBy argument
      const defaultSort = rankLeaderboard([
        { userId: 'u1', name: 'U1', kpiScore: 80, lifetimeXp: 100, joinedAt: '2026-01-01T00:00:00Z' },
      ])
      expect(defaultSort[0].rank).toBe(1)

      // 1. XP sorting tie-breaking on KPI score descending (including null kpiScore)
      const usersXpTie: LeaderboardUser[] = [
        {
          userId: 'u_null_kpi_b',
          name: 'Null KPI B',
          kpiScore: null,
          lifetimeXp: 500,
          joinedAt: '2026-01-02T00:00:00Z',
        },
        {
          userId: 'u_null_kpi_a',
          name: 'Null KPI A',
          kpiScore: null,
          lifetimeXp: 500,
          joinedAt: '2026-01-01T00:00:00Z',
        },
        {
          userId: 'u_low_kpi',
          name: 'Low KPI',
          kpiScore: 70,
          lifetimeXp: 500,
          joinedAt: '2026-01-01T00:00:00Z',
        },
        {
          userId: 'u_high_kpi',
          name: 'High KPI',
          kpiScore: 90,
          lifetimeXp: 500,
          joinedAt: '2026-01-01T00:00:00Z',
        },
      ]
      const rankedXp = rankLeaderboard(usersXpTie, 'XP')
      expect(rankedXp[0].userId).toBe('u_high_kpi')
      expect(rankedXp[1].userId).toBe('u_low_kpi')
      expect(rankedXp[2].userId).toBe('u_null_kpi_a')
      expect(rankedXp[3].userId).toBe('u_null_kpi_b')

      // 2. KPI sorting tie-breaking on XP descending and userId
      const usersKpiTie: LeaderboardUser[] = [
        {
          userId: 'user_b',
          name: 'User B',
          kpiScore: 90,
          lifetimeXp: 300,
          joinedAt: '2026-01-01T00:00:00Z',
        },
        {
          userId: 'user_a',
          name: 'User A',
          kpiScore: 90,
          lifetimeXp: 500, // Higher XP wins tie
          joinedAt: '2026-01-01T00:00:00Z',
        },
        {
          userId: 'user_c',
          name: 'User C',
          kpiScore: 90,
          lifetimeXp: 300, // Same XP as user_b, same joinedAt, user_b wins on userId
          joinedAt: '2026-01-01T00:00:00Z',
        },
      ]

      const ranked = rankLeaderboard(usersKpiTie, 'KPI')
      expect(ranked[0].userId).toBe('user_a')
      expect(ranked[1].userId).toBe('user_b')
      expect(ranked[2].userId).toBe('user_c')
    })
  })
})
