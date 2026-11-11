import z from '@deepseek-ai/schemastery'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

/** Title prefix that marks a scheduled task this plugin owns. */
const TASK_TITLE = 'Auto-continue'
/** Marker inside the delivered prompt; a message carrying it is this plugin's continuation. */
const PROMPT_MARKER = '<auto_continue>'
/** Model-visible instruction delivered once a spent usage limit has reset. */
const CONTINUE_PROMPT = [
  PROMPT_MARKER,
  'The usage limit that interrupted this conversation has reset.',
  'Continue the work the limit interrupted, exactly where the failed request stopped.',
  'Treat the existing conversation, tool results, and workspace as authoritative; do not repeat steps that already finished.',
  'Continue in the language the conversation was using.',
  '</auto_continue>',
].join('\n')
/** File that keeps the user's on/off choice across restarts. */
const STATE_FILE = fileURLToPath(new URL('./state.json', import.meta.url))
/** Failure codes that mean a spent usage limit rather than a transient fault. */
const DEFAULT_CODES = ['QUOTA', 'ACCOUNT_QUOTA', 'RATE_LIMIT']
/** Smallest wait the schedule service admits between deliveries of one task. */
const MIN_DELIVERY_SECONDS = 60
/** Largest single wait a timer can carry safely. */
const MAX_DELAY_SECONDS = 7 * 24 * 3600
/** Longest task title the schedule service accepts. */
const MAX_TITLE_LENGTH = 120
/** Which generation of this file a running Host loaded; lives in every state answer. */
const REVISION = '2026-11-12.6'

export const Config = z.object({
  /** Path the Web GUI reads and posts the toggle to. */
  endpoint: z.string().default('/plugins/auto-continue'),
  /** Whether a spent limit is continued automatically. Off by default; the Web GUI can change this at runtime. */
  enabled: z.boolean().default(false),
  /** Failure codes that count as a spent usage limit. */
  codes: z.array(z.string()).default([...DEFAULT_CODES]),
  /** Shortest wait this plugin schedules; shorter limits belong to the ordinary retry policy. */
  minWaitSeconds: z.number().default(MIN_DELIVERY_SECONDS),
  /** Longest wait this plugin schedules; a reset farther out is left to the user. */
  maxWaitSeconds: z.number().default(MAX_DELAY_SECONDS),
  /** First wait when no reset time is known. */
  baseWaitSeconds: z.number().default(300),
  /** Ceiling for the growing unknown-reset wait. */
  maxBackoffSeconds: z.number().default(3600),
  /** Continuations attempted for one limit episode before giving up. */
  maxAttempts: z.number().default(12),
  /** Route of the quota plugin read for a machine-readable reset time. */
  quotaEndpoint: z.string().default('/plugins/model-quota'),
  /** Deadline for that reset probe, in milliseconds. */
  probeTimeoutMs: z.number().default(8000),
  /**
   * Answer a `test` control action by booking a real continuation now. Off by
   * default: it exists so a deployment can prove the booking path end to end
   * without waiting for a provider limit.
   */
  debugTest: z.boolean().default(false),
})

/** Hard service: the Host HTTP carrier that serves the toggle route. */
export const inject = ['webServer']

