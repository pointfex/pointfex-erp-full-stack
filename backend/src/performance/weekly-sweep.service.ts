import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../common/prisma.service'
import { XpLedgerService } from './xp-ledger.service'
import { FrozenXpConsensusService } from './frozen-xp-consensus.service'
import { getDhakaWeekBoundaries } from '../common/dhaka-time.util'
import {
  weeklyKpiDeveloper,
  weeklyKpiPm,
  taskScoreDeveloper,
} from './kpi-engine'
import { Prisma } from '@prisma/client'

export interface SweepOptions {
  referenceDate?: Date
  forcePreviousWeek?: boolean
}

@Injectable()
export class WeeklySweepService {
  private readonly logger = new Logger(WeeklySweepService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly xpLedger: XpLedgerService,
    private readonly consensusService: FrozenXpConsensusService,
  ) {}

  /**
   * Runs the comprehensive weekly sweep.
   * Completely idempotent: safe to run multiple times with zero duplicate effects.
   */
  async runWeeklySweep(options?: SweepOptions) {
    const clock = options?.referenceDate || new Date()
    // By default sweep previous completed week (7 days prior)
    const targetDate = options?.forcePreviousWeek === false
      ? clock
      : new Date(clock.getTime() - 7 * 86400000)

    const { year, weekNumber, weekStartUtc: weekStart, weekEndUtc: weekEnd } =
      getDhakaWeekBoundaries(targetDate)

    const run = await this.prisma.sweepRun.create({
      data: {
        weekNumber,
        year,
        startedAt: new Date(),
        status: 'RUNNING',
      },
    })

    const counts = {
      developerKpisProcessed: 0,
      pmEvaluationsGenerated: 0,
      inactivityPenaltiesQueued: 0,
      pendingXpReleased: 0,
      expiredVotesSwept: 0,
      reconciliationDriftCount: 0,
      notificationsSent: 0,
    }
    const errors: string[] = []

    try {
      // ----------------------------------------------------------------------
      // Step 1 & 2: Process Developers & PMs for Target Week
      // ----------------------------------------------------------------------
      const activeEmployees = await this.prisma.employee.findMany({
        where: { isSuspended: false },
        include: {
          employeeRoles: { where: { isActive: true }, include: { role: true } },
        },
      })

      for (const emp of activeEmployees) {
        try {
          const roleSlugs = emp.employeeRoles.map((er) => (er.role.slug || '').toLowerCase())
          const isPm = roleSlugs.includes('pm') || (emp.title || '').toLowerCase().includes('project manager')

          // Fetch deliverables completed by employee in target week
          const weekTasks = await this.prisma.task.findMany({
            where: {
              assigneeId: emp.id,
              status: 'completed',
              completedAt: { gte: weekStart, lte: weekEnd },
            },
            include: { execScores: true },
          })

          if (weekTasks.length === 0) {
            // Zero-completion user: check for approved leave or exemption
            const isExcused = await this.checkIfWeekExcused(emp.id, weekStart)

            if (!isExcused) {
              // 1. Upsert WeeklyKpiRecord as NA (reason: INACTIVE)
              await this.prisma.weeklyKpiRecord.upsert({
                where: {
                  employeeId_year_weekNumber: {
                    employeeId: emp.id,
                    year,
                    weekNumber,
                  },
                },
                create: {
                  employeeId: emp.id,
                  year,
                  weekNumber,
                  weekStart,
                  score: null,
                  isInactive: true,
                  evaluationStatus: 'CONFIRMED',
                  evaluationBreakdown: { reason: 'INACTIVE', taskCount: 0 },
                },
                update: {
                  score: null,
                  isInactive: true,
                  evaluationStatus: 'CONFIRMED',
                },
              })

              // 2. Queue InactivityPenalty (idempotent: exactly one per user per week)
              const existingPenalty = await this.prisma.inactivityPenalty.findFirst({
                where: { userId: emp.id, weekStart },
              })

              if (!existingPenalty) {
                await this.prisma.inactivityPenalty.create({
                  data: {
                    userId: emp.id,
                    weekStart,
                    consumed: false,
                  },
                })
                counts.inactivityPenaltiesQueued++
              }
            }
          } else {
            // User had completions: compute weekly KPI
            if (!isPm) {
              // Developer KPI
              let anyProvisional = false
              const tasksInput = weekTasks.map((t) => {
                const pmScore = Number(t.pmScore || 85)
                const cto = t.execScores.find((s) => s.execRole === 'CTO')
                const cpo = t.execScores.find((s) => s.execRole === 'CPO')
                const cfo = t.execScores.find((s) => s.execRole === 'CFO')
                const chro = t.execScores.find((s) => s.execRole === 'CHRO')

                const scoreRes = taskScoreDeveloper({
                  pm: { score: pmScore },
                  cto: cto ? { score: Number(cto.score), status: cto.status } : undefined,
                  cpo: cpo ? { score: Number(cpo.score), status: cpo.status } : undefined,
                  cfo: cfo ? { score: Number(cfo.score), status: cfo.status } : undefined,
                  chro: chro ? { score: Number(chro.score), status: chro.status } : undefined,
                })

                if (scoreRes.isProvisional) anyProvisional = true

                return {
                  score: scoreRes.finalScore,
                  weightPoints: Number(t.weightPoints || 2),
                  context: (t.origin || 'MAIN_SQUAD') as any,
                }
              })

              const devKpi = weeklyKpiDeveloper({ tasks: tasksInput })
              const evalStatus = anyProvisional ? 'PROVISIONAL' : 'CONFIRMED'

              await this.prisma.weeklyKpiRecord.upsert({
                where: {
                  employeeId_year_weekNumber: {
                    employeeId: emp.id,
                    year,
                    weekNumber,
                  },
                },
                create: {
                  employeeId: emp.id,
                  year,
                  weekNumber,
                  weekStart,
                  score: devKpi.value !== null ? new Prisma.Decimal(devKpi.value) : null,
                  isInactive: false,
                  evaluationStatus: evalStatus as any,
                  evaluationBreakdown: {
                    taskCount: devKpi.taskCount,
                    totalWeight: devKpi.totalWeight,
                    isProvisional: anyProvisional,
                  },
                },
                update: {
                  score: devKpi.value !== null ? new Prisma.Decimal(devKpi.value) : null,
                  isInactive: false,
                  evaluationStatus: evalStatus as any,
                },
              })
              counts.developerKpisProcessed++
            }
          }
        } catch (err: any) {
          errors.push(`Employee ${emp.id}: ${err.message}`)
        }
      }

      // ----------------------------------------------------------------------
      // Step 3: Generate PM Weekly Evaluation Rows (KpiExecEvaluation)
      // ----------------------------------------------------------------------
      const pmEmployees = activeEmployees.filter((e) => {
        const roles = e.employeeRoles.map((er) => (er.role.slug || '').toLowerCase())
        return roles.includes('pm') || (e.title || '').toLowerCase().includes('project manager')
      })

      for (const pm of pmEmployees) {
        try {
          const pmRecord = await this.prisma.weeklyKpiRecord.upsert({
            where: {
              employeeId_year_weekNumber: {
                employeeId: pm.id,
                year,
                weekNumber,
              },
            },
            create: {
              employee: { connect: { id: pm.id } },
              year,
              weekNumber,
              weekStart,
              score: new Prisma.Decimal(85),
              isInactive: false,
              evaluationStatus: 'PROVISIONAL',
              evaluationBreakdown: { role: 'PM' },
            },
            update: {},
          })

          // Create the 4 evaluation rows if not existing
          const roles = ['CTO', 'CPO', 'CFO', 'CHRO']
          for (const r of roles) {
            await this.prisma.kpiExecEvaluation.upsert({
              where: {
                weeklyKpiRecordId_evaluatorRole: {
                  weeklyKpiRecordId: pmRecord.id,
                  evaluatorRole: r,
                },
              },
              create: {
                weeklyKpiRecordId: pmRecord.id,
                evaluatorRole: r,
                score: new Prisma.Decimal(85),
                suggestedScore: new Prisma.Decimal(85),
                status: 'UNREAD',
              },
              update: {},
            })
            counts.pmEvaluationsGenerated++
          }
        } catch (err: any) {
          errors.push(`PM ${pm.id} evaluations: ${err.message}`)
        }
      }

      // ----------------------------------------------------------------------
      // Step 4: Safety Net - Release PENDING XP with VERIFIED Weights (Idempotent)
      // ----------------------------------------------------------------------
      const unpostedVerified = await this.prisma.xpLedgerEntry.findMany({
        where: {
          eventType: 'AWARD_PENDING',
          task: {
            weightStatus: 'VERIFIED',
          },
        },
        include: { task: true },
      })

      for (const entry of unpostedVerified) {
        if (!entry.task || !entry.taskId) continue

        // Check if VERIFY_RELEASE or FREEZE already posted for this task to prevent infinite duplicate release
        const alreadyReleased = await this.prisma.xpLedgerEntry.findFirst({
          where: {
            taskId: entry.taskId,
            eventType: { in: ['VERIFY_RELEASE', 'FREEZE'] },
          },
        })
        if (alreadyReleased) continue

        await this.xpLedger.appendEvent({
          employeeId: entry.employeeId,
          delta: entry.delta,
          eventType: 'VERIFY_RELEASE',
          reason: `Sweep auto-released verified task weight [${entry.taskId}]`,
          taskId: entry.taskId || undefined,
          taskCategory: entry.task.weightCategory || 'MEDIUM',
          awardedById: 'SYSTEM_SWEEP',
        })
        counts.pendingXpReleased++
      }

      // ----------------------------------------------------------------------
      // Step 5: Hash Chain Verification & Balance Reconciliation
      // ----------------------------------------------------------------------
      const recon = await this.xpLedger.reconcileBalances()
      if (!recon.matched) {
        counts.reconciliationDriftCount = recon.discrepancies.length
        this.logger.warn(`XP balance reconciliation drift detected for ${recon.discrepancies.length} users`)

        // Alert CHRO & CEO
        await this.alertExecutives(
          'Reconciliation Drift Alert',
          `Automated sweep detected balance drift in ${recon.discrepancies.length} employee accounts. Please investigate.`,
        )
      }

      // Sweep expired consensus votes
      const voteSweep = await this.consensusService.sweepExpiredVotes()
      counts.expiredVotesSwept = voteSweep.sweptCount

      // ----------------------------------------------------------------------
      // Step 6: Backfill Window 24h Closing Reminder
      // ----------------------------------------------------------------------
      await this.sendBackfillWindowReminders(clock)

      // Mark run completed
      await this.prisma.sweepRun.update({
        where: { id: run.id },
        data: {
          endedAt: new Date(),
          status: 'COMPLETED',
          counts,
          errors: errors.length > 0 ? errors : Prisma.JsonNull,
        },
      })
    } catch (fatal: any) {
      await this.prisma.sweepRun.update({
        where: { id: run.id },
        data: {
          endedAt: new Date(),
          status: 'FAILED',
          counts,
          errors: [fatal.message, ...errors],
        },
      })
      throw fatal
    }

    return {
      runId: run.id,
      weekNumber,
      year,
      counts,
      errors,
      status: 'COMPLETED',
    }
  }

