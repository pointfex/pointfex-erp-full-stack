import { useState, useEffect, useCallback } from 'react'
import { Download, FileText, RotateCcw, Search, Wallet } from 'lucide-react'
import { erpApi } from '../../../api/client'
import {
  FinanceV2AccountStatement,
  FinanceV2LedgerTx,
  mapFinanceV2Account,
  mapFinanceV2LedgerTx,
} from '../../../api/adapter'
import { Button } from '../../../components/common/Button'
import { Modal } from '../../../components/common/Modal'
import { formatBDT } from '../../../utils/money'
import { FinanceV2SharedProps } from './financeV2Types'

const LEDGER_TX_TYPES = [
  'ADD_MONEY',
  'POOL_CREDIT',
  'TRANSFER',
  'EXECUTIVE_PAYROLL',
  'SQUAD_PAYROLL',
  'BONUS_AWARD',
  'PENALTY_SPLIT',
  'PENALTY_RESIDUAL',
  'CFO_COMMISSION',
  'REVERSAL',
]

export function AccountsStatementsTab({
  accounts,
  companyFund,
  squadAccounts,
  teams,
  perms,
  onRefreshAll,
  onToast,
  onRequestMfaConfirm,
}: FinanceV2SharedProps) {
  const [transactions, setTransactions] = useState<FinanceV2LedgerTx[]>([])
  const [sprintFilter, setSprintFilter] = useState<string>('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [teamFilter, setTeamFilter] = useState<string>('')
  const [searchFilter, setSearchFilter] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [selectedAccountId, setSelectedAccountId] = useState<string>('')
  const [statement, setStatement] = useState<FinanceV2AccountStatement | null>(null)
  const [statementLoading, setStatementLoading] = useState(false)

  const [reverseTarget, setReverseTarget] = useState<FinanceV2LedgerTx | null>(null)
  const [reverseReason, setReverseReason] = useState('')

  const buildFilterParams = useCallback(() => {
    const parsedSprint = Number(sprintFilter)
    return {
      sprintNumber: sprintFilter && Number.isInteger(parsedSprint) && parsedSprint > 0 ? parsedSprint : undefined,
      type: typeFilter || undefined,
      teamId: teamFilter || undefined,
      search: searchFilter.trim() || undefined,
    }
  }, [sprintFilter, typeFilter, teamFilter, searchFilter])

  const loadLedger = useCallback(async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const raw = await erpApi.getFinanceLedgerTransactions(buildFilterParams())
      setTransactions((raw || []).map(mapFinanceV2LedgerTx))
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to load double-entry ledger transactions')
    } finally {
      setLoading(false)
    }
  }, [buildFilterParams])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const raw = await erpApi.getFinanceLedgerTransactions(buildFilterParams())
        if (active) setTransactions((raw || []).map(mapFinanceV2LedgerTx))
      } catch (err: any) {
        if (active) setErrorMsg(err?.message || 'Failed to load double-entry ledger transactions')
      }
    })()
    return () => {
      active = false
    }
  }, [buildFilterParams])

  const handleViewStatement = async (accountId: string) => {
    setSelectedAccountId(accountId)
    setStatementLoading(true)
    try {
      const parsedSprint = Number(sprintFilter)
      const raw = await erpApi.getFinanceAccountStatement(accountId, {
        sprintNumber: sprintFilter && Number.isInteger(parsedSprint) && parsedSprint > 0 ? parsedSprint : undefined,
      })
      setStatement({
        account: mapFinanceV2Account(raw.account),
        openingBalance: Number(raw.openingBalance ?? 0),
        totalCredits: Number(raw.totalCredits ?? 0),
        totalDebits: Number(raw.totalDebits ?? 0),
        closingBalance: Number(raw.closingBalance ?? 0),
        currentAccountBalance: Number(raw.currentAccountBalance ?? 0),
        entries: (raw.entries || []).map(mapFinanceV2LedgerTx),
      })
    } catch (err: any) {
      onToast(err?.message || 'Failed to load account statement')
    } finally {
      setStatementLoading(false)
    }
  }

  const handleExportCsv = async () => {
    try {
      const { csv, filename } = await erpApi.exportFinanceLedgerCsv(buildFilterParams())
      if (typeof document !== 'undefined') {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = filename
        link.click()
        URL.revokeObjectURL(url)
      }
      onToast(`Exported ${filename}`)
    } catch (err: any) {
      onToast(err?.message || 'CSV export failed')
    }
  }

  const handleSubmitReverse = (e: React.FormEvent) => {
    e.preventDefault()
    if (!reverseTarget) return
    const trimmed = reverseReason.trim()
    if (trimmed.length < 10) {
      onToast('Reversal reason must be at least 10 characters for MFA verification')
      return
    }
    const target = reverseTarget
    setReverseTarget(null)
    setReverseReason('')
    onRequestMfaConfirm({
      title: `Reverse Ledger Entry ${target.referenceNo}`,
      details: `Create an append-only offsetting REVERSAL entry for ${formatBDT(target.netAmount)} (${target.type}).`,
      whatWillHappen: `Swaps source/destination balances by ${formatBDT(target.netAmount)} and preserves the original entry immutably.`,
      severity: 'danger',
      isCritical: true,
      onRun: async (mfaCode) => {
        await erpApi.reverseFinanceLedgerTransaction(target.id, trimmed, mfaCode)
        onToast(`Reversed ${target.referenceNo}`)
        await Promise.all([onRefreshAll(), loadLedger()])
        if (selectedAccountId) {
          await handleViewStatement(selectedAccountId)
        }
      },
    })
  }

  return (
    <div className="space-y-6">
      {/* Account Summary Strip */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {companyFund && (
          <div className="p-4 rounded-2xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-indigo-600 dark:text-indigo-400">
                {companyFund.name}
              </span>
              <Wallet className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="text-xl font-bold text-slate-900 dark:text-white mt-2">
              {formatBDT(companyFund.balance)}
            </div>
            <button
              onClick={() => handleViewStatement(companyFund.id)}
              className="mt-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
            >
              View Statement
            </button>
          </div>
        )}

        {squadAccounts.map((acc) => (
          <div
            key={acc.id}
            className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
                {acc.name}
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                {acc.teamCode || 'SQUAD'}
              </span>
            </div>
            <div className="text-xl font-bold text-slate-900 dark:text-white mt-2">
              {formatBDT(acc.balance)}
            </div>
            <button
              onClick={() => handleViewStatement(acc.id)}
              className="mt-2 text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
            >
              View Statement
            </button>
          </div>
        ))}

        {accounts.length === 0 && (
          <div className="col-span-full text-sm text-slate-400 py-6 text-center border border-dashed rounded-xl border-slate-200 dark:border-slate-800">
            No finance accounts visible for your role.
          </div>
        )}
      </div>

      {/* Selected Account Statement Drawer */}
      {selectedAccountId && (
        <div className="p-4 rounded-2xl border border-sky-200 dark:border-sky-900/50 bg-sky-50/30 dark:bg-sky-950/10 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-sky-600" />
              <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                Account Statement: {statement?.account.name || selectedAccountId}
              </h4>
            </div>
            <button
              onClick={() => {
                setSelectedAccountId('')
                setStatement(null)
              }}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
            >
              Close Statement
            </button>
          </div>

          {statementLoading ? (
            <div className="text-xs text-slate-500 py-4">Loading statement...</div>
          ) : statement ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div className="text-slate-500">Opening Balance</div>
                  <div className="font-bold text-slate-900 dark:text-white mt-0.5">
                    {formatBDT(statement.openingBalance)}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div className="text-slate-500">Total Credits</div>
                  <div className="font-bold text-emerald-600 mt-0.5">
                    +{formatBDT(statement.totalCredits)}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div className="text-slate-500">Total Debits</div>
                  <div className="font-bold text-rose-600 mt-0.5">
                    -{formatBDT(statement.totalDebits)}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div className="text-slate-500">Closing Balance</div>
                  <div className="font-bold text-slate-900 dark:text-white mt-0.5">
                    {formatBDT(statement.closingBalance)}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase">
                    <tr>
                      <th className="py-2 px-3">Ref</th>
                      <th className="py-2 px-3">Type</th>
                      <th className="py-2 px-3">Direction</th>
                      <th className="py-2 px-3 text-right">Amount</th>
                      <th className="py-2 px-3 text-right">Running</th>
                      <th className="py-2 px-3">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {statement.entries.map((entry) => (
                      <tr key={entry.id}>
                        <td className="py-2 px-3 font-mono">{entry.referenceNo}</td>
                        <td className="py-2 px-3">{entry.type}</td>
                        <td className="py-2 px-3">
                          <span
                            className={`font-semibold ${
                              entry.direction === 'CREDIT' ? 'text-emerald-600' : 'text-rose-600'
                            }`}
                          >
                            {entry.direction}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-semibold">
                          {formatBDT(entry.netAmount)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono">
                          {formatBDT(entry.runningBalance ?? 0)}
                        </td>
                        <td className="py-2 px-3 text-slate-600 dark:text-slate-300">
                          {entry.reason}
                        </td>
                      </tr>
                    ))}
                    {statement.entries.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-4 text-center text-slate-400">
                          No entries matched this statement period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* Ledger Filters & Export */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search ref or reason..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs"
            />
          </div>
          <input
            type="number"
            min={1}
            placeholder="Sprint #"
            value={sprintFilter}
            onChange={(e) => setSprintFilter(e.target.value)}
            className="w-24 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs"
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs"
          >
            <option value="">All Ledger Types</option>
            {LEDGER_TX_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs"
          >
            <option value="">All Squads</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          {perms.canExportCsv && (
            <Button variant="secondary" size="sm" icon={Download} onClick={handleExportCsv}>
              Export CSV
            </Button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 text-rose-600 text-xs">
          {errorMsg}
        </div>
      )}

      {/* Double-Entry Ledger Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-50 dark:bg-slate-800/40 text-slate-500 uppercase">
            <tr>
              <th className="py-3 px-3">Ref</th>
              <th className="py-3 px-3">Sprint</th>
              <th className="py-3 px-3">Type</th>
              <th className="py-3 px-3">From -&gt; To</th>
              <th className="py-3 px-3 text-right">Net Amount</th>
              <th className="py-3 px-3">Reason</th>
              <th className="py-3 px-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {transactions.map((tx) => (
              <tr key={tx.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/20">
                <td className="py-2.5 px-3 font-mono text-slate-700 dark:text-slate-200">
                  {tx.referenceNo}
                </td>
                <td className="py-2.5 px-3">S{tx.sprintNumber}</td>
                <td className="py-2.5 px-3">
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 font-semibold">
                    {tx.type}
                  </span>
                </td>
                <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                  {tx.sourceKind}:{tx.sourceRefId.slice(0, 12)} -&gt; {tx.destKind}:
                  {tx.destRefId.slice(0, 12)}
                </td>
                <td className="py-2.5 px-3 text-right font-bold tabular-nums text-slate-900 dark:text-white">
                  {formatBDT(tx.netAmount)}
                </td>
                <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                  {tx.reason}
                  {tx.reversedBy && (
                    <span className="ml-2 text-[10px] font-semibold text-amber-600">
                      (Reversed by {tx.reversedBy.referenceNo})
                    </span>
                  )}
                </td>
                <td className="py-2.5 px-3 text-right">
                  {!perms.isReadOnlyAuditor &&
                    perms.canPostMoney &&
                    tx.type !== 'REVERSAL' &&
                    !tx.reversedBy && (
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={RotateCcw}
                        onClick={() => {
                          setReverseTarget(tx)
                          setReverseReason('')
                        }}
                      >
                        Reverse
                      </Button>
                    )}
                </td>
              </tr>
            ))}
            {!loading && transactions.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400">
                  No double-entry ledger transactions match the active filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {reverseTarget && (
        <Modal
          isOpen={true}
          onClose={() => setReverseTarget(null)}
          title={`Reverse ${reverseTarget.referenceNo}`}
        >
          <form onSubmit={handleSubmitReverse} className="space-y-4">
            <div className="text-xs text-slate-600 dark:text-slate-300">
              Creates a permanent append-only REVERSAL entry offsetting{' '}
              <strong>{formatBDT(reverseTarget.netAmount)}</strong>.
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                Reversal Justification (min 10 chars)
              </label>
              <input
                type="text"
                minLength={10}
                required
                value={reverseReason}
                onChange={(e) => setReverseReason(e.target.value)}
                placeholder="Explain audit reason for this reversal"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setReverseTarget(null)}>
                Cancel
              </Button>
              <Button variant="danger" type="submit">
                Confirm Reversal
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
