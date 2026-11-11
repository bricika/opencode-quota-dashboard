/**
 * Pure shaping for the quota dashboard. Ported from dsh-quota-dashboard
 * `lib/data.js`; no I/O, no credentials, deterministic.
 */

export const BUILD = "0.1.0"

export const GO_PLAN_LABELS: Record<string, string> = {
  go: "Go",
  "go-plus": "Go Plus",
  "go-teams": "Go Teams",
}

export const GO_PLAN_PRICES: Record<string, string> = {
  go: "$10/月",
  "go-plus": "$40/月",
  "go-teams": "$20/人/月",
}

export const GO_QUOTA_CANDIDATES = [
  15, 20, 30, 35, 50, 60, 65, 80, 90, 100, 105, 120, 150, 180, 200, 240,
]

export const DEFAULT_GO_MODEL_LIMITS: Record<string, number> = {
  "deepseek-v4.1-flash": 100,
  "glm-5.3-flash": 60,
  "mimo-v2.6-flash": 60,
  "deepseek-v4-pro": 15,
  "glm-5.3": 15,
  "mimo-v2.6-pro": 15,
  "kimi-k3": 15,
  "kimi-k3.1-pro": 15,
  "qwen3.8-max": 15,
  "qwen3.8-flash": 30,
  "minimax-m3.1-flash": 20,
  "minimax-m3": 60,
  "grok-4.7": 15,
  "gpt-6-luna": 15,
  "gpt-5.6-luna": 15,
  "claude-haiku-5-5": 15,
  "gemini-4-argon": 30,
  "hy4": 60,
  "hy4-preview": 30,
  "hy3": 60,
  "longcat-2.0": 60,
  "kimi-k2.7-code": 60,
  "step-5-preview": 15,
  "muse-spark-1.3-contributor": 60,
  "muse-spark-1.2-contributor": 60,
}

export const GO_MODEL_LABELS: Record<string, string> = {
  "deepseek-v4.1-flash": "DeepSeek V4.1 Flash",
  "deepseek-v4-flash": "DeepSeek V4 Flash",
  "deepseek-v4-pro": "DeepSeek V4 Pro",
  "glm-5.3-flash": "GLM-5.3 Flash",
  "glm-5.3": "GLM-5.3",
  "glm-5.2": "GLM-5.2",
  "mimo-v2.6-flash": "MiMo V2.6 Flash",
  "mimo-v2.6-pro": "MiMo V2.6 Pro",
  "mimo-v2.5": "MiMo V2.5",
  "mimo-v2.5-pro": "MiMo V2.5 Pro",
  "kimi-k3": "Kimi K3",
  "kimi-k3.1-pro": "Kimi K3.1 Pro",
  "kimi-k2.7-code": "Kimi K2.7 Code",
  "qwen3.8-max": "Qwen3.8 Max",
  "qwen3.8-flash": "Qwen3.8 Flash",
  "qwen3.7-plus": "Qwen3.7 Plus",
  "minimax-m3.1-flash": "MiniMax M3.1 Flash",
  "minimax-m3": "MiniMax M3",
  "grok-4.7": "Grok 4.7",
  "gpt-6-luna": "GPT 6 Luna",
  "gpt-5.6-luna": "GPT 5.6 Luna",
  "claude-haiku-5-5": "Claude Haiku 5.5",
  "gemini-4-argon": "Gemini 4 Argon",
  "hy4": "Hy4",
  "hy4-preview": "Hy4 preview",
  "hy3": "Hy3",
  "longcat-2.0": "LongCat-2.0",
  "step-5-preview": "Step 5 Preview",
  "muse-spark-1.3-contributor": "Muse Spark 1.3 Contributor",
  "muse-spark-1.2-contributor": "Muse Spark 1.2 Contributor",
  "deepseek-flash": "DeepSeek Flash",
  "deepseek-reasoner": "DeepSeek Reasoner",
  "deepseek-chat": "DeepSeek Chat",
}

export const GO_FOCUS_MODELS = ["deepseek-v4.1-flash", "glm-5.3-flash", "mimo-v2.6-flash"]

