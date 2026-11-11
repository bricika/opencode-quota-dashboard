import assert from "node:assert/strict"
import test from "node:test"

import {
  calibrateGoModels,
  clampTz,
  computeBadge,
  dateKeyFromSec,
  formatMoney,
  formatPercent,
  formatTokens,
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
  startOfLocalDaySec,
} from "../src/data.ts"

const TZ = 8 * 3600
const START = 1793635200 // 2026-11-03 00:00 Asia/Shanghai
const DAY = 86400

test("range presets resolve to local-day boundaries", () => {
  const now = Date.UTC(2026, 10, 9, 4, 0, 0) // 2026-11-09 12:00 Asia/Shanghai
  const three = resolveRange({ preset: "3d" }, TZ, now)
  assert.equal(three.ok, true)
  assert.equal(three.days, 3)
  assert.equal(three.from, "2026-11-07")
  assert.equal(three.to, "2026-11-09")
  assert.equal(three.start, 1793980800)
  assert.equal(three.end, 1794240000)
  assert.equal(three.tzSec, TZ)

  const seven = resolveRange({ preset: "7d" }, TZ, now)
  assert.equal(seven.days, 7)
  assert.equal(seven.from, "2026-11-03")

  const thirty = resolveRange({ preset: "30d" }, TZ, now)
  assert.equal(thirty.days, 30)
  assert.equal(thirty.from, "2026-10-11")
})

test("custom range clamps future dates and rejects malformed ones", () => {
  const now = Date.UTC(2026, 10, 9, 4, 0, 0)
  const custom = resolveRange({ preset: "custom", from: "2026-11-01", to: "2026-11-03" }, TZ, now)
  assert.equal(custom.ok, true)
  assert.equal(custom.days, 3)
  assert.equal(custom.from, "2026-11-01")
  assert.equal(custom.to, "2026-11-03")

  const future = resolveRange({ preset: "custom", from: "2026-11-01", to: "2026-12-01" }, TZ, now)
  assert.equal(future.ok, true)
  assert.equal(future.to, "2026-11-09")
  assert.equal(future.days, 9)

  const bad = resolveRange({ preset: "custom", from: "2026-02-30", to: "2026-03-01" }, TZ, now)
  assert.equal(bad.ok, false)
})

test("timezone clamp rounds to quarter hours", () => {
  assert.equal(clampTz(28800), 28800)
  assert.equal(clampTz(28810), 28800)
  assert.equal(clampTz(1e9), 14 * 3600)
  assert.equal(clampTz(-1e9), -12 * 3600)
  assert.equal(clampTz("bad"), 0)
})

test("DeepSeek balance keeps negative values and availability", () => {
  const balance = shapeDeepSeekBalance({
    is_available: false,
    balance_infos: [
      { currency: "CNY", total_balance: "-0.01", granted_balance: "0.00", topped_up_balance: "-0.01" },
    ],
  })
  assert.equal(balance.ok, true)
  assert.equal(balance.isAvailable, false)
  assert.equal(balance.primary.total, -0.01)
  assert.equal(balance.primary.granted, 0)
})

test("Go status converts microcents and percentages", () => {
  const status = shapeGoStatus({
    product: "go",
    renewalProduct: "go",
    cancelAtPeriodEnd: false,
    access: {
      startsAt: "2026-10-14T05:35:13.000Z",
      endsAt: "2026-11-14T05:35:13.000Z",
      meters: {
        fiveHour: {
          startsAt: "2026-11-09T02:12:01.000Z",
          resetsAt: "2026-11-09T07:12:01.000Z",
          limitMicroCents: "1200000000",
          usedMicroCents: "13103841",
        },
        week: {
          startsAt: "2026-11-09T00:00:00.000Z",
          resetsAt: "2026-11-16T00:00:00.000Z",
          limitMicroCents: "3000000000",
          usedMicroCents: "13103841",
        },
        month: {
          resetsAt: "2026-11-14T05:35:13.000Z",
          limitMicroCents: "6000000000",
          usedMicroCents: "5741243277",
        },
      },
    },
  })
  assert.equal(status.ok, true)
  assert.equal(status.productLabel, "Go")
  assert.equal(status.month.limit, 60)
  assert.equal(status.month.used, 57.41243277)
  assert.ok(Math.abs(status.month.remaining - 2.58756723) < 1e-9)
  assert.ok(Math.abs(status.month.percent - 95.68738795) < 1e-9)
  assert.equal(status.meters.rolling.limit, 12)
  assert.equal(status.meters.rolling.used, 0.13103841)
  assert.equal(status.meters.weekly.limit, 30)
})

