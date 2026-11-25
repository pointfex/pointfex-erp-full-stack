import { Module } from '@nestjs/common'
import { BonusService } from './bonus.service'
import { CfoFinanceController } from './cfo-finance.controller'
import { CommissionService } from './commission.service'
import { FinanceConfigService } from './finance-config.service'
import { FinanceController } from './finance.controller'
import { FinanceService } from './finance.service'
import { LedgerService } from './ledger.service'
import { MoneyRequestService } from './money-request.service'
import { PayrollService } from './payroll.service'
import { PenaltyService } from './penalty.service'

@Module({
  controllers: [FinanceController, CfoFinanceController],
  providers: [
    FinanceService,
    FinanceConfigService,
    LedgerService,
    MoneyRequestService,
    PayrollService,
    BonusService,
    PenaltyService,
    CommissionService,
  ],
  exports: [
    FinanceService,
    FinanceConfigService,
    LedgerService,
    MoneyRequestService,
    PayrollService,
    BonusService,
    PenaltyService,
    CommissionService,
  ],
})
export class FinanceModule {}