const CURRENCY_SYMBOLS: Record<string, string> = {
  CNY: "¥",
  USD: "$",
  EUR: "€",
  JPY: "¥",
  GBP: "£",
}

export function currencySymbol(currency: string | null | undefined): string {
  const key = String(currency || "").toUpperCase()
  return CURRENCY_SYMBOLS[key] ?? String(currency || "")
}

export function clampTz(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.round(Math.min(14 * 3600, Math.max(-12 * 3600, n)) / 900) * 900
}

export function pad2(value: number): string {
  return String(value).padStart(2, "0")
}

export function localDateParts(ms: number, tzSec: number) {
  const shifted = new Date(Number(ms) + clampTz(tzSec) * 1000)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  }
}

export function dateKeyFromMs(ms: number, tzSec: number): string {
  const p = localDateParts(ms, tzSec)
  return `${p.year}-${pad2(p.month + 1)}-${pad2(p.day)}`
}

export function dateKeyFromSec(sec: number, tzSec: number): string {
  return dateKeyFromMs(Number(sec) * 1000, tzSec)
}

export function startOfLocalDaySec(ms: number, tzSec: number): number {
  const p = localDateParts(ms, tzSec)
  return Date.UTC(p.year, p.month, p.day) / 1000 - clampTz(tzSec)
}

export function parseDateKey(value: unknown) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""))
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const stamp = Date.UTC(year, month - 1, day)
  const check = new Date(stamp)
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null
  }
  return { year, month, day }
}

export function dateKeyToSec(value: unknown, tzSec: number): number | null {
  const p = parseDateKey(value)
  if (p === null) return null
  return Date.UTC(p.year, p.month - 1, p.day) / 1000 - clampTz(tzSec)
}

export function resolveRange(
  input: { preset?: string; from?: string; to?: string } | null | undefined,
  tzSec: number,
  nowMs = Date.now(),
) {
  const tz = clampTz(tzSec)
  const todayStart = startOfLocalDaySec(nowMs, tz)
  const todayEnd = todayStart + 86400
  const preset = String(input?.preset ?? "7d")

  if (preset === "custom") {
    const fromSec = dateKeyToSec(input?.from, tz)
    const toSec = dateKeyToSec(input?.to, tz)
    if (fromSec === null || toSec === null) return { ok: false as const, error: "自定义日期格式应为 YYYY-MM-DD" }
    let start = Math.min(fromSec, toSec)
    let end = Math.max(fromSec, toSec) + 86400
    if (start < todayStart - 180 * 86400) start = todayStart - 180 * 86400
    if (end > todayEnd) end = todayEnd
    if (end <= start) return { ok: false as const, error: "自定义日期范围为空" }
    const days = Math.round((end - start) / 86400)
    return {
      ok: true as const,
      key: `custom:${dateKeyFromSec(start, tz)}:${dateKeyFromSec(end - 86400, tz)}:${tz}`,
      label: "自定义",
      start,
      end,
      days,
      from: dateKeyFromSec(start, tz),
      to: dateKeyFromSec(end - 86400, tz),
      tzSec: tz,
    }
  }

  const presets: Record<string, number> = { "3d": 3, "7d": 7, "30d": 30 }
  const days = presets[preset]
  if (days === undefined) return { ok: false as const, error: "不支持的日期范围" }
  const start = todayStart - (days - 1) * 86400
  const end = todayEnd
  return {
    ok: true as const,
    key: `${preset}:${tz}`,
    label: preset === "3d" ? "近3天" : preset === "7d" ? "近7天" : "近30天",
    start,
    end,
    days,
    from: dateKeyFromSec(start, tz),
    to: dateKeyFromSec(end - 86400, tz),
    tzSec: tz,
  }
}

export function microToDollars(value: unknown): number {
  try {
    return Number(BigInt(String(value ?? "0"))) / 1e8
  } catch {
    const n = Number(value)
    return Number.isFinite(n) ? n / 1e8 : 0
  }
}

export function toNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export function formatMoney(value: unknown, currency = "CNY", options: { digits?: number; plain?: boolean } = {}): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return "—"
  const digits = options.digits ?? 2
  const abs = Math.abs(n)
  const body =
    abs > 0 && abs < 0.01
      ? "<0.01"
      : abs.toLocaleString("zh-CN", { minimumFractionDigits: digits, maximumFractionDigits: digits })
  const sign = n < 0 ? "-" : ""
  if (options.plain) return sign + body
  return currencySymbol(currency) + sign + body
}

