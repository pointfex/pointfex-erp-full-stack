import { useState, useEffect, useCallback } from 'react'
import { CheckCircle2, Lock, Percent, Play, Settings } from 'lucide-react'
import { erpApi } from '../../../api/client'
import {
  FinanceV2CommissionRecord,
  FinanceV2SprintLock,
  mapFinanceV2CommissionRecord,
  mapFinanceV2SprintLock,
} from '../../../api/adapter'
import { Button } from '../../../components/common/Button'
import { formatBDT } from '../../../utils/money'
import { FinanceV2SharedProps } from './financeV2Types'

export function CommissionSprintTab({
  config,
  currentUserId,
  perms,
  onRefreshAll,
  onToast,
  onRequestMfaConfirm,
}: FinanceV2SharedProps) {
  const [sprintNumber, setSprintNumber] = useState<number>(1)
  const [lockReason, setLockReason] = useState<string>('')
  const [commissions, setCommissions] = useState<FinanceV2CommissionRecord[]>([])
  const [locks, setLocks] = useState<FinanceV2SprintLock[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // CEO Config editor overrides (null tracks live fetched config without stale state)
  const [payrollRateOverride, setPayrollRateOverride] = useState<string | null>(null)
  const [commissionPctOverride, setCommissionPctOverride] = useState<string | null>(null)
  const [poolTotalOverride, setPoolTotalOverride] = useState<string | null>(null)

  const payrollRateInput = payrollRateOverride ?? String(config?.payrollRateBDT ?? 2500)
  const commissionPctInput = commissionPctOverride ?? String(config?.commissionRatePct ?? 5)
  const poolTotalInput = poolTotalOverride ?? String(config?.sprintPoolTotalBDT ?? 150000)

  const loadData = useCallback(async () => {
    setErrorMsg(null)
    try {
      const [commRaw, lockRaw] = await Promise.all([
        erpApi.getFinanceCommissions().catch(() => []),
        erpApi.getFinanceSprintLocks().catch(() => []),
      ])
      setCommissions((commRaw || []).map(mapFinanceV2CommissionRecord))
      setLocks((lockRaw || []).map(mapFinanceV2SprintLock))
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to load commission and sprint lock data')
    }
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const [commRaw, lockRaw] = await Promise.all([
          erpApi.getFinanceCommissions().catch(() => []),
          erpApi.getFinanceSprintLocks().catch(() => []),
        ])
        if (active) {
          setCommissions((commRaw || []).map(mapFinanceV2CommissionRecord))
          setLocks((lockRaw || []).map(mapFinanceV2SprintLock))
        }
      } catch (err: any) {
        if (active) setErrorMsg(err?.message || 'Failed to load commission and sprint lock data')
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const poolBase = config?.sprintPoolTotalBDT ?? 150000
  const ratePct = config?.commissionRatePct ?? 5
  const computedCommission = Number(((poolBase * ratePct) / 100).toFixed(2))
  const alreadyPostedForSprint = commissions.some((c) => c.sprintNumber === sprintNumber)

  const handleRequestLock = async (e: React.FormEvent) => {
    e.preventDefault()
    if (lockReason.trim().length < 5) {
      onToast('Sprint lock reason (min 5 chars) is required')
      return
    }
    try {
      await erpApi.requestFinanceSprintLock(sprintNumber, lockReason.trim())
      onToast(`Requested financial lock for Sprint ${sprintNumber}`)
      setLockReason('')
      await loadData()
    } catch (err: any) {
      onToast(err?.message || 'Failed to request sprint lock')
    }
  }

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault()
    onRequestMfaConfirm({
      title: 'Update Treasury Configuration (CEO Only)',
      details: `Set payroll rate=${formatBDT(Number(payrollRateInput))}, commission=${commissionPctInput}%, sprint pool=${formatBDT(Number(poolTotalInput))}.`,
      whatWillHappen: 'Persists updated CFO rates into FinanceConfig with before/after hash-chained audit logs.',
      severity: 'danger',
      isCritical: true,
      onRun: async (mfaCode) => {
        await erpApi.updateFinanceConfig(
          {
            payrollRateBDT: Number(payrollRateInput),
            commissionRatePct: Number(commissionPctInput),
            sprintPoolTotalBDT: Number(poolTotalInput),
          },
          mfaCode,
        )
        onToast('Updated CFO FinanceConfig')
        await onRefreshAll()
      },
    })
  }

  return (
    <div className="space-y-6">
      {errorMsg && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 text-rose-600 text-xs">
          {errorMsg}
        </div>
      )}

      {/* CFO Commission Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <Percent className="w-4 h-4 text-sky-500" />
              CFO Commission ({ratePct}% of {formatBDT(poolBase)})
            </div>
            <span className="text-sm font-bold text-emerald-600">
              {formatBDT(computedCommission)}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Once-per-sprint commission read-only from CEO configuration; requires Sprint{' '}
            {sprintNumber} pool credits posted first.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              value={sprintNumber}
              onChange={(e) => setSprintNumber(Math.max(1, Number(e.target.value) || 1))}
              className="w-24 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-semibold"
            />
            {!perms.isReadOnlyAuditor && perms.canRunCommission && (
              <Button
                variant="primary"
                size="sm"
                icon={Play}
                disabled={alreadyPostedForSprint}
                onClick={() =>
                  onRequestMfaConfirm({
                    title: `Run Sprint ${sprintNumber} CFO Commission`,
                    details: `Transfer ${formatBDT(computedCommission)} (${ratePct}% of ${formatBDT(poolBase)}) from Company Fund to active CFO wallet.`,
                    whatWillHappen: 'Credits CFO personal wallet and locks commission for Sprint ' + sprintNumber + '.',
                    severity: 'standard',
                    isCritical: false,
                    onRun: async (mfaCode) => {
                      await erpApi.runFinanceCommission(sprintNumber, mfaCode)
                      onToast(`Posted Sprint ${sprintNumber} CFO commission`)
                      await Promise.all([onRefreshAll(), loadData()])
                    },
                  })
                }
              >
                {alreadyPostedForSprint ? 'Already Posted' : 'Run Commission'}
              </Button>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/40 text-slate-500 uppercase">
                <tr>
                  <th className="py-2 px-3">Sprint</th>
                  <th className="py-2 px-3">Rate</th>
                  <th className="py-2 px-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {commissions.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2 px-3 font-semibold">Sprint {c.sprintNumber}</td>
                    <td className="py-2 px-3">
                      {c.ratePct}% of {formatBDT(c.poolBaseAmount)}
                    </td>
                    <td className="py-2 px-3 text-right font-bold tabular-nums">
                      {formatBDT(c.amount)}
                    </td>
                  </tr>
                ))}
                {commissions.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-4 text-center text-slate-400">
                      No commissions posted yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sprint Financial Locks */}
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-500" />
            Sprint Financial Period Locks
          </div>
          {!perms.isReadOnlyAuditor && perms.canRequestSprintLock && (
            <form onSubmit={handleRequestLock} className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                required
                minLength={5}
                value={lockReason}
                onChange={(e) => setLockReason(e.target.value)}
                placeholder={`Close Sprint ${sprintNumber} reason...`}
                className="flex-1 min-w-[160px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs"
              />
              <Button variant="secondary" size="sm" type="submit">
                Request Lock S{sprintNumber}
              </Button>
            </form>
          )}

          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/40 text-slate-500 uppercase">
                <tr>
                  <th className="py-2 px-3">Sprint</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3">Reason</th>
                  <th className="py-2 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {locks.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2 px-3 font-semibold">Sprint {l.sprintNumber}</td>
                    <td className="py-2 px-3">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 font-semibold">
                        {l.status}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-600 dark:text-slate-300">
                      {l.reason || '-'}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {!perms.isReadOnlyAuditor &&
                        perms.isCeo &&
                        l.status === 'PENDING_APPROVAL' &&
                        l.requestedById !== currentUserId && (
                          <Button
                            variant="primary"
                            size="sm"
                            icon={CheckCircle2}
                            onClick={() =>
                              onRequestMfaConfirm({
                                title: `Lock Sprint ${l.sprintNumber}`,
                                details: `Seal Sprint ${l.sprintNumber} ledger (${l.reason || 'period close'}).`,
                                whatWillHappen: 'Blocks non-CEO postings on this sprint permanently.',
                                severity: 'danger',
                                isCritical: true,
                                onRun: async (mfaCode) => {
                                  await erpApi.approveFinanceSprintLock(l.sprintNumber, mfaCode)
                                  onToast(`Sprint ${l.sprintNumber} locked`)
                                  await loadData()
                                },
                              })
                            }
                          >
                            CEO Approve Lock
                          </Button>
                        )}
                    </td>
                  </tr>
                ))}
                {locks.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-slate-400">
                      All sprints are currently OPEN.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* FinanceConfig Viewer / CEO Editor */}
      <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
            <Settings className="w-4 h-4 text-slate-500" />
            Finance Rates & Configuration{' '}
            {!perms.canManageConfig && (
              <span className="text-[11px] font-normal text-slate-500">(Read-Only · CEO Editable Only)</span>
            )}
          </div>
        </div>

        {perms.canManageConfig && !perms.isReadOnlyAuditor ? (
          <form onSubmit={handleSaveConfig} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end text-xs">
            <label className="space-y-1">
              <span className="text-slate-500 font-semibold">Payroll Rate (BDT)</span>
              <input
                type="number"
                min={1}
                value={payrollRateInput}
                onChange={(e) => setPayrollRateOverride(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-500 font-semibold">CFO Commission (%)</span>
              <input
                type="number"
                step="0.01"
                min={0}
                max={100}
                value={commissionPctInput}
                onChange={(e) => setCommissionPctOverride(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-500 font-semibold">Sprint Pool Total (BDT)</span>
              <input
                type="number"
                min={1}
                value={poolTotalInput}
                onChange={(e) => setPoolTotalOverride(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950"
              />
            </label>
            <Button variant="primary" size="sm" type="submit">
              Save CEO Config
            </Button>
          </form>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="text-slate-500">Payroll Rate</div>
              <div className="font-bold mt-0.5">{formatBDT(config?.payrollRateBDT ?? 2500)}</div>
            </div>
            <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="text-slate-500">Commission Rate</div>
              <div className="font-bold mt-0.5">{config?.commissionRatePct ?? 5}%</div>
            </div>
            <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="text-slate-500">Monthly / Sprint Pool</div>
              <div className="font-bold mt-0.5">{formatBDT(config?.sprintPoolTotalBDT ?? 150000)}</div>
            </div>
            <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="text-slate-500">Rank Weights</div>
              <div className="font-bold mt-0.5">{(config?.rankWeights || [6, 5, 4, 3, 2, 1]).join(':')}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
