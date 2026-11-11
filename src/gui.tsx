import {
  Command,
  Panel,
  Plugin,
  Slot,
  usePlugin,
  type PanelTab,
} from "@opencode/plugin/gui"
import { For, Match, Show, Switch, createEffect, createSignal, onCleanup, onMount, type JSX } from "solid-js"

import {
  DEFAULT_GO_MODEL_LIMITS,
  GO_FOCUS_MODELS,
  GO_MODEL_LABELS,
  formatMoney,
  formatPercent,
  formatTokens,
} from "./data.js"
import { QuotaRpc } from "./rpc.js"

/* ------------------------------------------------------------------------- */
/* Types                                                                      */
/* ------------------------------------------------------------------------- */

type RangePreset = "3d" | "7d" | "30d"
type TabKey = "overview" | "go" | "deepseek" | "glm" | "mimo" | "settings"
type ChartMode = "cost" | "tokens"

type PublicSettings = {
  refreshMinutes: number
  badgeMode: "both" | "deepseek" | "go"
  floatingCard: boolean
  deepseek: boolean
  go: boolean
  glm: boolean
  mimo: boolean
  autoCalibrate: boolean
  modelQuotas: Record<string, number>
  deepseekBaseUrl: string
  glmBaseUrl: string
  mimoKeyConfigured: boolean
  mimoTokenPlanKeyConfigured: boolean
}

type Credential = {
  configured: boolean
  source: string | null
  label: string | null
}

type Snapshot = {
  ok: boolean
  build: string
  updatedAt: string
  range: any
  settings: PublicSettings
  credentials: Record<string, Credential>
  deepseek: any
  go: any
  glm: any
  mimo: any
  badge: any
}

type BadgeResult = {
  ok: boolean
  updatedAt: string
  settings?: PublicSettings
  deepseek: any
  go: any
  badge: any
}

/* ------------------------------------------------------------------------- */
/* Palette and small components                                               */
/* ------------------------------------------------------------------------- */

function palette(dark: boolean) {
  return dark
    ? {
        text: "#e8e8e8",
        muted: "#9a9a9a",
        faint: "rgba(255,255,255,.07)",
        border: "rgba(255,255,255,.14)",
        card: "rgba(255,255,255,.04)",
        accent: "#7fb7ff",
        danger: "#ff8a8a",
        warn: "#e6b450",
        ok: "#7fd49b",
        bar: "#8ab4f8",
      }
    : {
        text: "#1f2328",
        muted: "#6a737d",
        faint: "rgba(0,0,0,.04)",
        border: "rgba(0,0,0,.12)",
        card: "rgba(0,0,0,.025)",
        accent: "#005093",
        danger: "#c62828",
        warn: "#a46600",
        ok: "#1b7f3a",
        bar: "#3b6ea5",
      }
}

function usePalette() {
  const ctx = usePlugin()
  return () => palette(ctx.appearance.mode() === "dark")
}

function Card(props: { title?: string; hint?: string; tone?: "normal" | "danger" | "warn"; children: JSX.Element }) {
  const colors = usePalette()
  const border = () => (props.tone === "danger" ? colors().danger : props.tone === "warn" ? colors().warn : colors().border)
  return (
    <div
      style={{
        border: `1px solid ${border()}`,
        "border-radius": "10px",
        padding: "10px 12px",
        background: colors().card,
        "min-width": "0",
      }}
    >
      <Show when={props.title}>
        <div style={{ "font-size": "11px", color: colors().muted, "margin-bottom": "6px" }}>{props.title}</div>
      </Show>
      {props.children}
      <Show when={props.hint}>
        <div style={{ "font-size": "11px", color: colors().muted, "margin-top": "6px" }}>{props.hint}</div>
      </Show>
    </div>
  )
}

function Progress(props: { value: number; height?: number }) {
  const colors = usePalette()
  const tone = () => (props.value >= 90 ? colors().danger : props.value >= 70 ? colors().warn : colors().ok)
  return (
    <div
      style={{
        height: `${props.height ?? 6}px`,
        background: colors().faint,
        "border-radius": "999px",
        overflow: "hidden",
        "margin-top": "6px",
      }}
    >
      <div
        style={{
          width: `${Math.min(100, Math.max(0, Number(props.value) || 0))}%`,
          height: "100%",
          background: tone(),
          "border-radius": "999px",
        }}
      />
    </div>
  )
}

function Metric(props: { label: string; value: JSX.Element | string; hint?: JSX.Element | string }) {
  const colors = usePalette()
  return (
    <div style={{ display: "flex", "flex-direction": "column", gap: "2px", "min-width": "0" }}>
      <span style={{ "font-size": "11px", color: colors().muted }}>{props.label}</span>
      <span style={{ "font-size": "20px", "font-weight": 600, "line-height": "1.2", "overflow-wrap": "anywhere" }}>
        {props.value}
      </span>
      <Show when={props.hint}>
        <span style={{ "font-size": "11px", color: colors().muted }}>{props.hint}</span>
      </Show>
    </div>
  )
}

function StatusPill(props: { ok: boolean; text: string }) {
  const colors = usePalette()
  const color = () => (props.ok ? colors().ok : colors().danger)
  return (
    <span
      style={{
        display: "inline-flex",
        "align-items": "center",
        gap: "4px",
        padding: "1px 6px",
        "border-radius": "999px",
        "font-size": "10px",
        color: color(),
        border: `1px solid ${color()}`,
        "white-space": "nowrap",
      }}
    >
      {props.text}
    </span>
  )
}

function Row(props: { label: string; children: JSX.Element }) {
  const colors = usePalette()
  return (
    <div
      style={{
        display: "flex",
        "justify-content": "space-between",
        gap: "10px",
        padding: "5px 0",
        "border-bottom": `1px solid ${colors().border}`,
        "font-size": "12px",
      }}
    >
      <span style={{ color: colors().muted }}>{props.label}</span>
      <span style={{ color: colors().text, "text-align": "right" }}>{props.children}</span>
    </div>
  )
}

function Notice(props: { kind: "info" | "warn" | "danger"; children: JSX.Element }) {
  const colors = usePalette()
  const color = () => (props.kind === "danger" ? colors().danger : props.kind === "warn" ? colors().warn : colors().accent)
  return (
    <div
      style={{
        border: `1px solid ${color()}`,
        "border-radius": "8px",
        padding: "8px 10px",
        "font-size": "12px",
        color: colors().text,
        background: colors().faint,
        "line-height": "1.5",
      }}
    >
      {props.children}
    </div>
  )
}

function ConsoleLink(props: { url?: string; label?: string }) {
  const ctx = usePlugin()
  return (
    <Show when={props.url}>
      <ctx.ui.Button
        size="small"
        variant="ghost"
        icon="square-arrow-top-right"
        onClick={() => void ctx.system.openExternal(props.url!)}
      >
        {props.label ?? "打开控制台"}
      </ctx.ui.Button>
    </Show>
  )
}