export function formatTokens(value: unknown): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return "—"
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B"
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M"
  if (n >= 1e4) return (n / 1e4).toFixed(1) + "K"
  return Math.round(n).toLocaleString("zh-CN")
}

export function formatPercent(value: unknown): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return "—"
  return n >= 100 ? "100%" : n > 0 && n < 1 ? "<1%" : `${Math.round(n)}%`
}

export function formatCount(value: unknown): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return "—"
  return Math.round(n).toLocaleString("zh-CN")
}

export function shapeMeter(meter: any) {
  if (!meter) return null
  const limit = microToDollars(meter.limitMicroCents)
  const used = microToDollars(meter.usedMicroCents)
  const remaining = Math.max(0, limit - used)
  return {
    limit,
    used,
    remaining,
    over: used > limit,
    percent: limit > 0 ? Math.min(100, Math.max(0, (used / limit) * 100)) : 0,
    rawPercent: limit > 0 ? (used / limit) * 100 : 0,
    startsAt: meter.startsAt ?? null,
    resetsAt: meter.resetsAt ?? null,
  }
}

export function shapeGoStatus(payload: any) {
  const product = String(payload?.product ?? "go")
  const access = payload?.access ?? null
  const meters = access?.meters ?? null
  const monthly = shapeMeter(meters?.month)
  return {
    ok: true,
    product,
    productLabel: GO_PLAN_LABELS[product] ?? product,
    priceLabel: GO_PLAN_PRICES[product] ?? "",
    renewalProduct: payload?.renewalProduct ?? null,
    renewalCurrency: payload?.renewalCurrency ?? null,
    cancelAtPeriodEnd: payload?.cancelAtPeriodEnd === true,
    useBalance: payload?.useBalance === true,
    access: access
      ? {
          startsAt: access.startsAt ?? null,
          endsAt: access.endsAt ?? null,
          cancelAtPeriodEnd: access.cancelAtPeriodEnd === true,
          meters: {
            rolling: shapeMeter(meters?.fiveHour),
            weekly: shapeMeter(meters?.week),
            monthly,
          },
        }
      : null,
    meters: access
      ? {
          rolling: shapeMeter(meters?.fiveHour),
          weekly: shapeMeter(meters?.week),
          monthly,
        }
      : null,
    month: monthly,
    upgradePrice: payload?.upgradePrice ?? null,
    teamsUpgradePrice: payload?.teamsUpgradePrice ?? null,
  }
}

function modelLabel(id: string): string {
  return GO_MODEL_LABELS[id] ?? id
}

export function shapeGoModels(
  usagePayload: any,
  options: {
    limits?: Record<string, number>
    autoQuotas?: Record<string, number>
    manualQuotas?: Record<string, number>
    focus?: string[]
    currentModel?: { model?: string } | null
  } = {},
) {
  const autoQuotas = options.autoQuotas ?? {}
  const limits = { ...DEFAULT_GO_MODEL_LIMITS, ...autoQuotas, ...(options.limits ?? {}) }
  const manualQuotas = options.manualQuotas ?? {}
  const focus = Array.isArray(options.focus) && options.focus.length > 0 ? options.focus : GO_FOCUS_MODELS
  const currentModel = options.currentModel ?? null
  const items = Array.isArray(usagePayload?.items) ? usagePayload.items : []
  const byId = new Map<string, any>()
  for (const item of items) {
    if (String(item?.provider ?? "") !== "opencode-go") continue
    const id = String(item?.model ?? "")
    if (!id) continue
    byId.set(id, item)
  }

  const rows: any[] = []
  const seen = new Set<string>()
  const pushRow = (id: string, item: any) => {
    const limit = Number(limits[id])
    const used = microToDollars(item?.totalCostMicroCents)
    const hasLimit = Number.isFinite(limit) && limit > 0
    rows.push({
      id,
      label: modelLabel(id),
      limit: hasLimit ? limit : null,
      used,
      remaining: hasLimit ? Math.max(0, limit - used) : null,
      over: hasLimit ? used > limit : false,
      percent: hasLimit ? Math.min(100, Math.max(0, (used / limit) * 100)) : null,
      requests: toNumber(item?.totalRequests),
      tokens:
        toNumber(item?.totalInputTokens) +
        toNumber(item?.totalOutputTokens) +
        toNumber(item?.totalCacheReadTokens) +
        toNumber(item?.totalCacheWrite5mTokens) +
        toNumber(item?.totalCacheWrite1hTokens),
      current: Boolean(currentModel && currentModel.model === id),
      configured: hasLimit,
      known: Boolean(item),
      source: manualQuotas[id] !== undefined ? "manual" : autoQuotas[id] !== undefined ? "auto" : "default",
    })
  }

  for (const id of focus) {
    pushRow(id, byId.get(id))
    seen.add(id)
  }
  for (const [id, item] of byId.entries()) {
    if (seen.has(id)) continue
    pushRow(id, item)
  }

  return {
    ok: true,
    rows,
    configured: rows.filter((row) => row.configured),
    unconfigured: rows.filter((row) => !row.configured),
    current: rows.find((row) => row.current) ?? null,
    totalUsed: rows.reduce((sum, row) => sum + row.used, 0),
  }
}

