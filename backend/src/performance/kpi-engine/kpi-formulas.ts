import { round2, clamp, validateWeightsSum } from './math.util'
import {
  DeveloperTaskScoringInput,
  DeveloperTaskScoringResult,
  DeveloperWeeklyKpiInput,
  WeeklyKpiResult,
  PmWeeklyKpiInput,
  CLevelWeeklyKpiInput,
  CeoWeeklyKpiInput,
  DisciplinaryDeductionInput,
  DisciplinaryDeductionResult,
} from './types'

/**
 * Level 1: Developer Task KPI Evaluation per CHRO Requirements §4.1:
 * "Project Manager (PM): 40%, CTO: 15%, CPO: 15%, CFO: 15%, CHRO: 15%. Total 100%."
 * "Executive read/approval policy. The system shall prepopulate the CTO, CPO, CFO and CHRO scores
 * with the PM's unweighted evaluation score. A provisional score shall not contribute to KPI until
 * the respective executive records a 'Read/Approve' action. Unapproved scores and their weights
 * shall be excluded from the calculation."
 * "Missing evaluation components: calculate the weighted mean of available, official scores only:
 * KPI = sum(score × weight) ÷ sum(included weights)."
 */
export function taskScoreDeveloper(input: DeveloperTaskScoringInput): DeveloperTaskScoringResult {
  const pmScore = input.pm?.score
  if (pmScore === undefined || pmScore === null || pmScore < 0 || pmScore > 100 || !Number.isFinite(pmScore)) {
    throw new Error(`Invalid PM satisfaction score: ${pmScore}. Must be between 0 and 100.`)
  }

  const wPm = input.weights?.pm ?? 0.40
  const wCto = input.weights?.cto ?? 0.15
  const wCpo = input.weights?.cpo ?? 0.15
  const wCfo = input.weights?.cfo ?? 0.15
  const wChro = input.weights?.chro ?? 0.15

  if (!validateWeightsSum([wPm, wCto, wCpo, wCfo, wChro])) {
    throw new Error(
      `Task evaluation weights must sum to 1.0. Given: ${[wPm, wCto, wCpo, wCfo, wChro].join(', ')}`,
    )
  }

  const validateScore = (score: number | undefined, roleName: string): number => {
    if (score !== undefined) {
      if (score < 0 || score > 100 || !Number.isFinite(score)) {
        throw new Error(`Invalid ${roleName} score: ${score}. Must be between 0 and 100.`)
      }
      return score
    }
    return pmScore // Prepopulated with PM score per §4.1
  }

  const ctoScore = validateScore(input.cto?.score, 'CTO')
  const cpoScore = validateScore(input.cpo?.score, 'CPO')
  const cfoScore = validateScore(input.cfo?.score, 'CFO')
  const chroScore = validateScore(input.chro?.score, 'CHRO')

  const ctoStatus = input.cto?.status ?? 'UNREAD'
  const cpoStatus = input.cpo?.status ?? 'UNREAD'
  const cfoStatus = input.cfo?.status ?? 'UNREAD'
  const chroStatus = input.chro?.status ?? 'UNREAD'

  const ctoOfficial = ctoStatus !== 'UNREAD' && input.cto?.score !== undefined
  const cpoOfficial = cpoStatus !== 'UNREAD' && input.cpo?.score !== undefined
  const cfoOfficial = cfoStatus !== 'UNREAD' && input.cfo?.score !== undefined
  const chroOfficial = chroStatus !== 'UNREAD' && input.chro?.score !== undefined

  const isProvisional = !ctoOfficial || !cpoOfficial || !cfoOfficial || !chroOfficial

  // Missing components policy (§4.1/§4.2): weighted mean of official scores only
  let includedWeightedSum = pmScore * wPm
  let includedWeightsTotal = wPm

  if (ctoOfficial) {
    includedWeightedSum += ctoScore * wCto
    includedWeightsTotal += wCto
  }
  if (cpoOfficial) {
    includedWeightedSum += cpoScore * wCpo
    includedWeightsTotal += wCpo
  }
  if (cfoOfficial) {
    includedWeightedSum += cfoScore * wCfo
    includedWeightsTotal += wCfo
  }
  if (chroOfficial) {
    includedWeightedSum += chroScore * wChro
    includedWeightsTotal += wChro
  }

  const rawBase = includedWeightsTotal > 0 ? includedWeightedSum / includedWeightsTotal : pmScore
  const baseScore = round2(clamp(rawBase, 0, 100))

  let finalScore = baseScore
  let penaltyApplied = false
  let penaltyRate = 0

  if (input.penaltyToApply) {
    penaltyRate = input.penaltyToApply.penaltyRate
    if (penaltyRate < 0 || penaltyRate > 1 || !Number.isFinite(penaltyRate)) {
      throw new Error(`Invalid penaltyRate: ${penaltyRate}. Must be between 0 and 1.`)
    }
    if (penaltyRate > 0) {
      finalScore = round2(clamp(baseScore * (1 - penaltyRate), 0, 100))
      penaltyApplied = true
    }
  }

  return {
    baseScore,
    finalScore,
    isProvisional,
    penaltyApplied,
    penaltyRate,
    execScores: {
      cto: { score: ctoScore, status: ctoStatus },
      cpo: { score: cpoScore, status: cpoStatus },
      cfo: { score: cfoScore, status: cfoStatus },
      chro: { score: chroScore, status: chroStatus },
    },
  }
}