/** Short human reading of a duration. */
function duration(milliseconds) {
  const totalMinutes = Math.max(0, Math.ceil(milliseconds / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0) return `${String(hours)}h ${String(minutes)}m`
  return `${String(minutes)}m`
}

/**
 * Continue a conversation automatically after a spent model usage limit resets.
 *
 * A limit failure ends the turn as usual, and this plugin books one durable
 * scheduled message at the moment the limit should be gone. That message resumes
 * the conversation in the same session — through the schedule service, so it
 * survives an app restart and reopens a session the user closed. A composer
 * toggle, persisted in `state.json`, decides whether any of this happens.
 */
export async function apply(ctx, config) {
  const read = (field, fallback) => {
    const value = config?.[field]
    if (value === undefined) return fallback
    const resolved = typeof value?.get === 'function' ? value.get() : value
    return resolved === undefined ? fallback : resolved
  }

  const logger = ctx.logger
  /** Session id to the one continuation booked for it. */
  const pending = new Map()
  /**
   * Per-session generation: a disarm bumps it, so a probe that was still running
   * cannot book a continuation for a decision the user already reversed.
   */
  const generation = new Map()
  /** The runtime on/off choice; `undefined` until `state.json` or a toggle decides. */
  let chosen
  let ready = false

  const configured = () => read('enabled', false) !== false
  const enabled = () => (chosen === undefined ? configured() : chosen === true)

  /** Persist the runtime choice; a failure must not lose the in-memory decision. */
  const persist = async () => {
    const body = `${JSON.stringify({ enabled: enabled() }, null, 2)}\n`
    const temporary = `${STATE_FILE}.tmp`
    try {
      await writeFile(temporary, body, 'utf8')
      await rename(temporary, STATE_FILE)
    } catch (error) {
      logger.warn(`auto-continue: could not save the toggle: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const schedule = () => ctx.get('schedule')

  /** Whether a failure is a spent usage limit. */
  const isLimit = (failure) => {
    if (failure === null || typeof failure !== 'object') return false
    const codes = read('codes', DEFAULT_CODES)
    if (Array.isArray(codes) && typeof failure.code === 'string' && codes.includes(failure.code)) return true
    return failure.status === 429 || failure.status === 402
  }

  /** Whether this agent is a root conversation that may receive a reminder. */
  const eligible = (agent) => {
    const header = agent?.session?.header
    if (header === undefined) return false
    if (header.parentSession !== undefined || header.origin === 'subagent') return false
    return typeof agent.session.id === 'string' && agent.session.id.length > 0
  }

  /** Read a short "2h 1m" reading as milliseconds. */
  const parseReading = (text) => {
    if (typeof text !== 'string') return undefined
    let totalMs = 0
    let matched = false
    for (const [, count, unit] of text.matchAll(/(\d+)\s*([hm])/gu)) {
      matched = true
      totalMs += Number(count) * (unit === 'h' ? 3600_000 : 60_000)
    }
    return matched && totalMs > 0 ? totalMs : undefined
  }

  /**
   * Read a machine-readable window reset from the quota plugin.
   *
   * The quota plugin already holds the provider credentials and cache, so asking
   * it beats probing the same provider a second time. Any refusal simply means
   * "reset unknown". The plugin reports the reset as a duration reading; the
   * exact millisecond field is used when that build exposes it.
   */
  const quotaResetMs = async (provider) => {
    const route = read('quotaEndpoint', '/plugins/model-quota')
    if (typeof route !== 'string' || route.length === 0 || typeof provider !== 'string') return undefined
    let url
    try {
      url = new URL(route, ctx.webServer.getOrigin())
    } catch {
      return undefined
    }
    url.searchParams.set('provider', provider)
    let response
    try {
      response = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(Math.max(1000, read('probeTimeoutMs', 8000))),
      })
    } catch {
      return undefined
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined)
      return undefined
    }
    let body
    try {
      body = await response.json()
    } catch {
      return undefined
    }
    const exact = body?.resetInMs
    if (typeof exact === 'number' && Number.isFinite(exact) && exact > 0) return exact

    const details = Array.isArray(body?.details) ? body.details : []
    const reading = (key) => parseReading(details.find(entry => entry?.key === key)?.value)
    // The exhausted bucket owns the reset that matters: the window before the week.
    const windowGone = body?.percent === 0
    const weekGone = body?.weeklyPercent === 0
    if (weekGone && !windowGone) return reading('weeklyResetIn')
    return reading('resetIn') ?? reading('weeklyResetIn')
  }

  /** The wait before the next continuation attempt, and why it is that long. */
  const waitSeconds = async (provider, failure, attempts) => {
    const floor = Math.max(MIN_DELIVERY_SECONDS, read('minWaitSeconds', MIN_DELIVERY_SECONDS))
    const ceiling = Math.max(floor, Math.min(MAX_DELAY_SECONDS, read('maxWaitSeconds', MAX_DELAY_SECONDS)))
    const fit = (seconds) => {
      if (!Number.isFinite(seconds) || seconds <= 0 || seconds > ceiling) return undefined
      return Math.max(floor, Math.round(seconds))
    }

    const hinted = failure?.providerRetryAfterMs
    if (typeof hinted === 'number' && Number.isFinite(hinted) && hinted > 0) {
      const seconds = fit(hinted / 1000)
      if (seconds !== undefined) return { seconds, source: 'provider' }
    }

    const resetMs = await quotaResetMs(provider)
    if (resetMs !== undefined) {
      const seconds = fit(resetMs / 1000)
      if (seconds !== undefined) return { seconds, source: 'quota' }
    }

    const base = Math.max(MIN_DELIVERY_SECONDS, read('baseWaitSeconds', 300))
    const cap = Math.min(ceiling, Math.max(base, read('maxBackoffSeconds', 3600)))
    const grown = Math.min(cap, base * 2 ** Math.max(0, attempts - 1))
    return { seconds: Math.max(floor, Math.round(grown)), source: 'backoff' }
  }

  /** Drop one continuation, deleting its scheduled task while it still exists. */
  const disarm = async (sessionId, why) => {
    generation.set(sessionId, (generation.get(sessionId) ?? 0) + 1)
    const entry = pending.get(sessionId)
    if (entry === undefined) return
    pending.delete(sessionId)
    const service = schedule()
    if (service === undefined || entry.taskId === undefined) return
    try {
      await service.edit({ id: entry.taskId, action: 'delete' })
      logger.info(`auto-continue: ${String(sessionId)} cancelled (${why})`)
    } catch (error) {
      logger.warn(`auto-continue: could not delete task for ${String(sessionId)}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /** Delete every continuation this plugin booked. */
  const disarmAll = async (why) => {
    for (const sessionId of [...pending.keys()]) await disarm(sessionId, why)
  }

  /** Book (or move) the one continuation for a session. */
  const arm = async ({ sessionId, provider, failure, capture }) => {
    const service = schedule()
    if (service === undefined) {
      logger.warn('auto-continue: the schedule service is not mounted; cannot continue after a limit')
      return
    }
    const current = () => generation.get(sessionId) ?? 0
    const previous = pending.get(sessionId)
    const attempts = (previous?.attempts ?? 0) + 1
    if (attempts > Math.max(1, read('maxAttempts', 12))) {
      await disarm(sessionId, 'attempt budget exhausted')
      logger.info(`auto-continue: ${String(sessionId)} reached ${String(attempts - 1)} attempts; staying stopped`)
      return
    }
    const wait = await waitSeconds(provider, failure, attempts)
    if (current() !== capture) return
    const dueAt = Date.now() + wait.seconds * 1000
    const title = `${TASK_TITLE} #${String(attempts)} · ${String(provider)}`.slice(0, MAX_TITLE_LENGTH)

    let task
    if (previous !== undefined && previous.taskId !== undefined) {
      try {
        task = await service.edit({
          id: previous.taskId,
          action: 'update',
          patch: { title, prompt: CONTINUE_PROMPT, timing: { kind: 'after', after_seconds: wait.seconds } },
        })
      } catch (error) {
        logger.warn(`auto-continue: could not move task for ${String(sessionId)}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    if (current() !== capture) {
      if (task !== undefined) await service.edit({ id: task.id, action: 'delete' }).catch(() => undefined)
      pending.delete(sessionId)
      return
    }
    if (task === undefined) {
      try {
        task = await service.create({
          title,
          prompt: CONTINUE_PROMPT,
          timing: { kind: 'after', after_seconds: wait.seconds },
          target: { kind: 'session', sessionId },
        }, sessionId)
      } catch (error) {
        logger.warn(`auto-continue: could not schedule a continuation for ${String(sessionId)}: ${error instanceof Error ? error.message : String(error)}`)
        pending.delete(sessionId)
        return
      }
    }
    if (current() !== capture) {
      // A disarm landed while the write was in flight; undo our own booking.
      await service.edit({ id: task.id, action: 'delete' }).catch(() => undefined)
      pending.delete(sessionId)
      return
    }
    pending.set(sessionId, {
      taskId: String(task.id),
      dueAt,
      attempts,
      provider: typeof provider === 'string' ? provider : '',
      source: wait.source,
      delivered: false,
    })
    logger.info(`auto-continue: ${String(sessionId)} continues ${duration(wait.seconds * 1000)} from now (${wait.source}, attempt ${String(attempts)})`)
  }

  /** Whether a stored task is one of this plugin's continuations. */
  const isOurs = (task) => {
    const title = task?.title
    const prompt = task?.prompt
    return typeof title === 'string' && title.startsWith(TASK_TITLE) && typeof prompt === 'string' && prompt.includes(PROMPT_MARKER)
  }

  /** Re-attach to continuations that survived a restart, then honor the current choice. */
  const adopt = async () => {
    const service = schedule()
    if (service === undefined) return
    let page
    try {
      page = await service.list({ active: true, limit: 100 })
    } catch (error) {
      logger.warn(`auto-continue: could not read scheduled tasks: ${error instanceof Error ? error.message : String(error)}`)
      return
    }
    for (const task of page.items ?? []) {
      if (!isOurs(task) || task.target?.kind !== 'session') continue
      const sessionId = String(task.target.sessionId)
      const dueAt = Date.parse(String(task.scheduledAt))
      if (!Number.isFinite(dueAt)) continue
      const match = /#(\d+)/u.exec(String(task.title))
      pending.set(sessionId, {
        taskId: String(task.id),
        dueAt,
        attempts: match === null ? 1 : Number(match[1]),
        provider: String(task.title).split('·').at(-1)?.trim() ?? '',
        source: 'restored',
        delivered: false,
      })
    }
    if (pending.size > 0) logger.info(`auto-continue: restored ${String(pending.size)} pending continuation(s)`)
    if (!enabled()) await disarmAll('automatic continuation is off')
  }

  /** Answer one browser poll or toggle with the current state. */
  const snapshot = () => ({
    revision: REVISION,
    enabled: enabled(),
    supported: schedule() !== undefined,
    now: Date.now(),
    pending: [...pending.entries()]
      .filter(([, entry]) => entry.delivered !== true && Number.isFinite(entry.dueAt))
      .map(([sessionId, entry]) => ({
        sessionId,
        dueAt: entry.dueAt,
        attempts: entry.attempts,
        provider: entry.provider,
        source: entry.source,
        taskId: entry.taskId ?? null,
      })),
  })

  /** Read one JSON request body, bounded. */
  const readBody = (req) => new Promise((resolve) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > 64_000) {
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

  await (async () => {
    try {
      const saved = JSON.parse(await readFile(STATE_FILE, 'utf8'))
      if (typeof saved?.enabled === 'boolean') chosen = saved.enabled
    } catch {
      /* no saved choice: the plugin config decides */
    }
    ready = true
  })()

  ctx.on('agent/request-error', (payload, next) => {
    // Let the failed turn finish first: the booking probe can take a moment and
    // must never hold the conversation open while the provider is unreachable.
    const decision = next()
    const capture = payload?.agent === undefined
      ? 0
      : (generation.get(String(payload.agent.session?.id)) ?? 0)
    void (async () => {
      try {
        if (!ready || !enabled() || !isLimit(payload?.failure) || !eligible(payload?.agent)) return
        if (payload?.signal?.aborted === true) return
        // A downstream policy that retries the same step owns the recovery.
        if ((await decision)?.kind === 'retry') return
        await arm({
          sessionId: String(payload.agent.session.id),
          provider: payload.provider,
          failure: payload.failure,
          capture,
        })
      } catch (error) {
        logger.warn(`auto-continue: request-error handler failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    })()
    return decision
  })

  ctx.on('session/event', (session, event) => {
    const sessionId = String(session?.id)
    const entry = pending.get(sessionId)
    if (entry === undefined) return
    if (event.type === 'turn/end') {
      // A completed turn means the conversation moved on; a stopped one keeps waiting.
      if (event.data?.reason?.kind === 'completed') void disarm(sessionId, 'the conversation completed')
      return
    }
    if (event.type !== 'user/message') return
    let text
    try {
      text = JSON.stringify(event.data?.content ?? [])
    } catch {
      text = ''
    }
    if (text.includes(PROMPT_MARKER)) {
      // The booked continuation arrived; a limit failure now starts a fresh attempt count.
      pending.set(sessionId, { ...entry, taskId: undefined, dueAt: undefined, delivered: true })
      return
    }
    // Any other input means a human took the conversation back.
    if (event.data?.source?.kind !== 'schedule') void disarm(sessionId, 'the user sent a message')
  })

  ctx.effect(() => {
    const endpoint = read('endpoint', '/plugins/auto-continue')
    const reply = (res, status, body) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(JSON.stringify(body))
    }
    return ctx.webServer.register({
      kind: 'exact',
      path: endpoint,
      handler: (req, res) => {
        if (req.method === 'GET' || req.method === 'HEAD') {
          reply(res, 200, snapshot())
          return
        }
        if (req.method !== 'POST') {
          reply(res, 405, { error: 'method-not-allowed' })
          return
        }
        void (async () => {
          const request = await readBody(req)
          let probe
          if (request.action === 'toggle') {
            chosen = typeof request.enabled === 'boolean' ? request.enabled : !enabled()
            await persist()
            if (!enabled()) await disarmAll('automatic continuation is off')
          } else if (request.action === 'cancel' && typeof request.sessionId === 'string') {
            await disarm(request.sessionId, 'the user cancelled it')
          } else if (request.action === 'test' && read('debugTest', false) === true && typeof request.sessionId === 'string') {
            const service = schedule()
            if (service === undefined) throw new Error('the schedule service is not mounted')
            const seconds = Math.max(MIN_DELIVERY_SECONDS, Math.min(MAX_DELAY_SECONDS, Math.round(Number(request.seconds) || 600)))
            const task = await service.create({
              title: `${TASK_TITLE} #0 · probe`,
              prompt: CONTINUE_PROMPT,
              timing: { kind: 'after', after_seconds: seconds },
              target: { kind: 'session', sessionId: request.sessionId },
            }, request.sessionId)
            probe = { taskId: String(task.id), scheduledAt: task.scheduledAt, afterSeconds: seconds }
          }
          reply(res, 200, { ...snapshot(), ...(probe === undefined ? {} : { probe }) })
        })().catch((error) => {
          logger.warn(`auto-continue: control route failed: ${error instanceof Error ? error.message : String(error)}`)
          try {
            reply(res, 500, { error: 'failed' })
          } catch {
            /* the reply already began */
          }
        })
      },
    })
  }, 'auto-continue: control route')

  // Adopt surviving continuations once the schedule service is available. It
  // usually is already (this bundle loads after the base tree); `inject` covers
  // a profile whose composition mounts it later.
  let adopted = false
  const adoptOnce = async () => {
    if (adopted) return
    adopted = true
    await adopt()
  }
  if (schedule() !== undefined) await adoptOnce()
  else ctx.inject(['schedule'], () => void adoptOnce())
}
