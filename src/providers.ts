import {
  BUILD,
  GO_FOCUS_MODELS,
  calibrateGoModels,
  computeBadge,
  dateKeyFromSec,
  microToDollars,
  resolveRange,
  shapeDeepSeekBalance,
  shapeGlmBalance,
  shapeGlmHistory,
  shapeGlmQuota,
  shapeGoModels,
  shapeGoStatus,
  shapeMimoBalance,
  shapeMimoPlan,
  shapeMimoUsage,
  safeErrorMessage,
} from "./data.js"
import { errorView, extractKey, fetchJson } from "./http.js"
import type { Settings } from "./settings.js"
import { loadAutoQuotas, loadGlmHistory, publicSettings, saveAutoQuotas, saveGlmHistory } from "./settings.js"

export interface ResolvedKey {
  key: string
  source: string
  label: string | null
}

export interface ProviderCredential {
  configured: boolean
  source: string | null
  label: string | null
}

export interface Runtime {
  ctx: any
  settings: Settings
  cache: Map<string, { at: number; value: any }>
  credentials: Map<string, { at: number; value: ResolvedKey | null }>
  autoQuotas: Record<string, any>
  glmHistory: { version: 1; days: Record<string, any> }
}

const CREDENTIAL_TTL = 60_000

export async function createRuntime(ctx: any, settings: Settings): Promise<Runtime> {
  const [autoQuotas, glmHistory] = await Promise.all([loadAutoQuotas(ctx), loadGlmHistory(ctx)])
  return {
    ctx,
    settings,
    cache: new Map(),
    credentials: new Map(),
    autoQuotas,
    glmHistory,
  }
}

function integrateSource(integrationID: string): string {
  return `integration:${integrationID}`
}

async function resolveIntegration(runtime: Runtime, integrationID: string): Promise<ResolvedKey | null> {
  const cached = runtime.credentials.get(integrationID)
  if (cached && Date.now() - cached.at < CREDENTIAL_TTL) return cached.value

  let value: ResolvedKey | null = null
  try {
    const connection = await runtime.ctx.integration.connection.active(integrationID)
    if (connection) {
      if (connection.type === "env") {
        const name = typeof connection.name === "string" ? connection.name : ""
        const env = name ? process.env[name] : undefined
        if (typeof env === "string" && env.trim() !== "") {
          value = { key: env.trim(), source: `env:${name}`, label: name }
        }
      } else {
        const credential = await runtime.ctx.integration.connection.resolve(connection)
        const key = extractKey(credential)
        if (key) {
          value = {
            key,
            source: integrateSource(integrationID),
            label: typeof connection.label === "string" ? connection.label : null,
          }
        }
      }
    }
  } catch {
    value = null
  }

  runtime.credentials.set(integrationID, { at: Date.now(), value })
  return value
}

function envKey(names: readonly string[]): ResolvedKey | null {
  for (const name of names) {
    const value = process.env[name]
    if (typeof value === "string" && value.trim() !== "") {
      return { key: value.trim(), source: `env:${name}`, label: name }
    }
  }
  return null
}

export async function resolveKey(
  runtime: Runtime,
  integrationID: string,
  envNames: readonly string[],
  manualKey = "",
): Promise<ResolvedKey | null> {
  if (manualKey.trim() !== "") {
    return { key: manualKey.trim(), source: "settings", label: "设置" }
  }
  const integration = await resolveIntegration(runtime, integrationID)
  if (integration) return integration
  return envKey(envNames)
}

export function resetCredentials(runtime: Runtime): void {
  runtime.credentials.clear()
}

async function cached(runtime: Runtime, key: string, ttl: number, force: boolean, fn: () => Promise<any>): Promise<any> {
  const hit = runtime.cache.get(key)
  if (!force && hit && Date.now() - hit.at < ttl) return hit.value
  const value = await fn()
  runtime.cache.set(key, { at: Date.now(), value })
  return value
}

async function settle<T>(promise: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  try {
    return { ok: true, value: await promise }
  } catch (error) {
    return { ok: false, error }
  }
}

