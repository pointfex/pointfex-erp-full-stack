import 'dotenv/config'
import * as bcrypt from 'bcrypt'
import { PrismaClient, Prisma } from '@prisma/client'
import { seedRbac } from './seed-rbac'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting Pointfex ERP Clean Baseline Seed...')

  // 1. Seed Mandatory Executive Position: pos_ceo
  await prisma.position.upsert({
    where: { id: 'pos_ceo' },
    update: {
      code: 'CEO',
      title: 'Chief Executive Officer',
      department: 'Executive',
      roleCategory: 'ceo',
    },
    create: {
      id: 'pos_ceo',
      code: 'CEO',
      title: 'Chief Executive Officer',
      department: 'Executive',
      roleCategory: 'ceo',
    },
  })

  // 2. Seed Default Task Weight Configurations
  const weightConfigs = [
    { category: 'SMALL' as const, points: new Prisma.Decimal(1), description: 'Small bug fixes, copy changes, minor config (1 pt / 10 XP)' },
    { category: 'MEDIUM' as const, points: new Prisma.Decimal(3), description: 'Standard feature implementation, component redesign (3 pts / 30 XP)' },
    { category: 'LARGE' as const, points: new Prisma.Decimal(5), description: 'Complex modules, major integrations, architectural spikes (5 pts / 50 XP)' },
    { category: 'CRITICAL' as const, points: new Prisma.Decimal(7), description: 'Critical incident response, platform core refactors (7 pts / 70 XP)' },
  ]
  for (const wc of weightConfigs) {
    await prisma.taskWeightConfig.upsert({
      where: { category: wc.category },
      update: { points: wc.points, description: wc.description },
      create: {
        category: wc.category,
        points: wc.points,
        description: wc.description,
        isDefault: true,
      },
    })
  }

  // 3. Seed Default KPI & Governance System Configuration
  await prisma.kpiConfig.upsert({
    where: { id: 'singleton' },
    update: {
      massiveXpThreshold: 200,
      inactivityPenalty: new Prisma.Decimal(0.00),
      mainSquadMultiplier: new Prisma.Decimal(1.00),
      outsideSquadMultiplier: new Prisma.Decimal(0.70),
      isolatedExecMultiplier: new Prisma.Decimal(0.50),
      devPmWeight: new Prisma.Decimal(0.40),
      devCtoWeight: new Prisma.Decimal(0.15),
      devCpoWeight: new Prisma.Decimal(0.15),
      devCfoWeight: new Prisma.Decimal(0.15),
      devChroWeight: new Prisma.Decimal(0.15),
    },
    create: {
      id: 'singleton',
      massiveXpThreshold: 200,
      inactivityPenalty: new Prisma.Decimal(0.00),
      mainSquadMultiplier: new Prisma.Decimal(1.00),
      outsideSquadMultiplier: new Prisma.Decimal(0.70),
      isolatedExecMultiplier: new Prisma.Decimal(0.50),
      devPmWeight: new Prisma.Decimal(0.40),
      devCtoWeight: new Prisma.Decimal(0.15),
      devCpoWeight: new Prisma.Decimal(0.15),
      devCfoWeight: new Prisma.Decimal(0.15),
      devChroWeight: new Prisma.Decimal(0.15),
    },
  })

  // 4. CEO Account Bootstrap (Strictly from Environment Variables)
  const ceoEmail = process.env.CEO_EMAIL?.trim().toLowerCase()
  const ceoInitialPassword = process.env.CEO_INITIAL_PASSWORD
  const ceoId = process.env.CEO_EMPLOYEE_ID?.trim() || 'emp_ceo_01'
  let effectiveCeoId = ceoId

  if (!ceoEmail || !ceoInitialPassword) {
    console.log(
      'ℹ️ CEO_EMAIL or CEO_INITIAL_PASSWORD not configured in environment. Skipping CEO user bootstrap.',
    )
  } else {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ceoEmail)) {
      throw new Error('CEO_EMAIL must be a valid email address.')
    }
    if (ceoInitialPassword.length < 8) {
      throw new Error('CEO_INITIAL_PASSWORD must be at least 8 characters long.')
    }

    const initialHash = await bcrypt.hash(ceoInitialPassword, 12)
    const ttlHours = Number.parseInt(process.env.TEMP_PASSWORD_TTL_HOURS || '48', 10) || 48
    const tempPasswordExpiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000)

    const existingCeo =
      (await prisma.employee.findUnique({ where: { id: ceoId } })) ||
      (await prisma.employee.findUnique({ where: { email: ceoEmail } }))

    if (!existingCeo) {
      const created = await prisma.employee.create({
        data: {
          id: ceoId,
          name: 'Chief Executive Officer',
          email: ceoEmail,
          passwordHash: initialHash,
          title: 'Chief Executive Officer',
          initials: 'CEO',
          avatarUrl: '',
          status: 'online',
          isSuspended: false,
          mustChangePassword: true,
          tempPasswordExpiresAt,
          mustEnrollMfa: false,
          mfaEnabled: false,
        },
      })
      effectiveCeoId = created.id
    } else {
      effectiveCeoId = existingCeo.id
      // Preserve existing credentials, MFA, and flags
      await prisma.employee.update({
        where: { id: effectiveCeoId },
        data: {
          title: 'Chief Executive Officer',
          isSuspended: false,
        },
      })
    }

    await prisma.positionAssignment.upsert({
      where: { id: 'asgn_ceo' },
      update: {
        employeeId: effectiveCeoId,
        positionId: 'pos_ceo',
        isActive: true,
      },
      create: {
        id: 'asgn_ceo',
        employeeId: effectiveCeoId,
        positionId: 'pos_ceo',
        startDate: new Date(),
        isActive: true,
      },
    })

    await prisma.loginAllowlistEntry.upsert({
      where: { pattern: ceoEmail },
      update: { isActive: true },
      create: {
        pattern: ceoEmail,
        isDomain: false,
        isActive: true,
        addedById: effectiveCeoId,
        note: 'Immutable Chief Executive Officer allowlist entry',
      },
    })
  }

  // 5. Seed System Roles, Catalog, Decision Policies, and RBAC/PBAC Authority Map
  await seedRbac(prisma, { ceoEmployeeId: effectiveCeoId })

  console.log('✅ Pointfex ERP Baseline Seed completed successfully (zero demo/dummy data seeded).')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
