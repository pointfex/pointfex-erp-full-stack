import { AuthenticatedUser } from '../common/auth-user.interface'

export async function resolveActorRoles(
  prismaOrTx: any,
  actor: AuthenticatedUser,
): Promise<Set<string>> {
  const roles = new Set<string>()
  if (actor.role) roles.add(actor.role.toLowerCase())
  if (Array.isArray(actor.roles)) {
    for (const r of actor.roles) {
      if (typeof r === 'string' && r.trim()) roles.add(r.toLowerCase())
    }
  }

  if (prismaOrTx?.employeeRole && typeof prismaOrTx.employeeRole.findMany === 'function') {
    const rows = await prismaOrTx.employeeRole.findMany({
      where: { employeeId: actor.id, isActive: true, role: { isActive: true } },
      select: { role: { select: { slug: true } } },
    })
    for (const row of rows ?? []) {
      if (row?.role?.slug) roles.add(String(row.role.slug).toLowerCase())
    }
  }

  if (
    prismaOrTx?.positionAssignment &&
    typeof prismaOrTx.positionAssignment.findMany === 'function'
  ) {
    const assignments = await prismaOrTx.positionAssignment.findMany({
      where: { employeeId: actor.id, isActive: true },
      select: { position: { select: { roleCategory: true } } },
    })
    for (const row of assignments ?? []) {
      if (row?.position?.roleCategory) {
        roles.add(String(row.position.roleCategory).toLowerCase())
      }
    }
  }

  return roles
}

export function isActorCeo(actor: AuthenticatedUser, roles?: Set<string>): boolean {
  const baseRole = actor.role?.toLowerCase()
  return Boolean(
    actor.permissions?.includes('system:root') ||
      baseRole === 'ceo' ||
      roles?.has('ceo') ||
      actor.roles?.some((r) => r.toLowerCase() === 'ceo'),
  )
}

export function hasGlobalFinanceAccess(actor: AuthenticatedUser, roles?: Set<string>): boolean {
  const baseRole = actor.role?.toLowerCase()
  return Boolean(
    isActorCeo(actor, roles) ||
      actor.permissions?.includes('finance_ledger:read_all') ||
      baseRole === 'cfo' ||
      baseRole === 'auditor' ||
      roles?.has('cfo') ||
      roles?.has('auditor'),
  )
}

export async function findManagedTeamIds(prismaOrTx: any, employeeId: string): Promise<string[]> {
  if (
    !prismaOrTx?.positionAssignment ||
    typeof prismaOrTx.positionAssignment.findMany !== 'function' ||
    !prismaOrTx?.team ||
    typeof prismaOrTx.team.findMany !== 'function'
  ) {
    return []
  }

  const assignments = await prismaOrTx.positionAssignment.findMany({
    where: { employeeId, isActive: true },
    select: { positionId: true },
  })
  const positionIds = Array.from(
    new Set((assignments ?? []).map((a: any) => a.positionId).filter(Boolean)),
  ) as string[]
  if (positionIds.length === 0) return []

  const teams = await prismaOrTx.team.findMany({
    where: { pmPositionId: { in: positionIds } },
    select: { id: true },
  })
  return Array.from(new Set((teams ?? []).map((t: any) => t.id).filter(Boolean)))
}

export async function findMemberTeamIds(prismaOrTx: any, employeeId: string): Promise<string[]> {
  if (!prismaOrTx?.teamMembership || typeof prismaOrTx.teamMembership.findMany !== 'function') {
    return []
  }
  const rows = await prismaOrTx.teamMembership.findMany({
    where: { employeeId, isActive: true },
    select: { teamId: true },
  })
  return Array.from(new Set((rows ?? []).map((r: any) => r.teamId).filter(Boolean)))
}

export async function isActivePmOfTeam(
  prismaOrTx: any,
  employeeId: string,
  teamId: string,
): Promise<boolean> {
  const managed = await findManagedTeamIds(prismaOrTx, employeeId)
  return managed.includes(teamId)
}

export async function findActiveEmployeesForRole(
  prismaOrTx: any,
  roleSlug: string,
): Promise<Array<{ employeeId: string; positionId: string | null; employeeName?: string }>> {
  const slug = roleSlug.toLowerCase()
  const slots: Array<{ employeeId: string; positionId: string | null; employeeName?: string }> = []
  const seenEmpWithoutPos = new Set<string>()
  const seenEmpPositions = new Set<string>()

  if (
    prismaOrTx?.positionAssignment &&
    typeof prismaOrTx.positionAssignment.findMany === 'function'
  ) {
    const posRows = await prismaOrTx.positionAssignment.findMany({
      where: {
        isActive: true,
        position: { roleCategory: slug },
        employee: { isSuspended: false },
      },
      include: {
        employee: { select: { id: true, name: true, status: true } },
      },
      orderBy: { assignedAt: 'asc' },
    })
    for (const row of posRows ?? []) {
      if (!row?.employeeId) continue
      const key = `${row.employeeId}:${row.positionId || slug}`
      if (seenEmpPositions.has(key)) continue
      seenEmpPositions.add(key)
      seenEmpWithoutPos.add(row.employeeId)
      slots.push({
        employeeId: row.employeeId,
        positionId: row.positionId ?? null,
        employeeName: row.employee?.name ?? undefined,
      })
    }
  }

  if (prismaOrTx?.employeeRole && typeof prismaOrTx.employeeRole.findMany === 'function') {
    const roleRows = await prismaOrTx.employeeRole.findMany({
      where: {
        isActive: true,
        role: { slug, isActive: true },
        employee: { isSuspended: false },
      },
      include: {
        employee: { select: { id: true, name: true, status: true } },
      },
      orderBy: { assignedAt: 'asc' },
    })
    for (const row of roleRows ?? []) {
      if (!row?.employeeId) continue
      if (seenEmpWithoutPos.has(row.employeeId)) continue
      seenEmpWithoutPos.add(row.employeeId)
      slots.push({
        employeeId: row.employeeId,
        positionId: null,
        employeeName: row.employee?.name ?? undefined,
      })
    }
  }

  return slots
}

export function buildAuditActor(actor: AuthenticatedUser, roleOverride?: string) {
  return {
    actorId: actor.id,
    actorName: actor.name || actor.email || actor.id,
    actorEmail: actor.email || '',
    actorRole: (roleOverride || actor.role || 'employee').toUpperCase(),
  }
}
