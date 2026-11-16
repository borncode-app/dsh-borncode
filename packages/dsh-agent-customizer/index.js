import z from '@deepseek-ai/schemastery'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

/** File that keeps the per-agent customizations across restarts. */
const STATE_FILE = fileURLToPath(new URL('./state.json', import.meta.url))
/** Largest instruction text the plugin stores when the row does not say otherwise. */
const MAX_LENGTH = 20000
/** Which generation of this file a running Host loaded; lives in every state answer. */
const REVISION = '2026-11-12.4'

export const Config = z.object({
  /** Path the Web GUI reads and writes the customizations at. */
  endpoint: z.string().default('/plugins/agent-customizer'),
  /** Largest instruction text accepted, in characters. */
  maxLength: z.number().default(MAX_LENGTH),
})

/** Hard services: the HTTP carrier that serves the page's data. */
export const inject = ['webServer']

/**
 * Read one setting, tolerating both a plain value and a live config getter.
 *
 * @param {object | undefined} config - the row's resolved configuration.
 * @param {string} field - the setting to read.
 * @param {unknown} fallback - the value to use when the setting is absent.
 * @returns {unknown} the resolved setting.
 */
function setting(config, field, fallback) {
  const value = config?.[field]
  if (value === undefined) return fallback
  const resolved = typeof value?.get === 'function' ? value.get() : value
  return resolved === undefined ? fallback : resolved
}

/**
 * Keep the per-agent customizations, and expose the default model to the Web GUI.
 *
 * The user picks a model in Settings → Agent customization and every freshly
 * created agent starts on it. The standing instructions the user writes once
 * belong to `dsh-session-instructions`, which contributes them to every agent
 * of this profile; this plugin owns the deployment default model only, so the
 * two never disagree about what the user asked for.
 */
