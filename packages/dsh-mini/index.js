import z from '@deepseek-ai/schemastery'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Host half of the dsh-mini supervisor.
 *
 * This package owns two jobs that the plugin kits themselves cannot own:
 *
 * 1. **Keeping git checkouts current.** The BornCode and MiniMax kits are
 *    installed into the profile as `link:` specifiers pointing at real
 *    checkouts, so the correct update mechanism is git — `fetch`, compare, and
 *    `pull --ff-only` — not a file swap. A file swap would rewrite a working
 *    tree underneath `git pull` and turn every later pull into a conflict.
 *
 * 2. **Saying whether the installed plugins actually run.** Every row keeps
 *    its own code and stays its own row; this plugin only reads the Loader's
 *    phase for each one, probes the health routes the rows publish, and
 *    reports the difference between "installed" and "working".
 *
 * Nothing here rewrites a kit: repositories stay separate, plugins stay
 * separate rows, and the only writes are the ones git makes itself.
 */

/** Which generation of this file a running Host loaded. */
const REVISION = '2026-11-20.1'
/** Longest one git command may run, in milliseconds. */
const GIT_TIMEOUT_MS = 120_000
/** Longest one package-manager run may take, in milliseconds. */
const INSTALL_TIMEOUT_MS = 300_000
/** Longest one health probe may take, in milliseconds. */
const PROBE_TIMEOUT_MS = 6_000
/** Rows the doctor never reports as a problem, whatever their phase. */
const QUIET_PHASES = new Set(['active', null])

export const Config = z.object({
  /** Path the Web GUI reads and writes the supervisor's state at. */
  endpoint: z.string().default('/plugins/dsh-mini'),
  /**
   * Checkouts the supervisor keeps current. Each entry is one repository and
   * one working tree; the kits stay separate repositories on purpose.
   */
  repos: z.array(z.object({
    /** Stable id the Settings page and the tools address this repository by. */
    id: z.string(),
    /** Display name shown in the Settings page. */
    label: z.string().default(''),
    /** Absolute path of the working tree to update. */
    path: z.string(),
    /** Git remote the update comes from. */
    remote: z.string().default('origin'),
    /** Branch that remote updates. */
    branch: z.string().default('main'),
    /** Regenerate the package graph when the manifest or lockfile changed. */
    install: z.boolean().default(true),
  })).default([]),
  /**
   * Health routes to probe, in addition to the Loader phase of every row.
   * A plugin that crashed keeps its phase honest but cannot answer its own
   * route, so both readings are reported side by side.
   */
  probes: z.array(z.object({
    /** Stable id shown in the Settings page. */
    id: z.string(),
    /** Display name shown in the Settings page. */
    label: z.string().default(''),
    /** Route path on this Host, such as `/plugins/agent-desktop`. */
    path: z.string(),
  })).default([]),
  /** Fetch and report on every launch. Read-only: this never moves a checkout. */
  autoCheck: z.boolean().default(true),
  /** Apply a fast-forward automatically when a check finds one waiting. */
  autoApply: z.boolean().default(false),
  /** Longest one git command may run, in milliseconds. */
  gitTimeoutMs: z.number().default(GIT_TIMEOUT_MS),
  /** Longest one package-manager run may take, in milliseconds. */
  installTimeoutMs: z.number().default(INSTALL_TIMEOUT_MS),
  /** Longest one health probe may take, in milliseconds. */
  probeTimeoutMs: z.number().default(PROBE_TIMEOUT_MS),
  /** Package manager run after a manifest or lockfile change. */
  packageManager: z.string().default('pnpm'),
})

/** The HTTP carrier for the Settings page. Everything else is looked up late. */
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
  const raw = config?.[field]
  const value = typeof raw === 'function' ? raw() : raw
  return value === undefined || value === null ? fallback : value
}

/**
 * Run one child process to completion and collect its output.
 *
 * @param {string} command - executable to run.
 * @param {string[]} args - arguments, passed as an array so no shell parses them.
 * @param {{ cwd?: string, timeoutMs?: number, env?: Record<string, string> }} options
 * @returns {Promise<{ code: number | null, stdout: string, stderr: string, error?: string }>}
 */