/**
 * Level 1: Developer Weekly Composite KPI Evaluation
 *
 * Formula: sum(taskScore * weightPoints) / sum(weightPoints)
 * Inactivity Rule: If tasks count is zero or total weight is zero, returns value: null, status: 'NA'.
 */
export function weeklyKpiDeveloper(input: DeveloperWeeklyKpiInput): WeeklyKpiResult {
  if (!input.tasks || input.tasks.length === 0) {
    return {
      value: null,
      status: 'NA',
      reason: 'INACTIVE',
      taskCount: 0,
      totalWeight: 0,
    }
  }

  let numerator = 0
  let denominator = 0

  for (const t of input.tasks) {
    if (t.weightPoints <= 0 || !Number.isFinite(t.weightPoints)) {
      throw new Error(`Invalid task weightPoints: weightPoints must be > 0 (out of range: ${t.weightPoints})`)
    }
    if (t.score < 0 || t.score > 100 || !Number.isFinite(t.score)) {
      throw new Error(`Invalid task score out of range: ${t.score}`)
    }

    let mult = 1.0
    const m: any = input.multipliers || {}
    if (t.context === 'OUTSIDE_SQUAD') {
      mult = m.outsideSquad ?? m.OUTSIDE_SQUAD ?? 0.70
    } else if (t.context === 'ISOLATED_EXECUTIVE') {
      mult = m.isolatedExec ?? m.ISOLATED_EXECUTIVE ?? 0.50
    } else if (t.context === 'MAIN_SQUAD') {
      mult = m.mainSquad ?? m.MAIN_SQUAD ?? 1.00
    }

    const effWeight = t.weightPoints * mult
    numerator += t.score * effWeight
    denominator += effWeight
  }

  if (denominator <= 0) {
    return {
      value: null,
      status: 'NA',
      reason: 'INACTIVE',
      taskCount: input.tasks.length,
      totalWeight: 0,
    }
  }

  const score = round2(clamp(numerator / denominator, 0, 100))

  return {
    value: score,
    status: 'OFFICIAL',
    taskCount: input.tasks.length,
    totalWeight: round2(denominator),
  }
}

/**
 * Cross-functional multi-squad evaluation per CHRO Requirements §2.3:
 * "For employees assigned to multiple squads, the overall weekly KPI shall be the arithmetic mean
 * of numerical squad KPIs for that week. Exclude all N/A squad results from both the numerator
 * and denominator. If every squad result is N/A, the overall weekly KPI shall be N/A."
 */