/* ------------------------------------------------------------------------- */
/* Chart                                                                      */
/* ------------------------------------------------------------------------- */

function Chart(props: { daily: any[]; mode: ChartMode; currency: string }) {
  const colors = usePalette()
  const value = (row: any) => Number(props.mode === "cost" ? row?.cost : row?.tokens) || 0
  const max = () => Math.max(1, ...props.daily.map(value))
  const total = () => props.daily.reduce((sum, row) => sum + value(row), 0)
  const format = (n: number) =>
    props.mode === "cost" ? formatMoney(n, props.currency) : formatTokens(n)

  return (
    <div>
      <div style={{ display: "flex", "align-items": "flex-end", gap: "2px", height: "110px", padding: "4px 0" }}>
        <For each={props.daily}>
          {(row) => {
            const current = value(row)
            const height = current > 0 ? Math.max(3, (current / max()) * 100) : 0
            return (
              <div
                title={`${row.date} · ${format(current)}`}
                style={{
                  flex: 1,
                  height: `${height}%`,
                  background: colors().bar,
                  opacity: current > 0 ? 0.85 : 0.18,
                  "border-radius": "2px 2px 0 0",
                  "min-width": "2px",
                }}
              />
            )
          }}
        </For>
      </div>
      <div style={{ display: "flex", "justify-content": "space-between", "font-size": "10px", color: colors().muted }}>
        <span>{props.daily[0]?.date ?? ""}</span>
        <span>{props.daily[props.daily.length - 1]?.date ?? ""}</span>
      </div>
      <div style={{ display: "flex", gap: "14px", "font-size": "11px", color: colors().muted, "margin-top": "6px" }}>
        <span>合计 {format(total())}</span>
        <span>日均 {format(total() / Math.max(1, props.daily.length))}</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------- */
/* Tabs                                                                       */
/* ------------------------------------------------------------------------- */

function OverviewTab(props: { snapshot: Snapshot; onOpenSettings: () => void }) {
  const ctx = usePlugin()
  const colors = usePalette()
  const snapshot = () => props.snapshot
  const ds = () => snapshot().deepseek
  const go = () => snapshot().go
  const glm = () => snapshot().glm
  const mimo = () => snapshot().mimo
  const badge = () => snapshot().badge

  const dsBalance = () => ds()?.balance?.primary ?? null
  const dsText = () => (dsBalance() ? formatMoney(dsBalance().total, dsBalance().currency) : "—")
  const goMonth = () => go()?.status?.month ?? null
  const glmBalance = () => glm()?.balance ?? null
  const mimoBalance = () => mimo()?.balance ?? null

  return (
    <div style={{ display: "flex", "flex-direction": "column", gap: "10px" }}>
      <Show when={badge()?.critical}>
        <Notice kind="danger">
          有额度需要关注：{badge()?.deepseekCritical ? "DeepSeek 余额不足或不可用；" : ""}
          {badge()?.goCritical ? "Go 本月用量已超过 90%；" : ""}
        </Notice>
      </Show>
      <Show when={badge()?.warn && !badge()?.critical}>
        <Notice kind="warn">Go 本月用量已超过 70%，注意剩余额度。</Notice>
      </Show>

      <div style={{ display: "grid", "grid-template-columns": "repeat(auto-fit, minmax(150px, 1fr))", gap: "8px" }}>
        <Card title="DeepSeek 余额" tone={ds()?.ok && dsBalance() && dsBalance().total <= 0 ? "danger" : "normal"}>
          <Metric
            label=""
            value={dsText()}
            hint={ds()?.ok ? (ds()?.balance?.isAvailable ? "可用" : "不可用") : ds()?.error ?? "未配置"}
          />
        </Card>
        <Card title="OpenCode Go" tone={badge()?.goCritical ? "danger" : badge()?.goWarn ? "warn" : "normal"}>
          <Metric
            label=""
            value={goMonth() ? formatPercent(goMonth().percent) : "—"}
            hint={
              goMonth()
                ? `已用 $${goMonth().used.toFixed(2)} / $${goMonth().limit.toFixed(0)}`
                : go()?.error ?? "未配置"
            }
          />
        </Card>
        <Card title="GLM / Z.AI" tone={glm()?.ok && glmBalance()?.available <= 0 ? "danger" : "normal"}>
          <Metric
            label=""
            value={glm()?.ok ? formatMoney(glmBalance()?.available, glmBalance()?.currency ?? "CNY") : "—"}
            hint={glm()?.ok ? `累计消费 ${formatMoney(glmBalance()?.spent, "CNY")}` : glm()?.error ?? "未配置"}
          />
        </Card>
        <Card title="MiMo" tone={mimo()?.configured ? "normal" : "normal"}>
          <Metric
            label=""
            value={mimo()?.ok ? formatMoney(mimoBalance()?.total, mimoBalance()?.currency ?? "CNY") : "—"}
            hint={mimo()?.configured ? (mimo()?.ok ? "可用" : mimo()?.error ?? "读取失败") : "未连接 Xiaomi"}
          />
        </Card>
      </div>

      <div>
        <div style={{ "font-size": "12px", "font-weight": 600, "margin-bottom": "4px" }}>凭据来源</div>
        <Row label="DeepSeek">{sourceText(snapshot().credentials.deepseek)}</Row>
        <Row label="OpenCode Go">{sourceText(snapshot().credentials.go)}</Row>
        <Row label="GLM / Z.AI">{sourceText(snapshot().credentials.glm)}</Row>
        <Row label="MiMo">{sourceText(snapshot().credentials.mimo)}</Row>
      </div>

      <div style={{ display: "flex", gap: "6px", "flex-wrap": "wrap" }}>
        <ConsoleLink url={snapshot().deepseek?.consoleUrl} label="DeepSeek 控制台" />
        <ConsoleLink url={snapshot().go?.consoleUrl} label="Go 控制台" />
        <ConsoleLink url={snapshot().glm?.consoleUrl} label="GLM 控制台" />
        <ConsoleLink url={snapshot().mimo?.consoleUrl} label="MiMo 控制台" />
        <ctx.ui.Button size="small" variant="ghost" icon="settings-gear" onClick={props.onOpenSettings}>
          设置
        </ctx.ui.Button>
      </div>
      <div style={{ "font-size": "10px", color: colors().muted }}>
        构建 {snapshot().build} · 更新于 {new Date(snapshot().updatedAt).toLocaleTimeString()}
      </div>
    </div>
  )
}

function sourceText(credential: Credential | undefined): string {
  if (!credential?.configured) return "未配置"
  if (credential.source?.startsWith("integration:")) return `OpenCode 凭据${credential.label ? `（${credential.label}）` : ""}`
  if (credential.source?.startsWith("env:")) return `环境变量 ${credential.source.slice(4)}`
  if (credential.source === "settings") return "插件设置"
  return credential.source ?? "已配置"
}

function GoTab(props: { go: any }) {
  const colors = usePalette()
  const status = () => props.go?.status ?? null
  const month = () => status()?.month ?? null
  const models = () => props.go?.models ?? null
  const configuredRows = () => (models()?.configured ?? []) as any[]
  const calibration = () => models()?.calibration ?? null

  return (
    <div style={{ display: "flex", "flex-direction": "column", gap: "10px" }}>
      <Show when={!props.go?.configured}>
        <Notice kind="info">未找到 OpenCode Go 凭据。请在 OpenCode 里运行 /connect，选择 OpenCode Go 并粘贴 key。</Notice>
      </Show>
      <Show when={props.go?.configured && props.go?.error}>
        <Notice kind="danger">{props.go.error}</Notice>
      </Show>

      <Show when={month()}>
        <Card
          title={`本期用量池${status()?.productLabel ? ` · ${status().productLabel}` : ""}`}
          hint={status()?.priceLabel || undefined}
          tone={month()?.percent >= 90 ? "danger" : month()?.percent >= 70 ? "warn" : "normal"}
        >
          <div style={{ display: "flex", "align-items": "baseline", gap: "8px" }}>
            <span style={{ "font-size": "30px", "font-weight": 700 }}>{formatPercent(month()?.percent)}</span>
            <span style={{ "font-size": "11px", color: colors().muted }}>
              ${Number(month()?.used ?? 0).toFixed(2)} / ${Number(month()?.limit ?? 0).toFixed(0)}
            </span>
          </div>
          <Progress value={Number(month()?.percent ?? 0)} height={8} />
          <div style={{ display: "grid", "grid-template-columns": "repeat(3, 1fr)", gap: "8px", "margin-top": "10px" }}>
            <Metric label="剩余" value={`$${Number(month()?.remaining ?? 0).toFixed(2)}`} />
            <Metric
              label="重置"
              value={month()?.resetsAt ? new Date(month().resetsAt).toLocaleDateString() : "—"}
              hint={month()?.resetsAt ? new Date(month().resetsAt).toLocaleTimeString() : undefined}
            />
            <Metric label="本期开始" value={status()?.access?.startsAt ? new Date(status().access.startsAt).toLocaleDateString() : "—"} />
          </div>
        </Card>
      </Show>

      <Show when={status()?.meters}>
        <div style={{ display: "grid", "grid-template-columns": "1fr 1fr", gap: "8px" }}>
          <Card title="5 小时窗口">
            <div style={{ "font-size": "18px", "font-weight": 600 }}>{formatPercent(status().meters.rolling?.percent)}</div>
            <Progress value={Number(status().meters.rolling?.percent ?? 0)} />
            <div style={{ "font-size": "10px", color: colors().muted, "margin-top": "4px" }}>
              ${Number(status().meters.rolling?.used ?? 0).toFixed(2)} / ${Number(status().meters.rolling?.limit ?? 0).toFixed(0)}
            </div>
          </Card>
          <Card title="本周窗口">
            <div style={{ "font-size": "18px", "font-weight": 600 }}>{formatPercent(status().meters.weekly?.percent)}</div>
            <Progress value={Number(status().meters.weekly?.percent ?? 0)} />
            <div style={{ "font-size": "10px", color: colors().muted, "margin-top": "4px" }}>
              ${Number(status().meters.weekly?.used ?? 0).toFixed(2)} / ${Number(status().meters.weekly?.limit ?? 0).toFixed(0)}
            </div>
          </Card>
        </div>
      </Show>

      <Show when={configuredRows().length > 0}>
        <div>
          <div style={{ "font-size": "12px", "font-weight": 600, "margin-bottom": "4px" }}>分模型额度</div>
          <For each={configuredRows()}>
            {(row) => (
              <Card
                title={row.label}
                tone={row.over ? "danger" : row.percent >= 90 ? "danger" : row.percent >= 70 ? "warn" : "normal"}
              >
                <div style={{ display: "flex", "justify-content": "space-between", "align-items": "baseline", gap: "8px" }}>
                  <span style={{ "font-size": "18px", "font-weight": 600 }}>{row.percent === null ? "—" : formatPercent(row.percent)}</span>
                  <span style={{ display: "inline-flex", gap: "4px" }}>
                    <Show when={row.current}>
                      <StatusPill ok={true} text="当前" />
                    </Show>
                    <Show when={row.calibrated}>
                      <StatusPill ok={true} text="自动校准" />
                    </Show>
                  </span>
                </div>
                <Progress value={Number(row.percent ?? 0)} />
                <div style={{ "font-size": "10px", color: colors().muted, "margin-top": "4px" }}>
                  已用 ${Number(row.used ?? 0).toFixed(2)} / ${Number(row.limit ?? 0).toFixed(0)} · 剩余 $
                  {Number(row.remaining ?? 0).toFixed(2)} · {formatTokens(row.tokens)} tokens
                </div>
              </Card>
            )}
          </For>
        </div>
      </Show>

      <Show when={calibration()}>
        <Notice kind="info">
          <Show when={calibration().applied} fallback={`自动校准未应用：${calibration().reason ?? "未知"}`}>
            自动校准：{GO_MODEL_LABELS[calibration().model] ?? calibration().model} 本期上限约 $
            {calibration().candidate}（置信度 {calibration().confidence}，份额 {formatPercent(calibration().share * 100)}）。
            官方只给总池，分模型条是同一池的标价刻度，不能相加。
          </Show>
        </Notice>
      </Show>

      <Show when={models()?.unconfigured?.length > 0}>
        <div>
          <div style={{ "font-size": "12px", "font-weight": 600, "margin-bottom": "4px" }}>其他已用量</div>
          <For each={models().unconfigured}>
            {(row: any) => (
              <Row label={row.label}>
                ${Number(row.used ?? 0).toFixed(2)} · {formatTokens(row.tokens)} tokens
              </Row>
            )}
          </For>
        </div>
      </Show>

      <ConsoleLink url={props.go?.usageUrl} label="打开 Go 用量页" />
    </div>
  )
}

function DeepSeekTab(props: { deepseek: any }) {
  const ds = () => props.deepseek
  const balance = () => ds()?.balance ?? null
  const primary = () => balance()?.primary ?? null

  return (
    <div style={{ display: "flex", "flex-direction": "column", gap: "10px" }}>
      <Show when={!ds()?.configured}>
        <Notice kind="info">未找到 DeepSeek 凭据。请在 OpenCode 里运行 /connect，选择 DeepSeek 并粘贴 API key。</Notice>
      </Show>
      <Show when={ds()?.configured && ds()?.error}>
        <Notice kind="danger">{ds().error}</Notice>
      </Show>

      <Show when={primary()}>
        <Card
          title="API 余额"
          tone={!balance()?.isAvailable || Number(primary()?.total) <= 0 ? "danger" : "normal"}
        >
          <Metric
            label={primary()?.currency ?? "CNY"}
            value={formatMoney(primary()?.total, primary()?.currency ?? "CNY")}
            hint={balance()?.isAvailable ? "可用" : "不可用 / 余额不足"}
          />
          <div style={{ display: "grid", "grid-template-columns": "1fr 1fr", gap: "8px", "margin-top": "10px" }}>
            <Metric label="赠金" value={formatMoney(primary()?.granted, primary()?.currency ?? "CNY")} />
            <Metric label="充值余额" value={formatMoney(primary()?.toppedUp, primary()?.currency ?? "CNY")} />
          </div>
        </Card>
      </Show>

      <For each={balance()?.infos ?? []}>
        {(info: any) => (
          <Row label={info.currency}>
            {formatMoney(info.total, info.currency)} · 赠金 {formatMoney(info.granted, info.currency)} · 充值{" "}
            {formatMoney(info.toppedUp, info.currency)}
          </Row>
        )}
      </For>

      <Notice kind="info">
        OpenCode 只保存 DeepSeek 的 API Key，没有 platform.deepseek.com 的账号登录态，因此这里只显示 API 余额，不显示官网按日用量。
      </Notice>
      <ConsoleLink url={ds()?.consoleUrl} label="打开 DeepSeek 控制台" />
    </div>
  )
}

function GlmTab(props: { glm: any; mode: ChartMode; onMode: (mode: ChartMode) => void }) {
  const ctx = usePlugin()
  const colors = usePalette()
  const glm = () => props.glm
  const balance = () => glm()?.balance ?? null
  const quota = () => glm()?.quota ?? null
  const usage = () => glm()?.usage ?? null
  const daily = () => (usage()?.daily ?? []) as any[]

  return (
    <div style={{ display: "flex", "flex-direction": "column", gap: "10px" }}>
      <Show when={!glm()?.configured}>
        <Notice kind="info">未找到 GLM / Z.AI 凭据。请在 OpenCode 里运行 /connect，选择 Z.AI 并粘贴 API key。</Notice>
      </Show>
      <Show when={glm()?.configured && glm()?.error}>
        <Notice kind="danger">{glm().error}</Notice>
      </Show>

      <Show when={balance()?.ok}>
        <Card
          title="账户余额"
          tone={Number(balance()?.available) <= 0 ? "danger" : "normal"}
        >
          <Metric
            label="可用余额"
            value={formatMoney(balance()?.available, balance()?.currency ?? "CNY")}
            hint={balance()?.isAvailable ? "可用" : "余额不足"}
          />
          <div style={{ display: "grid", "grid-template-columns": "repeat(3, 1fr)", gap: "8px", "margin-top": "10px" }}>
            <Metric label="累计消费" value={formatMoney(balance()?.spent, "CNY")} />
            <Metric label="今日消费" value={balance()?.today === null ? "—" : formatMoney(balance()?.today, "CNY")} />
            <Metric label="赠金" value={formatMoney(balance()?.gift, "CNY")} />
          </div>
        </Card>
      </Show>

      <Show when={quota()?.hasPlan}>
        <div>
          <div style={{ "font-size": "12px", "font-weight": 600, "margin-bottom": "4px" }}>
            Coding Plan {quota()?.planName ? `· ${quota().planName}` : ""}
          </div>
          <For each={quota()?.windows ?? []}>
            {(window: any) => (
              <Card title={window.label}>
                <div style={{ display: "flex", "justify-content": "space-between", "align-items": "baseline" }}>
                  <span style={{ "font-size": "18px", "font-weight": 600 }}>{formatPercent(window.percent)}</span>
                  <span style={{ "font-size": "10px", color: colors().muted }}>
                    {window.used} / {window.limit}
                  </span>
                </div>
                <Progress value={Number(window.percent ?? 0)} />
                <Show when={window.resetAt}>
                  <div style={{ "font-size": "10px", color: colors().muted, "margin-top": "4px" }}>
                    重置 {new Date(window.resetAt).toLocaleString()}
                  </div>
                </Show>
              </Card>
            )}
          </For>
        </div>
      </Show>
      <Show when={glm()?.configured && quota() && !quota()?.hasPlan}>
        <Notice kind="info">未开通 GLM Coding Plan{quota()?.error ? `（${quota().error}）` : ""}；余额和本地采样用量仍然可用。</Notice>
      </Show>

      <Card title="按日用量">
        <div style={{ display: "flex", gap: "4px", "margin-bottom": "6px" }}>
          <ctx.ui.Button size="small" variant={props.mode === "cost" ? "contrast" : "ghost"} onClick={() => props.onMode("cost")}>
            金额
          </ctx.ui.Button>
          <ctx.ui.Button size="small" variant={props.mode === "tokens" ? "contrast" : "ghost"} onClick={() => props.onMode("tokens")}>
            Tokens
          </ctx.ui.Button>
        </div>
        <Chart daily={daily()} mode={props.mode} currency={usage()?.currency ?? "CNY"} />
      </Card>

      <Notice kind="info">
        GLM 官方 API 只返回累计消费，没有按日用量。图表从插件运行起按天记录累计消费差，历史会逐步积累；首次运行前几天可能不完整。
      </Notice>
      <ConsoleLink url={glm()?.consoleUrl} label="打开 GLM 控制台" />
    </div>
  )
}

function MimoTab(props: { mimo: any; mode: ChartMode; onMode: (mode: ChartMode) => void; onOpenSettings: () => void }) {
  const ctx = usePlugin()
  const colors = usePalette()
  const mimo = () => props.mimo
  const balance = () => mimo()?.balance ?? null
  const plan = () => mimo()?.plan ?? null
  const usage = () => mimo()?.usage ?? null
  const daily = () => (usage()?.daily ?? []) as any[]

  return (
    <div style={{ display: "flex", "flex-direction": "column", gap: "10px" }}>
      <Show when={!mimo()?.configured}>
        <Notice kind="warn">
          未找到 MiMo 凭据。可以在 OpenCode 里运行 /connect，选择 Xiaomi 并粘贴 key，或者
          <ctx.ui.Button size="small" variant="ghost" onClick={props.onOpenSettings}>在设置里填写 MiMo Key</ctx.ui.Button>
        </Notice>
      </Show>
      <Show when={mimo()?.configured && mimo()?.error}>
        <Notice kind="danger">{mimo().error}</Notice>
      </Show>

      <Show when={balance()?.ok}>
        <Card title="账户余额" tone={Number(balance()?.total) <= 0 ? "danger" : "normal"}>
          <Metric
            label="可用余额"
            value={formatMoney(balance()?.total, balance()?.currency ?? "CNY")}
            hint={balance()?.isAvailable ? "可用" : "余额不足"}
          />
          <div style={{ display: "grid", "grid-template-columns": "repeat(3, 1fr)", gap: "8px", "margin-top": "10px" }}>
            <Metric label="现金" value={formatMoney(balance()?.cash, balance()?.currency ?? "CNY")} />
            <Metric label="赠金" value={formatMoney(balance()?.gift, balance()?.currency ?? "CNY")} />
            <Metric label="冻结" value={formatMoney(balance()?.frozen, balance()?.currency ?? "CNY")} />
          </div>
        </Card>
      </Show>

      <Show when={plan()?.ok}>
        <Card title="Token Plan">
          <div style={{ display: "flex", "justify-content": "space-between", "align-items": "baseline" }}>
            <span style={{ "font-size": "18px", "font-weight": 600 }}>{formatPercent(plan()?.percent)}</span>
            <span style={{ "font-size": "10px", color: colors().muted }}>
              {Number(plan()?.used ?? 0).toFixed(0)} / {Number(plan()?.total ?? 0).toFixed(0)} credits
            </span>
          </div>
          <Progress value={Number(plan()?.percent ?? 0)} />
          <div style={{ "font-size": "10px", color: colors().muted, "margin-top": "4px" }}>
            剩余 {Number(plan()?.remaining ?? 0).toFixed(0)} credits
            {plan()?.endAt ? ` · 到期 ${new Date(plan().endAt).toLocaleDateString()}` : ""}
          </div>
        </Card>
      </Show>
      <Show when={mimo()?.configured && plan() && !plan()?.ok}>
        <Notice kind="info">Token Plan 不可用：{plan()?.error ?? "未订阅"}</Notice>
      </Show>

      <Card title="按日用量">
        <div style={{ display: "flex", gap: "4px", "margin-bottom": "6px" }}>
          <ctx.ui.Button size="small" variant={props.mode === "cost" ? "contrast" : "ghost"} onClick={() => props.onMode("cost")}>
            金额
          </ctx.ui.Button>
          <ctx.ui.Button size="small" variant={props.mode === "tokens" ? "contrast" : "ghost"} onClick={() => props.onMode("tokens")}>
            Tokens
          </ctx.ui.Button>
        </div>
        <Chart daily={daily()} mode={props.mode} currency={usage()?.currency ?? "CNY"} />
      </Card>

      <ConsoleLink url={mimo()?.consoleUrl} label="打开 MiMo 控制台" />
    </div>
  )
}

/* ------------------------------------------------------------------------- */
/* Settings                                                                   */
/* ------------------------------------------------------------------------- */

function SettingRow(props: { label: string; hint?: string; children: JSX.Element }) {
  const colors = usePalette()
  return (
    <div
      style={{
        display: "flex",
        "align-items": "center",
        "justify-content": "space-between",
        gap: "12px",
        padding: "7px 0",
        "border-bottom": `1px solid ${colors().border}`,
      }}
    >
      <div style={{ "min-width": "0" }}>
        <div style={{ "font-size": "12px" }}>{props.label}</div>
        <Show when={props.hint}>
          <div style={{ "font-size": "10px", color: colors().muted }}>{props.hint}</div>
        </Show>
      </div>
      <div style={{ display: "flex", "align-items": "center", gap: "6px", "flex-shrink": 0 }}>{props.children}</div>
    </div>
  )
}

function SettingsTab(props: {
  settings: PublicSettings
  saving: () => boolean
  onSave: (patch: Record<string, unknown>) => Promise<void>
  onRefresh: () => void
}) {
  const colors = usePalette()
  const ctx = usePlugin()
  const [refresh, setRefresh] = createSignal(String(props.settings.refreshMinutes))
  const [floatingCard, setFloatingCard] = createSignal(props.settings.floatingCard)
  const [deepseekOn, setDeepseekOn] = createSignal(props.settings.deepseek)
  const [goOn, setGoOn] = createSignal(props.settings.go)
  const [glmOn, setGlmOn] = createSignal(props.settings.glm)
  const [mimoOn, setMimoOn] = createSignal(props.settings.mimo)
  const [autoCalibrate, setAutoCalibrate] = createSignal(props.settings.autoCalibrate)
  const [deepseekBaseUrl, setDeepseekBaseUrl] = createSignal(props.settings.deepseekBaseUrl)
  const [glmBaseUrl, setGlmBaseUrl] = createSignal(props.settings.glmBaseUrl)
  const [mimoKey, setMimoKey] = createSignal("")
  const [mimoTokenPlanKey, setMimoTokenPlanKey] = createSignal("")
  const [quotaText, setQuotaText] = createSignal<Record<string, string>>(
    Object.fromEntries(
      GO_FOCUS_MODELS.map((id) => [id, props.settings.modelQuotas[id] !== undefined ? String(props.settings.modelQuotas[id]) : ""]),
    ),
  )

  const save = async () => {
    const quotas: Record<string, number> = {}
    for (const [id, text] of Object.entries(quotaText())) {
      const value = Number(text)
      if (text.trim() !== "" && Number.isFinite(value) && value > 0) quotas[id] = value
    }
    const patch: Record<string, unknown> = {
      refreshMinutes: Number(refresh()),
      floatingCard: floatingCard(),
      deepseek: deepseekOn(),
      go: goOn(),
      glm: glmOn(),
      mimo: mimoOn(),
      autoCalibrate: autoCalibrate(),
      modelQuotas: quotas,
      deepseekBaseUrl: deepseekBaseUrl(),
      glmBaseUrl: glmBaseUrl(),
    }
    if (mimoKey().trim() !== "") patch.mimoKey = mimoKey().trim()
    if (mimoTokenPlanKey().trim() !== "") patch.mimoTokenPlanKey = mimoTokenPlanKey().trim()
    await props.onSave(patch)
    setMimoKey("")
    setMimoTokenPlanKey("")
  }

  const clearMimo = async () => {
    await props.onSave({ mimoKey: "" })
  }
  const clearMimoPlan = async () => {
    await props.onSave({ mimoTokenPlanKey: "" })
  }

  return (
    <div style={{ display: "flex", "flex-direction": "column", gap: "10px" }}>
      <div>
        <div style={{ "font-size": "12px", "font-weight": 600, "margin-bottom": "4px" }}>刷新</div>
        <SettingRow label="面板刷新间隔" hint="胶囊固定每 2 分钟刷新一次摘要">
          <ctx.ui.Select
            label="面板刷新间隔"
            value={refresh()}
            options={[
              { value: "1", label: "1 分钟" },
              { value: "5", label: "5 分钟" },
              { value: "15", label: "15 分钟" },
              { value: "30", label: "30 分钟" },
              { value: "60", label: "60 分钟" },
            ]}
            onChange={setRefresh}
          />
        </SettingRow>
        <SettingRow label="悬浮额度胶囊" hint="会话右上角只显示当前会话所用模型的额度">
          <ctx.ui.Switch checked={floatingCard()} onChange={setFloatingCard} label="悬浮额度胶囊" hideLabel />
        </SettingRow>
      </div>

      <div>
        <div style={{ "font-size": "12px", "font-weight": 600, "margin-bottom": "4px" }}>数据源</div>
        <SettingRow label="DeepSeek">
          <ctx.ui.Switch checked={deepseekOn()} onChange={setDeepseekOn} label="DeepSeek" hideLabel />
        </SettingRow>
        <SettingRow label="OpenCode Go">
          <ctx.ui.Switch checked={goOn()} onChange={setGoOn} label="OpenCode Go" hideLabel />
        </SettingRow>
        <SettingRow label="GLM / Z.AI">
          <ctx.ui.Switch checked={glmOn()} onChange={setGlmOn} label="GLM" hideLabel />
        </SettingRow>
        <SettingRow label="MiMo">
          <ctx.ui.Switch checked={mimoOn()} onChange={setMimoOn} label="MiMo" hideLabel />
        </SettingRow>
        <SettingRow label="自动校准 Go 分模型额度" hint="只对本期用量最多的模型生效">
          <ctx.ui.Switch checked={autoCalibrate()} onChange={setAutoCalibrate} label="自动校准" hideLabel />
        </SettingRow>
      </div>

      <div>
        <div style={{ "font-size": "12px", "font-weight": 600, "margin-bottom": "4px" }}>分模型额度覆盖</div>
        <For each={GO_FOCUS_MODELS}>
          {(id) => (
            <SettingRow label={GO_MODEL_LABELS[id] ?? id} hint={`默认 $${DEFAULT_GO_MODEL_LIMITS[id] ?? "—"}，留空自动`}>
              <ctx.ui.TextInput
                label={GO_MODEL_LABELS[id] ?? id}
                value={quotaText()[id] ?? ""}
                placeholder="自动"
                onInput={(value) => setQuotaText({ ...quotaText(), [id]: value })}
              />
            </SettingRow>
          )}
        </For>
      </div>

      <div>
        <div style={{ "font-size": "12px", "font-weight": 600, "margin-bottom": "4px" }}>接口地址</div>
        <SettingRow label="DeepSeek">
          <ctx.ui.TextInput label="DeepSeek 地址" value={deepseekBaseUrl()} onInput={setDeepseekBaseUrl} />
        </SettingRow>
        <SettingRow label="GLM">
          <ctx.ui.TextInput label="GLM 地址" value={glmBaseUrl()} onInput={setGlmBaseUrl} />
        </SettingRow>
      </div>

      <div>
        <div style={{ "font-size": "12px", "font-weight": 600, "margin-bottom": "4px" }}>MiMo 凭据</div>
        <SettingRow
          label="MiMo Key"
          hint={props.settings.mimoKeyConfigured ? "已配置；留空不修改" : "未配置；优先使用 OpenCode 的 Xiaomi 连接"}
        >
          <ctx.ui.TextInput
            label="MiMo Key"
            type="password"
            value={mimoKey()}
            placeholder={props.settings.mimoKeyConfigured ? "已配置" : "粘贴 key"}
            onInput={setMimoKey}
          />
          <Show when={props.settings.mimoKeyConfigured}>
            <ctx.ui.Button size="small" variant="ghost" onClick={() => void clearMimo()}>
              清除
            </ctx.ui.Button>
          </Show>
        </SettingRow>
        <SettingRow
          label="MiMo Token Plan Key"
          hint={props.settings.mimoTokenPlanKeyConfigured ? "已配置；留空不修改" : "可选，tp- 开头"}
        >
          <ctx.ui.TextInput
            label="MiMo Token Plan Key"
            type="password"
            value={mimoTokenPlanKey()}
            placeholder={props.settings.mimoTokenPlanKeyConfigured ? "已配置" : "可选"}
            onInput={setMimoTokenPlanKey}
          />
          <Show when={props.settings.mimoTokenPlanKeyConfigured}>
            <ctx.ui.Button size="small" variant="ghost" onClick={() => void clearMimoPlan()}>
              清除
            </ctx.ui.Button>
          </Show>
        </SettingRow>
      </div>

      <div style={{ display: "flex", gap: "6px", "padding-top": "4px" }}>
        <ctx.ui.Button variant="contrast" busy={props.saving()} onClick={() => void save()}>
          保存设置
        </ctx.ui.Button>
        <ctx.ui.Button variant="neutral" onClick={props.onRefresh}>
          立即刷新
        </ctx.ui.Button>
      </div>
      <div style={{ "font-size": "10px", color: colors().muted }}>
        API key 只在 OpenCode 服务端使用；RPC 和日志都不会返回 key。清空输入框不会删除已保存的 key，请用“清除”按钮。
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------- */
/* Floating capsule                                                           */
/* ------------------------------------------------------------------------- */

type ModelQuota = {
  ok: boolean
  kind?: "go" | "deepseek" | "glm" | "mimo"
  provider?: string
  model?: string
  label?: string
  row?: any
  month?: any
  balance?: any
  plan?: any
  available?: boolean
  error?: string
}

function FloatingCapsule(props: {
  enabled: () => boolean
  panelOpen: () => boolean
  onOpen: () => void
}) {
  const ctx = usePlugin()
  const colors = () => palette(ctx.appearance.mode() === "dark")
  const [quota, setQuota] = createSignal<ModelQuota | null>(null)
  const [wide, setWide] = createSignal(true)
  const [loading, setLoading] = createSignal(false)

  const current = () => ctx.screen.current()?.composer.model()

  const refresh = async () => {
    const model = current()
    if (!model) {
      setQuota(null)
      return
    }
    setLoading(true)
    try {
      const result = (await ctx.client.rpc(QuotaRpc).modelQuota({
        provider: model.providerID,
        model: model.modelID,
      })) as ModelQuota
      setQuota(result)
    } catch (cause) {
      setQuota({ ok: false, error: String(cause) })
    } finally {
      setLoading(false)
    }
  }

  onMount(() => {
    const query = window.matchMedia("(min-width: 1400px)")
    setWide(query.matches)
    const handler = (event: MediaQueryListEvent) => setWide(event.matches)
    query.addEventListener("change", handler)
    onCleanup(() => query.removeEventListener("change", handler))
    const timer = setInterval(() => void refresh(), 120_000)
    onCleanup(() => clearInterval(timer))
  })

  createEffect(() => {
    const model = current()
    if (!model) return
    // Read both fields so a composer model switch re-runs the fetch.
    void `${model.providerID}/${model.modelID}`
    void refresh()
  })

  const tone = () => {
    const q = quota()
    if (!q?.ok) return colors().muted
    if (q.kind === "go") {
      const percent = Number(q.month?.percent ?? 0)
      if (percent >= 90) return colors().danger
      if (percent >= 70) return colors().warn
      return colors().text
    }
    if (q.kind === "deepseek") {
      return !q.available || Number(q.balance?.total ?? 0) <= 0 ? colors().danger : colors().text
    }
    if (q.kind === "glm") {
      if (q.plan) return Number(q.plan.percent ?? 0) >= 90 ? colors().danger : colors().text
      return Number(q.balance?.available ?? 0) <= 0 ? colors().danger : colors().text
    }
    if (q.kind === "mimo") {
      if (q.plan?.ok) return Number(q.plan.percent ?? 0) >= 90 ? colors().danger : colors().text
      return Number(q.balance?.total ?? 0) <= 0 ? colors().danger : colors().text
    }
    return colors().muted
  }

  const view = () => {
    const q = quota()
    if (!q?.ok) return null

    if (q.kind === "go") {
      const month = q.month
      if (!month) {
        return { text: "opencode-go —", title: q.error ?? "OpenCode Go 本期用量池不可用" }
      }
      const reset = month.resetsAt ? `，重置 ${new Date(month.resetsAt).toLocaleDateString()}` : ""
      return {
        text: `opencode-go ${formatPercent(month.percent)}`,
        title: `OpenCode Go 本期用量池：已用 $${Number(month.used ?? 0).toFixed(2)} / $${Number(month.limit ?? 0).toFixed(0)}，剩余 $${Number(month.remaining ?? 0).toFixed(2)}${reset}`,
      }
    }

    if (q.kind === "deepseek") {
      return {
        text: `DeepSeek ${q.balance ? formatMoney(q.balance.total, q.balance.currency) : "—"}`,
        title: "DeepSeek API 余额",
      }
    }

    if (q.kind === "glm") {
      if (q.plan) {
        return {
          text: `GLM ${formatPercent(q.plan.percent)}`,
          title: `GLM ${q.plan.label}：已用 ${q.plan.used} / ${q.plan.limit}`,
        }
      }
      return {
        text: `GLM ${q.balance?.ok ? formatMoney(q.balance.available, "CNY") : "—"}`,
        title: "GLM 账户余额",
      }
    }

    if (q.kind === "mimo") {
      if (q.plan?.ok) {
        return { text: `MiMo ${formatPercent(q.plan.percent)}`, title: "MiMo Token Plan credits" }
      }
      return {
        text: `MiMo ${q.balance?.ok ? formatMoney(q.balance.total, q.balance.currency ?? "CNY") : "—"}`,
        title: "MiMo 账户余额",
      }
    }

    return null
  }

  return (
    <Show when={wide() && props.enabled() && !props.panelOpen() && view()}>
      <div
        onClick={props.onOpen}
        title={view()!.title}
        style={{
          position: "fixed",
          top: "96px",
          right: "18px",
          "z-index": 30,
          display: "inline-flex",
          "align-items": "center",
          gap: "6px",
          padding: "4px 9px",
          border: `1px solid ${colors().border}`,
          "border-radius": "999px",
          background: ctx.appearance.mode() === "dark" ? "rgba(32,32,32,.92)" : "rgba(255,255,255,.94)",
          "box-shadow": "0 4px 14px rgba(0,0,0,.10)",
          "backdrop-filter": "blur(8px)",
          color: colors().text,
          cursor: "pointer",
          "max-width": "300px",
          "white-space": "nowrap",
          "font-size": "11px",
          "line-height": "20px",
        }}
      >
        <span style={{ width: "6px", height: "6px", "border-radius": "50%", background: tone(), "flex-shrink": 0 }} />
        <span style={{ overflow: "hidden", "text-overflow": "ellipsis" }}>{view()!.text}</span>
        <Show when={loading()}>
          <span style={{ color: colors().muted, "font-size": "9px" }}>…</span>
        </Show>
      </div>
    </Show>
  )
}

/* ------------------------------------------------------------------------- */
/* Quota view                                                                 */
/* ------------------------------------------------------------------------- */

function QuotaView(props: {
  snapshot: () => Snapshot | null
  loading: () => boolean
  saving: () => boolean
  error: () => string | null
  range: () => RangePreset
  onRange: (range: RangePreset) => void
  onRefresh: (force?: boolean) => void
  onSave: (patch: Record<string, unknown>) => Promise<void>
  header?: boolean
  initialTab?: TabKey
}) {
  const ctx = usePlugin()
  const colors = usePalette()
  const [tab, setTab] = createSignal<TabKey>(props.initialTab ?? "overview")
  const [chartMode, setChartMode] = createSignal<ChartMode>("cost")
  const data = () => props.snapshot()

  createEffect(() => {
    if (!data() && !props.loading()) props.onRefresh(false)
  })

  createEffect(() => {
    const minutes = data()?.settings.refreshMinutes ?? 5
    const timer = setInterval(() => props.onRefresh(false), minutes * 60_000)
    onCleanup(() => clearInterval(timer))
  })

  const tabs: { key: TabKey; label: string }[] = [
    { key: "overview", label: "概览" },
    { key: "go", label: "Go" },
    { key: "deepseek", label: "DeepSeek" },
    { key: "glm", label: "GLM" },
    { key: "mimo", label: "MiMo" },
    { key: "settings", label: "设置" },
  ]

  return (
    <div style={{ display: "flex", "flex-direction": "column", gap: "8px", "min-height": "0", height: "100%" }}>
      <div style={{ display: "flex", "align-items": "center", "justify-content": "space-between", gap: "8px" }}>
        <Show when={props.header}>
          <div>
            <div style={{ "font-size": "15px", "font-weight": 600 }}>额度</div>
            <div style={{ "font-size": "10px", color: colors().muted }}>
              {data() ? `更新于 ${new Date(data()!.updatedAt).toLocaleTimeString()}` : "加载中"}
            </div>
          </div>
        </Show>
        <div style={{ display: "flex", "align-items": "center", gap: "4px", "margin-left": "auto" }}>
          <For each={["3d", "7d", "30d"] as RangePreset[]}>
            {(preset) => (
              <ctx.ui.Button
                size="small"
                variant={props.range() === preset ? "contrast" : "ghost"}
                onClick={() => props.onRange(preset)}
              >
                {preset === "3d" ? "3 天" : preset === "7d" ? "7 天" : "30 天"}
              </ctx.ui.Button>
            )}
          </For>
          <ctx.ui.IconButton icon="refresh" label="刷新" onClick={() => props.onRefresh(true)} />
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: "2px",
          "border-bottom": `1px solid ${colors().border}`,
          "padding-bottom": "4px",
          "overflow-x": "auto",
        }}
      >
        <For each={tabs}>
          {(item) => (
            <ctx.ui.Button
              size="small"
              variant={tab() === item.key ? "contrast" : "ghost-muted"}
              onClick={() => setTab(item.key)}
            >
              {item.label}
            </ctx.ui.Button>
          )}
        </For>
      </div>

      <div style={{ "overflow-y": "auto", "min-height": "0", "flex": "1", "padding-right": "10px" }}>
        <Show when={props.error()}>
          <div style={{ "margin-bottom": "8px" }}>
            <Notice kind="danger">{props.error()}</Notice>
          </div>
        </Show>
        <Show when={data()} fallback={<ctx.ui.Loader size="large" />}>
          {(snapshot) => (
            <Switch>
              <Match when={tab() === "overview"}>
                <OverviewTab snapshot={snapshot()} onOpenSettings={() => setTab("settings")} />
              </Match>
              <Match when={tab() === "go"}>
                <GoTab go={snapshot().go} />
              </Match>
              <Match when={tab() === "deepseek"}>
                <DeepSeekTab deepseek={snapshot().deepseek} />
              </Match>
              <Match when={tab() === "glm"}>
                <GlmTab glm={snapshot().glm} mode={chartMode()} onMode={setChartMode} />
              </Match>
              <Match when={tab() === "mimo"}>
                <MimoTab
                  mimo={snapshot().mimo}
                  mode={chartMode()}
                  onMode={setChartMode}
                  onOpenSettings={() => setTab("settings")}
                />
              </Match>
              <Match when={tab() === "settings"}>
                <SettingsTab
                  settings={snapshot().settings}
                  saving={props.saving}
                  onSave={props.onSave}
                  onRefresh={() => props.onRefresh(true)}
                />
              </Match>
            </Switch>
          )}
        </Show>
      </div>

      <Show when={props.loading()}>
        <div style={{ "font-size": "10px", color: colors().muted }}>正在刷新…</div>
      </Show>
    </div>
  )
}

function DashboardDialog(props: {
  snapshot: () => Snapshot | null
  loading: () => boolean
  saving: () => boolean
  error: () => string | null
  range: () => RangePreset
  onRange: (range: RangePreset) => void
  onRefresh: (force?: boolean) => void
  onSave: (patch: Record<string, unknown>) => Promise<void>
  onClose: () => void
  initialTab?: TabKey
}) {
  const ctx = usePlugin()
  return (
    <ctx.ui.Dialog
      title="额度"
      description="DeepSeek、OpenCode Go、GLM 与 MiMo"
      size="x-large"
      footer={<ctx.ui.Button onClick={props.onClose}>关闭</ctx.ui.Button>}
    >
      <div style={{ "min-height": "420px", height: "min(560px, 60vh)" }}>
        <QuotaView
          snapshot={props.snapshot}
          loading={props.loading}
          saving={props.saving}
          error={props.error}
          range={props.range}
          onRange={props.onRange}
          onRefresh={props.onRefresh}
          onSave={props.onSave}
          header={false}
          initialTab={props.initialTab}
        />
      </div>
    </ctx.ui.Dialog>
  )
}

/* ------------------------------------------------------------------------- */
/* Plugin                                                                     */
/* ------------------------------------------------------------------------- */

const tab: PanelTab = {
  id: "quota",
  get title() {
    return "额度"
  },
  closable: "compact",
}

export default Plugin.define({
  setup(ctx) {
    const [snapshot, setSnapshot] = createSignal<Snapshot | null>(null)
    const [badge, setBadge] = createSignal<BadgeResult | null>(null)
    const [loading, setLoading] = createSignal(false)
    const [saving, setSaving] = createSignal(false)
    const [error, setError] = createSignal<string | null>(null)
    const [range, setRange] = createSignal<RangePreset>("7d")

    const currentModel = () => {
      const model = ctx.screen.current()?.composer.model()
      return model ? { provider: model.providerID, model: model.modelID } : null
    }

    const refresh = async (force = false) => {
      if (loading()) return
      setLoading(true)
      setError(null)
      try {
        const model = currentModel()
        const result = (await ctx.client.rpc(QuotaRpc).snapshot({
          preset: range(),
          force,
          ...(model ? { currentModel: model } : {}),
        })) as Snapshot
        if (result?.ok === false) {
          setError((result as any).error ?? "额度读取失败")
        } else {
          setSnapshot(result)
        }
      } catch (cause) {
        setError(String(cause))
      } finally {
        setLoading(false)
      }
    }

    const refreshBadge = async () => {
      try {
        const result = (await ctx.client.rpc(QuotaRpc).badge({})) as BadgeResult
        setBadge(result)
      } catch {
        setBadge(null)
      }
    }

    const showDialog = (initialTab?: TabKey) => {
      void refresh()
      ctx.dialogs.open((dialog) => (
        <DashboardDialog
          snapshot={snapshot}
          loading={loading}
          saving={saving}
          error={error}
          range={range}
          initialTab={initialTab}
          onRange={(value) => {
            setRange(value)
            void refresh()
          }}
          onRefresh={(force) => void refresh(force)}
          onSave={async (patch) => {
            setSaving(true)
            try {
              await ctx.client.rpc(QuotaRpc).saveSettings(patch)
              await Promise.all([refresh(true), refreshBadge()])
            } finally {
              setSaving(false)
            }
          }}
          onClose={dialog.close}
        />
      ))
    }

    const openSettings = () => showDialog("settings")

    const openInSession = (session: any) => {
      ctx.layout.open(`${ctx.id}:quota`, session)
      if (!snapshot()) void refresh()
    }

    const open = () => {
      const session = ctx.sessions.current()
      if (session) {
        openInSession(session)
        return
      }
      showDialog()
    }

    void refreshBadge()
    const badgeTimer = setInterval(() => void refreshBadge(), 120_000)
    onCleanup(() => clearInterval(badgeTimer))

    ctx.add(Slot, {
      at: "session.header",
      order: 100,
      render: (input) => (
        <Show when={input.active}>
          <FloatingCapsule
            enabled={() => badge()?.settings?.floatingCard ?? true}
            panelOpen={() => ctx.layout.state(`${ctx.id}:quota`, input.session) === "visible"}
            onOpen={() => openInSession(input.session)}
          />
        </Show>
      ),
    })

    ctx.add(Command, () => ({
      id: "open",
      title: "打开额度面板",
      keywords: "quota balance usage 额度 余额",
      slash: { name: "quota" },
      run: open,
    }))

    ctx.add(Command, () => ({
      id: "settings",
      title: "额度面板设置",
      keywords: "quota settings 额度 设置",
      slash: { name: "quota-settings" },
      run: openSettings,
    }))

    ctx.add(Panel, {
      id: "quota",
      region: "side",
      width: 440,
      mobile: {
        title: "额度",
        order: 45,
        kind: "menu",
        icon: "window-analytics",
        cached: true,
      },
      list: (input) => (input.open.includes("quota") ? [tab] : []),
      render: () => (
        <div style={{ "min-height": "0", height: "100%" }}>
          <QuotaView
            snapshot={snapshot}
            loading={loading}
            saving={saving}
            error={error}
            range={range}
            onRange={(value) => {
              setRange(value)
              void refresh()
            }}
            onRefresh={(force) => void refresh(force)}
            onSave={async (patch) => {
              setSaving(true)
              try {
                await ctx.client.rpc(QuotaRpc).saveSettings(patch)
                await Promise.all([refresh(true), refreshBadge()])
              } finally {
                setSaving(false)
              }
            }}
            header
          />
        </div>
      ),
    })
  },
})
