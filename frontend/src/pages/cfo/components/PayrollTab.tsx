import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, CheckCircle2, Play, Users } from 'lucide-react'
import { erpApi } from '../../../api/client'
import { FinanceV2PayrollRun, mapFinanceV2PayrollRun } from '../../../api/adapter'
import { Button } from '../../../components/common/Button'
import { formatBDT } from '../../../utils/money'
import { FinanceV2SharedProps } from './financeV2Types'

export function PayrollTab({
  config,
  teams,
  perms,
  onRefreshAll,
  onToast,
  onRequestMfaConfirm,
}: FinanceV2SharedProps) {
  const [sprintNumber, setSprintNumber] = useState<number>(1)
  const [selectedTeamId, setSelectedTeamId] = useState<string>('')
  const [runs, setRuns] = useState<FinanceV2PayrollRun[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const loadRuns = useCallback(async () => {
    setErrorMsg(null)
    try {
      const raw = await erpApi.getFinancePayrollRuns()
      setRuns((raw || []).map(mapFinanceV2PayrollRun))
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to load payroll runs')
    }
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const raw = await erpApi.getFinancePayrollRuns()
        if (active) setRuns((raw || []).map(mapFinanceV2PayrollRun))
      } catch (err: any) {
        if (active) setErrorMsg(err?.message || 'Failed to load payroll runs')
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const effectiveTeamId = selectedTeamId || teams[0]?.id || ''
  const confirmedSprintRuns = runs.filter(
    (r) => r.sprintNumber === sprintNumber && r.kind === 'SQUAD' && r.status === 'CONFIRMED',
  )

  const handleGenerateDraft = async () => {
    if (!effectiveTeamId) return
    try {
      await erpApi.generateFinanceSquadPayroll(sprintNumber, effectiveTeamId)
      onToast(`Generated Sprint ${sprintNumber} squad payroll draft`)
      await loadRuns()
    } catch (err: any) {
      onToast(err?.message || 'Failed to generate squad payroll draft')
    }
  }

  const handleConfirmRun = async (runId: string) => {
    try {
      await erpApi.confirmFinanceSquadPayroll(runId)
      onToast('Squad payroll roster confirmed')
      await loadRuns()
    } catch (err: any) {
      onToast(err?.message || 'Failed to confirm squad payroll')
    }
  }

  return (
    <div className="space-y-6">
      {errorMsg && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 text-rose-600 text-xs">
          {errorMsg}
        </div>
      )}

      {/* Policy Summary */}
      <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs font-bold uppercase text-slate-700 dark:text-slate-200">
            Payroll Rate & Executive Policy
          </div>
          <div className="text-xs text-slate-500">
            Rate per person: <strong>{formatBDT(config?.payrollRateBDT ?? 2500)}</strong> |
            Executive slots ({(config?.executivePayrollRoles || ['cto', 'cpo', 'cfo', 'chro']).join(', ').toUpperCase()},{' '}
            CEO excluded) paid from Company Fund.
          </div>
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
        </div>
      </div>

      {/* Executive & Squad Action Controls */}
      {!perms.isReadOnlyAuditor && perms.canRunPayroll && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-500" />
              Run Executive Payroll (Sprint {sprintNumber})
            </div>
            <p className="text-xs text-slate-500">
              Pays all distinct active executives ({(config?.executivePayrollRoles || ['cto', 'cpo', 'cfo', 'chro']).join(', ').toUpperCase()}). Blocks if fewer than{' '}
              {config?.executivePayrollRoles?.length || 4} distinct people resolve.
            </p>
            <Button
              variant="primary"
              size="sm"
              icon={Play}
              onClick={() =>
                onRequestMfaConfirm({
                  title: `Execute Sprint ${sprintNumber} Executive Payroll`,
                  details: `Pay executive slots from Company Fund at ${formatBDT(config?.payrollRateBDT ?? 2500)} per executive.`,
                  whatWillHappen: 'Credits personal wallets and mirrors FinancialTransaction entries idempotently.',
                  severity: 'standard',
                  isCritical: true,
                  onRun: async (mfaCode) => {
                    await erpApi.runFinanceExecutivePayroll(sprintNumber, mfaCode)
                    onToast(`Sprint ${sprintNumber} executive payroll executed`)
                    await Promise.all([onRefreshAll(), loadRuns()])
                  },
                })
              }
            >
              Execute Executive Payroll
            </Button>
          </div>

          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="font-bold text-sm text-slate-900 dark:text-white">
              Generate Draft / Batch Execute Squad Payroll (Sprint {sprintNumber})
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={effectiveTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs"
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <Button variant="secondary" size="sm" onClick={handleGenerateDraft}>
                Generate Squad Draft
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={Play}
                disabled={confirmedSprintRuns.length === 0}
                onClick={() =>
                  onRequestMfaConfirm({
                    title: `Execute Confirmed Squad Payroll (Sprint ${sprintNumber})`,
                    details: `Batch execute ${confirmedSprintRuns.length} PM-confirmed squad payroll run(s).`,
                    whatWillHappen: 'Debits each Squad Account, credits squad developers & PM, and consumes SWAP_FIRE flags.',
                    severity: 'standard',
                    isCritical: true,
                    onRun: async (mfaCode) => {
                      await erpApi.executeFinanceSquadPayrollBatch(
                        { sprintNumber, runIds: confirmedSprintRuns.map((r) => r.id) },
                        mfaCode,
                      )
                      onToast(`Executed ${confirmedSprintRuns.length} squad payroll run(s)`)
                      await Promise.all([onRefreshAll(), loadRuns()])
                    },
                  })
                }
              >
                Batch Execute ({confirmedSprintRuns.length} Confirmed)
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Payroll Runs Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-50 dark:bg-slate-800/40 text-slate-500 uppercase">
            <tr>
              <th className="py-2.5 px-3">Scope Key</th>
              <th className="py-2.5 px-3">Kind</th>
              <th className="py-2.5 px-3">Headcount</th>
              <th className="py-2.5 px-3 text-right">Total Amount</th>
              <th className="py-2.5 px-3">Roster / Swap Alerts</th>
              <th className="py-2.5 px-3">Status</th>
              <th className="py-2.5 px-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {runs.map((run) => {
              const teamName =
                run.rosterSnapshot?.teamName ||
                teams.find((t) => t.id === run.teamId)?.name ||
                run.teamId ||
                'Executives'
              const swapCount = run.rosterSnapshot?.pendingRosterChanges?.length || 0
              return (
                <tr key={run.id}>
                  <td className="py-2.5 px-3 font-mono font-semibold">{run.scopeKey}</td>
                  <td className="py-2.5 px-3">{run.kind} ({teamName})</td>
                  <td className="py-2.5 px-3">{run.headcount}</td>
                  <td className="py-2.5 px-3 text-right font-bold tabular-nums">
                    {formatBDT(run.totalAmount)}
                  </td>
                  <td className="py-2.5 px-3">
                    {swapCount > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 font-semibold">
                        <AlertTriangle className="w-3 h-3" />
                        {swapCount} Roster Change Flag
                      </span>
                    ) : run.rosterChangeFlagConsumed ? (
                      <span className="text-[11px] text-emerald-600">Swap Flag Consumed</span>
                    ) : (
                      <span className="text-slate-400">Normal Roster</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 font-semibold">
                      {run.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    {!perms.isReadOnlyAuditor &&
                      perms.canConfirmPayroll &&
                      run.kind === 'SQUAD' &&
                      run.status === 'DRAFT' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={CheckCircle2}
                          onClick={() => handleConfirmRun(run.id)}
                        >
                          PM Confirm
                        </Button>
                      )}
                  </td>
                </tr>
              )
            })}
            {runs.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400">
                  No payroll runs generated yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