export async function apply(ctx, config) {
  const logger = ctx.logger
  const endpoint = String(setting(config, 'endpoint', '/plugins/agent-customizer'))
  const maxLength = Math.max(0, Math.floor(Number(setting(config, 'maxLength', MAX_LENGTH)) || 0))

  /** When the customizations were last written. */
  let updatedAt = 0

  /**
   * Store the customizations next to the plugin.
   *
   * The write is atomic, so a crash never leaves a half-written file behind.
   *
   * @param {number} stamp - the timestamp to record with them.
   * @returns {Promise<boolean>} whether the file was written.
   */
  const persist = async (stamp) => {
    const body = `${JSON.stringify({ updatedAt: stamp }, null, 2)}\n`
    const temporary = `${STATE_FILE}.tmp`
    try {
      await writeFile(temporary, body, 'utf8')
      await rename(temporary, STATE_FILE)
      return true
    } catch (error) {
      logger.warn(`agent-customizer: could not save the customizations: ${error instanceof Error ? error.message : String(error)}`)
      return false
    }
  }

  /** Read one JSON request body, bounded. */
  const readBody = (req) => new Promise((resolve) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > 256_000) {
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        resolve({})
      }
    })
    req.on('error', () => resolve({}))
  })

  try {
    const saved = JSON.parse(await readFile(STATE_FILE, 'utf8'))
    if (typeof saved?.updatedAt === 'number') updatedAt = saved.updatedAt
  } catch {
    /* nothing stored yet: the page starts empty */
  }

  /**
   * The agent roster the page offers, as the registry currently holds it.
   *
   * @param {object} registry - the Agent preset registry service.
   * @returns {Promise<object[]>} one row per declared preset.
   */
  const readPresets = async (registry) => {
    if (registry === undefined) return []
    try {
      const roster = typeof registry.remoteExportList === 'function'
        ? await registry.remoteExportList()
        : await registry.list()
      const rows = Array.isArray(roster) ? roster : (roster?.presets ?? [])
      return rows.map((row) => ({
        id: String(row.id),
        name: typeof row.name === 'string' && row.name.length > 0 ? row.name : String(row.id),
        description: typeof row.description === 'string' ? row.description : '',
        order: typeof row.order === 'number' ? row.order : 0,
        isDefault: row.isDefault === true,
        broken: typeof row.broken === 'string' ? row.broken : null,
      }))
    } catch (error) {
      logger.warn(`agent-customizer: could not read the agent roster: ${error instanceof Error ? error.message : String(error)}`)
      return []
    }
  }

  /**
   * The reasoning levels one exact model advertises.
   *
   * A model that advertises no reasoning metadata simply offers none, so the
   * page keeps its "Auto" choice and sends no effort.
   *
   * @param {object} llm - the LLM registry service.
   * @param {string} provider - the provider route the model belongs to.
   * @param {string} model - the exact model id.
   * @returns {Promise<string[]>} the advertised effort ids.
   */
  const readEfforts = async (llm, provider, model) => {
    try {
      const resolved = await llm.resolveModelInfo(provider, model)
      const efforts = resolved?.reasoning?.efforts
      if (!Array.isArray(efforts)) return []
      return efforts.map((effort) => String(effort?.id ?? '')).filter((id) => id.length > 0)
    } catch {
      return []
    }
  }

  /**
   * The models the registered providers advertise, for the page's picker.
   *
   * @param {object} llm - the LLM registry service.
   * @returns {Promise<object[]>} one group per provider that lists models.
   */
  const readProviders = async (llm) => {
    if (llm === undefined) return []
    let providers = []
    try {
      providers = llm.listProviders()
    } catch (error) {
      logger.warn(`agent-customizer: could not read the provider directory: ${error instanceof Error ? error.message : String(error)}`)
      return []
    }
    return Promise.all(providers.map(async (provider) => {
      const group = { id: String(provider.id), name: String(provider.name ?? provider.id), models: [], error: null }
      try {
        const models = await llm.listModels(provider.id)
        group.models = await Promise.all(models.map(async (model) => ({
          id: String(model.id),
          name: String(model.name ?? model.id),
          efforts: await readEfforts(llm, provider.id, String(model.id)),
        })))
      } catch (error) {
        group.error = error instanceof Error ? error.message : String(error)
      }
      return group
    }))
  }

  /** The complete answer the page renders from. */
  const snapshot = async () => {
    const registry = ctx.get('agentPresets')
    const defaults = ctx.get('agentDefaultModel')
    const llm = ctx.get('llm')
    let defaultModel = null
    try {
      defaultModel = defaults?.currentSelection?.() ?? null
    } catch {
      defaultModel = null
    }
    return {
      revision: REVISION,
      presets: await readPresets(registry),
      defaultModel,
      providers: await readProviders(llm),
      maxLength,
      updatedAt,
    }
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: endpoint,
    handler: (req, res) => {
      const reply = (status, body) => {
        res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        res.end(JSON.stringify(body))
      }
      if (req.method === 'GET' || req.method === 'HEAD') {
        void (async () => {
          try {
            reply(200, await snapshot())
          } catch (error) {
            logger.warn(`agent-customizer: could not read the customizations: ${error instanceof Error ? error.message : String(error)}`)
            reply(500, { error: 'failed' })
          }
        })()
        return
      }
      if (req.method !== 'POST') {
        reply(405, { error: 'method-not-allowed' })
        return
      }
      void (async () => {
        const request = await readBody(req)
        const action = request?.action
        if (action === 'save-model') {
          const defaults = ctx.get('agentDefaultModel')
          if (defaults === undefined) {
            reply(501, { error: 'no-default-model' })
            return
          }
          const provider = typeof request.provider === 'string' ? request.provider.trim() : ''
          const model = typeof request.model === 'string' ? request.model.trim() : ''
          if (provider.length === 0 || model.length === 0) {
            reply(400, { error: 'invalid-model' })
            return
          }
          // `saveSelection` replaces the whole selection, so an omitted effort
          // would silently drop the stored one. An absent field keeps the
          // current effort; an explicit null clears it ("Auto").
          let current = null
          try {
            current = defaults.currentSelection()
          } catch {
            current = null
          }
          let effort
          if (request.reasoningEffort === null) {
            effort = undefined
          } else if (typeof request.reasoningEffort === 'string' && request.reasoningEffort.trim().length > 0) {
            effort = request.reasoningEffort.trim()
          } else {
            effort = typeof current?.reasoningEffort === 'string' ? current.reasoningEffort : undefined
          }
          try {
            await defaults.saveSelection({
              provider,
              model,
              ...effort === undefined ? {} : { reasoningEffort: effort },
            })
          } catch (error) {
            logger.warn(`agent-customizer: could not save the default model: ${error instanceof Error ? error.message : String(error)}`)
            reply(500, { error: 'not-saved' })
            return
          }
          try {
            current = defaults.currentSelection()
          } catch {
            current = null
          }
          if (current === null || current.provider !== provider || current.model !== model) {
            reply(500, { error: 'not-saved' })
            return
          }
          logger.info(`agent-customizer: default model is now ${provider}/${model}`)
          const stamp = Date.now()
          await persist(stamp)
          updatedAt = stamp
          reply(200, await snapshot())
          return
        }
        reply(400, { error: 'unknown-action' })
      })().catch((error) => {
        logger.warn(`agent-customizer: control route failed: ${error instanceof Error ? error.message : String(error)}`)
        try {
          reply(500, { error: 'failed' })
        } catch {
          /* the reply already began */
        }
      })
    },
  }), 'agent-customizer: control route')
}