export function crossFunctionalSquadKpi(
  squadKpis: Array<{ squadId: string; kpi: number | null; isInactive?: boolean }>,
): WeeklyKpiResult {
  if (!squadKpis || squadKpis.length === 0) {
    return {
      value: null,
      status: 'NA',
      reason: 'NO_SQUADS',
    }
  }

  const validSquadKpis = squadKpis
    .filter((s) => !s.isInactive && s.kpi !== null && Number.isFinite(s.kpi))
    .map((s) => s.kpi as number)

  if (validSquadKpis.length === 0) {
    return {
      value: null,
      status: 'NA',
      reason: 'ALL_SQUADS_INACTIVE',
    }
  }

  const sum = validSquadKpis.reduce((acc, curr) => acc + curr, 0)
  const mean = round2(clamp(sum / validSquadKpis.length, 0, 100))

  return {
    value: mean,
    status: 'OFFICIAL',
  }
}

/**
 * Level 2: Project Manager (PM) Weekly Composite KPI Evaluation per CHRO Requirements §4.1:
 * "A Project Manager shall provide their own 40% PM evaluation when evaluating their own performance.
 * Other evaluator roles and weights remain unchanged: PM (40%), CTO (15%), CPO (15%), CFO (15%), CHRO (15%)."
 * Prepopulated executive scores are provisional and excluded until "Read/Approve".
 * Missing evaluation components: calculate weighted mean of available official scores only.
 */
export function weeklyKpiPm(input: PmWeeklyKpiInput): WeeklyKpiResult {
  if (!input.hasCompletions) {
    return {
      value: null,
      status: 'NA',
      reason: 'INACTIVE',
      taskCount: 0,
    }
  }

  const hasPmSelfEval = input.pm !== undefined || (input.weights?.pm !== undefined && input.weights.pm > 0)
  const isLegacyFourWeight = !hasPmSelfEval

  if (input.weights) {
    if (input.weights.pm !== undefined) {
      const wPm = input.weights.pm
      const wCto = input.weights.cto ?? 0.15
      const wCpo = input.weights.cpo ?? 0.15
      const wCfo = input.weights.cfo ?? 0.15
      const wChro = input.weights.chro ?? 0.15
      if (!validateWeightsSum([wPm, wCto, wCpo, wCfo, wChro])) {
        throw new Error(`PM evaluation weights must sum to 1.0. Given: ${[wPm, wCto, wCpo, wCfo, wChro].join(', ')}`)
      }
    } else {
      const wCto = input.weights.cto ?? 0.30
      const wCpo = input.weights.cpo ?? 0.30
      const wCfo = input.weights.cfo ?? 0.20
      const wChro = input.weights.chro ?? 0.20
      if (!validateWeightsSum([wCto, wCpo, wCfo, wChro])) {
        throw new Error(`PM evaluation weights must sum to 1.0. Given: ${[wCto, wCpo, wCfo, wChro].join(', ')}`)
      }
    }
  }

  const wPm = input.weights?.pm ?? 0.40
  const wCto = input.weights?.cto ?? (isLegacyFourWeight ? 0.30 : 0.15)
  const wCpo = input.weights?.cpo ?? (isLegacyFourWeight ? 0.30 : 0.15)
  const wCfo = input.weights?.cfo ?? (isLegacyFourWeight ? 0.20 : 0.15)
  const wChro = input.weights?.chro ?? (isLegacyFourWeight ? 0.20 : 0.15)

  const pmScore = input.pm?.score
  if (pmScore !== undefined && (pmScore < 0 || pmScore > 100 || !Number.isFinite(pmScore))) {
    throw new Error(`PM self-evaluation score out of range [0, 100]: ${pmScore}`)
  }

  const fallbackScore = pmScore ?? 85

  const resolveExec = (field?: { score?: number; suggestedScore?: number; status?: string }) => {
    if (field?.score !== undefined) {
      if (field.score < 0 || field.score > 100 || !Number.isFinite(field.score)) {
        throw new Error(`PM score out of range [0, 100]: ${field.score}`)
      }
      const isOfficial = field.status === 'CONFIRMED' || field.status === 'ADJUSTED'
      return { score: field.score, isOfficial, isProvisional: !isOfficial }
    }
    const fallback = field?.suggestedScore ?? fallbackScore
    if (fallback < 0 || fallback > 100 || !Number.isFinite(fallback)) {
      throw new Error(`PM score out of range [0, 100]: ${fallback}`)
    }
    return { score: fallback, isOfficial: false, isProvisional: true }
  }

  const cto = resolveExec(input.cto)
  const cpo = resolveExec(input.cpo)
  const cfo = resolveExec(input.cfo)
  const chro = resolveExec(input.chro)

  if (isLegacyFourWeight) {
    const raw = cto.score * (input.weights?.cto ?? 0.3) +
      cpo.score * (input.weights?.cpo ?? 0.3) +
      cfo.score * (input.weights?.cfo ?? 0.2) +
      chro.score * (input.weights?.chro ?? 0.2)
    const isProv = cto.isProvisional || cpo.isProvisional || cfo.isProvisional || chro.isProvisional
    return {
      value: round2(clamp(raw, 0, 100)),
      status: isProv ? 'PROVISIONAL' : 'OFFICIAL',
    }
  }

  let includedWeightedSum = 0
  let includedWeightsTotal = 0

  if (pmScore !== undefined) {
    includedWeightedSum += pmScore * wPm
    includedWeightsTotal += wPm
  }
  if (cto.isOfficial) {
    includedWeightedSum += cto.score * wCto
    includedWeightsTotal += wCto
  }
  if (cpo.isOfficial) {
    includedWeightedSum += cpo.score * wCpo
    includedWeightsTotal += wCpo
  }
  if (cfo.isOfficial) {
    includedWeightedSum += cfo.score * wCfo
    includedWeightsTotal += wCfo
  }
  if (chro.isOfficial) {
    includedWeightedSum += chro.score * wChro
    includedWeightsTotal += wChro
  }

  // If no components were explicitly marked official yet, evaluate available scores with provisional status
  if (includedWeightsTotal <= 0) {
    const defaultRaw = fallbackScore * wPm + cto.score * wCto + cpo.score * wCpo + cfo.score * wCfo + chro.score * wChro
    return {
      value: round2(clamp(defaultRaw, 0, 100)),
      status: 'PROVISIONAL',
    }
  }

  const score = round2(clamp(includedWeightedSum / includedWeightsTotal, 0, 100))
  const isProvisional = !cto.isOfficial || !cpo.isOfficial || !cfo.isOfficial || !chro.isOfficial

  return {
    value: score,
    status: isProvisional ? 'PROVISIONAL' : 'OFFICIAL',
  }
}

