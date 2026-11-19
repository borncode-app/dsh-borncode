import assert from 'node:assert/strict'
import test from 'node:test'

/**
 * The plugin keeps its classifier private, so this test drives it through the
 * public entry point: a fake Cordis context captures the guard the plugin
 * registers, and the test calls that guard with real tool executions.
 */

/** A fake context recording what the plugin registered. */
function fakeContext() {
  const captured = { guard: null, sections: [], logger: [] }
  const ctx = {
    logger: () => ({ info: (line) => captured.logger.push(line), warn: () => {} }),
    effect: (factory) => {
      const dispose = factory()
      return () => dispose?.()
    },
    tools: {
      guard: (fn) => {
        captured.guard = fn
        return () => {
          captured.guard = null
        }
      },
    },
    get: () => ({
      section: (section) => {
        captured.sections.push(section)
        return () => {}
      },
      getSectionOrder: () => 100,
    }),
  }
  return { ctx, captured }
}

/** Build a tool execution the guard accepts. */
function exec(name, args) {
  return { callId: 'c1', rootCallId: 'c1', name, token: 't1', arguments: args, signal: new AbortController().signal }
}

/**
 * Load the plugin and wait for its first docker context probe.
 *
 * @returns {Promise<{ guard: Function|null, sections: object[], logger: string[] }>} the capture.
 */
async function load() {
  const { apply, Config } = await import('../index.js')
  const { ctx, captured } = fakeContext()
  apply(ctx, Config({}))
  await new Promise((resolve) => setTimeout(resolve, 400))
  return captured
}

test('development commands are denied with the kiri command', async () => {
  const captured = await load()
  assert.ok(captured.guard, 'the plugin registers a guard')
  const reason = captured.guard(exec('pwsh', { command: 'docker run --rm alpine echo hello' }))
  assert.ok(reason, 'the call is denied')
  assert.match(reason, /docker-kiri/)
  assert.match(reason, /docker --context kiri run --rm alpine echo hello/)
})

test('compose up is a development call', async () => {
  const captured = await load()
  const reason = captured.guard(exec('pwsh', { command: 'docker compose up -d' }))
  assert.ok(reason)
  assert.match(reason, /docker --context kiri compose up -d/)
})

test('a build keeps the default runtime', async () => {
  const captured = await load()
  assert.equal(captured.guard(exec('pwsh', { command: 'docker build -t app:1 .' })), undefined)
})

test('compose build keeps the default runtime', async () => {
  const captured = await load()
  assert.equal(captured.guard(exec('pwsh', { command: 'docker compose build' })), undefined)
})

test('a push keeps the default runtime', async () => {
  const captured = await load()
  assert.equal(captured.guard(exec('pwsh', { command: 'docker push registry/app:1' })), undefined)
})

test('image housekeeping is not a runtime choice', async () => {
  const captured = await load()
  // Deleting an image must work for a production build the hook just allowed.
  assert.equal(captured.guard(exec('pwsh', { command: 'docker rmi app:1' })), undefined)
  assert.equal(captured.guard(exec('pwsh', { command: 'docker image prune -f' })), undefined)
})

test('removing a development container is still a development call', async () => {
  const captured = await load()
  const reason = captured.guard(exec('pwsh', { command: 'docker rm -f dev-box' }))
  assert.ok(reason)
  assert.match(reason, /docker --context kiri rm -f dev-box/)
})

test('an explicit context is left alone', async () => {
  const captured = await load()
  assert.equal(captured.guard(exec('pwsh', { command: 'docker --context desktop-linux run alpine' })), undefined)
})

test('a non-docker command is left alone', async () => {
  const captured = await load()
  assert.equal(captured.guard(exec('pwsh', { command: 'npm test' })), undefined)
})

test('another tool is never inspected', async () => {
  const captured = await load()
  assert.equal(captured.guard(exec('read', { command: 'docker run alpine' })), undefined)
})

test('a chained docker command is caught', async () => {
  const captured = await load()
  const reason = captured.guard(exec('bash', { command: 'npm run db:up && docker compose up -d' }))
  assert.ok(reason)
  assert.match(reason, /docker --context kiri compose up -d/)
})

test('the system prompt carries the dev/prod split', async () => {
  const captured = await load()
  assert.equal(captured.sections.length, 1)
  const text = captured.sections[0].text()
  assert.match(text, /docker --context kiri compose up/)
  assert.match(text, /Do not pass --context kiri to a build/)
})

test('the denial is actionable whether or not kiri is installed', async () => {
  const captured = await load()
  const reason = captured.guard(exec('pwsh', { command: 'docker ps' }))
  assert.ok(reason)
  assert.match(reason, /docker --context kiri ps/)
  assert.ok(captured.logger.some((line) => line.includes('docker-kiri')))
})