test("Go status tolerates a paused subscription", () => {
  const status = shapeGoStatus({ product: "go", access: null })
  assert.equal(status.ok, true)
  assert.equal(status.access, null)
  assert.equal(status.month, null)
})

test("Go per-model rows use list cost and configured limits", () => {
  const rows = shapeGoModels(
    {
      items: [
        {
          model: "deepseek-v4.1-flash",
          provider: "opencode-go",
          totalRequests: "22795",
          totalInputTokens: "145989663",
          totalOutputTokens: "19880856",
          totalCacheReadTokens: "7238682818",
          totalCacheWrite5mTokens: "0",
          totalCacheWrite1hTokens: "0",
          totalCostMicroCents: "7968228366",
        },
        {
          model: "kimi-k3",
          provider: "opencode-go",
          totalRequests: "1",
          totalInputTokens: "133",
          totalOutputTokens: "38",
          totalCacheReadTokens: "0",
          totalCacheWrite5mTokens: "0",
          totalCacheWrite1hTokens: "0",
          totalCostMicroCents: "96900",
        },
      ],
    },
    { currentModel: { model: "deepseek-v4.1-flash" } },
  )
  assert.equal(rows.ok, true)
  assert.equal(rows.rows.length, 4)
  assert.equal(rows.rows[0].id, "deepseek-v4.1-flash")
  assert.equal(rows.rows[0].limit, 100)
  assert.equal(rows.rows[0].used, 79.68228366)
  assert.ok(Math.abs(rows.rows[0].remaining - 20.31771634) < 1e-9)
  assert.equal(rows.rows[0].current, true)
  assert.equal(rows.rows[1].id, "glm-5.3-flash")
  assert.equal(rows.rows[1].used, 0)
  assert.equal(rows.rows[1].remaining, 60)
  assert.equal(rows.rows[2].id, "mimo-v2.6-flash")
  assert.equal(rows.rows[2].remaining, 60)
  assert.equal(rows.rows[3].id, "kimi-k3")
  assert.equal(rows.rows[3].limit, 15)
  assert.equal(rows.rows[3].current, false)
})

test("Go rows can start from a remembered auto-calibrated cap", () => {
  const shaped = shapeGoModels(
    { items: [] },
    { autoQuotas: { "deepseek-v4.1-flash": 80 }, focus: ["deepseek-v4.1-flash"] },
  )
  assert.equal(shaped.rows[0].limit, 80)
  assert.equal(shaped.rows[0].source, "auto")
  assert.equal(shaped.rows[0].remaining, 80)
})

test("Go calibration infers an old $80 cap from the shared $60 pool", () => {
  const shaped = shapeGoModels(
    {
      items: [
        {
          model: "deepseek-v4.1-flash",
          provider: "opencode-go",
          totalRequests: "22795",
          totalInputTokens: "145989663",
          totalOutputTokens: "19880856",
          totalCacheReadTokens: "7238682818",
          totalCacheWrite5mTokens: "0",
          totalCacheWrite1hTokens: "0",
          totalCostMicroCents: "7968228366",
        },
      ],
    },
    { currentModel: { model: "deepseek-v4.1-flash" } },
  )
  const calibrated = calibrateGoModels(
    shaped,
    { month: { limit: 60, used: 57.47, remaining: 2.53, percent: 95.78 } },
    { periodCost: 80.1, autoCalibrate: true },
  )
  assert.equal(calibrated.calibration.applied, true)
  assert.equal(calibrated.calibration.model, "deepseek-v4.1-flash")
  assert.equal(calibrated.calibration.candidate, 80)
  assert.equal(calibrated.rows[0].limit, 80)
  assert.equal(calibrated.rows[0].source, "auto")
  assert.equal(calibrated.rows[0].current, true)
  assert.ok(calibrated.rows[0].remaining < 0.4)
  assert.ok(calibrated.rows[0].percent > 99)
})

