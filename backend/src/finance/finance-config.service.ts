import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Optional,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../common/prisma.service'
import { AuditLoggerService } from '../common/audit-logger.service'
import { AuthenticatedUser } from '../common/auth-user.interface'
import { DEFAULT_FINANCE_CONFIG_VALUES } from './finance-bootstrap.seed'
import { buildAuditActor, isActorCeo, resolveActorRoles } from './finance-actor.util'

export interface BonusTierRule {
  minScore: number
  maxScore: number
  amount: string
  label: string
}

export interface PenaltyRuleConfig {
  amount: string
  recipientRole: string | null
  recipientPct: string
  companyPct: string
  requiresCeoApproval?: boolean
  triggersRosterChange?: boolean
}

export interface UpdateFinanceConfigInput {
  payrollRateBDT?: number | string
  commissionRatePct?: number | string
  sprintPoolTotalBDT?: number | string
  squadOpeningSeedBDT?: number | string
  executivePayrollRoles?: string[]
  rankWeights?: number[]
  bonusTiers?: BonusTierRule[]
  penaltyTable?: Record<string, PenaltyRuleConfig>
}

@Injectable()
export class FinanceConfigService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly auditLogger?: AuditLoggerService,
  ) {}

  async getConfig(tx?: Prisma.TransactionClient) {
    const db = (tx ?? this.prisma) as PrismaService
    const existing = await db.financeConfig.findUnique({
      where: { id: 'singleton' },
    })
    if (existing) {
      return existing
    }

    return db.financeConfig.upsert({
      where: { id: 'singleton' },
      update: {},
      create: {
        id: 'singleton',
        payrollRateBDT: DEFAULT_FINANCE_CONFIG_VALUES.payrollRateBDT,
        commissionRatePct: DEFAULT_FINANCE_CONFIG_VALUES.commissionRatePct,
        sprintPoolTotalBDT: DEFAULT_FINANCE_CONFIG_VALUES.sprintPoolTotalBDT,
        squadOpeningSeedBDT: DEFAULT_FINANCE_CONFIG_VALUES.squadOpeningSeedBDT,
        executivePayrollRoles: DEFAULT_FINANCE_CONFIG_VALUES.executivePayrollRoles,
        rankWeights: DEFAULT_FINANCE_CONFIG_VALUES.rankWeights,
        bonusTiers: DEFAULT_FINANCE_CONFIG_VALUES.bonusTiers as unknown as Prisma.InputJsonValue,
        penaltyTable: DEFAULT_FINANCE_CONFIG_VALUES.penaltyTable as unknown as Prisma.InputJsonValue,
      },
    })
  }

  async updateConfig(dto: UpdateFinanceConfigInput, actor: AuthenticatedUser) {
    const roles = await resolveActorRoles(this.prisma, actor)
    if (!isActorCeo(actor, roles)) {
      throw new ForbiddenException('Only the CEO may update finance configuration parameters')
    }

    const updateData: Prisma.FinanceConfigUpdateInput = {
      updatedById: actor.id,
    }

    if (dto.payrollRateBDT !== undefined) {
      const rate = new Prisma.Decimal(dto.payrollRateBDT)
      if (!rate.isFinite() || rate.lessThanOrEqualTo(0)) {
        throw new BadRequestException('payrollRateBDT must be greater than 0')
      }
      updateData.payrollRateBDT = rate.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
    }

    if (dto.commissionRatePct !== undefined) {
      const pct = new Prisma.Decimal(dto.commissionRatePct)
      if (!pct.isFinite() || pct.lessThan(0) || pct.greaterThan(100)) {
        throw new BadRequestException('commissionRatePct must be between 0 and 100')
      }
      updateData.commissionRatePct = pct.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
    }

    if (dto.sprintPoolTotalBDT !== undefined) {
      const pool = new Prisma.Decimal(dto.sprintPoolTotalBDT)
      if (!pool.isFinite() || pool.lessThanOrEqualTo(0)) {
        throw new BadRequestException('sprintPoolTotalBDT must be greater than 0')
      }
      updateData.sprintPoolTotalBDT = pool.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
    }

    if (dto.squadOpeningSeedBDT !== undefined) {
      const seed = new Prisma.Decimal(dto.squadOpeningSeedBDT)
      if (!seed.isFinite() || seed.lessThan(0)) {
        throw new BadRequestException('squadOpeningSeedBDT must be non-negative')
      }
      updateData.squadOpeningSeedBDT = seed.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
    }

    if (dto.executivePayrollRoles !== undefined) {
      if (!Array.isArray(dto.executivePayrollRoles) || dto.executivePayrollRoles.length === 0) {
        throw new BadRequestException('executivePayrollRoles must be a non-empty array')
      }
      const normalized = Array.from(
        new Set(dto.executivePayrollRoles.map((r) => String(r).trim().toLowerCase()).filter(Boolean)),
      )
      if (normalized.length === 0 || normalized.includes('ceo')) {
        throw new BadRequestException(
          'executivePayrollRoles must be non-empty and cannot include ceo',
        )
      }
      updateData.executivePayrollRoles = normalized
    }

    if (dto.rankWeights !== undefined) {
      if (
        !Array.isArray(dto.rankWeights) ||
        dto.rankWeights.length !== 6 ||
        dto.rankWeights.some((w) => !Number.isInteger(w) || w <= 0)
      ) {
        throw new BadRequestException('rankWeights must contain exactly 6 positive integers')
      }
      updateData.rankWeights = dto.rankWeights
    }

    if (dto.bonusTiers !== undefined) {
      if (!Array.isArray(dto.bonusTiers) || dto.bonusTiers.length === 0) {
        throw new BadRequestException('bonusTiers must be a non-empty array')
      }
      const normalizedTiers = dto.bonusTiers.map((tier) => {
        const amt = new Prisma.Decimal(tier.amount)
        if (
          typeof tier.minScore !== 'number' ||
          typeof tier.maxScore !== 'number' ||
          tier.minScore < 0 ||
          tier.maxScore > 100 ||
          tier.minScore > tier.maxScore ||
          !amt.isFinite() ||
          amt.lessThan(0) ||
          !tier.label?.trim()
        ) {
          throw new BadRequestException(`Invalid bonus tier entry: ${JSON.stringify(tier)}`)
        }
        return {
          minScore: tier.minScore,
          maxScore: tier.maxScore,
          amount: amt.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2),
          label: tier.label.trim(),
        }
      })
      updateData.bonusTiers = normalizedTiers as unknown as Prisma.InputJsonValue
    }

    if (dto.penaltyTable !== undefined) {
      if (!dto.penaltyTable || typeof dto.penaltyTable !== 'object' || Array.isArray(dto.penaltyTable)) {
        throw new BadRequestException('penaltyTable must be an object keyed by PenaltyCategory')
      }
      const normalizedTable: Record<string, PenaltyRuleConfig> = {}
      for (const [category, rule] of Object.entries(dto.penaltyTable)) {
        const amt = new Prisma.Decimal(rule.amount)
        const recPct = new Prisma.Decimal(rule.recipientPct ?? 0)
        const compPct = new Prisma.Decimal(rule.companyPct ?? 1)
        if (
          !amt.isFinite() ||
          amt.lessThanOrEqualTo(0) ||
          recPct.lessThan(0) ||
          compPct.lessThan(0) ||
          !recPct.plus(compPct).equals(1)
        ) {
          throw new BadRequestException(`Invalid penalty rule for category ${category}`)
        }
        normalizedTable[category] = {
          amount: amt.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2),
          recipientRole: rule.recipientRole ? rule.recipientRole.toLowerCase().trim() : null,
          recipientPct: recPct.toFixed(2),
          companyPct: compPct.toFixed(2),
          requiresCeoApproval: Boolean(rule.requiresCeoApproval),
          triggersRosterChange: Boolean(rule.triggersRosterChange),
        }
      }
      updateData.penaltyTable = normalizedTable as unknown as Prisma.InputJsonValue
    }

    return this.prisma.$transaction(async (tx) => {
      const before = await this.getConfig(tx)
      const updated = await tx.financeConfig.update({
        where: { id: 'singleton' },
        data: updateData,
      })

      await this.auditLogger?.log(
        {
          ...buildAuditActor(actor, 'CEO'),
          action: 'FINANCE_CONFIG_UPDATED',
          actionCode: 'finance_config:manage',
          severity: 'CRITICAL',
          entityType: 'FinanceConfig',
          entityId: 'singleton',
          description: 'Updated CFO finance configuration parameters',
          category: 'FINANCE',
          beforeState: {
            payrollRateBDT: String(before.payrollRateBDT),
            commissionRatePct: String(before.commissionRatePct),
            sprintPoolTotalBDT: String(before.sprintPoolTotalBDT),
            executivePayrollRoles: before.executivePayrollRoles,
          },
          afterState: {
            payrollRateBDT: String(updated.payrollRateBDT),
            commissionRatePct: String(updated.commissionRatePct),
            sprintPoolTotalBDT: String(updated.sprintPoolTotalBDT),
            executivePayrollRoles: updated.executivePayrollRoles,
          },
          mfaVerified: true,
        },
        tx,
      )

      return updated
    })
  }
}
