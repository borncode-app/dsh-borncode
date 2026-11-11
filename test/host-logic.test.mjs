// Logic harness for dsh-auto-continue's Host half: a fake Cordis context, a fake
// schedule service, and a fake HTTP route. Proves the limit -> book -> toggle ->
// cancel -> resume state machine without touching the running Harness.
// The plugin ships with automatic continuation off, so the harness starts by
// proving that fresh state is off and then turns the switch on explicitly.
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { existsSync, rmSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const pluginDir = new URL('../', import.meta.url)
const statePath = fileURLToPath(new URL('state.json', pluginDir))
if (existsSync(statePath)) rmSync(statePath)

const { apply, Config } = await import(new URL('index.js', pluginDir).href)

/** Fake schedule service that records every management call. */
function fakeSchedule() {
  const tasks = new Map()
  const calls = []
  let seq = 0
  const schedule = {
    calls,
    tasks,
    async list(request = {}) {
      calls.push(['list', request])
      const items = [...tasks.values()].filter(task => task.status === 'active')
      return { items, shown: items.length, total: items.length, limit: 100, offset: 0 }
    },
    async create(request, actor) {
      calls.push(['create', request, actor])
      const id = `task-${++seq}`
      const task = {
        id,
        title: request.title,
        prompt: request.prompt,
        target: request.target,
        scheduledAt: new Date(Date.now() + request.timing.after_seconds * 1000).toISOString(),
        status: 'active',
      }
      tasks.set(id, task)
      return task
    },
    async edit(request) {
      calls.push(['edit', request])
      const task = tasks.get(request.id)
      if (request.action === 'delete') {
        const existed = tasks.delete(request.id)
        if (!existed) throw new Error('schedule_not_found')
        return { id: request.id, deleted: true }
      }
      if (task === undefined) throw new Error('schedule_not_found')
      Object.assign(task, request.patch)
      if (request.patch.timing?.kind === 'after') {
        task.scheduledAt = new Date(Date.now() + request.patch.timing.after_seconds * 1000).toISOString()
      }
      return task
    },
  }
  return schedule
}

/** Fake Host context: listener registry, effect runner, HTTP route, services. */
function fakeContext(schedule) {
  const handlers = new Map()
  const routes = []
  const logs = []
  const ctx = {
    logs,
    handlers,
    routes,
    logger: {
      info: (message) => logs.push(['info', message]),
      warn: (message) => logs.push(['warn', message]),
    },
    get: (name) => (name === 'schedule' ? schedule : undefined),
    on: (name, handler) => {
      const list = handlers.get(name) ?? []
      list.push(handler)
      handlers.set(name, list)
      return () => {
        const current = handlers.get(name) ?? []
        handlers.set(name, current.filter(entry => entry !== handler))
      }
    },
    effect: (fn) => {
      const dispose = fn()
      return typeof dispose === 'function' ? dispose : () => undefined
    },
    webServer: {
      getOrigin: () => 'http://127.0.0.1:54588',
      register: (route) => {
        routes.push(route)
        return () => {
          const index = routes.indexOf(route)
          if (index >= 0) routes.splice(index, 1)
        }
      },
    },
  }
  return ctx
}

/** Drive one captured waterfall listener and let its background booking settle. */
async function fire(ctx, name, payload) {
  const handlers = ctx.handlers.get(name) ?? []
  assert.ok(handlers.length > 0, `no listener for ${name}`)
  const decision = handlers[0](payload, async () => undefined)
  await decision
  // The listener books in the background so the failed turn never waits on a
  // probe; give the live quota probe room to answer before asserting.
  await new Promise(resolve => setTimeout(resolve, 2500))
  return decision
}

/** Call the registered Host route with a synthetic request. */
async function request(ctx, method, body) {
  const route = ctx.routes[0]
  assert.ok(route !== undefined, 'no route registered')
  const req = new EventEmitter()
  req.method = method
  req.url = route.path
  const response = {
    status: undefined,
    headers: undefined,
    body: '',
    writeHead(status, headers) {
      this.status = status
      this.headers = headers
    },
    end(text) {
      this.body = text ?? ''
    },
  }
  const answered = new Promise((resolve, reject) => {
    response.end = (text) => {
      response.body = text ?? ''
      resolve()
    }
    setTimeout(() => reject(new Error('route did not answer')), 5000)
  })
  route.handler(req, response)
  if (body !== undefined) req.emit('data', Buffer.from(JSON.stringify(body)))
  req.emit('end')
  await answered
  return { status: response.status, json: JSON.parse(response.body) }
}

const schedule = fakeSchedule()
const ctx = fakeContext(schedule)
await apply(ctx, Config({}))

// 1. Fresh state: off, supported, nothing booked.
let state = await request(ctx, 'GET')
assert.equal(state.status, 200)
assert.equal(state.json.enabled, false)
assert.equal(state.json.supported, true)
assert.deepEqual(state.json.pending, [])
console.log('ok 1 fresh state is off:', JSON.stringify(state.json))

// 2. The plugin starts off, so the switch is turned on before anything is booked.
state = await request(ctx, 'POST', { action: 'toggle' })
assert.equal(state.json.enabled, true)
assert.equal(JSON.parse(readFileSync(statePath, 'utf8')).enabled, true)
console.log('ok 2 switch turned on')

// 3. A spent limit books exactly one continuation for that session.
const limitFailure = { code: 'QUOTA', message: 'quota exceeded', status: 402 }
await fire(ctx, 'agent/request-error', {
  turn: 1,
  step: 1,
  provider: 'minimax-api',
  failure: limitFailure,
  signal: new AbortController().signal,
  agent: { session: { id: 'session-test', header: { id: 'session-test', isSeeded: false } } },
})
const created = schedule.calls.filter(call => call[0] === 'create')
assert.equal(created.length, 1)
assert.equal(created[0][1].target.kind, 'session')
assert.equal(created[0][1].target.sessionId, 'session-test')
assert.ok(created[0][1].prompt.includes('<auto_continue>'))
assert.ok(created[0][1].timing.kind === 'after' && created[0][1].timing.after_seconds >= 60, `after_seconds ${created[0][1].timing.after_seconds}`)
state = await request(ctx, 'GET')
assert.equal(state.json.pending.length, 1)
assert.equal(state.json.pending[0].sessionId, 'session-test')
assert.equal(state.json.pending[0].attempts, 1)
console.log('ok 3 booked:', JSON.stringify(state.json.pending[0]), 'after', created[0][1].timing.after_seconds, 's')

// 4. A second limit failure moves the same task instead of adding one.
await fire(ctx, 'agent/request-error', {
  turn: 2,
  step: 1,
  provider: 'minimax-api',
  failure: limitFailure,
  signal: new AbortController().signal,
  agent: { session: { id: 'session-test', header: { id: 'session-test', isSeeded: false } } },
})
assert.equal(schedule.calls.filter(call => call[0] === 'create').length, 1)
assert.equal(schedule.calls.filter(call => call[0] === 'edit').length, 1)
state = await request(ctx, 'GET')
assert.equal(state.json.pending.length, 1)
assert.equal(state.json.pending[0].attempts, 2)
console.log('ok 4 moved:', JSON.stringify(state.json.pending[0]))

// 5. A transient failure code changes nothing.
await fire(ctx, 'agent/request-error', {
  turn: 3,
  step: 1,
  provider: 'minimax-api',
  failure: { code: 'SERVER', message: 'boom', status: 500 },
  signal: new AbortController().signal,
  agent: { session: { id: 'session-test', header: { id: 'session-test', isSeeded: false } } },
})
assert.equal(schedule.calls.filter(call => call[0] === 'create').length, 1)
console.log('ok 5 transient failure ignored')

// 6. A delegated child session never books a reminder.
await fire(ctx, 'agent/request-error', {
  turn: 1,
  step: 1,
  provider: 'minimax-api',
  failure: limitFailure,
  signal: new AbortController().signal,
  agent: { session: { id: 'session-child', header: { id: 'session-child', isSeeded: false, parentSession: 'session-test' } } },
})
assert.equal(schedule.calls.filter(call => call[0] === 'create').length, 1)
console.log('ok 6 subagent skipped')

// 7. Turning the switch off deletes the booked task and persists the choice.
state = await request(ctx, 'POST', { action: 'toggle' })
assert.equal(state.json.enabled, false)
assert.deepEqual(state.json.pending, [])
assert.equal(schedule.tasks.size, 0)
assert.equal(JSON.parse(readFileSync(statePath, 'utf8')).enabled, false)
console.log('ok 7 toggle off persisted:', readFileSync(statePath, 'utf8').replace(/\s+/gu, ' '))

// 8. With the switch off no new continuation is booked.
await fire(ctx, 'agent/request-error', {
  turn: 4,
  step: 1,
  provider: 'minimax-api',
  failure: limitFailure,
  signal: new AbortController().signal,
  agent: { session: { id: 'session-test', header: { id: 'session-test', isSeeded: false } } },
})
assert.equal(schedule.calls.filter(call => call[0] === 'create').length, 1)
console.log('ok 8 off books nothing')

// 9. Turning it back on restores the service.
state = await request(ctx, 'POST', { action: 'toggle' })
assert.equal(state.json.enabled, true)
console.log('ok 9 toggle on')

// 10. Book again, then a human message cancels the pending continuation.
await fire(ctx, 'agent/request-error', {
  turn: 5,
  step: 1,
  provider: 'minimax-api',
  failure: limitFailure,
  signal: new AbortController().signal,
  agent: { session: { id: 'session-test', header: { id: 'session-test', isSeeded: false } } },
})
assert.equal(schedule.tasks.size, 1)
ctx.handlers.get('session/event')[0](
  { id: 'session-test' },
  { type: 'user/message', data: { content: [{ type: 'text', text: 'actually do something else' }], source: { kind: 'user' } } },
)
await new Promise(resolve => setTimeout(resolve, 50))
assert.equal(schedule.tasks.size, 0)
state = await request(ctx, 'GET')
assert.deepEqual(state.json.pending, [])
console.log('ok 10 human message cancelled the booking')

// 11. Delivered continuation is recognized, and the next limit counts as attempt 2 of the episode.
await fire(ctx, 'agent/request-error', {
  turn: 6,
  step: 1,
  provider: 'minimax-api',
  failure: limitFailure,
  signal: new AbortController().signal,
  agent: { session: { id: 'session-test', header: { id: 'session-test', isSeeded: false } } },
})
const bookedBeforeDelivery = [...schedule.tasks.keys()]
assert.equal(bookedBeforeDelivery.length, 1)
ctx.handlers.get('session/event')[0](
  { id: 'session-test' },
  { type: 'user/message', data: { content: [{ type: 'text', text: '<auto_continue>continue</auto_continue>' }], source: { kind: 'schedule' } } },
)
// The real service ends a one-shot task when it delivers; the fake mirrors that.
schedule.tasks.delete(bookedBeforeDelivery[0])
state = await request(ctx, 'GET')
assert.deepEqual(state.json.pending, [])
await fire(ctx, 'agent/request-error', {
  turn: 7,
  step: 1,
  provider: 'minimax-api',
  failure: limitFailure,
  signal: new AbortController().signal,
  agent: { session: { id: 'session-test', header: { id: 'session-test', isSeeded: false } } },
})
state = await request(ctx, 'GET')
assert.equal(state.json.pending[0].attempts, 2)
console.log('ok 11 episode attempt count:', JSON.stringify(state.json.pending[0]))

// 12. A completed turn releases the booking.
ctx.handlers.get('session/event')[0](
  { id: 'session-test' },
  { type: 'turn/end', data: { turn: 7, reason: { kind: 'completed' } } },
)
await new Promise(resolve => setTimeout(resolve, 50))
assert.equal(schedule.tasks.size, 0)
state = await request(ctx, 'GET')
assert.deepEqual(state.json.pending, [])
console.log('ok 12 completed turn released the booking')

// 13. An explicit cancel action clears one session's booking.
await fire(ctx, 'agent/request-error', {
  turn: 8,
  step: 1,
  provider: 'minimax-api',
  failure: limitFailure,
  signal: new AbortController().signal,
  agent: { session: { id: 'session-test', header: { id: 'session-test', isSeeded: false } } },
})
state = await request(ctx, 'POST', { action: 'cancel', sessionId: 'session-test' })
assert.deepEqual(state.json.pending, [])
console.log('ok 13 explicit cancel')

// 14. A restart adopts a surviving task and honors a stored off choice.
const schedule2 = fakeSchedule()
await schedule2.create({
  title: 'Auto-continue #3 · minimax-api',
  prompt: '<auto_continue>continue</auto_continue>',
  timing: { kind: 'after', after_seconds: 600 },
  target: { kind: 'session', sessionId: 'session-restart' },
})
const ctx2 = fakeContext(schedule2)
await apply(ctx2, Config({}))
state = await request(ctx2, 'GET')
assert.equal(state.json.pending.length, 1)
assert.equal(state.json.pending[0].sessionId, 'session-restart')
assert.equal(state.json.pending[0].attempts, 3)
assert.equal(state.json.pending[0].source, 'restored')
console.log('ok 14 restart adopted:', JSON.stringify(state.json.pending[0]))

rmSync(statePath)
console.log('\nall 14 checks passed')
