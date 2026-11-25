import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common'
import {
  BonusAwardStatus,
  LedgerTxType,
  MoneyRequestStatus,
  MoneyRequestType,
  PayrollRunKind,
  PayrollRunStatus,
  PenaltyCategory,
  PenaltyStatus,
} from '@prisma/client'
import type { Response } from 'express'
import { AuthenticatedUser } from '../common/auth-user.interface'
import { CurrentUser } from '../common/current-user.decorator'
import { PermissionsGuard } from '../common/permissions.guard'
import { RequireAnyPermission, RequirePermissions } from '../common/require-permissions.decorator'
import { RequiresFreshMfa } from '../common/requires-fresh-mfa.decorator'
import { BonusService } from './bonus.service'
import { CommissionService } from './commission.service'
import {
  CreateAddMoneyRequestDto,
  CreateTransferRequestDto,
  DisburseSprintBonusesDto,
  ExecuteSquadPayrollBatchDto,
  GenerateSquadPayrollDto,
  RecordPenaltyDto,
  RejectWithReasonDto,
  RequestSprintLockDto,
  ReverseLedgerTxDto,
  ScoreBonusDto,
  SubmitSprintRankingDto,
  UpdateFinanceConfigDto,
} from './dto/cfo-finance.dto'
import { FinanceConfigService } from './finance-config.service'
import { LedgerService } from './ledger.service'
import { MoneyRequestService } from './money-request.service'
import { PayrollService } from './payroll.service'
import { PenaltyService } from './penalty.service'

@Controller('finance/v2')
@UseGuards(PermissionsGuard)
export class CfoFinanceController {
  constructor(
    private readonly configService: FinanceConfigService,
    private readonly ledgerService: LedgerService,
    private readonly moneyRequestService: MoneyRequestService,
    private readonly payrollService: PayrollService,
    private readonly bonusService: BonusService,
    private readonly penaltyService: PenaltyService,
    private readonly commissionService: CommissionService,
  ) {}

  @Get('config')
  @RequireAnyPermission(
    'finance_ledger:read_all',
    'performance:evaluate',
    'penalties:record',
    'payroll:confirm',
    'bonus_awards:score',
    'wallets:read_own',
  )
  getConfig() {
    return this.configService.getConfig()
  }

  @Patch('config')
  @RequirePermissions('finance_config:manage')
  @RequiresFreshMfa('treasury:transfer')
  updateConfig(
    @Body() dto: UpdateFinanceConfigDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.configService.updateConfig(dto, actor)
  }

  @Get('accounts')
  @RequireAnyPermission(
    'finance_ledger:read_all',
    'payroll:confirm',
    'bonus_awards:score',
    'penalties:record',
    'performance:evaluate',
    'wallets:read_own',
  )
  getAccounts(@CurrentUser() actor: AuthenticatedUser) {
    return this.ledgerService.getAccounts(actor)
  }

  @Get('accounts/:id/statement')
  @RequireAnyPermission('finance_ledger:read_all', 'payroll:confirm')
  getAccountStatement(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('sprintNumber') sprintNumber?: string,
  ) {
    return this.ledgerService.getAccountStatement(
      id,
      {
        fromDate: fromDate ? new Date(fromDate) : undefined,
        toDate: toDate ? new Date(toDate) : undefined,
        sprintNumber: sprintNumber ? Number(sprintNumber) : undefined,
      },
      actor,
    )
  }

  @Get('transactions')
  @RequireAnyPermission(
    'finance_ledger:read_all',
    'payroll:confirm',
    'wallets:read_own',
    'transactions:read_own',
  )
  getTransactions(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('sprintNumber') sprintNumber?: string,
    @Query('type') type?: LedgerTxType,
    @Query('teamId') teamId?: string,
    @Query('employeeId') employeeId?: string,
    @Query('accountId') accountId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.ledgerService.getTransactions(
      {
        sprintNumber: sprintNumber ? Number(sprintNumber) : undefined,
        type,
        teamId,
        employeeId,
        accountId,
        fromDate: fromDate ? new Date(fromDate) : undefined,
        toDate: toDate ? new Date(toDate) : undefined,
        search,
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
      },
      actor,
    )
  }

