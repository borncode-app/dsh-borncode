import z from '@deepseek-ai/schemastery'
import { execFile } from 'node:child_process'

/**
 * Docker commands that build a production artifact. These keep the Docker
 * runtime the project already has; `kiri` is for the dev loop only.
 */
const PROD_COMMANDS = new Set(['build', 'buildx', 'push'])

/**
 * Docker subcommands that start, inspect or drive development containers.
 * These are the ones this plugin redirects to the kiri context.
 *
 * Image housekeeping is deliberately absent: `rmi` and `image prune` delete
 * artifacts, they do not pick a runtime to run something on, so redirecting
 * them would block cleanup of the production images a build just made.
 */
const DEV_COMMANDS = new Set([
  'run',
  'create',
  'start',
  'stop',
  'restart',
  'rm',
  'exec',
  'attach',
  'logs',
  'ps',
  'port',
  'top',
  'stats',
  'inspect',
  'wait',
  'kill',
  'pause',
  'unpause',
  'rename',
  'update',
  'compose',
  'cp',
])

/**
 * Shell programs a tool call may route through. `bash -lc "docker run ..."`
 * is the same intent as `docker run ...`, so both are inspected.
 */
const SHELLS = new Set(['bash', 'sh', 'zsh', 'pwsh', 'powershell', 'cmd', 'cmd.exe'])

/**
 * Tools whose arguments carry a command line to inspect. Anything else is
 * left alone so this plugin cannot deny an unrelated tool by accident.
 */
const COMMAND_TOOLS = new Set(['bash', 'pwsh'])

/** How long one `docker context` probe may take. */
const PROBE_TIMEOUT_MS = 5000

/**
 * Docker refuses to start or run without one of these; a line that has none of
 * them is not a container command and is left alone.
 *
 * @param {string} text - one shell line, already trimmed.
 * @returns {boolean} whether the line is a docker invocation worth inspecting.
 */