function credentialOf(key: ResolvedKey | null): ProviderCredential {
  return {
    configured: key !== null,
    source: key?.source ?? null,
    label: key?.label ?? null,
  }
}

function missing(provider: string, key: ResolvedKey | null) {
  return {
    configured: false,
    ok: false,
    code: "missing-key",
    error: `未配置 ${provider} 凭据`,
    credential: credentialOf(key),
  }
}

/* ------------------------------------------------------------------------- */
/* DeepSeek                                                                   */
/* ------------------------------------------------------------------------- */

export async function loadDeepSeek(runtime: Runtime, force: boolean, signal?: AbortSignal) {
  const key = await resolveKey(runtime, "deepseek", ["DEEPSEEK_API_KEY"])
  if (!key) return missing("DeepSeek", key)
  if (!runtime.settings.deepseek) {
    return { configured: true, ok: false, code: "disabled", error: "DeepSeek 已在设置中关闭", credential: credentialOf(key) }
  }

  const result = await settle(
    cached(runtime, "deepseek:balance", 60_000, force, () =>
      fetchJson(`${runtime.settings.deepseekBaseUrl}/user/balance`, {
        headers: { authorization: `Bearer ${key.key}` },
        timeoutMs: 15_000,
        signal,
      }),
    ),
  )

  if (!result.ok) {
    return {
      configured: true,
      ...errorView(result.error, "deepseek"),
      balance: null,
      credential: credentialOf(key),
      consoleUrl: "https://platform.deepseek.com/",
    }
  }

  return {
    configured: true,
    ok: true,
    balance: shapeDeepSeekBalance(result.value),
    credential: credentialOf(key),
    consoleUrl: "https://platform.deepseek.com/",
  }
}

/* ------------------------------------------------------------------------- */
/* OpenCode Go                                                                */
/* ------------------------------------------------------------------------- */

function sumActivityCost(payload: any): number | null {
  const daily = Array.isArray(payload?.daily) ? payload.daily : null
  if (!daily) return null
  return daily.reduce((sum: number, row: any) => sum + microToDollars(row?.totalCostMicroCents), 0)
}

export async function loadGo(
  runtime: Runtime,
  options: { force: boolean; currentModel?: { provider?: string; model?: string } | null; signal?: AbortSignal },
) {
  const key = await resolveKey(runtime, "opencode-go", ["OPENCODE_GO_API_KEY", "OPENCODE_API_KEY"])
  if (!key) return missing("OpenCode Go", key)
  if (!runtime.settings.go) {
    return { configured: true, ok: false, code: "disabled", error: "Go 已在设置中关闭", credential: credentialOf(key) }
  }

  const headers = { authorization: `Bearer ${key.key}` }
  const [statusR, usageR, activityR] = await Promise.all([
    settle(
      cached(runtime, "go:status", 60_000, options.force, () =>
        fetchJson("https://opencode.ai/console/api/go/status", { headers, timeoutMs: 15_000, signal: options.signal }),
      ),
    ),
    settle(
      cached(runtime, "go:usage:30d", 300_000, options.force, () =>
        fetchJson("https://opencode.ai/console/api/usage/models?range=30d&pageSize=100", {
          headers,
          timeoutMs: 20_000,
          signal: options.signal,
        }),
      ),
    ),
    settle(
      cached(runtime, "go:activity", 300_000, options.force, () =>
        fetchJson("https://opencode.ai/console/api/activity/go?range=mtd", {
          headers,
          timeoutMs: 15_000,
          signal: options.signal,
        }),
      ),
    ),
  ])

  const status = statusR.ok
    ? shapeGoStatus(statusR.value)
    : { ...errorView(statusR.error, "opencode") }

  let models: any = { ok: false, code: "no-usage", error: "Go 分模型用量读取失败", rows: [], configured: [], unconfigured: [] }
  if (usageR.ok) {
    const autoLimits = Object.fromEntries(
      Object.entries(runtime.autoQuotas).map(([id, value]) => [id, Number(value?.limit)]),
    )
    const shaped = shapeGoModels(usageR.value, {
      autoQuotas: autoLimits,
      manualQuotas: runtime.settings.modelQuotas,
      focus: GO_FOCUS_MODELS,
      currentModel: options.currentModel ?? null,
    })
    const periodCost = activityR.ok ? sumActivityCost(activityR.value) : null
    const calibrated = calibrateGoModels(shaped, status, {
      autoCalibrate: runtime.settings.autoCalibrate,
      periodCost,
    })
    if (calibrated.calibration?.applied) {
      const id = calibrated.calibration.model
      const limit = calibrated.calibration.candidate
      const previous = runtime.autoQuotas[id]
      if (!previous || previous.limit !== limit) {
        runtime.autoQuotas[id] = {
          limit,
          calibratedAt: Date.now(),
          periodStart: (status as any)?.access?.startsAt ?? null,
        }
        void saveAutoQuotas(runtime.ctx, runtime.autoQuotas).catch(() => undefined)
      }
    }
    models = { ok: true, ...calibrated }
  } else {
    models = { ...errorView(usageR.error, "opencode"), rows: [], configured: [], unconfigured: [] }
  }

  return {
    configured: true,
    ok: status.ok === true,
    status,
    models,
    periodCost: activityR.ok ? sumActivityCost(activityR.value) : null,
    credential: credentialOf(key),
    consoleUrl: "https://opencode.ai/console",
    usageUrl: "https://opencode.ai/console/activity/usage",
  }
}