  @Get('transactions/export.csv')
  @RequirePermissions('finance_reports:export')
  async exportTransactionsCsv(
    @CurrentUser() actor: AuthenticatedUser,
    @Res() res: Response,
    @Query('sprintNumber') sprintNumber?: string,
    @Query('type') type?: LedgerTxType,
    @Query('teamId') teamId?: string,
    @Query('employeeId') employeeId?: string,
    @Query('accountId') accountId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('search') search?: string,
  ) {
    const exported = await this.ledgerService.exportTransactionsCsv(
      {
        sprintNumber: sprintNumber ? Number(sprintNumber) : undefined,
        type,
        teamId,
        employeeId,
        accountId,
        fromDate: fromDate ? new Date(fromDate) : undefined,
        toDate: toDate ? new Date(toDate) : undefined,
        search,
      },
      actor,
    )
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`)
    return res.send(exported.csv)
  }

  @Post('transactions/:id/reverse')
  @RequirePermissions('money_requests:post')
  @RequiresFreshMfa('treasury:transfer')
  reverseTransaction(
    @Param('id') id: string,
    @Body() dto: ReverseLedgerTxDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.ledgerService.reverseTransaction(id, dto.reason, actor)
  }

  @Get('sprint-locks')
  @RequireAnyPermission(
    'finance_ledger:read_all',
    'sprints:lock',
    'money_requests:approve',
  )
  listSprintLocks() {
    return this.ledgerService.listSprintLocks()
  }

  @Post('sprint-locks/:id/request')
  @RequirePermissions('sprints:lock')
  requestSprintLock(
    @Param('id', ParseIntPipe) sprintNumber: number,
    @Body() dto: RequestSprintLockDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.ledgerService.requestSprintLock(sprintNumber, dto.reason, actor)
  }

  @Post('sprint-locks/:id/approve')
  @RequirePermissions('money_requests:approve')
  @RequiresFreshMfa('treasury:transfer')
  approveSprintLock(
    @Param('id', ParseIntPipe) sprintNumber: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.ledgerService.approveSprintLock(sprintNumber, actor)
  }

  @Get('money-requests')
  @RequireAnyPermission(
    'finance_ledger:read_all',
    'performance:evaluate',
    'money_requests:create',
    'money_requests:approve',
    'money_requests:post',
  )
  listMoneyRequests(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('type') type?: MoneyRequestType,
    @Query('status') status?: MoneyRequestStatus,
    @Query('sprintNumber') sprintNumber?: string,
    @Query('teamId') teamId?: string,
  ) {
    return this.moneyRequestService.listMoneyRequests(
      {
        type,
        status,
        sprintNumber: sprintNumber ? Number(sprintNumber) : undefined,
        teamId,
      },
      actor,
    )
  }

  @Post('money-requests/add-money')
  @RequirePermissions('money_requests:create')
  createAddMoneyRequest(
    @Body() dto: CreateAddMoneyRequestDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.moneyRequestService.createAddMoneyRequest(dto, actor)
  }

  @Post('money-requests/transfer')
  @RequirePermissions('money_requests:create')
  createTransferRequest(
    @Body() dto: CreateTransferRequestDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.moneyRequestService.createTransferRequest(dto, actor)
  }

  @Post('money-requests/:id/approve')
  @RequirePermissions('money_requests:approve')
  @RequiresFreshMfa('treasury:transfer')
  approveMoneyRequest(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.moneyRequestService.approveMoneyRequest(id, actor)
  }

  @Post('money-requests/:id/reject')
  @RequirePermissions('money_requests:approve')
  rejectMoneyRequest(
    @Param('id') id: string,
    @Body() dto: RejectWithReasonDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.moneyRequestService.rejectMoneyRequest(id, dto.rejectionReason, actor)
  }

  @Post('money-requests/:id/post')
  @RequirePermissions('money_requests:post')
  @RequiresFreshMfa('treasury:transfer')
  postMoneyRequest(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.moneyRequestService.postMoneyRequest(id, actor)
  }

  @Get('sprint-rankings')
  @RequireAnyPermission(
    'finance_ledger:read_all',
    'performance:evaluate',
    'money_requests:approve',
    'money_requests:post',
  )
  listSprintRankings(@Query('sprintNumber') sprintNumber?: string) {
    return this.moneyRequestService.listSprintRankings(
      sprintNumber ? Number(sprintNumber) : undefined,
    )
  }

  @Post('sprint-rankings')
  @RequireAnyPermission('performance:evaluate', 'money_requests:approve')
  submitSprintRanking(
    @Body() dto: SubmitSprintRankingDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.moneyRequestService.submitSprintRanking(dto, actor)
  }

  @Post('sprint-rankings/:id/approve')
  @RequirePermissions('money_requests:approve')
  @RequiresFreshMfa('treasury:transfer')
  approveSprintRanking(
    @Param('id', ParseIntPipe) sprintNumber: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.moneyRequestService.approveSprintRanking(sprintNumber, actor)
  }

  @Post('sprint-rankings/:id/reject')
  @RequirePermissions('money_requests:approve')
  rejectSprintRanking(
    @Param('id', ParseIntPipe) sprintNumber: number,
    @Body() dto: RejectWithReasonDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.moneyRequestService.rejectSprintRanking(
      sprintNumber,
      dto.rejectionReason,
      actor,
    )
  }

  @Post('sprint-rankings/:id/post-pool')
  @RequirePermissions('money_requests:post')
  @RequiresFreshMfa('treasury:transfer')
  postSprintPoolCredits(
    @Param('id', ParseIntPipe) sprintNumber: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.moneyRequestService.postSprintPoolCredits(sprintNumber, actor)
  }

  @Get('payroll')
  @RequireAnyPermission('finance_ledger:read_all', 'payroll:run', 'payroll:confirm')
  listPayrollRuns(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('sprintNumber') sprintNumber?: string,
    @Query('kind') kind?: PayrollRunKind,
    @Query('teamId') teamId?: string,
    @Query('status') status?: PayrollRunStatus,
  ) {
    return this.payrollService.listPayrollRuns(
      {
        sprintNumber: sprintNumber ? Number(sprintNumber) : undefined,
        kind,
        teamId,
        status,
      },
      actor,
    )
  }

  @Post('payroll/executive/:id/run')
  @RequirePermissions('payroll:run')
  @RequiresFreshMfa('treasury:transfer')
  runExecutivePayroll(
    @Param('id', ParseIntPipe) sprintNumber: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.payrollService.runExecutivePayroll(sprintNumber, actor)
  }

  @Post('payroll/squad/generate')
  @RequirePermissions('payroll:run')
  generateSquadPayroll(
    @Body() dto: GenerateSquadPayrollDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.payrollService.generateSquadPayroll(dto.sprintNumber, dto.teamId, actor)
  }

  @Post('payroll/squad/:id/confirm')
  @RequirePermissions('payroll:confirm')
  confirmSquadPayroll(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.payrollService.confirmSquadPayroll(id, actor)
  }

  @Post('payroll/squad/execute-batch')
  @RequirePermissions('payroll:run')
  @RequiresFreshMfa('treasury:transfer')
  executeSquadPayrollBatch(
    @Body() dto: ExecuteSquadPayrollBatchDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.payrollService.executeSquadPayrollBatch(dto, actor)
  }

  @Get('bonuses')
  @RequireAnyPermission(
    'finance_ledger:read_all',
    'bonus_awards:score',
    'bonus_awards:approve',
    'bonus_awards:disburse',
    'wallets:read_own',
  )
  listBonuses(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('sprintNumber') sprintNumber?: string,
    @Query('teamId') teamId?: string,
    @Query('status') status?: BonusAwardStatus,
  ) {
    return this.bonusService.listBonuses(
      {
        sprintNumber: sprintNumber ? Number(sprintNumber) : undefined,
        teamId,
        status,
      },
      actor,
    )
  }

  @Post('bonuses/score')
  @RequirePermissions('bonus_awards:score')
  scoreBonus(
    @Body() dto: ScoreBonusDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.bonusService.scoreBonus(dto, actor)
  }

  @Post('bonuses/:id/approve')
  @RequirePermissions('bonus_awards:approve')
  @RequiresFreshMfa('treasury:transfer')
  approveBonus(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.bonusService.approveBonus(id, actor)
  }

  @Post('bonuses/:id/reject')
  @RequirePermissions('bonus_awards:approve')
  rejectBonus(
    @Param('id') id: string,
    @Body() dto: RejectWithReasonDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.bonusService.rejectBonus(id, dto.rejectionReason, actor)
  }

  @Post('bonuses/:id/disburse')
  @RequirePermissions('bonus_awards:disburse')
  @RequiresFreshMfa('treasury:transfer')
  disburseBonus(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.bonusService.disburseBonus(id, actor)
  }

  @Post('bonuses/disburse-batch')
  @RequirePermissions('bonus_awards:disburse')
  @RequiresFreshMfa('treasury:transfer')
  disburseSprintBonuses(
    @Body() dto: DisburseSprintBonusesDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.bonusService.disburseSprintBonuses(dto, actor)
  }

  @Get('penalties')
  @RequireAnyPermission(
    'finance_ledger:read_all',
    'penalties:record',
    'penalties:post',
    'payroll:confirm',
  )
  listPenalties(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('sprintNumber') sprintNumber?: string,
    @Query('teamId') teamId?: string,
    @Query('category') category?: PenaltyCategory,
    @Query('status') status?: PenaltyStatus,
  ) {
    return this.penaltyService.listPenalties(
      {
        sprintNumber: sprintNumber ? Number(sprintNumber) : undefined,
        teamId,
        category,
        status,
      },
      actor,
    )
  }

  @Get('penalties/roster-flags')
  @RequireAnyPermission('finance_ledger:read_all', 'payroll:run', 'payroll:confirm')
  getPendingRosterChangeFlags(@Query('teamId') teamId?: string) {
    return this.penaltyService.getPendingRosterChangeFlags(teamId)
  }

  @Post('penalties')
  @RequirePermissions('penalties:record')
  recordPenalty(
    @Body() dto: RecordPenaltyDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.penaltyService.recordPenalty(dto, actor)
  }

  @Post('penalties/:id/approve')
  @RequirePermissions('money_requests:approve')
  @RequiresFreshMfa('treasury:transfer')
  approvePenalty(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.penaltyService.approvePenalty(id, actor)
  }

  @Post('penalties/:id/reject')
  @RequirePermissions('money_requests:approve')
  rejectPenalty(
    @Param('id') id: string,
    @Body() dto: RejectWithReasonDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.penaltyService.rejectPenalty(id, dto.rejectionReason, actor)
  }

  @Post('penalties/:id/post')
  @RequirePermissions('penalties:post')
  @RequiresFreshMfa('treasury:transfer')
  postPenalty(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.penaltyService.postPenalty(id, actor)
  }

  @Get('commissions')
  @RequireAnyPermission('finance_ledger:read_all', 'commissions:run')
  listCommissions() {
    return this.commissionService.listCommissions()
  }

  @Post('commissions/:id/run')
  @RequirePermissions('commissions:run')
  @RequiresFreshMfa('treasury:transfer')
  runCommission(
    @Param('id', ParseIntPipe) sprintNumber: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.commissionService.runCommission(sprintNumber, actor)
  }
}
