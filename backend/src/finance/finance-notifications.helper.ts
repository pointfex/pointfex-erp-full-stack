export interface FinanceNotificationPayload {
  title: string
  message: string
  entityType: string
  entityId: string
  excludeEmployeeId?: string
}

/**
 * Fans out an in-app financial workflow notification inside an existing Prisma
 * transaction (or root client) to all active holders of the specified roles.
 */
export async function notifyFinanceRoles(
  tx: any,
  roles: string[],
  payload: FinanceNotificationPayload,
): Promise<number> {
  if (!tx?.notification || typeof tx.notification.createMany !== 'function') {
    return 0
  }

  const normalizedRoles = Array.from(
    new Set(roles.map((r) => r.trim().toLowerCase()).filter(Boolean)),
  )
  if (normalizedRoles.length === 0) return 0

  const recipientIds = new Set<string>()

  if (tx.employeeRole && typeof tx.employeeRole.findMany === 'function') {
    const roleHolders = await tx.employeeRole.findMany({
      where: {
        isActive: true,
        role: { slug: { in: normalizedRoles }, isActive: true },
        employee: { status: 'active' },
      },
      select: { employeeId: true },
    })
    for (const row of roleHolders ?? []) {
      if (row?.employeeId) recipientIds.add(row.employeeId)
    }
  }

  if (tx.positionAssignment && typeof tx.positionAssignment.findMany === 'function') {
    const posHolders = await tx.positionAssignment.findMany({
      where: {
        isActive: true,
        position: { roleCategory: { in: normalizedRoles } },
        employee: { status: 'active' },
      },
      select: { employeeId: true },
    })
    for (const row of posHolders ?? []) {
      if (row?.employeeId) recipientIds.add(row.employeeId)
    }
  }

  if (payload.excludeEmployeeId) {
    recipientIds.delete(payload.excludeEmployeeId)
  }

  if (recipientIds.size === 0) return 0

  await tx.notification.createMany({
    data: Array.from(recipientIds).map((userId) => ({
      userId,
      title: payload.title,
      message: payload.message,
      type: 'financial',
      entityType: payload.entityType,
      entityId: payload.entityId,
    })),
  })

  return recipientIds.size
}