/* ------------------------------------------------------------------------- */
/* GLM / Z.AI                                                                 */
/* ------------------------------------------------------------------------- */

function recordGlmSpend(runtime: Runtime, spent: unknown, tzSec: number): void {
  const value = Number(spent)
  if (!Number.isFinite(value)) return
  const date = dateKeyFromSec(Math.floor(Date.now() / 1000), tzSec)
  const days = runtime.glmHistory.days
  const existing = days[date]
  if (existing && typeof existing === "object") {
    if (existing.spent === value) return
    existing.spent = value
  } else {
    days[date] = { spent: value, firstSpent: value, firstAt: Date.now() }
  }
  const keys = Object.keys(days).sort()
  for (const key of keys.slice(0, Math.max(0, keys.length - 180))) delete days[key]
  void saveGlmHistory(runtime.ctx, runtime.glmHistory).catch(() => undefined)
}

export async function loadGlm(
  runtime: Runtime,
  range: any,
  force: boolean,
  signal?: AbortSignal,
) {
  const key = await resolveKey(runtime, "zai", ["ZAI_API_KEY", "ZHIPU_API_KEY", "BIGMODEL_API_KEY", "GLM_API_KEY"])
  if (!key) return missing("GLM", key)
  if (!runtime.settings.glm) {
    return { configured: true, ok: false, code: "disabled", error: "GLM 已在设置中关闭", credential: credentialOf(key) }
  }

  const base = runtime.settings.glmBaseUrl
  const headers = { authorization: `Bearer ${key.key}` }
  const [balanceR, quotaR] = await Promise.all([
    settle(
      cached(runtime, "glm:balance", 60_000, force, () =>
        fetchJson(`${base}/api/biz/account/query-customer-account-report`, { headers, timeoutMs: 15_000, signal }),
      ),
    ),
    settle(
      cached(runtime, "glm:quota", 300_000, force, () =>
        fetchJson(`${base}/api/monitor/usage/quota/limit`, { headers, timeoutMs: 15_000, signal }),
      ),
    ),
  ])

  let balance: any
  if (balanceR.ok) {
    try {
      balance = shapeGlmBalance(balanceR.value)
      recordGlmSpend(runtime, balance.spent, range.tzSec)
    } catch (error) {
      balance = { ...errorView(error, "glm") }
    }
  } else {
    balance = { ...errorView(balanceR.error, "glm") }
  }

  let quota: any
  if (quotaR.ok) {
    try {
      quota = shapeGlmQuota(quotaR.value)
    } catch (error) {
      quota = { ok: false, hasPlan: false, windows: [], error: safeErrorMessage(error) }
    }
  } else {
    quota = { ok: false, hasPlan: false, windows: [], error: safeErrorMessage(quotaR.error) }
  }

  return {
    configured: true,
    ok: balance.ok === true,
    balance,
    quota,
    usage: shapeGlmHistory(runtime.glmHistory, range),
    credential: credentialOf(key),
    consoleUrl: "https://open.bigmodel.cn/",
  }
}