function run(command, args, options = {}) {
  const { cwd, timeoutMs = GIT_TIMEOUT_MS, env = {} } = options
  return new Promise(resolve => {
    let settled = false
    let stdout = ''
    let stderr = ''
    let child
    const finish = result => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }
    const timer = setTimeout(() => {
      try {
        child?.kill()
      } catch { /* already gone */ }
      finish({ code: null, stdout, stderr, error: `timed out after ${timeoutMs} ms` })
    }, timeoutMs)
    timer.unref?.()
    try {
      child = spawn(command, args, {
        cwd,
        windowsHide: true,
        // A prompt would wait for a human who is not there; fail loudly instead.
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: 'echo', ...env },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      finish({ code: null, stdout, stderr, error: error instanceof Error ? error.message : String(error) })
      return
    }
    child.stdout?.on('data', chunk => { stdout += String(chunk) })
    child.stderr?.on('data', chunk => { stderr += String(chunk) })
    child.on('error', error => {
      finish({ code: null, stdout, stderr, error: error instanceof Error ? error.message : String(error) })
    })
    child.on('close', code => finish({ code, stdout, stderr }))
  })
}

/** Trim one git output line and drop the trailing newline git always adds. */
function line(text) {
  return String(text ?? '').trim()
}

/**
 * Parse `git status --porcelain` into the files that differ from HEAD.
 *
 * @param {string} text - the command's stdout.
 * @returns {string[]} one `XY path` entry per changed file.
 */
function parseStatus(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map(row => row.trimEnd())
    .filter(row => row !== '')
}

/**
 * Read one checkout's state without changing it.
 *
 * @param {object} repo - the managed repository entry.
 * @param {number} timeoutMs - how long git may take.
 * @returns {Promise<object>} the checkout's facts, including any failure.
 */
async function readRepo(repo, timeoutMs) {
  /** @type {Record<string, unknown>} */
  const state = {
    id: repo.id,
    label: repo.label || repo.id,
    path: repo.path,
    remote: repo.remote,
    branch: repo.branch,
    present: false,
    isRepository: false,
    head: '',
    subject: '',
    dirty: 0,
    dirtyFiles: [],
    behind: 0,
    ahead: 0,
    updates: [],
    error: '',
  }
  if (typeof repo.path !== 'string' || repo.path === '') {
    state.error = 'no path is configured for this repository'
    return state
  }
  if (!existsSync(repo.path)) {
    state.error = 'the checkout is not at the configured path'
    return state
  }
  state.present = true
  // `rev-parse` answers two questions at once: is this a work tree, and where.
  const inside = await run('git', ['rev-parse', '--is-inside-work-tree'], { cwd: repo.path, timeoutMs })
  if (inside.code !== 0 || line(inside.stdout) !== 'true') {
    state.error = line(inside.stderr) || 'the path is not a git working tree'
    return state
  }
  state.isRepository = true
  const [head, subject, status] = await Promise.all([
    run('git', ['rev-parse', '--short', 'HEAD'], { cwd: repo.path, timeoutMs }),
    run('git', ['log', '-1', '--format=%s'], { cwd: repo.path, timeoutMs }),
    run('git', ['status', '--porcelain'], { cwd: repo.path, timeoutMs }),
  ])
  state.head = line(head.stdout)
  state.subject = line(subject.stdout)
  state.dirtyFiles = parseStatus(status.stdout)
  state.dirty = state.dirtyFiles.length
  // Counting against the remote-tracking ref needs no network; it only reads
  // what the last fetch recorded, which is why `check` fetches first.
  const counts = await run(
    'git', ['rev-list', '--left-right', '--count', `${repo.remote}/${repo.branch}...HEAD`],
    { cwd: repo.path, timeoutMs },
  )
  if (counts.code === 0) {
    const [behind, ahead] = line(counts.stdout).split(/\s+/).map(value => Number.parseInt(value, 10) || 0)
    state.behind = behind
    state.ahead = ahead
  } else {
    state.error = line(counts.stderr) || `no ${repo.remote}/${repo.branch} to compare against`
  }
  if (state.behind > 0 && state.error === '') {
    const log = await run(
      'git', ['log', '--oneline', '--no-decorate', `HEAD..${repo.remote}/${repo.branch}`],
      { cwd: repo.path, timeoutMs },
    )
    state.updates = String(log.stdout ?? '')
      .split(/\r?\n/)
      .map(row => row.trim())
      .filter(row => row !== '')
  }
  return state
}