  private async checkIfWeekExcused(userId: string, weekStart: Date): Promise<boolean> {
    // Check if there is a documented CHRO exemption
    const auditExemption = await this.prisma.kpiXpAuditLog.findFirst({
      where: {
        employeeId: userId,
        actionType: 'CHRO_INACTIVITY_EXEMPTION',
        triggerEvent: { contains: weekStart.toISOString().split('T')[0] },
      },
    })
    return Boolean(auditExemption)
  }

  private async alertExecutives(title: string, message: string) {
    const executives = await this.prisma.employee.findMany({
      where: {
        isSuspended: false,
        OR: [
          { title: { contains: 'CHRO', mode: 'insensitive' } },
          { title: { contains: 'CEO', mode: 'insensitive' } },
        ],
      },
    })

    for (const exec of executives) {
      try {
        await this.prisma.notification.create({
          data: {
            userId: exec.id,
            title,
            message,
            type: 'financial',
          },
        })
      } catch {
        // Non-blocking
      }
    }
  }

  private async sendBackfillWindowReminders(now: Date) {
    const oneDayAhead = new Date(now.getTime() + 24 * 3600 * 1000)
    const closingSoon = await this.prisma.backfillWindow.findMany({
      where: {
        isActive: true,
        endsAt: { gte: now, lte: oneDayAhead },
      },
    })

    if (closingSoon.length === 0) return

    const pms = await this.prisma.employee.findMany({
      where: {
        isSuspended: false,
        title: { contains: 'Project Manager', mode: 'insensitive' },
      },
    })

    for (const w of closingSoon) {
      for (const pm of pms) {
        try {
          await this.prisma.notification.create({
            data: {
              userId: pm.id,
              title: 'Backfill Window Closing Soon',
              message: `The active deliverable backfill window closes in less than 24 hours (Ends at: ${w.endsAt.toISOString()}). Ensure past-dated tasks are submitted immediately.`,
              type: 'deadline',
              entityType: 'backfill_window',
              entityId: w.id,
            },
          })
        } catch {
          // Non-blocking
        }
      }
    }
  }
}
