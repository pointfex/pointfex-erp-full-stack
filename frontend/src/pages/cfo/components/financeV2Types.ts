import { FinanceV2Account, FinanceV2Config } from '../../../api/adapter'

export interface FinanceV2PermFlags {
  isCeo: boolean
  canReadAll: boolean
  canCreateRequest: boolean
  canApproveMoney: boolean
  canPostMoney: boolean
  canRunPayroll: boolean
  canConfirmPayroll: boolean
  canScoreBonus: boolean
  canApproveBonus: boolean
  canDisburseBonus: boolean
  canRecordPenalty: boolean
  canPostPenalty: boolean
  canRunCommission: boolean
  canRequestSprintLock: boolean
  canManageConfig: boolean
  canExportCsv: boolean
  canSubmitRanking: boolean
  isReadOnlyAuditor: boolean
}

export interface MfaConfirmRequest {
  title: string
  details: string
  whatWillHappen: string
  severity?: 'standard' | 'danger'
  isCritical?: boolean
  onRun: (mfaCode?: string) => Promise<void>
}

export interface FinanceV2SharedProps {
  accounts: FinanceV2Account[]
  companyFund: FinanceV2Account | null
  squadAccounts: FinanceV2Account[]
  config: FinanceV2Config | null
  teams: Array<{ id: string; name: string; code: string }>
  staffList: Array<{ id: string; name: string; role: string }>
  currentUserId: string
  currentUserRole: string
  perms: FinanceV2PermFlags
  onRefreshAll: () => Promise<void>
  onToast: (message: string) => void
  onRequestMfaConfirm: (opts: MfaConfirmRequest) => void
}
