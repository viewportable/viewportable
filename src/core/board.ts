import { DEFAULT_DEVICE_IDS, getDeviceById, type DeviceSpec } from '../shared/device'

export const MAX_ACTIVE_DEVICES = 6

export type BoardToggleResult = {
  deviceIds: string[]
  changed: boolean
  added: boolean
}

export type BoardReconcilePlan = {
  deviceIds: string[]
  removeIds: string[]
  addIds: string[]
}

export function normalizeBoardDeviceIds(ids: readonly string[]): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []

  for (const id of ids) {
    if (seen.has(id) || !getDeviceById(id)) continue

    seen.add(id)
    normalized.push(id)

    if (normalized.length === MAX_ACTIVE_DEVICES) break
  }

  return normalized.length > 0 ? normalized : [...DEFAULT_DEVICE_IDS]
}

export function resolveBoardDevices(ids: readonly string[]): DeviceSpec[] {
  return normalizeBoardDeviceIds(ids)
    .map((id) => getDeviceById(id))
    .filter((device): device is DeviceSpec => device !== undefined)
}

export function toggleBoardDevice(
  currentIds: readonly string[],
  deviceId: string,
): BoardToggleResult {
  const current = normalizeBoardDeviceIds(currentIds)
  const exists = current.includes(deviceId)

  if (!getDeviceById(deviceId)) {
    return { deviceIds: current, changed: false, added: false }
  }

  if (exists && current.length === 1) {
    return { deviceIds: current, changed: false, added: false }
  }

  if (!exists && current.length >= MAX_ACTIVE_DEVICES) {
    return { deviceIds: current, changed: false, added: false }
  }

  const next = exists ? current.filter((id) => id !== deviceId) : [...current, deviceId]

  return {
    deviceIds: normalizeBoardDeviceIds(next),
    changed: true,
    added: !exists,
  }
}

export function planBoardReconcile(
  currentIds: readonly string[],
  requestedIds: readonly string[],
): BoardReconcilePlan {
  const deviceIds = normalizeBoardDeviceIds(requestedIds)
  const current = new Set(currentIds)
  const next = new Set(deviceIds)

  return {
    deviceIds,
    removeIds: currentIds.filter((id) => !next.has(id)),
    addIds: deviceIds.filter((id) => !current.has(id)),
  }
}