/**
 * Calculates Domain Execution component for C-Level: average of weekly KPIs of PMs in that domain.
 * Null/N/A weeks are strictly excluded. If no valid KPIs exist, returns null.
 */
export function domainExecutionFromDepartment(
  pmKpis: Array<{ value: number | null; isInactive?: boolean }>,
): number | null {
  const validScores = pmKpis
    .filter((k) => !k.isInactive && k.value !== null && Number.isFinite(k.value))
    .map((k) => k.value as number)

  if (validScores.length === 0) {
    return null
  }

  const avg = validScores.reduce((acc, curr) => acc + curr, 0) / validScores.length
  return round2(clamp(avg, 0, 100))
}

/**
 * Calculates Peer Synergy component for C-Level: average of ratings from peer executives.
 * Self-rating is strictly excluded.
 */
export function peerSynergy(
  evaluations: Array<{ evaluatorId: string; score: number }>,
  selfId: string,
): number | null {
  const peerScores = evaluations
    .filter((e) => e.evaluatorId !== selfId && Number.isFinite(e.score))
    .map((e) => {
      if (e.score < 0 || e.score > 100) {
        throw new Error(`Peer score out of range [0, 100]: ${e.score}`)
      }
      return e.score
    })

  if (peerScores.length === 0) {
    return null
  }

  const avg = peerScores.reduce((acc, curr) => acc + curr, 0) / peerScores.length
  return round2(clamp(avg, 0, 100))
}