function mentionsDocker(text) {
  return /(^|[\s;&|(])docker(?:\.[a-z]+)?\s/i.test(text) || /(^|[\s;&|(])docker\s*$/.test(text)
}

/**
 * Split one shell line on the operators that separate commands, so each
 * command is inspected on its own.
 *
 * @param {string} line - one shell line.
 * @returns {string[]} the commands on that line.
 */
function commandsOfLine(line) {
  return line
    .split(/&&|\|\||;|\|/)
    .map((part) => part.trim())
    .filter((part) => part !== '')
}

/**
 * Read the docker invocation a single command performs, skipping the global
 * options that may sit between `docker` and the subcommand.
 *
 * @param {string} command - one command with its arguments.
 * @returns {{ subcommand: string, rest: string[] } | null} the invocation, or
 *   null when the command does not start a docker call.
 */
function dockerInvocation(command) {
  const tokens = command.split(/\s+/).filter((token) => token !== '')
  let index = 0
  if (tokens[0] === 'sudo' || tokens[0] === 'env') {
    index += 1
    while (index < tokens.length && (tokens[index].startsWith('-') || tokens[index].includes('='))) {
      index += 1
    }
  }
  if (tokens[index] !== 'docker') return null
  index += 1
  while (index < tokens.length && tokens[index].startsWith('-')) {
    // `--context kiri` and `--host tcp://...` carry a value in the next token.
    if (tokens[index] === '--context' || tokens[index] === '--host' || tokens[index] === '-c' || tokens[index] === '-H') {
      index += 2
      continue
    }
    index += 1
  }
  if (index >= tokens.length) return null
  return { subcommand: tokens[index].toLowerCase(), rest: tokens.slice(index + 1) }
}

/**
 * Read the shell command a tool call runs.
 *
 * @param {string} name - the tool name.
 * @param {unknown} args - the parsed tool arguments.
 * @returns {string[]} the command lines this call runs, or an empty list.
 */
function commandLines(name, args) {
  if (!COMMAND_TOOLS.has(name)) return []
  if (args === null || typeof args !== 'object') return []
  const lines = []
  for (const key of ['command', 'script', 'cmd']) {
    const value = args[key]
    if (typeof value === 'string' && value.trim() !== '') lines.push(value)
  }
  return lines
}

/**
 * Decide what one docker invocation is for.
 *
 * Build-time commands stay on the project's Docker runtime; dev-time container
 * commands belong on kiri. A compose subcommand is classified by what it does:
 * `up`, `run` and `exec` start a dev stack, while `build` and `push` make an
 * artifact.
 *
 * @param {{ subcommand: string, rest: string[] }} invocation - one docker call.
 * @returns {'dev' | 'prod' | 'other'} the classification.
 */
function classify(invocation) {
  const { subcommand, rest } = invocation
  if (PROD_COMMANDS.has(subcommand)) return 'prod'
  if (subcommand !== 'compose') {
    return DEV_COMMANDS.has(subcommand) ? 'dev' : 'other'
  }
  const composeSubcommand = (rest.find((token) => !token.startsWith('-')) ?? '').toLowerCase()
  if (composeSubcommand === 'build' || composeSubcommand === 'push') return 'prod'
  if (
    composeSubcommand === 'up' ||
    composeSubcommand === 'run' ||
    composeSubcommand === 'exec' ||
    composeSubcommand === 'restart' ||
    composeSubcommand === 'start'
  ) {
    return 'dev'
  }
  return 'other'
}

/**
 * Whether a command line carries an explicit context, so the user already
 * chose the runtime and the hook must not override that choice.
 *
 * @param {string} line - the complete command line.
 * @param {string[]} rest - the arguments after the subcommand.
 * @returns {boolean} whether a context or host was named.
 */
function namesContext(line, rest) {
  return /--context[=\s]|--host[=\s]|DOCKER_CONTEXT|DOCKER_HOST/.test(line) || rest.some((token) => token.includes('://'))
}

/**
 * Ask the docker client which contexts exist, so the denial can name the exact
 * command that is available on this machine.
 *
 * @returns {Promise<string[]>} the context names the client reports.
 */
function readContexts() {
  return new Promise((resolve) => {
    execFile('docker', ['context', 'ls', '--format', '{{.Name}}'], { timeout: PROBE_TIMEOUT_MS }, (error, stdout) => {
      if (error !== null) {
        resolve([])
        return
      }
      resolve(
        stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((name) => name !== ''),
      )
    })
  })
}

/**
 * Build the model-facing reason for one redirected command.
 *
 * @param {string} command - the exact command the tool call runs.
 * @param {string} contextName - the docker context development work targets.
 * @param {string[]} available - the context names the client reports.
 * @param {Set<string>} aliases - names that count as a kiri runtime.
 * @returns {string} the denial reason.
 */
function denialReason(command, contextName, available, aliases) {
  const corrected = command.replace(/(^|\s)docker(\s)/, `$1docker --context ${contextName}$2`).trim()
  if (available.some((name) => aliases.has(name))) {
    return [
      'docker-kiri: start, run and inspect development containers on kiri, not on the default Docker runtime.',
      `Run it as: ${corrected}`,
      'A build or a push that produces the production artifact keeps the default context, so run those without --context.',
    ].join(' ')
  }
  return [
    'docker-kiri: this development call needs the kiri runtime, but no kiri docker context is registered.',
    `The docker client reports these contexts: ${available.length === 0 ? 'none readable' : available.join(', ')}.`,
    'Install kiri from https://github.com/libracoder/kiri (on Windows the .msi serves its context through WSL 2), then open it once so it registers the context.',
    `After that, run: ${corrected}`,
    'Builds and pushes are unaffected: they keep using the default context.',
  ].join(' ')
}

export const Config = z.object({
  /** Turn the hook off without uninstalling it. */
  enabled: z.boolean().default(true),
  /** Docker context the dev loop runs on. */
  context: z.string().default('kiri'),
  /** Names the hook recognizes as a kiri-managed runtime. */
  contextAliases: z.array(z.string()).default(['kiri']),
  /**
   * Offer the kiri command in the system prompt, so the model reaches for it
   * before a denied call rather than after one.
   */
  guideInPrompt: z.boolean().default(true),
  /**
   * Deny a dev call whose command names no context, and point at kiri. Off
   * leaves the system prompt as the only guidance.
   */
  block: z.boolean().default(true),
})

/** Services this plugin reads; all are core Host services. */
export const inject = ['tools', 'systemPrompt']

const GUIDE = [
  '<docker-kiri>',
  'This machine runs its development containers on kiri, a Docker-compatible runtime, instead of Docker Desktop.',
  'When a task starts, runs, inspects or stops containers for development or testing, target kiri:',
  '- docker --context kiri run ...',
  '- docker --context kiri compose up -d',
  'Builds and pushes that produce a production artifact stay on the project\'s normal Docker runtime:',
  '- docker build ... (no --context, so the default context is used)',
  'Do not pass --context kiri to a build or a push.',
  '</docker-kiri>',
].join('\n')

/**
 * Register the docker-to-kiri hook.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx - the plugin context.
 * @param {z.infer<typeof Config>} config - the row's validated configuration.
 */
export function apply(ctx, config) {
  if (!config.enabled) return

  const contextName = config.context
  const aliases = new Set([contextName, ...config.contextAliases])
  const logger = ctx.logger('docker-kiri')

  /** The context names from the last probe, and when it ran. */
  let report = { available: [], readAt: 0 }

  /**
   * Read the context list, reusing a probe younger than a minute.
   *
   * @param {boolean} force - read now even when the last probe is recent.
   * @returns {Promise<string[]>} the context names the client reports.
   */
  const contexts = async (force = false) => {
    if (!force && Date.now() - report.readAt < 60_000) return report.available
    const available = await readContexts()
    report = { available, readAt: Date.now() }
    return available
  }

  /**
   * Find the first development command in one line that names no context.
   *
   * @param {string} line - one command line a tool call runs.
   * @returns {string | null} the offending command, or null when none.
   */
  const offendingCommand = (line) => {
    if (!mentionsDocker(line)) return null
    for (const command of commandsOfLine(line)) {
      const invocation = dockerInvocation(command)
      if (invocation === null) continue
      if (classify(invocation) !== 'dev') continue
      if (namesContext(line, invocation.rest)) continue
      return command
    }
    return null
  }

  if (config.block) {
    ctx.effect(
      () =>
        ctx.tools.guard((exec) => {
          const lines = commandLines(exec.name, exec.arguments)
          if (lines.length === 0) return undefined
          let target = null
          for (const line of lines) {
            target = offendingCommand(line)
            if (target !== null) break
          }
          if (target === null) return undefined
          // The guard is synchronous by contract, so it answers from the last
          // probe and refreshes it in the background for the next call.
          void contexts()
          if (report.readAt === 0) {
            return [
              'docker-kiri: this development call needs the kiri runtime, and the docker context list is still being read.',
              `Retry in a moment, or run it as: ${target.replace(/(^|\s)docker(\s)/, `$1docker --context ${contextName}$2`).trim()}`,
            ].join(' ')
          }
          return denialReason(target, contextName, report.available, aliases)
        }),
      'docker-kiri: tool guard',
    )
  }

  if (config.guideInPrompt) {
    const prompt = ctx.get('systemPrompt')
    if (prompt !== undefined) {
      const dispose = prompt.section({
        name: 'docker-kiri',
        order: prompt.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX') + 2,
        text: () => GUIDE,
        interpolate: false,
      })
      ctx.effect(() => dispose, 'docker-kiri: prompt section')
    }
  }

  // Fill the first report at load time so the guard has an answer for the very
  // first call instead of reporting that it is still reading.
  void contexts(true).then((loaded) => {
    logger.info(
      `docker-kiri: dev containers target the "${contextName}" context; ` +
        `${loaded.some((name) => aliases.has(name)) ? 'the context is registered' : 'the context is not registered yet'}`,
    )
  })
}