/**
 * Go exposes one shared monthly allowance; each model's list-price cap is a
 * scale on that same pool. When one model dominates the period, infer its real
 * cap and snap to a quota OpenCode actually offered. Manual overrides win.
 */
export function calibrateGoModels(models: any, status: any, options: { autoCalibrate?: boolean; periodCost?: number | null } = {}) {
  const month = status?.month ?? null
  const rows = Array.isArray(models?.rows) ? models.rows : []
  if (!month || !(month.limit > 0) || !(month.used > 0) || rows.length === 0) {
    return { ...models, calibration: { applied: false, reason: "no-pool" } }
  }
  if (options.autoCalibrate === false) {
    return { ...models, calibration: { applied: false, reason: "disabled" } }
  }

  const totalListCost = rows.reduce((sum: number, row: any) => sum + Math.max(0, Number(row.used) || 0), 0)
  if (!(totalListCost > 0)) {
    return { ...models, calibration: { applied: false, reason: "no-usage" } }
  }

  let dominant: any = null
  for (const row of rows) {
    if (row.source === "manual") continue
    if (!(row.used > 0)) continue
    if (dominant === null || row.used > dominant.used) dominant = row
  }
  if (dominant === null) {
    return { ...models, calibration: { applied: false, reason: "manual-only" } }
  }

  const share = dominant.used / totalListCost
  const periodCost = Number(options.periodCost)
  const periodScale = Number.isFinite(periodCost) && periodCost > 0 ? periodCost / totalListCost : 1
  const dominantPeriodUsed = dominant.used * periodScale
  const rawEstimate = (dominantPeriodUsed * month.limit) / month.used

  if (share < 0.7) {
    return { ...models, calibration: { applied: false, reason: "usage-spread", share, rawEstimate } }
  }

  const candidates = [
    ...new Set(
      [
        ...GO_QUOTA_CANDIDATES,
        ...rows.map((row: any) => Number(row.limit)).filter((value: number) => Number.isFinite(value) && value > 0),
        Number(DEFAULT_GO_MODEL_LIMITS[dominant.id]),
        Number(dominant.limit),
      ].filter((value) => Number.isFinite(value) && value > 0),
    ),
  ].sort((a, b) => a - b)

  const otherExpected = rows
    .filter((row: any) => row !== dominant && row.limit > 0 && row.used > 0)
    .reduce((sum: number, row: any) => sum + (row.used * periodScale * month.limit) / row.limit, 0)

  let best: any = null
  for (const candidate of candidates) {
    const expected = (dominantPeriodUsed * month.limit) / candidate + otherExpected
    const error = Math.abs(expected - month.used)
    const distance = Math.abs(candidate - (Number(dominant.limit) || candidate))
    if (best === null || error < best.error - 1e-9 || (Math.abs(error - best.error) < 1e-9 && distance < best.distance)) {
      best = { candidate, expected, error, distance }
    }
  }
  if (best === null) {
    return { ...models, calibration: { applied: false, reason: "no-candidate", rawEstimate } }
  }

  const errorRatio = best.error / month.used
  const confidence = errorRatio < 0.06 ? "high" : errorRatio < 0.15 ? "medium" : "low"
  if (confidence === "low") {
    return {
      ...models,
      calibration: { applied: false, reason: "low-confidence", share, rawEstimate, candidate: best.candidate, errorRatio },
    }
  }

  const calibrated = {
    ...dominant,
    limit: best.candidate,
    remaining: Math.max(0, best.candidate - dominant.used),
    over: dominant.used > best.candidate,
    percent: Math.min(100, Math.max(0, (dominant.used / best.candidate) * 100)),
    source: "auto",
    calibrated: true,
    calibration: {
      rawEstimate,
      candidate: best.candidate,
      expectedPlan: best.expected,
      error: best.error,
      errorRatio,
      confidence,
      share,
      periodScale,
    },
  }
  const calibratedRows = rows.map((row: any) => (row === dominant ? calibrated : row))
  return {
    ...models,
    rows: calibratedRows,
    configured: calibratedRows.filter((row: any) => row.configured),
    unconfigured: calibratedRows.filter((row: any) => !row.configured),
    current: calibratedRows.find((row: any) => row.current) ?? null,
    totalUsed: calibratedRows.reduce((sum: number, row: any) => sum + row.used, 0),
    calibration: {
      applied: true,
      model: dominant.id,
      rawEstimate,
      candidate: best.candidate,
      expectedPlan: best.expected,
      error: best.error,
      errorRatio,
      confidence,
      share,
      periodScale,
    },
  }
}