/**
 * Fetch one checkout's remote so the comparison is against what is published.
 *
 * @param {object} repo - the managed repository entry.
 * @param {number} timeoutMs - how long git may take.
 * @returns {Promise<string>} an empty string on success, else the reason.
 */
async function fetchRepo(repo, timeoutMs) {
  if (typeof repo.path !== 'string' || repo.path === '' || !existsSync(repo.path)) return 'the checkout is not at the configured path'
  const result = await run('git', ['fetch', '--quiet', repo.remote], { cwd: repo.path, timeoutMs })
  if (result.code === 0) return ''
  return result.error ?? (line(result.stderr) || `git fetch exited with ${result.code}`)
}

/**
 * Fast-forward one checkout and regenerate its package graph when the manifest
 * or the lockfile moved.
 *
 * A dirty tree is refused before anything is touched: the files are the user's
 * work, and `git pull` cannot resolve them without guessing.
 *
 * @param {object} repo - the managed repository entry.
 * @param {object} options - timeouts and the package manager to run.
 * @returns {Promise<object>} what happened, including the previous and new HEAD.
 */
async function updateRepo(repo, options) {
  const { gitTimeoutMs, installTimeoutMs, packageManager } = options
  /** @type {Record<string, unknown>} */
  const outcome = {
    id: repo.id,
    label: repo.label || repo.id,
    applied: false,
    previous: '',
    installed: false,
    reloaded: null,
    error: '',
  }
  const before = await readRepo(repo, gitTimeoutMs)
  if (!before.isRepository) {
    outcome.error = before.error || 'the path is not a git working tree'
    return outcome
  }
  if (before.dirty > 0) {
    outcome.error = `the checkout has ${before.dirty} uncommitted change${before.dirty === 1 ? '' : 's'}; commit or stash them before updating`
    return outcome
  }
  outcome.previous = before.head
  const fetched = await fetchRepo(repo, gitTimeoutMs)
  if (fetched !== '') {
    outcome.error = `git fetch failed: ${fetched}`
    return outcome
  }
  const pulled = await run('git', ['pull', '--ff-only', repo.remote, repo.branch], {
    cwd: repo.path, timeoutMs: gitTimeoutMs,
  })
  if (pulled.code !== 0) {
    outcome.error = `git pull failed: ${line(pulled.stderr) || line(pulled.stdout) || `exit ${pulled.code}`}`
    return outcome
  }
  outcome.applied = true
  const after = await readRepo(repo, gitTimeoutMs)
  outcome.current = after.head
  outcome.subject = after.subject
  if (before.head === after.head) return outcome

  // A kit resolves its sub-packages through its own `node_modules`, so a new
  // workspace package that appeared in this pull has no link until the package
  // graph is regenerated.
  const changed = await run('git', ['diff', '--name-only', before.head, after.head], {
    cwd: repo.path, timeoutMs: gitTimeoutMs,
  })
  const touched = String(changed.stdout ?? '').split(/\r?\n/).map(row => row.trim())
  const needsInstall = touched.some(file =>
    file === 'package.json' || file === 'pnpm-lock.yaml' || file === 'pnpm-workspace.yaml'
    || file.endsWith('/package.json'))
  if (!needsInstall || repo.install !== true) return outcome
  const installed = await run(packageManager, ['install', '--ignore-scripts'], {
    cwd: repo.path, timeoutMs: installTimeoutMs,
  })
  if (installed.code !== 0) {
    outcome.error = `${packageManager} install failed: ${line(installed.stderr) || line(installed.stdout) || `exit ${installed.code}`}`
    return outcome
  }
  outcome.installed = true
  return outcome
}