/* ------------------------------------------------------------------------- */
/* Xiaomi MiMo                                                                */
/* ------------------------------------------------------------------------- */

function mimoDate(offsetDays: number): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + offsetDays)
  return date.toISOString().slice(0, 10)
}

function fillMimoDaily(usage: any, days: number) {
  const span = Math.max(1, Math.min(31, Number(days) || 7))
  const byDate = new Map<string, any>((usage.daily ?? []).map((row: any) => [row.date, row]))
  const currency = usage.currency ?? "CNY"
  const daily: any[] = []
  for (let offset = span - 1; offset >= 0; offset -= 1) {
    const date = mimoDate(-offset)
    daily.push(
      byDate.get(date) ?? {
        date,
        cost: 0,
        costByCurrency: { [currency]: 0 },
        tokens: 0,
        requests: 0,
      },
    )
  }
  return { ...usage, daily, days: span }
}

export async function loadMimo(
  runtime: Runtime,
  range: any,
  force: boolean,
  signal?: AbortSignal,
) {
  const key = await resolveKey(runtime, "xiaomi", ["XIAOMI_API_KEY", "MIMO_API_KEY"], runtime.settings.mimoKey)
  if (!key) return missing("MiMo", key)
  if (!runtime.settings.mimo) {
    return { configured: true, ok: false, code: "disabled", error: "MiMo 已在设置中关闭", credential: credentialOf(key) }
  }

  const tokenPlanKey = await resolveKey(
    runtime,
    "__mimo_token_plan__",
    ["XIAOMI_TOKEN_PLAN_API_KEY", "MIMO_TOKEN_PLAN_API_KEY", "MIMO_TP_API_KEY"],
    runtime.settings.mimoTokenPlanKey,
  )
  const span = Math.max(1, Math.min(31, range.days))
  const headers = { authorization: `Bearer ${key.key}` }
  const [balanceR, usageR, planR] = await Promise.all([
    settle(
      cached(runtime, "mimo:balance", 60_000, force, () =>
        fetchJson("https://api.xiaomimimo.com/v1/platform/balance", { headers, timeoutMs: 15_000, signal }),
      ),
    ),
    settle(
      cached(runtime, `mimo:usage:${span}d`, 300_000, force, () =>
        fetchJson(
          `https://api.xiaomimimo.com/v1/platform/usage/daily?start_date=${mimoDate(-(span - 1))}&end_date=${mimoDate(0)}`,
          { headers, timeoutMs: 20_000, signal },
        ),
      ),
    ),
    tokenPlanKey
      ? settle(
          cached(runtime, "mimo:token-plan", 300_000, force, () =>
            fetchJson("https://token-plan-cn.xiaomimimo.com/v1/platform/token_plan", {
              headers: { authorization: `Bearer ${tokenPlanKey.key}` },
              timeoutMs: 15_000,
              signal,
            }),
          ),
        )
      : Promise.resolve(null),
  ])

  let balance: any
  if (balanceR.ok) {
    try {
      balance = shapeMimoBalance(balanceR.value)
    } catch (error) {
      balance = { ...errorView(error, "mimo") }
    }
  } else {
    balance = { ...errorView(balanceR.error, "mimo") }
  }

  let usage: any
  if (usageR.ok) {
    try {
      usage = fillMimoDaily(shapeMimoUsage(usageR.value), range.days)
    } catch (error) {
      usage = { ...errorView(error, "mimo") }
    }
  } else {
    usage = { ...errorView(usageR.error, "mimo") }
  }

  let plan: any = null
  if (planR !== null) {
    if (planR.ok) {
      try {
        plan = shapeMimoPlan(planR.value)
      } catch (error) {
        plan = { ...errorView(error, "mimo") }
      }
    } else {
      plan = { ...errorView(planR.error, "mimo") }
    }
  }

  return {
    configured: true,
    ok: balance.ok === true,
    balance,
    usage,
    plan,
    tokenPlanConfigured: tokenPlanKey !== null,
    credential: credentialOf(key),
    consoleUrl: "https://platform.xiaomimimo.com/console/balance",
  }
}