export function shapeDeepSeekBalance(payload: any) {
  const infos = (Array.isArray(payload?.balance_infos) ? payload.balance_infos : []).map((info: any) => ({
    currency: String(info?.currency ?? "CNY").toUpperCase(),
    total: toNumber(info?.total_balance),
    granted: toNumber(info?.granted_balance),
    toppedUp: toNumber(info?.topped_up_balance),
    totalRaw: String(info?.total_balance ?? ""),
    grantedRaw: String(info?.granted_balance ?? ""),
    toppedUpRaw: String(info?.topped_up_balance ?? ""),
  }))
  const primary = infos[0] ?? null
  return {
    ok: true,
    isAvailable: payload?.is_available === true,
    infos,
    primary,
  }
}

function isoFromEpoch(value: unknown): string | null {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  const ms = n > 1e12 ? n : n * 1000
  return new Date(ms).toISOString()
}

export function shapeGlmBalance(payload: any) {
  const body = payload && typeof payload === "object" ? payload : {}
  if (body.success === false || (body.code !== undefined && toNumber(body.code) !== 200)) {
    throw new Error(body.msg ? String(body.msg) : "GLM 余额查询失败")
  }
  const data = body.data && typeof body.data === "object" ? body.data : body
  const available = toNumber(data.availableBalance ?? data.balance)
  return {
    ok: true,
    currency: "CNY",
    available,
    balance: toNumber(data.balance),
    recharge: toNumber(data.rechargeAmount),
    gift: toNumber(data.giveAmount),
    spent: toNumber(data.totalSpendAmount),
    frozen: toNumber(data.frozenBalance),
    today: data.todaySpendAmount === null || data.todaySpendAmount === undefined ? null : toNumber(data.todaySpendAmount),
    isAvailable: available > 0,
  }
}

