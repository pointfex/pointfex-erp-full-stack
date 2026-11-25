import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../common/prisma.service'
import { AuditLoggerService } from '../common/audit-logger.service'
import { AuthenticatedUser } from '../common/auth-user.interface'
import { buildAuditActor, findActiveEmployeesForRole } from './finance-actor.util'
import { FinanceConfigService } from './finance-config.service'
import { LedgerService } from './ledger.service'

@Injectable()
export class CommissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
    private readonly configService: FinanceConfigService,
    @Optional() private readonly auditLogger?: AuditLoggerService,
  ) {}

  async runCommission(sprintNumber: number, actor: AuthenticatedUser) {
    if (!Number.isInteger(sprintNumber) || sprintNumber < 1) {
      throw new BadRequestException('sprintNumber must be a positive integer')
    }

    return this.prisma.$transaction(async (tx) => {
      await this.ledgerService.assertSprintNotLocked(tx, sprintNumber, { actor })

      const existing = await tx.commissionRecord.findUnique({
        where: { sprintNumber },
      })
      if (existing) {
        throw new ConflictException(
          `CFO commission has already been posted for Sprint ${sprintNumber}`,
        )
      }

      const ranking = await tx.sprintRanking.findUnique({ where: { sprintNumber } })
      const postedPoolCount = await tx.moneyRequest.count({
        where: {
          type: 'POOL_CREDIT',
          sprintNumber,
          status: 'PAID',
        },
      })
      if (!ranking?.poolPostedAt && postedPoolCount === 0) {
        throw new BadRequestException(
          `Sprint ${sprintNumber} pool credits must be posted before running CFO commission`,
        )
      }

      // Rate and pool base always come from CEO-controlled FinanceConfig (CFO cannot override).
      const config = await this.configService.getConfig(tx)
      const poolBaseAmount = new Prisma.Decimal(config.sprintPoolTotalBDT).toDecimalPlaces(
        2,
        Prisma.Decimal.ROUND_HALF_UP,
      )
      const ratePct = new Prisma.Decimal(config.commissionRatePct).toDecimalPlaces(
        2,
        Prisma.Decimal.ROUND_HALF_UP,
      )
      const amount = poolBaseAmount
        .mul(ratePct)
        .div(100)
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)

      if (amount.lessThanOrEqualTo(0)) {
        throw new BadRequestException('Calculated CFO commission amount must be positive')
      }

      const cfoHolders = await findActiveEmployeesForRole(tx, 'cfo')
      const cfoEmployeeId = cfoHolders[0]?.employeeId
      if (!cfoEmployeeId) {
        throw new NotFoundException('No active CFO employee found to credit commission')
      }

      const companyFund = await tx.financeAccount.findFirst({
        where: { type: 'COMPANY_FUND' },
      })
      if (!companyFund) {
        throw new NotFoundException('COMPANY_FUND finance account not found')
      }
      if (new Prisma.Decimal(companyFund.balance).lessThan(amount)) {
        throw new BadRequestException(
          `Insufficient Company Fund balance for CFO commission (available Tk ${new Prisma.Decimal(companyFund.balance).toFixed(2)}, required Tk ${amount.toFixed(2)})`,
        )
      }

      const ledgerResult = await this.ledgerService.postTransaction(
        {
          idempotencyKey: `cfo_commission:${sprintNumber}`,
          sprintNumber,
          type: 'CFO_COMMISSION',
          sourceKind: 'FINANCE_ACCOUNT',
          sourceRefId: companyFund.id,
          destKind: 'PERSONAL_WALLET',
          destRefId: cfoEmployeeId,
          employeeId: cfoEmployeeId,
          grossAmount: amount,
          reason: `Sprint ${sprintNumber} CFO Commission (${ratePct.toFixed(2)}% of Tk ${poolBaseAmount.toFixed(2)})`,
          approvedById: actor.id,
          approvedAt: new Date(),
          metadata: {
            poolBaseAmount: poolBaseAmount.toFixed(2),
            ratePct: ratePct.toFixed(2),
          },
        },
        actor,
        tx,
      )

      const record = await tx.commissionRecord.create({
        data: {
          sprintNumber,
          poolBaseAmount,
          ratePct,
          amount,
          cfoEmployeeId,
          postedById: actor.id,
          ledgerTransactionId: ledgerResult.transaction.id,
        },
      })

      await this.auditLogger?.log(
        {
          ...buildAuditActor(actor),
          action: 'CFO_COMMISSION_POSTED',
          actionCode: 'commissions:run',
          severity: 'CRITICAL',
          entityType: 'CommissionRecord',
          entityId: record.id,
          description: `Posted Sprint ${sprintNumber} CFO Commission of Tk ${amount.toFixed(2)} (${ratePct.toFixed(2)}% of Tk ${poolBaseAmount.toFixed(2)})`,
          category: 'FINANCE',
          afterState: {
            sprintNumber,
            poolBaseAmount: poolBaseAmount.toFixed(2),
            ratePct: ratePct.toFixed(2),
            amount: amount.toFixed(2),
            cfoEmployeeId,
            ledgerTransactionId: ledgerResult.transaction.id,
          },
          mfaVerified: true,
        },
        tx,
      )

      return record
    })
  }

  async listCommissions() {
    return this.prisma.commissionRecord.findMany({
      orderBy: { sprintNumber: 'desc' },
    })
  }
}
