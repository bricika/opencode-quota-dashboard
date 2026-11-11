import { Rpc } from "@opencode/plugin/rpc"

const Empty = { type: "object", properties: {}, additionalProperties: false } as const
const Any = { type: "object", additionalProperties: true } as const

const SnapshotInput = {
  type: "object",
  properties: {
    preset: { type: "string" },
    from: { type: "string" },
    to: { type: "string" },
    force: { type: "boolean" },
    currentModel: {
      type: "object",
      properties: {
        provider: { type: "string" },
        model: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
} as const

const SettingsInput = {
  type: "object",
  properties: {
    refreshMinutes: { type: "number" },
    badgeMode: { type: "string" },
    floatingCard: { type: "boolean" },
    deepseek: { type: "boolean" },
    go: { type: "boolean" },
    glm: { type: "boolean" },
    mimo: { type: "boolean" },
    autoCalibrate: { type: "boolean" },
    modelQuotas: { type: "object", additionalProperties: { type: "number" } },
    deepseekBaseUrl: { type: "string" },
    glmBaseUrl: { type: "string" },
    mimoKey: { type: "string" },
    mimoTokenPlanKey: { type: "string" },
  },
  additionalProperties: false,
} as const

/**
 * RPC contract between the server part (which holds credentials and talks to
 * provider APIs) and the GUI part (which only receives shaped numbers).
 */
export const QuotaRpc = Rpc.define({
  id: "quota-dashboard",
  methods: {
    ping: {
      input: Empty,
      output: Any,
    },
    badge: {
      input: Empty,
      output: Any,
    },
    modelQuota: {
      input: {
        type: "object",
        properties: {
          provider: { type: "string" },
          model: { type: "string" },
        },
        required: ["provider", "model"],
        additionalProperties: false,
      },
      output: Any,
    },
    snapshot: {
      input: SnapshotInput,
      output: Any,
    },
    settings: {
      input: Empty,
      output: Any,
    },
    saveSettings: {
      input: SettingsInput,
      output: Any,
    },
  },
  events: {},
})