/**
 * Level 3: C-Level Executive (CTO, CPO, CFO, CHRO) Weekly Composite KPI Evaluation per CHRO Requirements §4.2:
 * Evaluator weights: CEO (60%), CTO (10%), CFO (10%), CHRO (10%), CPO (10%). Total 100%.
 * Each C-Level executive is authorized to evaluate their own 10% component.
 * Missing evaluation components: KPI = sum(score × weight) ÷ sum(included weights).
 * Do not treat unapproved score as zero. If no official scores exist, show result as pending.
 */
export function weeklyKpiCLevel(input: CLevelWeeklyKpiInput): WeeklyKpiResult {
  // Support legacy companyGoal/domainExecution/ceoReview/peerSynergy inputs
  if (input.companyGoal !== undefined) {
    const wGoal = input.weights?.companyGoal ?? 0.40
    const wDomain = input.weights?.domainExecution ?? 0.30
    const wCeo = typeof input.weights?.ceoReview === 'number' ? input.weights.ceoReview : 0.20
    const wPeer = input.weights?.peerSynergy ?? 0.10

    if (!validateWeightsSum([wGoal, wDomain, wCeo, wPeer])) {
      throw new Error(`C-Level weights must sum to 1.0. Given: ${[wGoal, wDomain, wCeo, wPeer].join(', ')}`)
    }

    if (input.domainExecution === null || input.peerSynergy === null) {
      return {
        value: null,
        status: 'INCOMPLETE',
        reason: 'Missing domain execution average or peer synergy evaluations',
      }
    }

    const ceoScore = typeof input.ceoReview === 'number' ? input.ceoReview : (input.ceoReview as any)?.score ?? 88

    for (const [name, val] of [
      ['companyGoal', input.companyGoal],
      ['domainExecution', input.domainExecution],
      ['ceoReview', ceoScore],
      ['peerSynergy', input.peerSynergy],
    ] as const) {
      if (val < 0 || val > 100 || !Number.isFinite(val)) {
        throw new Error(`${name} score out of range [0, 100]: ${val}`)
      }
    }

    const raw =
      input.companyGoal * wGoal +
      input.domainExecution * wDomain +
      ceoScore * wCeo +
      input.peerSynergy * wPeer

    return {
      value: round2(clamp(raw, 0, 100)),
      status: 'OFFICIAL',
    }
  }

  // Modern §4.2 C-Level formula: 60% CEO + 10% CTO + 10% CFO + 10% CHRO + 10% CPO
  const wCeo = input.weights?.ceo ?? 0.60
  const wCto = input.weights?.cto ?? 0.10
  const wCfo = input.weights?.cfo ?? 0.10
  const wChro = input.weights?.chro ?? 0.10
  const wCpo = input.weights?.cpo ?? 0.10

  if (!validateWeightsSum([wCeo, wCto, wCfo, wChro, wCpo])) {
    throw new Error(`C-Level weights must sum to 1.0. Given: ${[wCeo, wCto, wCfo, wChro, wCpo].join(', ')}`)
  }

  const resolveItem = (field?: { score?: number; status?: string } | number) => {
    if (typeof field === 'number') {
      if (field < 0 || field > 100 || !Number.isFinite(field)) {
        throw new Error(`Score out of range [0, 100]: ${field}`)
      }
      return { score: field, isOfficial: true }
    }
    if (field?.score !== undefined) {
      if (field.score < 0 || field.score > 100 || !Number.isFinite(field.score)) {
        throw new Error(`Score out of range [0, 100]: ${field.score}`)
      }
      const isOfficial = field.status === 'CONFIRMED' || field.status === 'ADJUSTED'
      return { score: field.score, isOfficial }
    }
    return { score: undefined, isOfficial: false }
  }

  const ceo = resolveItem(input.ceoReview)
  const cto = resolveItem(input.cto)
  const cfo = resolveItem(input.cfo)
  const chro = resolveItem(input.chro)
  const cpo = resolveItem(input.cpo)

  let includedWeightedSum = 0
  let includedWeightsTotal = 0

  if (ceo.isOfficial && ceo.score !== undefined) {
    includedWeightedSum += ceo.score * wCeo
    includedWeightsTotal += wCeo
  }
  if (cto.isOfficial && cto.score !== undefined) {
    includedWeightedSum += cto.score * wCto
    includedWeightsTotal += wCto
  }
  if (cfo.isOfficial && cfo.score !== undefined) {
    includedWeightedSum += cfo.score * wCfo
    includedWeightsTotal += wCfo
  }
  if (chro.isOfficial && chro.score !== undefined) {
    includedWeightedSum += chro.score * wChro
    includedWeightsTotal += wChro
  }
  if (cpo.isOfficial && cpo.score !== undefined) {
    includedWeightedSum += cpo.score * wCpo
    includedWeightsTotal += wCpo
  }

  if (includedWeightsTotal <= 0) {
    return {
      value: null,
      status: 'PENDING',
      reason: 'No official C-Level scores recorded yet',
    }
  }

  const score = round2(clamp(includedWeightedSum / includedWeightsTotal, 0, 100))
  const isProvisional = !ceo.isOfficial || !cto.isOfficial || !cfo.isOfficial || !chro.isOfficial || !cpo.isOfficial

  return {
    value: score,
    status: isProvisional ? 'PROVISIONAL' : 'OFFICIAL',
  }
}