test("Go calibration follows an upgraded $100 cap", () => {
  const shaped = shapeGoModels(
    {
      items: [
        {
          model: "deepseek-v4.1-flash",
          provider: "opencode-go",
          totalRequests: "22795",
          totalInputTokens: "145989663",
          totalOutputTokens: "19880856",
          totalCacheReadTokens: "7238682818",
          totalCacheWrite5mTokens: "0",
          totalCacheWrite1hTokens: "0",
          totalCostMicroCents: "7968228366",
        },
      ],
    },
    { currentModel: { model: "deepseek-v4.1-flash" } },
  )
  const calibrated = calibrateGoModels(shaped, { month: { limit: 60, used: 48.1 } }, { periodCost: 80.1, autoCalibrate: true })
  assert.equal(calibrated.calibration.applied, true)
  assert.equal(calibrated.calibration.candidate, 100)
  assert.equal(calibrated.rows[0].limit, 100)
  assert.ok(calibrated.rows[0].remaining > 20)
})

test("Go calibration respects a manual cap and the disable switch", () => {
  const shaped = shapeGoModels(
    {
      items: [
        {
          model: "deepseek-v4.1-flash",
          provider: "opencode-go",
          totalRequests: "10",
          totalInputTokens: "100",
          totalOutputTokens: "20",
          totalCacheReadTokens: "1000",
          totalCostMicroCents: "7968228366",
        },
      ],
    },
    { currentModel: { model: "deepseek-v4.1-flash" }, manualQuotas: { "deepseek-v4.1-flash": 100 } },
  )
  assert.equal(shaped.rows[0].source, "manual")
  const calibrated = calibrateGoModels(shaped, { month: { limit: 60, used: 57.47 } }, { periodCost: 80.1 })
  assert.equal(calibrated.calibration.applied, false)
  assert.equal(calibrated.rows[0].limit, 100)
  assert.equal(calibrated.rows[0].source, "manual")

  const disabled = calibrateGoModels(
    shapeGoModels(
      {
        items: [
          {
            model: "deepseek-v4.1-flash",
            provider: "opencode-go",
            totalRequests: "10",
            totalInputTokens: "100",
            totalOutputTokens: "20",
            totalCacheReadTokens: "1000",
            totalCostMicroCents: "7968228366",
          },
        ],
      },
      { currentModel: { model: "deepseek-v4.1-flash" } },
    ),
    { month: { limit: 60, used: 57.47 } },
    { periodCost: 80.1, autoCalibrate: false },
  )
  assert.equal(disabled.calibration.applied, false)
  assert.equal(disabled.rows[0].limit, 100)
})

test("badge marks a negative balance and a nearly exhausted Go pool", () => {
  const badge = computeBadge({
    deepseek: {
      balance: {
        ok: true,
        isAvailable: false,
        primary: { currency: "CNY", total: -0.01 },
      },
    },
    go: {
      status: {
        ok: true,
        product: "go",
        productLabel: "Go",
        month: { limit: 60, used: 57.41, remaining: 2.59, percent: 95.7 },
      },
    },
  })
  assert.equal(badge.deepseek.balance, -0.01)
  assert.equal(badge.deepseek.available, false)
  assert.equal(badge.deepseekCritical, true)
  assert.equal(badge.go.percent, 95.7)
  assert.equal(badge.goCritical, true)
  assert.equal(badge.critical, true)
})

test("formatters are compact and stable", () => {
  assert.equal(formatTokens(7215), "7,215")
  assert.equal(formatTokens(1_234_567), "1.23M")
  assert.equal(formatPercent(95.68), "96%")
  assert.equal(formatPercent(0.4), "<1%")
  assert.equal(formatMoney(-0.01, "CNY"), "¥-0.01")
  assert.equal(formatMoney(12.345, "USD"), "$12.35")
  assert.equal(formatMoney(0.001, "CNY"), "¥<0.01")
})

test("local date helpers agree", () => {
  assert.equal(startOfLocalDaySec(Date.UTC(2026, 10, 9, 4, 0, 0), TZ), 1794153600)
  assert.equal(dateKeyFromSec(1794153600, TZ), "2026-11-09")
})

test("GLM balance keeps zero available and reports spend", () => {
  const balance = shapeGlmBalance({
    code: 200,
    success: true,
    data: {
      balance: 0,
      availableBalance: 0,
      rechargeAmount: 336,
      giveAmount: 0,
      totalSpendAmount: 336,
      frozenBalance: 0,
      todaySpendAmount: null,
    },
  })
  assert.equal(balance.available, 0)
  assert.equal(balance.recharge, 336)
  assert.equal(balance.spent, 336)
  assert.equal(balance.gift, 0)
  assert.equal(balance.isAvailable, false)

  const noPlan = shapeGlmQuota({ code: 500, success: false, msg: "当前用户没有coding plan" })
  assert.equal(noPlan.hasPlan, false)
  assert.equal(noPlan.ok, false)
  assert.match(noPlan.error, /coding plan/i)
})

