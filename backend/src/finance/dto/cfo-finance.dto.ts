import { PenaltyCategory } from '@prisma/client'
import { Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator'

export class UpdateFinanceConfigDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  payrollRateBDT?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionRatePct?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  sprintPoolTotalBDT?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  squadOpeningSeedBDT?: number

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  executivePayrollRoles?: string[]

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  rankWeights?: number[]

  @IsOptional()
  @IsArray()
  bonusTiers?: Array<{
    minScore: number
    maxScore: number
    amount: string
    label: string
  }>

  @IsOptional()
  @IsObject()
  penaltyTable?: Record<
    string,
    {
      amount: string
      recipientRole: string | null
      recipientPct: string
      companyPct: string
      requiresCeoApproval?: boolean
      triggersRosterChange?: boolean
    }
  >
}

export class CreateAddMoneyRequestDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sprintNumber: number

  @IsNotEmpty()
  @IsString()
  destAccountId: string

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number

  @IsNotEmpty()
  @IsString()
  @MinLength(5)
  reason: string

  @IsOptional()
  @IsString()
  purpose?: string
}

export class CreateTransferRequestDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sprintNumber: number

  @IsNotEmpty()
  @IsString()
  sourceAccountId: string

  @IsIn(['FINANCE_ACCOUNT', 'PERSONAL_WALLET'])
  destKind: 'FINANCE_ACCOUNT' | 'PERSONAL_WALLET'

  @IsNotEmpty()
  @IsString()
  destRefId: string

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number

  @IsNotEmpty()
  @IsString()
  @MinLength(5)
  reason: string

  @IsOptional()
  @IsString()
  purpose?: string
}

export class RejectWithReasonDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(5)
  rejectionReason: string
}

export class ReverseLedgerTxDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(5)
  reason: string
}

export class RequestSprintLockDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(5)
  reason: string
}

export class SprintRankingEntryDto {
  @IsNotEmpty()
  @IsString()
  teamId: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  rank: number
}

export class SubmitSprintRankingDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sprintNumber: number

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SprintRankingEntryDto)
  entries: SprintRankingEntryDto[]
}

export class GenerateSquadPayrollDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sprintNumber: number

  @IsNotEmpty()
  @IsString()
  teamId: string
}

export class ExecuteSquadPayrollBatchDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sprintNumber: number

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  runIds?: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  teamIds?: string[]
}

export class BonusCriteriaScoresDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(25)
  delivery: number

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(20)
  quality: number

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(25)
  ownership: number

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(15)
  collaboration: number

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(15)
  reliability: number
}

export class ScoreBonusDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sprintNumber: number

  @IsNotEmpty()
  @IsString()
  teamId: string

  @IsNotEmpty()
  @IsString()
  employeeId: string

  @ValidateNested()
  @Type(() => BonusCriteriaScoresDto)
  criteriaScores: BonusCriteriaScoresDto

  @IsNotEmpty()
  @IsString()
  @MinLength(10)
  evidence: string
}

export class DisburseSprintBonusesDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sprintNumber: number

  @IsOptional()
  @IsString()
  teamId?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  awardIds?: string[]
}

export class RecordPenaltyDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sprintNumber: number

  @IsNotEmpty()
  @IsString()
  teamId: string

  @IsEnum(PenaltyCategory)
  category: PenaltyCategory

  @IsNotEmpty()
  @IsString()
  @MinLength(5)
  reason: string

  @IsOptional()
  @IsString()
  recipientEmployeeId?: string
}