/**
 * Level 4: CEO Weekly Composite KPI Evaluation
 *
 * Formula: 0.60*CompanyPerformance + 0.40*CLevelAggregate
 * CLevelAggregate: Average of the four C-Level final weekly KPIs (ignoring N/A).
 */
export function weeklyKpiCeo(input: CeoWeeklyKpiInput): WeeklyKpiResult {
  const wPerf = input.weights?.companyPerformance ?? 0.60
  const wAgg = input.weights?.cLevelAggregate ?? 0.40

  if (!validateWeightsSum([wPerf, wAgg])) {
    throw new Error(`CEO weights must sum to 1.0. Given: ${wPerf}, ${wAgg}`)
  }

  if (input.companyPerformance < 0 || input.companyPerformance > 100) {
    throw new Error(`Company performance out of range [0, 100]: ${input.companyPerformance}`)
  }

  const validCLevels = input.cLevelFinalKpis
    .filter((k) => !k.isInactive && k.score !== null && Number.isFinite(k.score))
    .map((k) => k.score as number)

  if (validCLevels.length === 0) {
    return {
      value: null,
      status: 'INCOMPLETE',
      reason: 'No official C-Level weekly KPIs available to compute C-Level aggregate',
    }
  }

  const aggregate = validCLevels.reduce((acc, curr) => acc + curr, 0) / validCLevels.length
  const raw = input.companyPerformance * wPerf + aggregate * wAgg

  return {
    value: round2(clamp(raw, 0, 100)),
    status: 'OFFICIAL',
  }
}

/**
 * Applies a CHRO or CEO disciplinary deduction to a finalized weekly KPI per CHRO Requirements §2.4:
 * "The CHRO and CEO shall each have independent authority to directly deduct percentage points
 * from any employee's numerical weekly KPI for documented disciplinary action, policy breaches or misconduct.
 * Neither executive requires approval from the other... The adjusted KPI shall remain within 0-100.
 * No KPI deduction shall be applied to an N/A week, and no deduction shall carry forward from that week."
 */
export function applyDisciplinaryDeduction(
  input: DisciplinaryDeductionInput,
): DisciplinaryDeductionResult {
  const { weeklyValue, points } = input

  if (points <= 0 || points > 100 || !Number.isFinite(points)) {
    throw new Error(`Disciplinary deduction points must be in (0, 100]. Given: ${points}`)
  }

  if (weeklyValue === null || !Number.isFinite(weeklyValue)) {
    return {
      value: null,
      previousValue: null,
      deductionPoints: points,
      deductionApplied: false,
      note: 'Week score was N/A (Inactive); no deduction applied per §2.4',
    }
  }

  const newValue = round2(clamp(weeklyValue - points, 0, 100))

  return {
    value: newValue,
    previousValue: weeklyValue,
    deductionPoints: points,
    deductionApplied: true,
  }
}