export function shapeGlmQuota(payload: any) {
  const body = payload && typeof payload === "object" ? payload : {}
  if (body.success === false || (body.code !== undefined && toNumber(body.code) !== 200)) {
    return {
      ok: false,
      hasPlan: false,
      windows: [],
      error: body.msg ? String(body.msg) : "未开通 Coding Plan",
    }
  }
  const data = body.data && typeof body.data === "object" ? body.data : {}
  const limits = Array.isArray(data.limits) ? data.limits : []
  const windows: any[] = []
  let search: any = null
  for (const limit of limits) {
    if (!limit || typeof limit !== "object") continue
    const type = String(limit.type ?? "")
    if (type === "TIME_LIMIT") {
      const used = toNumber(limit.currentValue)
      const total = toNumber(limit.usage)
      search = {
        used,
        limit: total,
        remaining: limit.remaining !== undefined ? toNumber(limit.remaining) : Math.max(0, total - used),
        percent: limit.percentage !== undefined ? toNumber(limit.percentage) : total > 0 ? (used / total) * 100 : 0,
        resetAt: isoFromEpoch(limit.nextResetTime),
      }
      continue
    }
    if (type !== "TOKENS_LIMIT" && type !== "CREDIT_LIMIT") continue
    const unit = toNumber(limit.unit)
    const number = toNumber(limit.number)
    const used = toNumber(limit.currentValue)
    const total = toNumber(limit.usage)
    const percent = limit.percentage !== undefined ? toNumber(limit.percentage) : total > 0 ? (used / total) * 100 : 0
    windows.push({
      label: unit === 3 ? `${number > 0 ? number : 5} 小时窗口` : unit === 6 ? "本周窗口" : "额度窗口",
      used,
      limit: total,
      remaining: limit.remaining !== undefined ? toNumber(limit.remaining) : Math.max(0, total - used),
      percent: Math.min(100, Math.max(0, percent)),
      resetAt: isoFromEpoch(limit.nextResetTime),
    })
  }
  windows.sort((a, b) => {
    const rank = (label: string) => (label.includes("小时") ? 0 : label.includes("本周") ? 1 : 2)
    return rank(a.label) - rank(b.label)
  })
  return {
    ok: true,
    hasPlan: windows.length > 0,
    planName: data.planName ? String(data.planName) : null,
    windows,
    search,
  }
}

export function shapeMimoBalance(payload: any) {
  const body = payload && typeof payload === "object" ? payload : {}
  const info = Array.isArray(body.balance_infos) ? body.balance_infos[0] : null
  if (!info || typeof info !== "object") throw new Error("MiMo 余额响应缺少 balance_infos")
  return {
    ok: true,
    isAvailable: body.is_available === true,
    currency: info.currency ? String(info.currency) : "CNY",
    cash: toNumber(info.cash_balance),
    gift: toNumber(info.gift_balance),
    frozen: toNumber(info.frozen_balance),
    creditLimit: toNumber(info.credit_limit),
    creditAvailable: toNumber(info.credit_available),
    total: toNumber(info.total_available),
  }
}

export function shapeMimoPlan(payload: any) {
  const body = payload && typeof payload === "object" ? payload : {}
  const quota = body.quota && typeof body.quota === "object" ? body.quota : null
  if (!quota) throw new Error("MiMo Token Plan 响应缺少 quota")
  const total = toNumber(quota.total_credits)
  const used = toNumber(quota.used_credits)
  const remaining = quota.remaining_credits !== undefined ? toNumber(quota.remaining_credits) : Math.max(0, total - used)
  const period = body.period && typeof body.period === "object" ? body.period : {}
  return {
    ok: true,
    planCode: body.plan_code ? String(body.plan_code) : null,
    startAt: period.start_at ? String(period.start_at) : null,
    endAt: period.end_at ? String(period.end_at) : null,
    total,
    used,
    remaining,
    percent: total > 0 ? Math.min(100, Math.max(0, (used / total) * 100)) : 0,
    autoRenew: body.auto_renew === true,
  }
}