/* ------------------------------------------------------------------------- */
/* Current model quota                                                        */
/* ------------------------------------------------------------------------- */

/**
 * Lightweight Go total-pool lookup for the floating capsule. The capsule shows
 * the subscription-wide percentage; per-model rows stay in the panel.
 */
export async function loadGoOverall(runtime: Runtime, signal?: AbortSignal) {
  const key = await resolveKey(runtime, "opencode-go", ["OPENCODE_GO_API_KEY", "OPENCODE_API_KEY"])
  if (!key) return { ok: false, code: "missing-key", error: "未配置 OpenCode Go 凭据" }
  if (!runtime.settings.go) return { ok: false, code: "disabled", error: "Go 已在设置中关闭" }

  const result = await settle(
    cached(runtime, "go:status", 60_000, false, () =>
      fetchJson("https://opencode.ai/console/api/go/status", {
        headers: { authorization: `Bearer ${key.key}` },
        timeoutMs: 15_000,
        signal,
      }),
    ),
  )

  if (!result.ok) {
    return {
      ok: true,
      kind: "go",
      month: null,
      status: null,
      error: safeErrorMessage(result.error),
      credential: credentialOf(key),
    }
  }

  const status = shapeGoStatus(result.value)
  return {
    ok: true,
    kind: "go",
    month: status.month,
    status,
    error: null,
    credential: credentialOf(key),
  }
}

export async function loadModelQuota(
  runtime: Runtime,
  provider: string,
  model: string,
  signal?: AbortSignal,
) {
  const p = String(provider || "").toLowerCase()
  const m = String(model || "")

  if (p.includes("opencode")) {
    return { ...(await loadGoOverall(runtime, signal)), provider, model: m }
  }

  if (p.startsWith("deepseek")) {
    const ds = await loadDeepSeek(runtime, false, signal)
    if (!ds.configured) {
      return { ok: false, code: "missing-key", error: (ds as any).error ?? "未配置 DeepSeek 凭据" }
    }
    return {
      ok: true,
      kind: "deepseek",
      provider,
      model: m,
      label: "DeepSeek",
      balance: (ds as any).balance?.primary ?? null,
      available: (ds as any).balance?.isAvailable === true,
      error: (ds as any).ok ? null : (ds as any).error ?? null,
    }
  }

  if (p === "zai" || p.includes("zhipu") || p.includes("bigmodel") || p.includes("glm")) {
    const range = resolveRange({ preset: "7d" }, localTzSec())
    const glm = await loadGlm(runtime, range, false, signal)
    if (!glm.configured) {
      return { ok: false, code: "missing-key", error: (glm as any).error ?? "未配置 GLM 凭据" }
    }
    const plan = (glm as any).quota?.hasPlan ? ((glm as any).quota.windows ?? [])[0] ?? null : null
    return {
      ok: true,
      kind: "glm",
      provider,
      model: m,
      label: "GLM",
      balance: (glm as any).balance ?? null,
      plan,
      error: (glm as any).ok ? null : (glm as any).error ?? null,
    }
  }

  if (p.includes("xiaomi") || p.includes("mimo")) {
    const range = resolveRange({ preset: "7d" }, localTzSec())
    const mimo = await loadMimo(runtime, range, false, signal)
    if (!mimo.configured) {
      return { ok: false, code: "missing-key", error: (mimo as any).error ?? "未配置 MiMo 凭据" }
    }
    return {
      ok: true,
      kind: "mimo",
      provider,
      model: m,
      label: "MiMo",
      balance: (mimo as any).balance ?? null,
      plan: (mimo as any).plan ?? null,
      error: (mimo as any).ok ? null : (mimo as any).error ?? null,
    }
  }

  return { ok: false, code: "unknown-provider", error: `暂不支持该 provider：${provider || "未知"}` }
}

