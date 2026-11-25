import { useState, useEffect, useCallback } from 'react'
import { ArrowRightLeft, Award, CheckCircle2, PlusCircle, Send, XCircle } from 'lucide-react'
import { erpApi } from '../../../api/client'
import {
  FinanceV2MoneyRequest,
  FinanceV2SprintRanking,
  mapFinanceV2MoneyRequest,
  mapFinanceV2SprintRanking,
} from '../../../api/adapter'
import { Button } from '../../../components/common/Button'
import { Modal } from '../../../components/common/Modal'
import { MoneyInput } from '../../../components/common/MoneyInput'
import { formatBDT } from '../../../utils/money'
import { FinanceV2SharedProps } from './financeV2Types'

export function AddMoneyTransferTab({
  accounts,
  squadAccounts,
  config,
  teams,
  staffList,
  currentUserId,
  perms,
  onRefreshAll,
  onToast,
  onRequestMfaConfirm,
}: FinanceV2SharedProps) {
  const [sprintNumber, setSprintNumber] = useState<number>(1)
  const [requests, setRequests] = useState<FinanceV2MoneyRequest[]>([])
  const [rankings, setRankings] = useState<FinanceV2SprintRanking[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Add Money form
  const [addDestId, setAddDestId] = useState<string>('')
  const [addAmount, setAddAmount] = useState<number>(10000)
  const [addReason, setAddReason] = useState<string>('')

  // Transfer form
  const [txSourceId, setTxSourceId] = useState<string>('')
  const [txDestKind, setTxDestKind] = useState<'FINANCE_ACCOUNT' | 'PERSONAL_WALLET'>(
    'FINANCE_ACCOUNT',
  )
  const [txDestRefId, setTxDestRefId] = useState<string>('')
  const [txAmount, setTxAmount] = useState<number>(5000)
  const [txPurpose, setTxPurpose] = useState<string>('INFRA_ALLOCATION')
  const [txReason, setTxReason] = useState<string>('')

  // Reject modal (money request or ranking)
  const [rejectState, setRejectState] = useState<{
    kind: 'money_request' | 'ranking'
    idOrSprint: string | number
    label: string
  } | null>(null)
  const [rejectReason, setRejectReason] = useState<string>('')

  // Sprint Ranking state (rank -> teamId)
  const [rankSelections, setRankSelections] = useState<string[]>([])

  const loadData = useCallback(async () => {
    setErrorMsg(null)
    try {
      const [reqRaw, rankRaw] = await Promise.all([
        erpApi.getFinanceMoneyRequests().catch(() => []),
        erpApi.getFinanceSprintRankings().catch(() => []),
      ])
      setRequests((reqRaw || []).map(mapFinanceV2MoneyRequest))
      setRankings((rankRaw || []).map(mapFinanceV2SprintRanking))
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to load funding requests and sprint rankings')
    }
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const [reqRaw, rankRaw] = await Promise.all([
          erpApi.getFinanceMoneyRequests().catch(() => []),
          erpApi.getFinanceSprintRankings().catch(() => []),
        ])
        if (active) {
          setRequests((reqRaw || []).map(mapFinanceV2MoneyRequest))
          setRankings((rankRaw || []).map(mapFinanceV2SprintRanking))
        }
      } catch (err: any) {
        if (active) setErrorMsg(err?.message || 'Failed to load funding requests')
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const effectiveAddDestId = addDestId || accounts[0]?.id || ''
  const effectiveTxSourceId = txSourceId || accounts[0]?.id || ''
  const effectiveTxDestRefId =
    txDestRefId ||
    (txDestKind === 'FINANCE_ACCOUNT'
      ? accounts.find((a) => a.id !== effectiveTxSourceId)?.id || ''
      : staffList[0]?.id || '')

  const selectedSourceAcc = accounts.find((a) => a.id === effectiveTxSourceId)
  const selectedDestAcc =
    txDestKind === 'FINANCE_ACCOUNT' ? accounts.find((a) => a.id === effectiveTxDestRefId) : null
  const isBlockedCompanyFundPath =
    selectedSourceAcc?.type === 'COMPANY_FUND' &&
    selectedDestAcc?.type === 'SQUAD' &&
    /PAYROLL|BONUS/i.test(txPurpose)

  const handleSubmitAddMoney = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!effectiveAddDestId || addAmount <= 0 || addReason.trim().length < 5) {
      onToast('Destination account, positive amount, and reason (min 5 chars) are required')
      return
    }
    try {
      await erpApi.createFinanceAddMoneyRequest({
        sprintNumber,
        destAccountId: effectiveAddDestId,
        amount: addAmount,
        reason: addReason.trim(),
      })
      onToast('Add Money request submitted for CEO approval')
      setAddReason('')
      await loadData()
    } catch (err: any) {
      onToast(err?.message || 'Failed to submit Add Money request')
    }
  }

  const handleSubmitTransfer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isBlockedCompanyFundPath) {
      onToast('Company Fund cannot transfer directly to Squad Accounts for payroll or bonuses')
      return
    }
    if (!effectiveTxSourceId || !effectiveTxDestRefId || txAmount <= 0 || txReason.trim().length < 5) {
      onToast('Valid source, destination, amount, and reason (min 5 chars) are required')
      return
    }
    try {
      await erpApi.createFinanceTransferRequest({
        sprintNumber,
        sourceAccountId: effectiveTxSourceId,
        destKind: txDestKind,
        destRefId: effectiveTxDestRefId,
        amount: txAmount,
        purpose: txPurpose,
        reason: txReason.trim(),
      })
      onToast('Transfer request submitted for CEO approval')
      setTxReason('')
      await loadData()
    } catch (err: any) {
      onToast(err?.message || 'Failed to create transfer request')
    }
  }

  const weightsCount = config?.rankWeights?.length || 6
  const activeSquadIds = squadAccounts.map((s) => s.teamId).filter(Boolean) as string[]
  const rankChoices =
    rankSelections.length === weightsCount
      ? rankSelections
      : Array.from({ length: weightsCount }, (_, idx) => activeSquadIds[idx] || teams[idx]?.id || '')

  const handleSubmitRanking = async (e: React.FormEvent) => {
    e.preventDefault()
    if (rankChoices.some((t) => !t) || new Set(rankChoices).size !== rankChoices.length) {
      onToast('Please assign each squad a unique rank without duplicates')
      return
    }
    try {
      await erpApi.submitFinanceSprintRanking({
        sprintNumber,
        entries: rankChoices.map((teamId, idx) => ({ teamId, rank: idx + 1 })),
      })
      onToast(`Sprint ${sprintNumber} ranking submitted for CEO approval`)
      await loadData()
    } catch (err: any) {
      onToast(err?.message || 'Failed to submit sprint ranking')
    }
  }

  const handleSubmitReject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!rejectState || rejectReason.trim().length < 5) {
      onToast('Rejection reason (at least 5 characters) is required')
      return
    }
    try {
      if (rejectState.kind === 'money_request') {
        await erpApi.rejectFinanceMoneyRequest(String(rejectState.idOrSprint), rejectReason.trim())
      } else {
        await erpApi.rejectFinanceSprintRanking(Number(rejectState.idOrSprint), rejectReason.trim())
      }
      onToast(`Rejected ${rejectState.label}`)
      setRejectState(null)
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

      <div className="flex items-center gap-3">
        <label className="text-xs font-semibold uppercase text-slate-500">Active Sprint #</label>
        <input
          type="number"
          min={1}
          value={sprintNumber}
          onChange={(e) => setSprintNumber(Math.max(1, Number(e.target.value) || 1))}
          className="w-24 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm font-semibold"
        />
      </div>

      {/* Forms Grid */}
      {!perms.isReadOnlyAuditor && (perms.canCreateRequest || perms.canSubmitRanking) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Add Money Form */}
          {perms.canCreateRequest && (
            <form
              onSubmit={handleSubmitAddMoney}
              className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20 space-y-3"
            >
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white text-sm">
                <PlusCircle className="w-4 h-4 text-emerald-500" />
                Request Add Money (CEO Approval Required)
              </div>
              <select
                value={effectiveAddDestId}
                onChange={(e) => setAddDestId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.type}) — {formatBDT(acc.balance)}
                  </option>
                ))}
              </select>
              <MoneyInput
                label="Amount (BDT)"
                min={1}
                value={addAmount}
                onChangeDigits={setAddAmount}
                required
              />
              <input
                type="text"
                required
                minLength={5}
                value={addReason}
                onChange={(e) => setAddReason(e.target.value)}
                placeholder="Funding justification (e.g., Sprint Q4 client deposit)"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs"
              />
              <Button variant="primary" size="sm" type="submit" icon={Send}>
                Submit Add Money Request
              </Button>
            </form>
          )}

          {/* Transfer Form */}
          {perms.canCreateRequest && (
            <form
              onSubmit={handleSubmitTransfer}
              className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20 space-y-3"
            >
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white text-sm">
                <ArrowRightLeft className="w-4 h-4 text-sky-500" />
                Request Transfer (CEO Approval Required)
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={effectiveTxSourceId}
                  onChange={(e) => setTxSourceId(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      From: {acc.name} ({formatBDT(acc.balance)})
                    </option>
                  ))}
                </select>
                <select
                  value={txDestKind}
                  onChange={(e) => {
                    setTxDestKind(e.target.value as 'FINANCE_ACCOUNT' | 'PERSONAL_WALLET')
                    setTxDestRefId('')
                  }}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs"
                >
                  <option value="FINANCE_ACCOUNT">To Account</option>
                  <option value="PERSONAL_WALLET">To Personal Wallet</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={effectiveTxDestRefId}
                  onChange={(e) => setTxDestRefId(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs"
                >
                  {txDestKind === 'FINANCE_ACCOUNT'
                    ? accounts
                        .filter((a) => a.id !== effectiveTxSourceId)
                        .map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.name}
                          </option>
                        ))
                    : staffList.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name} ({emp.role.toUpperCase()})
                        </option>
                      ))}
                </select>
                <select
                  value={txPurpose}
                  onChange={(e) => setTxPurpose(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs"
                >
                  <option value="INFRA_ALLOCATION">Infra / Operations</option>
                  <option value="EMERGENCY_GRANT">Emergency Grant</option>
                  <option value="SQUAD_PAYROLL">Squad Payroll (Blocked from Company Fund)</option>
                  <option value="BONUS_AWARD">Bonus Award (Blocked from Company Fund)</option>
                </select>
              </div>
              {isBlockedCompanyFundPath && (
                <div className="text-[11px] text-rose-600 font-medium">
                  Blocked rule: Transfers from Company Fund to Squad Accounts for payroll or bonuses
                  are prohibited. Use Sprint Pool Credits instead.
                </div>
              )}
              <MoneyInput
                label="Transfer Amount (BDT)"
                min={1}
                value={txAmount}
                onChangeDigits={setTxAmount}
                required
              />
              <input
                type="text"
                required
                minLength={5}
                value={txReason}
                onChange={(e) => setTxReason(e.target.value)}
                placeholder="Transfer justification (min 5 chars)"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs"
              />
              <Button
                variant="primary"
                size="sm"
                type="submit"
                icon={Send}
                disabled={isBlockedCompanyFundPath}
              >
                Submit Transfer Request
              </Button>
            </form>
          )}
        </div>
      )}

      {/* CHRO/CPO/CEO Sprint Ranking Submission */}
      {!perms.isReadOnlyAuditor && perms.canSubmitRanking && (
        <form
          onSubmit={handleSubmitRanking}
          className="p-4 rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/30 dark:bg-amber-950/10 space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white text-sm">
              <Award className="w-4 h-4 text-amber-500" />
              Submit Sprint {sprintNumber} Squad Ranking (CHRO / CPO / CEO)
            </div>
            <span className="text-xs text-slate-500">
              Pool: {formatBDT(config?.sprintPoolTotalBDT ?? 150000)} | Weights:{' '}
              {(config?.rankWeights || [6, 5, 4, 3, 2, 1]).join(':')}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {rankChoices.map((selectedTeamId, idx) => (
              <div key={idx} className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-500">
                  Rank #{idx + 1} (w={config?.rankWeights?.[idx] ?? 6 - idx})
                </label>
                <select
                  value={selectedTeamId}
                  onChange={(e) => {
                    const next = [...rankChoices]
                    next[idx] = e.target.value
                    setRankSelections(next)
                  }}
                  className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs"
                >
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <Button variant="primary" size="sm" type="submit">
            Submit Sprint {sprintNumber} Ranking
          </Button>
        </form>
      )}

      {/* Sprint Rankings Queue */}
      <div className="space-y-2">
        <h4 className="font-bold text-slate-900 dark:text-white text-sm">
          Sprint Rankings & ৳150k Pool Distribution
        </h4>
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/40 text-slate-500 uppercase">
              <tr>
                <th className="py-2.5 px-3">Sprint</th>
                <th className="py-2.5 px-3">Ranked Squads</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rankings.map((r) => (
                <tr key={r.id}>
                  <td className="py-2.5 px-3 font-semibold">Sprint {r.sprintNumber}</td>
                  <td className="py-2.5 px-3">
                    {r.entries
                      .map((e) => {
                        const t = teams.find((tm) => tm.id === e.teamId)
                        return `#${e.rank} ${t?.name || e.teamId}`
                      })
                      .join(' · ')}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 font-semibold">
                      {r.poolPostedAt ? 'POOL POSTED' : r.status}
                    </span>
                    {r.rejectionReason && (
                      <div className="text-[11px] text-rose-500 mt-0.5">{r.rejectionReason}</div>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right space-x-2">
                    {!perms.isReadOnlyAuditor &&
                      perms.isCeo &&
                      r.status === 'SUBMITTED' &&
                      r.submittedById !== currentUserId && (
                        <>
                          <Button
                            variant="primary"
                            size="sm"
                            icon={CheckCircle2}
                            onClick={() =>
                              onRequestMfaConfirm({
                                title: `Approve Sprint ${r.sprintNumber} Ranking`,
                                details: `Approve ranked pool allocation for Sprint ${r.sprintNumber}.`,
                                whatWillHappen: 'Allows CFO to distribute the ৳150,000 sprint pool across ranked squads.',
                                severity: 'standard',
                                isCritical: true,
                                onRun: async (mfaCode) => {
                                  await erpApi.approveFinanceSprintRanking(r.sprintNumber, mfaCode)
                                  onToast(`Approved Sprint ${r.sprintNumber} ranking`)
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
                            onClick={() =>
                              setRejectState({
                                kind: 'ranking',
                                idOrSprint: r.sprintNumber,
                                label: `Sprint ${r.sprintNumber} Ranking`,
                              })
                            }
                          >
                            Reject
                          </Button>
                        </>
                      )}
                    {!perms.isReadOnlyAuditor &&
                      perms.canPostMoney &&
                      r.status === 'APPROVED' &&
                      !r.poolPostedAt && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() =>
                            onRequestMfaConfirm({
                              title: `Post Sprint ${r.sprintNumber} Pool Credits`,
                              details: `Distribute ${formatBDT(config?.sprintPoolTotalBDT ?? 150000)} from Company Fund to all ranked squads.`,
                              whatWillHappen: 'Creates POOL_CREDIT requests & double-entry ledger rows in one atomic batch.',
                              severity: 'standard',
                              isCritical: true,
                              onRun: async (mfaCode) => {
                                await erpApi.postFinanceSprintPoolCredits(r.sprintNumber, mfaCode)
                                onToast(`Posted Sprint ${r.sprintNumber} pool credits`)
                                await Promise.all([onRefreshAll(), loadData()])
                              },
                            })
                          }
                        >
                          Post Pool Batch
                        </Button>
                      )}
                  </td>
                </tr>
              ))}
              {rankings.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-400">
                    No sprint rankings submitted yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Money & Transfer Queue */}
      <div className="space-y-2">
        <h4 className="font-bold text-slate-900 dark:text-white text-sm">
          Add Money, Pool Credits & Transfer Queue
        </h4>
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/40 text-slate-500 uppercase">
              <tr>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Sprint</th>
                <th className="py-2.5 px-3 text-right">Amount</th>
                <th className="py-2.5 px-3">Reason</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {requests.map((req) => (
                <tr key={req.id}>
                  <td className="py-2.5 px-3 font-semibold">{req.type}</td>
                  <td className="py-2.5 px-3">S{req.sprintNumber}</td>
                  <td className="py-2.5 px-3 text-right font-bold tabular-nums">
                    {formatBDT(req.amount)}
                  </td>
                  <td className="py-2.5 px-3">
                    <div>{req.reason}</div>
                    {req.rejectionReason && (
                      <div className="text-[11px] text-rose-500">Rejected: {req.rejectionReason}</div>
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 font-semibold">
                      {req.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right space-x-2">
                    {!perms.isReadOnlyAuditor &&
                      perms.canApproveMoney &&
                      req.status === 'SUBMITTED' &&
                      req.requesterId !== currentUserId && (
                        <>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() =>
                              onRequestMfaConfirm({
                                title: `Approve ${req.type} (${formatBDT(req.amount)})`,
                                details: req.reason,
                                whatWillHappen: 'Marks this money request CEO-approved so CFO can post it to the ledger.',
                                severity: 'standard',
                                isCritical: true,
                                onRun: async (mfaCode) => {
                                  await erpApi.approveFinanceMoneyRequest(req.id, mfaCode)
                                  onToast('Approved money request')
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
                            onClick={() =>
                              setRejectState({
                                kind: 'money_request',
                                idOrSprint: req.id,
                                label: `${req.type} (${formatBDT(req.amount)})`,
                              })
                            }
                          >
                            Reject
                          </Button>
                        </>
                      )}
                    {!perms.isReadOnlyAuditor && perms.canPostMoney && req.status === 'APPROVED' && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() =>
                          onRequestMfaConfirm({
                            title: `Post ${req.type} (${formatBDT(req.amount)})`,
                            details: req.reason,
                            whatWillHappen: `Posts ${formatBDT(req.amount)} to the immutable double-entry ledger.`,
                            severity: 'standard',
                            isCritical: req.amount >= 50000,
                            onRun: async (mfaCode) => {
                              await erpApi.postFinanceMoneyRequest(req.id, mfaCode)
                              onToast('Posted transaction to ledger')
                              await Promise.all([onRefreshAll(), loadData()])
                            },
                          })
                        }
                      >
                        Post to Ledger
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {requests.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    No money requests found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {rejectState && (
        <Modal
          isOpen={true}
          onClose={() => setRejectState(null)}
          title={`Reject ${rejectState.label}`}
        >
          <form onSubmit={handleSubmitReject} className="space-y-4">
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
              <Button variant="secondary" onClick={() => setRejectState(null)}>
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