test("GLM coding plan windows map five-hour and weekly rows", () => {
  const quota = shapeGlmQuota({
    code: 200,
    success: true,
    data: {
      limits: [
        {
          type: "TOKENS_LIMIT",
          unit: 3,
          number: 5,
          currentValue: 1,
          usage: 2,
          percentage: 50,
          nextResetTime: Date.now() + 3600_000,
        },
        {
          type: "TOKENS_LIMIT",
          unit: 6,
          number: 1,
          currentValue: 2,
          usage: 4,
          percentage: 50,
          nextResetTime: Date.now() + 86400_000,
        },
      ],
    },
  })
  assert.equal(quota.hasPlan, true)
  assert.equal(quota.windows.length, 2)
  assert.equal(quota.windows[0].label, "5 小时窗口")
  assert.equal(quota.windows[0].remaining, 1)
  assert.equal(quota.windows[1].label, "本周窗口")
})

test("MiMo balance, plan and empty usage keep zero values", () => {
  const balance = shapeMimoBalance({
    object: "balance",
    is_available: false,
    balance_infos: [
      {
        currency: "CNY",
        cash_balance: "0.00",
        gift_balance: "0.00",
        frozen_balance: "0.00",
        credit_limit: "0.00",
        credit_available: "0.00",
        total_available: "0.00",
      },
    ],
  })
  assert.equal(balance.total, 0)
  assert.equal(balance.cash, 0)
  assert.equal(balance.isAvailable, false)

  const plan = shapeMimoPlan({
    object: "token_plan",
    plan_code: "pro",
    period: { start_at: "2026-09-21 23:59:59", end_at: "2027-09-21 23:59:59" },
    quota: { total_credits: 100, used_credits: 25, remaining_credits: 75 },
    auto_renew: false,
  })
  assert.equal(plan.total, 100)
  assert.equal(plan.used, 25)
  assert.equal(plan.remaining, 75)
  assert.equal(plan.percent, 25)

  const usage = shapeMimoUsage({ object: "list", data: [] })
  assert.equal(usage.cost, 0)
  assert.equal(usage.tokens, 0)
  assert.equal(usage.requests, 0)
  assert.equal(usage.rows, 0)
})

test("MiMo daily usage sums model and plugin rows", () => {
  const usage = shapeMimoUsage({
    data: [
      { date: "2026-11-10", currency: "CNY", consumed_amount: "0.012345", total_tokens: 1000, request_count: 2 },
      { date: "2026-11-10", currency: "CNY", consumed_amount: "0.000500", request_count: 1 },
      { date: "2026-11-11", currency: "CNY", consumed_amount: "0.100000", total_tokens: 500, request_count: 1 },
    ],
  })
  assert.equal(usage.cost, 0.112845)
  assert.equal(usage.tokens, 1500)
  assert.equal(usage.requests, 4)
  assert.equal(usage.rows, 3)
  assert.equal(usage.daily.length, 2)
  assert.equal(usage.daily[0].date, "2026-11-10")
  assert.equal(usage.daily[0].cost, 0.012845)
  assert.equal(usage.daily[1].requests, 1)
})

test("GLM local history turns cumulative spend into daily bars", () => {
  const range = { days: 3, start: START, tzSec: TZ }
  const day1 = dateKeyFromSec(START, TZ)
  const day2 = dateKeyFromSec(START + DAY, TZ)
  const day3 = dateKeyFromSec(START + 2 * DAY, TZ)
  const usage = shapeGlmHistory(
    {
      days: {
        [day1]: { spent: 336, firstSpent: 336 },
        [day2]: { spent: 340, firstSpent: 336 },
        [day3]: { spent: 341, firstSpent: 336 },
      },
    },
    range,
  )
  assert.equal(usage.days, 3)
  assert.equal(usage.daily.length, 3)
  assert.equal(usage.daily[0].cost, 0)
  assert.equal(usage.daily[1].cost, 4)
  assert.equal(usage.daily[2].cost, 1)
  assert.equal(usage.cost, 5)
})