/**
 * Ask the Host to recompose the profile so the replaced modules are loaded.
 *
 * `reconcileProfile` answers the modules it could not replace and, when the
 * profile itself moved, a restart reason; both are reported instead of a
 * success the user cannot use.
 *
 * @param {object} context - the plugin context.
 * @param {string[]} requiredIds - entry ids that must be active afterwards.
 * @returns {Promise<{ ok: boolean, pending: string[], restartReason: string, error: string }>}
 */
async function reloadProfile(context, requiredIds) {
  const hmr = context.get?.('hmr')
  if (hmr === undefined || hmr === null) {
    return { ok: false, pending: [], restartReason: '', error: 'the Host exposes no HMR service; restart the application to load the new files' }
  }
  try {
    // Reconciliation asserts its own exclusion, so it must run inside it.
    const result = await hmr.runExclusive(() => hmr.reconcileProfile(requiredIds))
    return {
      ok: true,
      pending: Array.isArray(result?.pending) ? result.pending.map(entry => String(entry?.url ?? entry)) : [],
      restartReason: typeof result?.restartReason === 'string' ? result.restartReason : '',
      error: '',
      warnings: Array.isArray(result?.warnings) ? result.warnings.map(String) : [],
    }
  } catch (error) {
    return { ok: false, pending: [], restartReason: '', error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Probe one published health route on this Host.
 *
 * @param {string} origin - the Host's own origin.
 * @param {object} probe - the configured probe entry.
 * @param {number} timeoutMs - how long the request may take.
 * @returns {Promise<object>} the probe's result.
 */
async function probeRoute(origin, probe, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  timer.unref?.()
  try {
    const response = await fetch(new URL(probe.path, origin), {
      method: 'GET',
      signal: controller.signal,
      headers: { accept: 'application/json' },
    })
    return {
      id: probe.id,
      label: probe.label || probe.id,
      path: probe.path,
      ok: response.ok,
      status: response.status,
      error: response.ok ? '' : `the route answered ${response.status}`,
    }
  } catch (error) {
    return {
      id: probe.id,
      label: probe.label || probe.id,
      path: probe.path,
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Read one `listPlugins()` row into the doctor's shape.
 *
 * @param {object} row - one row from the plugin manager.
 * @returns {object} the row's verdict.
 */
function verdictOf(row) {
  const phase = row?.fiberPhase ?? null
  const enabled = row?.enabled === true
  let verdict = 'ok'
  if (!enabled) verdict = 'off'
  else if (phase === 'failed') verdict = 'failed'
  else if (phase === 'active') verdict = 'ok'
  else if (phase === null) verdict = 'idle'
  else verdict = 'starting'
  return {
    entryId: String(row?.entryId ?? ''),
    moduleName: String(row?.moduleName ?? ''),
    title: typeof row?.meta?.title === 'string' ? row.meta.title : '',
    enabled,
    phase,
    verdict,
    diagnostic: typeof row?.diagnostic === 'string' ? row.diagnostic : '',
  }
}

export async function apply(ctx, config) {
  const logger = ctx.logger ?? console
  const endpoint = setting(config, 'endpoint', '/plugins/dsh-mini')
  const repos = setting(config, 'repos', [])
  const probes = setting(config, 'probes', [])
  const autoCheck = setting(config, 'autoCheck', true) === true
  const autoApply = setting(config, 'autoApply', false) === true
  const gitTimeoutMs = setting(config, 'gitTimeoutMs', GIT_TIMEOUT_MS)
  const installTimeoutMs = setting(config, 'installTimeoutMs', INSTALL_TIMEOUT_MS)
  const probeTimeoutMs = setting(config, 'probeTimeoutMs', PROBE_TIMEOUT_MS)
  const packageManager = setting(config, 'packageManager', 'pnpm')

  /** The last reading, so the page can render without re-running git. */
  const state = {
    revision: REVISION,
    checking: false,
    applying: false,
    checkedAt: 0,
    updatedAt: 0,
    repos: [],
    probes: [],
    doctor: { total: 0, active: 0, failed: 0, off: 0, starting: 0, idle: 0, rows: [], problems: [] },
    lastApply: null,
    lastError: '',
  }
  /** One update at a time: two writers on one checkout would race. */
  let busy = false

  /** Read every managed checkout without changing it, fetching first. */
  async function check({ fetch = true } = {}) {
    if (busy) return state
    busy = true
    state.checking = true
    try {
      /** @type {object[]} */
      const rows = []
      for (const repo of repos) {
        if (fetch) await fetchRepo(repo, gitTimeoutMs)
        rows.push(await readRepo(repo, gitTimeoutMs))
      }
      state.repos = rows
      state.checkedAt = Date.now()
      state.lastError = ''
    } catch (error) {
      state.lastError = error instanceof Error ? error.message : String(error)
      logger.warn?.(`dsh-mini: check failed (${state.lastError})`)
    } finally {
      state.checking = false
      busy = false
    }
    return state
  }

  /** Apply every waiting fast-forward, then ask the Host to reload. */
  async function applyAll() {
    if (busy) return { ok: false, error: 'another check or update is already running' }
    busy = true
    state.applying = true
    const results = []
    try {
      for (const repo of repos) results.push(await updateRepo(repo, { gitTimeoutMs, installTimeoutMs, packageManager }))
      const changed = results.filter(result => result.applied === true && result.previous !== result.current)
      let reload = null
      if (changed.length > 0) reload = await reloadProfile(ctx, [])
      state.lastApply = { at: Date.now(), results, reload }
      state.updatedAt = Date.now()
      const failed = results.filter(result => result.error !== '')
      state.lastError = failed.length > 0 ? failed.map(result => `${result.label}: ${result.error}`).join('; ') : ''
      return { ok: failed.length === 0, results, reload }
    } finally {
      state.applying = false
      busy = false
      await check({ fetch: false }).catch(() => {})
    }
  }

  /** Read every row's phase and probe the published health routes. */
  async function doctor() {
    const manager = ctx.get?.('pluginManager')
    const origin = typeof ctx.webServer?.getOrigin === 'function' ? ctx.webServer.getOrigin() : ''
    /** @type {object[]} */
    let rows = []
    let rowsError = ''
    if (manager === undefined || manager === null) {
      rowsError = 'the Host exposes no plugin manager; row phases cannot be read'
    } else {
      try {
        rows = await manager.listPlugins()
      } catch (error) {
        rowsError = error instanceof Error ? error.message : String(error)
      }
    }
    const verdicts = rows.map(verdictOf)
    const counted = { total: verdicts.length, active: 0, failed: 0, off: 0, starting: 0, idle: 0 }
    for (const row of verdicts) {
      if (row.verdict === 'ok') counted.active += 1
      else if (row.verdict === 'failed') counted.failed += 1
      else if (row.verdict === 'off') counted.off += 1
      else if (row.verdict === 'idle') counted.idle += 1
      else counted.starting += 1
    }
    // Only rows that are meant to run and are not running are problems: a row
    // the user turned off is a decision, not a fault.
    const problems = verdicts.filter(row => row.verdict === 'failed' || row.verdict === 'starting' || row.verdict === 'idle')
    /** @type {object[]} */
    const probed = []
    if (origin !== '') {
      for (const probe of probes) probed.push(await probeRoute(origin, probe, probeTimeoutMs))
    }
    state.doctor = {
      ...counted,
      rows: verdicts,
      problems,
      probes: probed,
      rowsError,
      at: Date.now(),
    }
    return state.doctor
  }

  /** Read the request body as JSON, tolerating an empty one. */
  function readBody(req) {
    return new Promise(resolve => {
      let body = ''
      req.on('data', chunk => {
        body += String(chunk)
        if (body.length > 65_536) req.destroy()
      })
      req.on('end', () => {
        try {
          resolve(body === '' ? {} : JSON.parse(body))
        } catch {
          resolve({})
        }
      })
      req.on('error', () => resolve({}))
    })
  }

  /** The document the Settings page renders. */
  function view() {
    return {
      revision: state.revision,
      endpoint,
      autoCheck,
      autoApply,
      checking: state.checking,
      applying: state.applying,
      checkedAt: state.checkedAt,
      updatedAt: state.updatedAt,
      repos: state.repos,
      probes: state.doctor.probes ?? [],
      doctor: state.doctor,
      lastApply: state.lastApply,
      lastError: state.lastError,
    }
  }

  // The brand artwork ships inside this package and is served from it, so the
  // page never depends on GitHub being reachable and the mark keeps rendering
  // offline. The file is read once at boot; a missing asset is not fatal.
  const brandMarkPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'logo.svg')
  let brandMark = null
  try {
    brandMark = readFileSync(brandMarkPath, 'utf8')
  } catch (error) {
    logger.warn?.(`dsh-mini: could not read the brand mark (${error instanceof Error ? error.message : String(error)})`)
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: `${endpoint}/logo.svg`,
    handler: (req, res) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405)
        res.end()
        return
      }
      if (brandMark === null) {
        res.writeHead(404)
        res.end()
        return
      }
      res.writeHead(200, {
        'content-type': 'image/svg+xml; charset=utf-8',
        // Immutable for this build: the artwork only changes with the package.
        'cache-control': 'public, max-age=86400',
      })
      res.end(req.method === 'HEAD' ? undefined : brandMark)
    },
  }), 'dsh-mini: brand mark')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: endpoint,
    handler: (req, res) => {
      const reply = (status, body) => {
        res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        res.end(JSON.stringify(body))
      }
      if (req.method === 'GET' || req.method === 'HEAD') {
        // Reading the page must not show a reading older than the checkout:
        // a cached "behind" or "dirty" survives a commit the user just made,
        // and the page then contradicts `git status`. A read costs one local
        // `git status` per repository (no network unless a check is asked for),
        // which is cheap enough to do on every open.
        void check({ fetch: false })
          .then(() => doctor())
          .then(() => reply(200, view()))
          .catch(error => {
            logger.warn?.(`dsh-mini: could not read the status (${error instanceof Error ? error.message : String(error)})`)
            reply(500, { error: 'failed' })
          })
        return
      }
      if (req.method !== 'POST') {
        reply(405, { error: 'method-not-allowed' })
        return
      }
      void (async () => {
        const body = await readBody(req)
        const action = body?.action
        try {
          if (action === 'check') {
            await check({ fetch: true })
            await doctor()
            reply(200, view())
            return
          }
          if (action === 'apply' || action === 'update-now') {
            const result = await applyAll()
            await doctor()
            reply(result.ok ? 200 : 409, { ...view(), apply: result })
            return
          }
          if (action === 'doctor') {
            await doctor()
            reply(200, view())
            return
          }
          reply(400, { error: 'unknown-action' })
        } catch (error) {
          state.lastError = error instanceof Error ? error.message : String(error)
          reply(500, { error: state.lastError })
        }
      })()
    },
  }), 'dsh-mini: status route')

  // One read-only check after boot: the page then opens with real numbers
  // instead of a spinner. It never moves a checkout on its own.
  if (autoCheck) {
    const timer = setTimeout(() => {
      void (async () => {
        await check({ fetch: true })
        if (autoApply && state.repos.some(repo => repo.behind > 0)) await applyAll()
        logger.info?.(`dsh-mini: ${state.repos.map(repo => `${repo.label} ${repo.behind > 0 ? `behind ${repo.behind}` : 'current'}`).join(', ') || 'no managed repositories'}`)
      })().catch(error => {
        logger.warn?.(`dsh-mini: the startup check failed (${error instanceof Error ? error.message : String(error)})`)
      })
    }, 15_000)
    timer.unref?.()
    ctx.effect(() => () => clearTimeout(timer), 'dsh-mini: startup check')
  }
}
