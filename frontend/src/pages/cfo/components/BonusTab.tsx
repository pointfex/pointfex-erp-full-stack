import { useState, useEffect, useCallback } from 'react'
import { Award, CheckCircle2, Play, XCircle } from 'lucide-react'
import { erpApi } from '../../../api/client'
import {
  FinanceV2BonusAward,
  FinanceV2MoneyRequest,
  mapFinanceV2BonusAward,
  mapFinanceV2MoneyRequest,
} from '../../../api/adapter'
import { Button } from '../../../components/common/Button'
import { Modal } from '../../../components/common/Modal'
import { formatBDT } from '../../../utils/money'
import { FinanceV2SharedProps } from './financeV2Types'

export function BonusTab({
  teams,
  staffList,
  currentUserId,
  perms,
  onRefreshAll,
  onToast,
  onRequestMfaConfirm,
}: FinanceV2SharedProps) {
  const [sprintNumber, setSprintNumber] = useState<number>(1)
  const [bonuses, setBonuses] = useState<FinanceV2BonusAward[]>([])
  const [poolCredits, setPoolCredits] = useState<FinanceV2MoneyRequest[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [rejectAward, setRejectAward] = useState<FinanceV2BonusAward | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const [scoreTeamId, setScoreTeamId] = useState('')
  const [scoreEmpId, setScoreEmpId] = useState('')
  const [delivery, setDelivery] = useState(22)
  const [quality, setQuality] = useState(18)
  const [ownership, setOwnership] = useState(22)
  const [collaboration, setCollaboration] = useState(13)
  const [reliability, setReliability] = useState(14)
  const [evidence, setEvidence] = useState('')

  const loadData = useCallback(async () => {
    setErrorMsg(null)
    try {
      const [bonusRaw, poolRaw] = await Promise.all([
        erpApi.getFinanceBonuses(),
        erpApi.getFinanceMoneyRequests({ type: 'POOL_CREDIT', status: 'PAID' }).catch(() => []),
      ])
      setBonuses((bonusRaw || []).map(mapFinanceV2BonusAward))
      setPoolCredits((poolRaw || []).map(mapFinanceV2MoneyRequest))
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to load bonus awards')
    }
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const [bonusRaw, poolRaw] = await Promise.all([
          erpApi.getFinanceBonuses(),
          erpApi.getFinanceMoneyRequests({ type: 'POOL_CREDIT', status: 'PAID' }).catch(() => []),
        ])
        if (active) {
          setBonuses((bonusRaw || []).map(mapFinanceV2BonusAward))
          setPoolCredits((poolRaw || []).map(mapFinanceV2MoneyRequest))
        }
      } catch (err: any) {
        if (active) setErrorMsg(err?.message || 'Failed to load bonus awards')
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const effectiveTeamId = scoreTeamId || teams[0]?.id || ''
  const effectiveEmpId = scoreEmpId || staffList[0]?.id || ''

  const sprintApprovedAwards = bonuses.filter(
    (b) => b.sprintNumber === sprintNumber && b.status === 'APPROVED',
  )

  const handleScoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!effectiveTeamId || !effectiveEmpId || evidence.trim().length < 10) {
      onToast('Squad, employee, and evidence (min 10 chars) are required')
      return
    }
    try {
      await erpApi.scoreFinanceBonus({
        sprintNumber,
        teamId: effectiveTeamId,
        employeeId: effectiveEmpId,
        criteriaScores: { delivery, quality, ownership, collaboration, reliability },
        evidence: evidence.trim(),
      })
      onToast('Bonus evaluation submitted for CEO approval')
      setEvidence('')
      await loadData()
    } catch (err: any) {
      onToast(err?.message || 'Failed to submit bonus score')
    }
  }

  const handleConfirmReject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!rejectAward || rejectReason.trim().length < 5) {
      onToast('Rejection reason (min 5 chars) is required')
      return
    }
    try {
      await erpApi.rejectFinanceBonus(rejectAward.id, rejectReason.trim())
      onToast('Bonus award rejected')
      setRejectAward(null)
      setRejectReason('')
      await loadData()
    } catch (err: any) {
      onToast(err?.message || 'Failed to reject bonus')
    }
  }

  return (
    <div className="space-y-6">
      {errorMsg && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 text-rose-600 text-xs">
          {errorMsg}
        </div>
      )}

      {/* Pool Credit Remaining Meters */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-bold uppercase text-slate-600 dark:text-slate-300">
            Sprint {sprintNumber} Pool-Credit Bonus Caps
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-500">Sprint #</label>
            <input
              type="number"
              min={1}
              value={sprintNumber}
              onChange={(e) => setSprintNumber(Math.max(1, Number(e.target.value) || 1))}
              className="w-20 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-semibold"
            />
            {!perms.isReadOnlyAuditor && perms.canDisburseBonus && (
              <Button
                variant="primary"
                size="sm"
                icon={Play}
                disabled={sprintApprovedAwards.length === 0}
                onClick={() =>
                  onRequestMfaConfirm({
                    title: `Disburse Sprint ${sprintNumber} Approved Bonuses`,
                    details: `Batch disburse ${sprintApprovedAwards.length} CEO-approved bonus award(s).`,
                    whatWillHappen: 'Verifies pool-credit caps, debits Squad Accounts, and credits staff wallets.',
                    severity: 'standard',
                    isCritical: true,
                    onRun: async (mfaCode) => {
                      await erpApi.disburseFinanceBonusesBatch(
                        { sprintNumber, awardIds: sprintApprovedAwards.map((a) => a.id) },
                        mfaCode,
                      )
                      onToast(`Disbursed ${sprintApprovedAwards.length} sprint bonus(es)`)
                      await Promise.all([onRefreshAll(), loadData()])
                    },
                  })
                }
              >
                Batch Disburse ({sprintApprovedAwards.length})
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {teams.map((team) => {
            const cap = poolCredits
              .filter((p) => p.sprintNumber === sprintNumber && p.teamId === team.id)
              .reduce((acc, p) => acc + p.amount, 0)
            const used = bonuses
              .filter(
                (b) =>
                  b.sprintNumber === sprintNumber &&
                  b.teamId === team.id &&
                  (b.status === 'APPROVED' || b.status === 'PAID'),
              )
              .reduce((acc, b) => acc + b.tierAmount, 0)
            const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0
            return (
              <div
                key={team.id}
                className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20 text-xs space-y-1.5"
              >
                <div className="flex justify-between font-semibold">
                  <span>{team.name}</span>
                  <span>
                    {formatBDT(used)} / {formatBDT(cap)}
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* PM / CEO Bonus Scoring Form */}
      {!perms.isReadOnlyAuditor && perms.canScoreBonus && (
        <form
          onSubmit={handleScoreSubmit}
          className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20 space-y-3"
        >
          <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
            <Award className="w-4 h-4 text-emerald-500" />
            Submit Sprint Bonus Score (Total{' '}
            {delivery + quality + ownership + collaboration + reliability}/100)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select
              value={effectiveTeamId}
              onChange={(e) => setScoreTeamId(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs"
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <select
              value={effectiveEmpId}
              onChange={(e) => setScoreEmpId(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs"
            >
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.role.toUpperCase()})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
            <label className="space-y-1">
              <span className="text-slate-500">Delivery (/25)</span>
              <input
                type="number"
                min={0}
                max={25}
                value={delivery}
                onChange={(e) => setDelivery(Number(e.target.value) || 0)}
                className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-500">Quality (/20)</span>
              <input
                type="number"
                min={0}
                max={20}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value) || 0)}
                className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-500">Ownership (/25)</span>
              <input
                type="number"
                min={0}
                max={25}
                value={ownership}
                onChange={(e) => setOwnership(Number(e.target.value) || 0)}
                className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-500">Collab (/15)</span>
              <input
                type="number"
                min={0}
                max={15}
                value={collaboration}
                onChange={(e) => setCollaboration(Number(e.target.value) || 0)}
                className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-500">Reliability (/15)</span>
              <input
                type="number"
                min={0}
                max={15}
                value={reliability}
                onChange={(e) => setReliability(Number(e.target.value) || 0)}
                className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950"
              />
            </label>
          </div>
          <input
            type="text"
            required
            minLength={10}
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            placeholder="Delivery evidence links & PR summary (min 10 chars)"
            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs"
          />
          <Button variant="primary" size="sm" type="submit">
            Submit Score
          </Button>
        </form>
      )}

      {/* Bonus Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-50 dark:bg-slate-800/40 text-slate-500 uppercase">
            <tr>
              <th className="py-2.5 px-3">Sprint / Squad</th>
              <th className="py-2.5 px-3">Recipient</th>
              <th className="py-2.5 px-3">Score</th>
              <th className="py-2.5 px-3 text-right">Tier Amount</th>
              <th className="py-2.5 px-3">Status</th>
              <th className="py-2.5 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {bonuses.map((b) => {
              const teamName = teams.find((t) => t.id === b.teamId)?.name || b.teamId
              const emp = staffList.find((s) => s.id === b.employeeId)
              return (
                <tr key={b.id}>
                  <td className="py-2.5 px-3">
                    S{b.sprintNumber} · {teamName}
                  </td>
                  <td className="py-2.5 px-3 font-medium">{emp?.name || b.employeeId}</td>
                  <td className="py-2.5 px-3 font-semibold">{b.totalScore}/100</td>
                  <td className="py-2.5 px-3 text-right font-bold tabular-nums">
                    {formatBDT(b.tierAmount)}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 font-semibold">
                      {b.status}
                    </span>
                    {b.rejectionReason && (
                      <div className="text-[11px] text-rose-500 mt-0.5">{b.rejectionReason}</div>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right space-x-2">
                    {!perms.isReadOnlyAuditor &&
                      perms.canApproveBonus &&
                      b.status === 'SUBMITTED' &&
                      b.scoredById !== currentUserId && (
                        <>
                          <Button
                            variant="primary"
                            size="sm"
                            icon={CheckCircle2}
                            onClick={() =>
                              onRequestMfaConfirm({
                                title: `Approve Bonus (${formatBDT(b.tierAmount)})`,
                                details: `Approve bonus for ${emp?.name || b.employeeId} (Score ${b.totalScore}/100).`,
                                whatWillHappen: 'Verifies squad pool cap and unlocks CFO disbursement.',
                                severity: 'standard',
                                isCritical: true,
                                onRun: async (mfaCode) => {
                                  await erpApi.approveFinanceBonus(b.id, mfaCode)
                                  onToast('Approved bonus award')
                                  await loadData()
                                },
                              })
                            }
                          >
                            Approve
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            icon={XCircle}
                            onClick={() => {
                              setRejectAward(b)
                              setRejectReason('')
                            }}
                          >
                            Reject
                          </Button>
                        </>
                      )}
                    {!perms.isReadOnlyAuditor && perms.canDisburseBonus && b.status === 'APPROVED' && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() =>
                          onRequestMfaConfirm({
                            title: `Disburse Bonus (${formatBDT(b.tierAmount)})`,
                            details: `Credit ${formatBDT(b.tierAmount)} from ${teamName} to ${emp?.name || b.employeeId}.`,
                            whatWillHappen: 'Posts BONUS_AWARD ledger entry and updates personal wallet.',
                            severity: 'standard',
                            isCritical: false,
                            onRun: async (mfaCode) => {
                              await erpApi.disburseFinanceBonus(b.id, mfaCode)
                              onToast('Disbursed bonus award')
                              await Promise.all([onRefreshAll(), loadData()])
                            },
                          })
                        }
                      >
                        Disburse
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })}
            {bonuses.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400">
                  No bonus awards scored yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {rejectAward && (
        <Modal isOpen={true} onClose={() => setRejectAward(null)} title="Reject Bonus Award">
          <form onSubmit={handleConfirmReject} className="space-y-4">
            <input
              type="text"
              required
              minLength={5}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Required rejection reason (min 5 chars)"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm"
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setRejectAward(null)}>
                Cancel
              </Button>
              <Button variant="danger" type="submit">
                Reject
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
