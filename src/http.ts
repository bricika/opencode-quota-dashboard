/**
 * HTTP helpers shared by every provider.
 *
 * Nothing here logs or returns a credential. Callers pass the key in and get
 * shaped payloads back.
 */

export class QuotaError extends Error {
  readonly code: string
  readonly status: number

  constructor(message: string, code = "error", status = 0) {
    super(message)
    this.name = "QuotaError"
    this.code = code
    this.status = status
  }
}

export interface FetchOptions {
  readonly method?: string
  readonly headers?: Record<string, string>
  readonly timeoutMs?: number
  readonly signal?: AbortSignal
}

function httpMessage(status: number, detail: string): string {
  if (status === 401) return "认证失败（HTTP 401）"
  if (status === 403) return "无权访问（HTTP 403）"
  if (status === 404) return "接口不存在（HTTP 404）"
  if (status === 429) return "请求过于频繁（HTTP 429）"
  if (status >= 500) return `上游服务错误（HTTP ${status}）`
  const extra = detail.trim() === "" ? "" : `：${detail.trim().slice(0, 120)}`
  return `请求失败（HTTP ${status}）${extra}`
}

function detailFrom(payload: unknown, text: string): string {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>
    if (Array.isArray(record.detail) && record.detail.length > 0) {
      const first = record.detail[0]
      if (typeof first === "string") return first
      if (first && typeof first === "object") {
        const item = first as Record<string, unknown>
        const loc = Array.isArray(item.loc) ? item.loc.join(".") : ""
        return [loc, item.msg].filter(Boolean).join(" ")
      }
    }
    if (typeof record.detail === "string") return record.detail
    if (typeof record.error === "string") return record.error
    if (record.error && typeof record.error === "object") {
      const error = record.error as Record<string, unknown>
      if (typeof error.message === "string") return error.message
    }
    if (typeof record.msg === "string") return record.msg
    if (typeof record.message === "string") return record.message
  }
  return typeof text === "string" ? text.slice(0, 160) : ""
}

export async function fetchJson<T = unknown>(url: string, options: FetchOptions = {}): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000)
  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal

  try {
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: { accept: "application/json", ...options.headers },
      signal,
    })
    const text = await response.text()
    let payload: unknown = null
    try {
      payload = text ? JSON.parse(text) : null
    } catch {
      payload = null
    }

    if (!response.ok) {
      throw new QuotaError(httpMessage(response.status, detailFrom(payload, text)), "http", response.status)
    }
    if (payload === null) {
      throw new QuotaError("响应不是有效 JSON", "protocol", response.status)
    }
    return payload as T
  } catch (error) {
    if (error instanceof QuotaError) throw error
    const name = (error as { name?: string } | null)?.name
    if (name === "AbortError") throw new QuotaError("请求超时", "timeout")
    throw new QuotaError((error as Error)?.message || "网络请求失败", "network")
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Credential.Value is a union: `{ type: "key", key }`, OAuth, or external.
 * The quota APIs only understand API keys, so return null for the rest.
 */
export function extractKey(value: unknown): string | null {
  if (typeof value === "string" && value.trim() !== "") return value.trim()
  if (!value || typeof value !== "object") return null

  const record = value as Record<string, unknown>
  if (record.type === "key" && typeof record.key === "string" && record.key.trim() !== "") {
    return record.key.trim()
  }
  if (record.type === "oauth" || record.type === "external") return null

  for (const field of ["key", "value", "token", "secret", "apiKey", "access"]) {
    const candidate = record[field]
    if (typeof candidate === "string" && candidate.trim() !== "") return candidate.trim()
  }
  return null
}

export function errorView(error: unknown, fallbackCode = "error") {
  if (error instanceof QuotaError) {
    return { ok: false as const, code: error.code, status: error.status, error: error.message }
  }
  return { ok: false as const, code: fallbackCode, status: 0, error: (error as Error)?.message || "未知错误" }
}
