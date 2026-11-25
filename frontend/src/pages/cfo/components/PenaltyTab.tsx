import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, CheckCircle2, Gavel, ShieldAlert, XCircle } from 'lucide-react'
import { erpApi } from '../../../api/client'
import { FinanceV2PenaltyRecord, mapFinanceV2PenaltyRecord } from '../../../api/adapter'
import { Button } from '../../../components/common/Button'
import { Modal } from '../../../components/common/Modal'
import { formatBDT } from '../../../utils/money'
import { FinanceV2SharedProps } from './financeV2Types'

const PENALTY_CATEGORIES = [
  'CODE_SMELL',
  'CTO_CONSULTANCY',
  'SLACKER',
  'SWAP_FIRE',
  'DEADLINE',
  'BLIND_QA',
] as const

export function PenaltyTab({
  config,
  teams,
  currentUserId,
  currentUserRole,
  perms,
  onRefreshAll,
  onToast,
  onRequestMfaConfirm,
}: FinanceV2SharedProps) {
  const [sprintNumber, setSprintNumber] = useState<number>(1)
  const [teamId, setTeamId] = useState<string>('')
  const [category, setCategory] = useState<string>('CODE_SMELL')
  const [reason, setReason] = useState<string>('')
  const [penalties, setPenalties] = useState<FinanceV2PenaltyRecord[]>([])
  const [rosterFlags, setRosterFlags] = useState<FinanceV2PenaltyRecord[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [rejectPenalty, setRejectPenalty] = useState<FinanceV2PenaltyRecord | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const allowedCategories = PENALTY_CATEGORIES.filter((cat) => {
    const r = currentUserRole.toLowerCase()
    if (perms.isCeo || r === 'ceo') return true
    if (r === 'cto') return cat === 'CODE_SMELL' || cat === 'CTO_CONSULTANCY' || cat === 'DEADLINE' || cat === 'BLIND_QA'
    if (r === 'chro' || r === 'cpo') return cat === 'SLACKER' || cat === 'SWAP_FIRE' || cat === 'DEADLINE' || cat === 'BLIND_QA'
    if (r === 'cfo') return cat === 'DEADLINE' || cat === 'BLIND_QA'
    return true
  })

  const effectiveTeamId = teamId || teams[0]?.id || ''
  const effectiveCategory = allowedCategories.includes(category as any)
    ? category
    : allowedCategories[0] || 'BLIND_QA'

  const loadData = useCallback(async () => {
    setErrorMsg(null)
    try {
      const [penRaw, flagRaw] = await Promise.all([
        erpApi.getFinancePenalties(),
        erpApi.getFinanceRosterChangeFlags().catch(() => []),
      ])
      setPenalties((penRaw || []).map(mapFinanceV2PenaltyRecord))
      setRosterFlags((flagRaw || []).map(mapFinanceV2PenaltyRecord))
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to load penalty records')
    }
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const [penRaw, flagRaw] = await Promise.all([
          erpApi.getFinancePenalties(),
          erpApi.getFinanceRosterChangeFlags().catch(() => []),
        ])
        if (active) {
          setPenalties((penRaw || []).map(mapFinanceV2PenaltyRecord))
          setRosterFlags((flagRaw || []).map(mapFinanceV2PenaltyRecord))
        }
      } catch (err: any) {
        if (active) setErrorMsg(err?.message || 'Failed to load penalty records')
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const selectedRule = config?.penaltyTable?.[effectiveCategory]

  const handleRecordPenalty = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!effectiveTeamId || reason.trim().length < 5) {
      onToast('Squad and incident reason (min 5 chars) are required')
      return
    }
    try {
      await erpApi.recordFinancePenalty({
        sprintNumber,
        teamId: effectiveTeamId,
        category: effectiveCategory,
        reason: reason.trim(),
      })
      onToast(`Recorded ${effectiveCategory} penalty`)
      setReason('')
      await loadData()
    } catch (err: any) {
      onToast(err?.message || 'Failed to record penalty')
    }
  }

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!rejectPenalty || rejectReason.trim().length < 5) {
      onToast('Rejection reason (min 5 chars) is required')
      return
    }
    try {
      await erpApi.rejectFinancePenalty(rejectPenalty.id, rejectReason.trim())
      onToast('Deadline penalty rejected')
      setRejectPenalty(null)
      setRejectReason('')
      await loadData()
    } catch (err: any) {
      onToast(err?.message || 'Rejection failed')
    }
  }

  return (
    <div className="space-y-6">
      {errorMsg && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 text-rose-600 text-xs">
          {errorMsg}
        </div>
      )}

      {rosterFlags.length > 0 && (
        <div className="p-3.5 rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 flex items-start gap-2.5 text-xs">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-amber-800 dark:text-amber-300">
              Pending SWAP_FIRE Roster Change Alerts ({rosterFlags.length})
            </div>
            <div className="text-amber-700 dark:text-amber-400 mt-0.5">
              {rosterFlags
                .map((f) => `${teams.find((t) => t.id === f.teamId)?.name || f.teamId}: ${f.reason}`)
                .join(' · ')}
            </div>
          </div>
        </div>
      )}

      {/* Record Penalty Form */}
      {!perms.isReadOnlyAuditor && perms.canRecordPenalty && (
        <form
          onSubmit={handleRecordPenalty}
          className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20 space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-500" />
              Record Squad Penalty Incident
            </div>
            {selectedRule && (
              <span className="text-xs text-slate-500">
                Config: {formatBDT(Number(selectedRule.amount))} (
                {selectedRule.recipientRole
                  ? `${Math.round(Number(selectedRule.recipientPct) * 100)}% ${selectedRule.recipientRole.toUpperCase()} / `
                  : ''}
                {Math.round(Number(selectedRule.companyPct) * 100)}% Company Fund)
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="number"
              min={1}
              value={sprintNumber}
              onChange={(e) => setSprintNumber(Math.max(1, Number(e.target.value) || 1))}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs"
            />
            <select
              value={effectiveTeamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs"
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <select
              value={effectiveCategory}
              onChange={(e) => setCategory(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs"
            >
              {allowedCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <input
            type="text"
            required
            minLength={5}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Incident reference & reason (min 5 chars)"
            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs"
          />
          <Button variant="danger" size="sm" type="submit" icon={Gavel}>
            Record Penalty
          </Button>
        </form>
      )}

      {/* Penalties Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-50 dark:bg-slate-800/40 text-slate-500 uppercase">
            <tr>
              <th className="py-2.5 px-3">Sprint / Squad</th>
              <th className="py-2.5 px-3">Category</th>
              <th className="py-2.5 px-3 text-right">Gross</th>
              <th className="py-2.5 px-3">Split Preview</th>
              <th className="py-2.5 px-3">Status</th>
              <th className="py-2.5 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {penalties.map((p) => {
              const teamName = teams.find((t) => t.id === p.teamId)?.name || p.teamId
              return (
                <tr key={p.id}>
                  <td className="py-2.5 px-3">
                    S{p.sprintNumber} · {teamName}
                  </td>
                  <td className="py-2.5 px-3 font-semibold">
                    {p.category}
                    {p.triggersRosterChange && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-[10px]">
                        SWAP
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold tabular-nums">
                    {formatBDT(p.grossAmount)}
                  </td>
                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                    Recipient: {formatBDT(p.recipientShare)} | Company Fund:{' '}
                    {formatBDT(p.companyFundShare)}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 font-semibold">
                      {p.status}
                    </span>
                    {p.rejectionReason && (
                      <div className="text-[11px] text-rose-500 mt-0.5">{p.rejectionReason}</div>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right space-x-2">
                    {!perms.isReadOnlyAuditor &&
                      perms.isCeo &&
                      p.status === 'PENDING_CEO_APPROVAL' &&
                      p.recordedById !== currentUserId && (
                        <>
                          <Button
                            variant="primary"
                            size="sm"
                            icon={CheckCircle2}
                            onClick={() =>
                              onRequestMfaConfirm({
                                title: `Approve ${p.category} Penalty`,
                                details: `Approve ${formatBDT(p.grossAmount)} penalty for ${teamName}.`,
                                whatWillHappen: 'Allows CFO to post the penalty split (20% CFO / 80% Company Fund).',
                                severity: 'danger',
                                isCritical: true,
                                onRun: async (mfaCode) => {
                                  await erpApi.approveFinancePenalty(p.id, mfaCode)
                                  onToast('Approved DEADLINE penalty')
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
                              setRejectPenalty(p)
                              setRejectReason('')
                            }}
                          >
                            Reject
                          </Button>
                        </>
                      )}
                    {!perms.isReadOnlyAuditor &&
                      perms.canPostPenalty &&
                      (p.status === 'RECORDED' && p.category !== 'DEADLINE' ||
                        p.status === 'APPROVED') && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() =>
                            onRequestMfaConfirm({
                              title: `Post ${p.category} Penalty (${formatBDT(p.grossAmount)})`,
                              details: `Debit ${teamName} and credit Recipient (${formatBDT(p.recipientShare)}) + Company Fund (${formatBDT(p.companyFundShare)}).`,
                              whatWillHappen: 'Writes balanced double-entry ledger legs atomically.',
                              severity: 'danger',
                              isCritical: false,
                              onRun: async (mfaCode) => {
                                await erpApi.postFinancePenalty(p.id, mfaCode)
                                onToast('Posted penalty split to ledger')
                                await Promise.all([onRefreshAll(), loadData()])
                              },
                            })
                          }
                        >
                          Post Split
                        </Button>
                      )}
                  </td>
                </tr>
              )
            })}
            {penalties.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400">
                  No penalties recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {rejectPenalty && (
        <Modal isOpen={true} onClose={() => setRejectPenalty(null)} title="Reject DEADLINE Penalty">
          <form onSubmit={handleRejectSubmit} className="space-y-4">
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
              <Button variant="secondary" onClick={() => setRejectPenalty(null)}>
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
