export type BadgeMode = "both" | "deepseek" | "go"

export interface Settings {
  refreshMinutes: number
  badgeMode: BadgeMode
  floatingCard: boolean
  deepseek: boolean
  go: boolean
  glm: boolean
  mimo: boolean
  autoCalibrate: boolean
  modelQuotas: Record<string, number>
  deepseekBaseUrl: string
  glmBaseUrl: string
  /** Manual fallbacks; normally the OpenCode integration supplies the key. */
  mimoKey: string
  mimoTokenPlanKey: string
}

export const DEFAULT_SETTINGS: Settings = {
  refreshMinutes: 5,
  badgeMode: "both",
  floatingCard: true,
  deepseek: true,
  go: true,
  glm: true,
  mimo: true,
  autoCalibrate: true,
  modelQuotas: {},
  deepseekBaseUrl: "https://api.deepseek.com",
  glmBaseUrl: "https://open.bigmodel.cn",
  mimoKey: "",
  mimoTokenPlanKey: "",
}

const REFRESH_CHOICES = new Set([1, 5, 15, 30, 60])
const BADGE_MODES = new Set<BadgeMode>(["both", "deepseek", "go"])

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value.trim().replace(/\/+$/, "") : fallback
}

function normalizeQuotas(value: unknown): Record<string, number> {
  const result: Record<string, number> = {}
  if (!value || typeof value !== "object") return result
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof id !== "string" || id.length === 0 || id.length > 100) continue
    const limit = Number(raw)
    if (!Number.isFinite(limit) || limit <= 0 || limit > 10_000) continue
    result[id] = limit
  }
  return result
}

export function normalizeSettings(value: unknown): Settings {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  const refresh = Number(record.refreshMinutes)
  const badgeMode = String(record.badgeMode ?? DEFAULT_SETTINGS.badgeMode) as BadgeMode
  return {
    refreshMinutes: REFRESH_CHOICES.has(refresh) ? refresh : DEFAULT_SETTINGS.refreshMinutes,
    badgeMode: BADGE_MODES.has(badgeMode) ? badgeMode : DEFAULT_SETTINGS.badgeMode,
    floatingCard: record.floatingCard !== false,
    deepseek: record.deepseek !== false,
    go: record.go !== false,
    glm: record.glm !== false,
    mimo: record.mimo !== false,
    autoCalibrate: record.autoCalibrate !== false,
    modelQuotas: normalizeQuotas(record.modelQuotas),
    deepseekBaseUrl: stringValue(record.deepseekBaseUrl, DEFAULT_SETTINGS.deepseekBaseUrl),
    glmBaseUrl: stringValue(record.glmBaseUrl, DEFAULT_SETTINGS.glmBaseUrl),
    mimoKey: typeof record.mimoKey === "string" ? record.mimoKey.trim() : "",
    mimoTokenPlanKey: typeof record.mimoTokenPlanKey === "string" ? record.mimoTokenPlanKey.trim() : "",
  }
}

export type PublicSettings = Omit<Settings, "mimoKey" | "mimoTokenPlanKey"> & {
  mimoKeyConfigured: boolean
  mimoTokenPlanKeyConfigured: boolean
}

export function publicSettings(settings: Settings): PublicSettings {
  const { mimoKey, mimoTokenPlanKey, ...rest } = settings
  return {
    ...rest,
    mimoKeyConfigured: mimoKey !== "",
    mimoTokenPlanKeyConfigured: mimoTokenPlanKey !== "",
  }
}

/** A settings patch may leave a secret out; `""` clears it explicitly. */
export function mergeSettings(current: Settings, patch: unknown): Settings {
  if (!patch || typeof patch !== "object") return current
  const input = patch as Record<string, unknown>
  const next: Settings = { ...current }

  if ("refreshMinutes" in input) {
    const value = Number(input.refreshMinutes)
    if (REFRESH_CHOICES.has(value)) next.refreshMinutes = value
  }
  if ("badgeMode" in input) {
    const value = String(input.badgeMode) as BadgeMode
    if (BADGE_MODES.has(value)) next.badgeMode = value
  }
  for (const flag of ["floatingCard", "deepseek", "go", "glm", "mimo", "autoCalibrate"] as const) {
    if (flag in input && typeof input[flag] === "boolean") next[flag] = input[flag] as boolean
  }
  if ("modelQuotas" in input) next.modelQuotas = normalizeQuotas(input.modelQuotas)
  if ("deepseekBaseUrl" in input) next.deepseekBaseUrl = stringValue(input.deepseekBaseUrl, DEFAULT_SETTINGS.deepseekBaseUrl)
  if ("glmBaseUrl" in input) next.glmBaseUrl = stringValue(input.glmBaseUrl, DEFAULT_SETTINGS.glmBaseUrl)
  if ("mimoKey" in input && typeof input.mimoKey === "string") next.mimoKey = input.mimoKey.trim()
  if ("mimoTokenPlanKey" in input && typeof input.mimoTokenPlanKey === "string") {
    next.mimoTokenPlanKey = input.mimoTokenPlanKey.trim()
  }
  return next
}

export async function loadSettings(ctx: { storage: { get: (key: string) => Promise<any> } }): Promise<Settings> {
  const stored = await ctx.storage.get("settings").catch(() => undefined)
  return normalizeSettings(stored)
}

export async function saveSettings(
  ctx: { storage: { set: (key: string, value: any) => Promise<void> } },
  settings: Settings,
): Promise<void> {
  await ctx.storage.set("settings", settings)
}

export async function loadAutoQuotas(ctx: { storage: { get: (key: string) => Promise<any> } }): Promise<Record<string, any>> {
  const stored = await ctx.storage.get("auto-quotas").catch(() => undefined)
  if (!stored || typeof stored !== "object") return {}
  const result: Record<string, any> = {}
  for (const [id, value] of Object.entries(stored as Record<string, unknown>)) {
    const limit = Number((value as any)?.limit ?? value)
    if (!Number.isFinite(limit) || limit <= 0 || limit > 10_000) continue
    result[id] = {
      limit,
      calibratedAt: Number((value as any)?.calibratedAt) || 0,
      periodStart: typeof (value as any)?.periodStart === "string" ? (value as any).periodStart : null,
    }
  }
  return result
}

export async function saveAutoQuotas(
  ctx: { storage: { set: (key: string, value: any) => Promise<void> } },
  quotas: Record<string, any>,
): Promise<void> {
  await ctx.storage.set("auto-quotas", quotas)
}

export async function loadGlmHistory(ctx: { storage: { get: (key: string) => Promise<any> } }): Promise<{ version: 1; days: Record<string, any> }> {
  const stored = await ctx.storage.get("glm-history").catch(() => undefined)
  if (stored && typeof stored === "object" && (stored as any).days && typeof (stored as any).days === "object") {
    return { version: 1, days: (stored as any).days }
  }
  return { version: 1, days: {} }
}

export async function saveGlmHistory(
  ctx: { storage: { set: (key: string, value: any) => Promise<void> } },
  history: { version: 1; days: Record<string, any> },
): Promise<void> {
  await ctx.storage.set("glm-history", history)
}
