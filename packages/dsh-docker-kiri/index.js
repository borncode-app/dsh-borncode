import z from '@deepseek-ai/schemastery'
import { execFile } from 'node:child_process'

/**
 * There is no command rewriting here on purpose.
 *
 * kiri speaks the Docker Engine API, so once its context is the active one,
 * `docker compose up`, `docker ps` and `docker run` all reach it with no extra
 * flag. That is the whole point: the development loop stays ordinary docker
 * and simply runs on the lighter engine.
 *
 * The only thing left to say is where builds go, because a build follows the
 * selected buildx builder rather than the active docker context.
 */

/** How long one probe may take. */
const PROBE_TIMEOUT_MS = 5000

/** The docker subcommands that make an artifact rather than run a container. */
const BUILD_COMMANDS = new Set(['build', 'buildx', 'push'])

/**
 * Run one command and return its stdout, or an empty string when it fails.
 *
 * @param {string} command - the executable.
 * @param {string[]} args - its arguments.
 * @returns {Promise<string>} the standard output.
 */
function run(command, args) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: PROBE_TIMEOUT_MS }, (error, stdout) => {
      resolve(error === null ? stdout : '')
    })
  })
}

/**
 * Read the docker facts the prompt should state: which context is active, and
 * which buildx builder a plain `docker build` would use.
 *
 * @returns {Promise<{ contexts: string[], active: string | null }>} the probe.
 */
async function probe() {
  const listing = await run('docker', ['context', 'ls', '--format', '{{.Name}}\t{{if .Current}}current{{end}}'])
  const contexts = []
  let active = null
  for (const line of listing.split(/\r?\n/)) {
    const [name, marker] = line.split('\t')
    const trimmed = name?.trim()
    if (!trimmed) continue
    contexts.push(trimmed)
    if (marker?.trim() === 'current') active = trimmed
  }
  return { contexts, active }
}

export const Config = z.object({
  /** Turn the guidance off without uninstalling the plugin. */
  enabled: z.boolean().default(true),
  /** The docker context the development loop is expected to use. */
  context: z.string().default('kiri'),
  /**
   * Write the runtime split into the system prompt. Nothing is blocked either
   * way: kiri is an ordinary Docker endpoint, so plain docker commands reach it
   * once its context is active.
   */
  guideInPrompt: z.boolean().default(true),
  /**
   * Also state which buildx builder a plain `docker build` resolves to, so a
   * build that lands on the wrong engine is visible before it runs.
   */
  reportBuilder: z.boolean().default(true),
})

/** Services this plugin reads; all are core Host services. */
export const inject = ['systemPrompt']

/**
 * Compose the prompt section from a live probe.
 *
 * @param {{ contexts: string[], active: string | null }} facts - the probe.
 * @param {string} contextName - the context development work is expected on.
 * @param {string | null} builder - the buildx builder a build would use.
 * @returns {string} the section body.
 */
function guide(facts, contextName, builder) {
  const lines = ['<docker-kiri>']
  if (facts.active === null) {
    lines.push(`No docker context is active, and ${facts.contexts.length} are registered.`)
  } else if (facts.active === contextName) {
    lines.push(`The active docker context is "${contextName}", the lightweight kiri engine.`)
    lines.push('Plain docker commands already reach kiri, so run them without --context:')
    lines.push('- docker compose up -d')
    lines.push('- docker ps')
    lines.push('- docker exec -it <container> sh')
  } else {
    lines.push(`The active docker context is "${facts.active}", not "${contextName}".`)
    lines.push(`kiri is a Docker-compatible engine; select it once with "docker context use ${contextName}" so plain docker commands reach it.`)
  }
  lines.push('')
  lines.push('kiri is a standard Docker Engine endpoint, not a separate CLI dialect: it needs no kiri-specific syntax.')
  if (builder !== null) {
    lines.push(`A plain "docker build" uses the buildx builder "${builder}", which follows the selected builder rather than the active context.`)
    lines.push('A build or push that must produce the production artifact belongs on the project\'s normal Docker runtime; check the builder before a release build.')
  }
  lines.push('</docker-kiri>')
  return lines.join('\n')
}

/**
 * Read the buildx builder that a plain `docker build` would select.
 *
 * @returns {Promise<string | null>} the builder name, or null when unknown.
 */
async function probeBuilder() {
  const listing = await run('docker', ['buildx', 'ls'])
  for (const line of listing.split(/\r?\n/)) {
    // The selected builder is marked with an asterisk on its own line; a
    // builder line is `name` or `name*`, and its nodes follow prefixed by `\_`.
    const match = /^(\S+?)(\*?)\s{2,}/.exec(line)
    if (match !== null && match[2] === '*') return match[1]
  }
  return null
}

/**
 * Register the kiri guidance.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx - the plugin context.
 * @param {z.infer<typeof Config>} config - the row's validated configuration.
 */
export function apply(ctx, config) {
  if (!config.enabled) return

  const contextName = config.context
  const logger = ctx.logger('docker-kiri')

  /** The last probe, and when it ran. */
  let facts = { contexts: [], active: null, builder: null, readAt: 0 }

  /** Refresh the cached probe, at most once a minute. */
  const refresh = async () => {
    const [contextFacts, builder] = await Promise.all([
      probe(),
      config.reportBuilder ? probeBuilder() : Promise.resolve(null),
    ])
    facts = { ...contextFacts, builder, readAt: Date.now() }
    return facts
  }

  const prompt = ctx.get('systemPrompt')
  if (prompt !== undefined) {
    // The section text is a function of the cached probe: the harness calls it
    // on every assembly, so the text follows the machine instead of a snapshot
    // taken at load time.
    const dispose = prompt.section({
      name: 'docker-kiri',
      order: prompt.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX') + 2,
      text: () => guide(facts, contextName, facts.builder),
      interpolate: false,
    })
    ctx.effect(() => dispose, 'docker-kiri: prompt section')
  }

  // Refresh on a slow interval so the section tracks a context switch without
  // the plugin ever blocking a call.
  ctx.effect(() => ctx.interval(() => void refresh(), 60_000), 'docker-kiri: refresh')

  void refresh().then((loaded) => {
    logger.info(
      `docker-kiri: active docker context is "${loaded.active ?? 'none'}"; ` +
        `build uses builder "${loaded.builder ?? 'unknown'}"; guidance only, no command is blocked`,
    )
  })
}