export function shapeMimoUsage(payload: any) {
  const body = payload && typeof payload === "object" ? payload : {}
  const rows = Array.isArray(body.data) ? body.data : []
  const byCurrency: Record<string, number> = {}
  const dailyMap = new Map<string, any>()
  let tokens = 0
  let requests = 0
  for (const row of rows) {
    if (!row || typeof row !== "object") continue
    const currency = row.currency ? String(row.currency) : "CNY"
    const cost = toNumber(row.consumed_amount)
    const rowTokens = toNumber(row.total_tokens)
    const rowRequests = toNumber(row.request_count)
    byCurrency[currency] = (byCurrency[currency] ?? 0) + cost
    tokens += rowTokens
    requests += rowRequests
    const date = row.date ? String(row.date) : ""
    if (date !== "") {
      const day = dailyMap.get(date) ?? { date, cost: 0, costByCurrency: {}, tokens: 0, requests: 0 }
      day.cost += cost
      day.costByCurrency[currency] = (day.costByCurrency[currency] ?? 0) + cost
      day.tokens += rowTokens
      day.requests += rowRequests
      dailyMap.set(date, day)
    }
  }
  const currency = Object.keys(byCurrency)[0] ?? "CNY"
  return {
    ok: true,
    currency,
    cost: byCurrency[currency] ?? 0,
    costByCurrency: byCurrency,
    tokens,
    requests,
    rows: rows.length,
    daily: [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
  }
}

export function shapeGlmHistory(history: any, range: any) {
  const days = Math.max(1, Math.min(180, Number(range?.days) || 7))
  const start = Number(range?.start) || 0
  const tz = Number(range?.tzSec) || 0
  const map = history?.days && typeof history.days === "object" ? history.days : {}
  const daily: any[] = []
  let previousSpent: number | null = null
  for (let index = 0; index < days; index += 1) {
    const date = dateKeyFromSec(start + index * 86400, tz)
    const stored = map[date]
    const spentValue = stored && typeof stored === "object" ? stored.spent : stored
    const firstValue = stored && typeof stored === "object" ? stored.firstSpent : undefined
    const spent = Number.isFinite(Number(spentValue)) ? Number(spentValue) : null
    const baseline =
      previousSpent !== null ? previousSpent : Number.isFinite(Number(firstValue)) ? Number(firstValue) : null
    let cost = 0
    if (spent !== null && baseline !== null && baseline !== undefined) cost = Math.max(0, spent - baseline)
    if (spent !== null) previousSpent = spent
    daily.push({ date, cost, costByCurrency: { CNY: cost }, tokens: 0, requests: 0 })
  }
  const total = daily.reduce((sum, row) => sum + row.cost, 0)
  return {
    ok: true,
    currency: "CNY",
    days,
    daily,
    cost: total,
    costByCurrency: { CNY: total },
    tokens: 0,
    requests: 0,
    sampling: true,
  }
}

export function computeBadge(overview: any) {
  const ds = overview?.deepseek ?? {}
  const go = overview?.go ?? {}
  const balanceInfo = ds?.balance?.primary ?? null
  const hasDeepSeek = ds?.balance?.ok === true
  const deepseekBalance = balanceInfo ? balanceInfo.total : null
  const deepseekCurrency = balanceInfo?.currency ?? "CNY"
  const deepseekAvailable = ds?.balance?.ok === true ? ds.balance.isAvailable : deepseekBalance !== null && deepseekBalance > 0
  const goMonth = go?.status?.month ?? null
  const hasGo = go?.status?.ok === true
  const goPercent = goMonth ? goMonth.percent : null
  const goRemaining = goMonth ? goMonth.remaining : null
  const deepseekCritical =
    ds?.balance?.ok === true && (!deepseekAvailable || (deepseekBalance !== null && deepseekBalance <= 0))
  const goCritical = goPercent !== null && goPercent >= 90
  const goWarn = goPercent !== null && goPercent >= 70

  return {
    deepseek: {
      configured: hasDeepSeek,
      ok: ds?.balance?.ok === true,
      currency: deepseekCurrency,
      balance: deepseekBalance,
      available: deepseekAvailable,
      error: ds?.balance?.error ?? (ds?.balance?.ok === false ? "余额读取失败" : null),
    },
    go: {
      configured: hasGo,
      ok: hasGo,
      product: go?.status?.product ?? null,
      productLabel: go?.status?.productLabel ?? null,
      percent: goPercent,
      remaining: goRemaining,
      limit: goMonth?.limit ?? null,
      error: go?.status?.error ?? (go?.status?.ok === false ? "Go 额度读取失败" : null),
    },
    critical: deepseekCritical || goCritical,
    warn: goWarn,
    deepseekCritical,
    goCritical,
    goWarn,
  }
}

export function safeErrorMessage(error: unknown): string {
  if (error === null || error === undefined) return ""
  if (typeof error === "string") return error
  const message = typeof (error as Error).message === "string" ? (error as Error).message : String(error)
  return message.replace(/\s+/g, " ").trim().slice(0, 240)
}