/* ------------------------------------------------------------------------- */
/* Snapshot and badge                                                         */
/* ------------------------------------------------------------------------- */

export function localTzSec(): number {
  return -new Date().getTimezoneOffset() * 60
}

export async function loadSnapshot(
  runtime: Runtime,
  input: {
    preset?: string
    from?: string
    to?: string
    force?: boolean
    currentModel?: { provider?: string; model?: string } | null
  },
  signal?: AbortSignal,
) {
  const tzSec = localTzSec()
  const range = resolveRange(
    { preset: input.preset ?? "7d", from: input.from, to: input.to },
    tzSec,
  )
  if (!range.ok) {
    return { ok: false, code: "range", error: range.error }
  }

  const force = input.force === true
  const [deepseek, go, glm, mimo] = await Promise.all([
    loadDeepSeek(runtime, force, signal),
    loadGo(runtime, { force, currentModel: input.currentModel ?? null, signal }),
    loadGlm(runtime, range, force, signal),
    loadMimo(runtime, range, force, signal),
  ])

  return {
    ok: true,
    build: BUILD,
    updatedAt: new Date().toISOString(),
    range,
    settings: publicSettings(runtime.settings),
    credentials: {
      deepseek: deepseek.credential,
      go: go.credential,
      glm: glm.credential,
      mimo: mimo.credential,
    },
    deepseek,
    go,
    glm,
    mimo,
    badge: computeBadge({ deepseek, go }),
  }
}

export async function loadBadge(runtime: Runtime, signal?: AbortSignal) {
  const deepseekKey = runtime.settings.deepseek ? await resolveKey(runtime, "deepseek", ["DEEPSEEK_API_KEY"]) : null
  const goKey = runtime.settings.go
    ? await resolveKey(runtime, "opencode-go", ["OPENCODE_GO_API_KEY", "OPENCODE_API_KEY"])
    : null

  const [deepseekR, goR] = await Promise.all([
    deepseekKey
      ? settle(
          cached(runtime, "deepseek:balance", 60_000, false, () =>
            fetchJson(`${runtime.settings.deepseekBaseUrl}/user/balance`, {
              headers: { authorization: `Bearer ${deepseekKey.key}` },
              timeoutMs: 15_000,
              signal,
            }),
          ),
        )
      : Promise.resolve(null),
    goKey
      ? settle(
          cached(runtime, "go:status", 60_000, false, () =>
            fetchJson("https://opencode.ai/console/api/go/status", {
              headers: { authorization: `Bearer ${goKey.key}` },
              timeoutMs: 15_000,
              signal,
            }),
          ),
        )
      : Promise.resolve(null),
  ])

  const deepseek = deepseekR
    ? deepseekR.ok
      ? { configured: true, ok: true, balance: shapeDeepSeekBalance(deepseekR.value), credential: credentialOf(deepseekKey) }
      : { configured: true, balance: null, ...errorView(deepseekR.error, "deepseek"), credential: credentialOf(deepseekKey) }
    : { configured: false, ok: false, balance: null, code: "missing-key", error: "未配置 DeepSeek 凭据", credential: credentialOf(null) }

  const go = goR
    ? goR.ok
      ? { configured: true, ok: true, status: shapeGoStatus(goR.value), credential: credentialOf(goKey) }
      : { configured: true, ok: false, status: { ...errorView(goR.error, "opencode") }, credential: credentialOf(goKey) }
    : { configured: false, ok: false, status: { ok: false, code: "missing-key", error: "未配置 Go 凭据" }, credential: credentialOf(null) }

  return {
    ok: true,
    build: BUILD,
    updatedAt: new Date().toISOString(),
    settings: publicSettings(runtime.settings),
    deepseek,
    go,
    badge: computeBadge({ deepseek, go }),
  }
}


