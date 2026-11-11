import { Plugin } from "@opencode/plugin"

import { BUILD } from "./data.js"
import { createRuntime, loadBadge, loadModelQuota, loadSnapshot, resetCredentials, type Runtime } from "./providers.js"
import { QuotaRpc } from "./rpc.js"
import { loadSettings, mergeSettings, publicSettings, saveSettings } from "./settings.js"

export default Plugin.define({
  id: "quota-dashboard",
  async setup(ctx) {
    const settings = await loadSettings(ctx)
    const runtime: Runtime = await createRuntime(ctx, settings)

    const registration = await ctx.rpc.register(QuotaRpc, {
      ping: async () => ({
        ok: true,
        build: BUILD,
        location: ctx.location.directory,
        time: new Date().toISOString(),
      }),
      badge: async (_input, context) => loadBadge(runtime, context.signal),
      modelQuota: async (input, context) => {
        const value = (input ?? {}) as { provider?: string; model?: string }
        return loadModelQuota(runtime, value.provider ?? "", value.model ?? "", context.signal)
      },
      snapshot: async (input, context) =>
        loadSnapshot(
          runtime,
          (input ?? {}) as {
            preset?: string
            from?: string
            to?: string
            force?: boolean
            currentModel?: { provider?: string; model?: string } | null
          },
          context.signal,
        ),
      settings: async () => ({ ok: true, settings: publicSettings(runtime.settings) }),
      saveSettings: async (input) => {
        const next = mergeSettings(runtime.settings, input)
        const secretsChanged =
          next.mimoKey !== runtime.settings.mimoKey || next.mimoTokenPlanKey !== runtime.settings.mimoTokenPlanKey
        runtime.settings = next
        await saveSettings(ctx, next)
        if (secretsChanged) {
          resetCredentials(runtime)
          runtime.cache.clear()
        }
        return { ok: true, settings: publicSettings(next) }
      },
    })

    return async () => {
      await registration.dispose()
    }
  },
})
