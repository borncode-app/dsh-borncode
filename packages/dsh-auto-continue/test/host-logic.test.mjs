// Logic harness for dsh-auto-continue's Host half: a fake Cordis context, a fake
// schedule service, and a fake HTTP route. Proves the limit -> book -> per-session
// toggle -> cancel -> resume state machine without touching the running Harness.
// The plugin ships with automatic continuation off, so the harness starts by
// proving that fresh state is off, then turns one session on explicitly and
// shows that another session's choice is independent.
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { existsSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const pluginDir = new URL('../', import.meta.url)
const statePath = fileURLToPath(new URL('state.json', pluginDir))
if (existsSync(statePath)) rmSync(statePath)

const { apply, Config } = await import(new URL('index.js', pluginDir).href)

/** Most session choices the state file keeps; the oldest fall off first. */
const SESSION_CAP = 500

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

/** Report one spent usage limit for a root conversation. */
async function spendLimit(ctx, sessionId, turn) {
  await fire(ctx, 'agent/request-error', {
    turn,
    step: 1,
    provider: 'minimax-api',
    failure: { code: 'QUOTA', message: 'quota exceeded', status: 402 },
    signal: new AbortController().signal,
    agent: { session: { id: sessionId, header: { id: sessionId, isSeeded: false } } },
  })
}

/** Call the registered Host route with a synthetic request and optional query. */
async function request(ctx, method, body, query) {
  const route = ctx.routes[0]
  assert.ok(route !== undefined, 'no route registered')
  const req = new EventEmitter()
  req.method = method
  req.url = query === undefined ? route.path : `${route.path}?${new URLSearchParams(query).toString()}`
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

/** The explicit session choices currently stored on disk. */
function storedSessions() {
  return JSON.parse(readFileSync(statePath, 'utf8')).sessions
}

const schedule = fakeSchedule()
const ctx = fakeContext(schedule)
await apply(ctx, Config({}))

// 1. Fresh state: nothing is on, nothing is booked, no session is named.
let state = await request(ctx, 'GET')
assert.equal(state.status, 200)
assert.equal(state.json.enabled, false)
assert.equal(state.json.sessionId, null)
assert.equal(state.json.supported, true)
assert.deepEqual(state.json.pending, [])
assert.deepEqual(state.json.sessions, [])
console.log('ok 1 fresh state is off:', JSON.stringify(state.json))

// 2. A session with no stored choice uses the plugin config default (off).
state = await request(ctx, 'GET', undefined, { sessionId: 'session-test' })
assert.equal(state.json.sessionId, 'session-test')
assert.equal(state.json.enabled, false)
assert.deepEqual(state.json.pending, [])
assert.deepEqual(state.json.sessions, [])
console.log('ok 2 no stored choice reports the config default:', JSON.stringify(state.json))

// 3. Turning that session on stores only the explicit choice.
state = await request(ctx, 'POST', { action: 'toggle', sessionId: 'session-test' })
assert.equal(state.json.sessionId, 'session-test')
assert.equal(state.json.enabled, true)
assert.deepEqual(state.json.sessions, ['session-test'])
assert.deepEqual(storedSessions(), { 'session-test': true })
console.log('ok 3 session switched on:', readFileSync(statePath, 'utf8').replace(/\s+/gu, ' '))

// 4. A spent limit books exactly one continuation for that session.
await spendLimit(ctx, 'session-test', 1)
const created = schedule.calls.filter(call => call[0] === 'create')
assert.equal(created.length, 1)
assert.equal(created[0][1].target.kind, 'session')
assert.equal(created[0][1].target.sessionId, 'session-test')
assert.ok(created[0][1].prompt.includes('<auto_continue>'))
assert.ok(created[0][1].timing.kind === 'after' && created[0][1].timing.after_seconds >= 60, `after_seconds ${created[0][1].timing.after_seconds}`)
state = await request(ctx, 'GET', undefined, { sessionId: 'session-test' })
assert.equal(state.json.pending.length, 1)
assert.equal(state.json.pending[0].sessionId, 'session-test')
assert.equal(state.json.pending[0].attempts, 1)
console.log('ok 4 booked:', JSON.stringify(state.json.pending[0]), 'after', created[0][1].timing.after_seconds, 's')

// 5. A second limit failure moves the same task instead of adding one.
await spendLimit(ctx, 'session-test', 2)
assert.equal(schedule.calls.filter(call => call[0] === 'create').length, 1)
assert.equal(schedule.calls.filter(call => call[0] === 'edit').length, 1)
state = await request(ctx, 'GET', undefined, { sessionId: 'session-test' })
assert.equal(state.json.pending.length, 1)
assert.equal(state.json.pending[0].attempts, 2)
console.log('ok 5 moved:', JSON.stringify(state.json.pending[0]))

// 6. A transient failure code changes nothing.
await fire(ctx, 'agent/request-error', {
  turn: 3,
  step: 1,
  provider: 'minimax-api',
  failure: { code: 'SERVER', message: 'boom', status: 500 },
  signal: new AbortController().signal,
  agent: { session: { id: 'session-test', header: { id: 'session-test', isSeeded: false } } },
})
assert.equal(schedule.calls.filter(call => call[0] === 'create').length, 1)
console.log('ok 6 transient failure ignored')

// 7. A delegated child session never books a reminder.
await fire(ctx, 'agent/request-error', {
  turn: 1,
  step: 1,
  provider: 'minimax-api',
  failure: { code: 'QUOTA', message: 'quota exceeded', status: 402 },
  signal: new AbortController().signal,
  agent: { session: { id: 'session-child', header: { id: 'session-child', isSeeded: false, parentSession: 'session-test' } } },
})
assert.equal(schedule.calls.filter(call => call[0] === 'create').length, 1)
console.log('ok 7 subagent skipped')

// 8. A second session can be turned on without touching the first one.
state = await request(ctx, 'POST', { action: 'toggle', sessionId: 'session-b' })
assert.equal(state.json.sessionId, 'session-b')
assert.equal(state.json.enabled, true)
assert.deepEqual(state.json.sessions, ['session-test', 'session-b'])
assert.deepEqual(storedSessions(), { 'session-test': true, 'session-b': true })
state = await request(ctx, 'GET', undefined, { sessionId: 'session-b' })
assert.equal(state.json.enabled, true)
console.log('ok 8 session B switched on independently:', JSON.stringify(state.json.sessions))

// 9. Turning session A off leaves session B on, deletes only A's task, and the
//    two sessions still read their own choice back.
state = await request(ctx, 'POST', { action: 'toggle', sessionId: 'session-test', enabled: false })
assert.equal(state.json.sessionId, 'session-test')
assert.equal(state.json.enabled, false)
assert.deepEqual(state.json.pending, [])
assert.equal(schedule.tasks.size, 0)
assert.deepEqual(state.json.sessions, ['session-b'])
assert.deepEqual(storedSessions(), { 'session-b': true })
state = await request(ctx, 'GET', undefined, { sessionId: 'session-b' })
assert.equal(state.json.enabled, true)
state = await request(ctx, 'GET', undefined, { sessionId: 'session-test' })
assert.equal(state.json.enabled, false)
console.log('ok 9 session A off, session B still on; choices read independently')

// 10. The off session books nothing while the on session still books.
await spendLimit(ctx, 'session-test', 4)
assert.equal(schedule.calls.filter(call => call[0] === 'create').length, 1)
await spendLimit(ctx, 'session-b', 1)
assert.equal(schedule.calls.filter(call => call[0] === 'create').length, 2)
const booked = schedule.calls.filter(call => call[0] === 'create').at(-1)
assert.equal(booked[1].target.sessionId, 'session-b')
state = await request(ctx, 'GET', undefined, { sessionId: 'session-b' })
assert.equal(state.json.pending.length, 1)
assert.equal(state.json.pending[0].attempts, 1)
console.log('ok 10 off books nothing; on books:', JSON.stringify(state.json.pending[0]))

// 11. Book again, then a human message cancels this session's pending continuation.
ctx.handlers.get('session/event')[0](
  { id: 'session-b' },
  { type: 'user/message', data: { content: [{ type: 'text', text: 'actually do something else' }], source: { kind: 'user' } } },
)
await new Promise(resolve => setTimeout(resolve, 50))
assert.equal(schedule.tasks.size, 0)
state = await request(ctx, 'GET', undefined, { sessionId: 'session-b' })
assert.deepEqual(state.json.pending, [])
console.log('ok 11 human message cancelled the booking')

// 12. Delivered continuation is recognized, and the next limit counts as attempt 2 of the episode.
await spendLimit(ctx, 'session-b', 2)
const bookedBeforeDelivery = [...schedule.tasks.keys()]
assert.equal(bookedBeforeDelivery.length, 1)
ctx.handlers.get('session/event')[0](
  { id: 'session-b' },
  { type: 'user/message', data: { content: [{ type: 'text', text: '<auto_continue>continue</auto_continue>' }], source: { kind: 'schedule' } } },
)
// The real service ends a one-shot task when it delivers; the fake mirrors that.
schedule.tasks.delete(bookedBeforeDelivery[0])
state = await request(ctx, 'GET', undefined, { sessionId: 'session-b' })
assert.deepEqual(state.json.pending, [])
await spendLimit(ctx, 'session-b', 3)
state = await request(ctx, 'GET', undefined, { sessionId: 'session-b' })
assert.equal(state.json.pending[0].attempts, 2)
console.log('ok 12 episode attempt count:', JSON.stringify(state.json.pending[0]))

// 13. A completed turn releases the booking.
ctx.handlers.get('session/event')[0](
  { id: 'session-b' },
  { type: 'turn/end', data: { turn: 3, reason: { kind: 'completed' } } },
)
await new Promise(resolve => setTimeout(resolve, 50))
assert.equal(schedule.tasks.size, 0)
state = await request(ctx, 'GET', undefined, { sessionId: 'session-b' })
assert.deepEqual(state.json.pending, [])
console.log('ok 13 completed turn released the booking')

// 14. An explicit cancel action clears one session's booking.
await spendLimit(ctx, 'session-b', 4)
assert.equal(schedule.tasks.size, 1)
state = await request(ctx, 'POST', { action: 'cancel', sessionId: 'session-b' })
assert.equal(state.json.sessionId, 'session-b')
assert.deepEqual(state.json.pending, [])
assert.equal(schedule.tasks.size, 0)
console.log('ok 14 explicit cancel')

// 15. The stored map is capped at 500 ids, oldest first, when a choice is written.
const many = {}
for (let index = 0; index <= SESSION_CAP; index += 1) many[`s-${String(index)}`] = true
writeFileSync(statePath, `${JSON.stringify({ sessions: many }, null, 2)}\n`)
const schedule3 = fakeSchedule()
const ctx3 = fakeContext(schedule3)
await apply(ctx3, Config({}))
state = await request(ctx3, 'GET')
assert.equal(state.json.sessions.length, SESSION_CAP)
assert.equal(state.json.sessions[0], 's-1')
state = await request(ctx3, 'POST', { action: 'toggle', sessionId: 's-new' })
assert.equal(state.json.enabled, true)
const capped = Object.keys(storedSessions())
assert.equal(capped.length, SESSION_CAP)
assert.equal(capped[0], 's-2')
assert.equal(capped.at(-1), 's-new')
console.log('ok 15 state capped at 500 sessions, oldest dropped')

// 16. A legacy global `{ enabled: true }` file is ignored, not migrated.
writeFileSync(statePath, `${JSON.stringify({ enabled: true }, null, 2)}\n`)
const schedule4 = fakeSchedule()
const ctx4 = fakeContext(schedule4)
await apply(ctx4, Config({}))
state = await request(ctx4, 'GET', undefined, { sessionId: 'legacy-session' })
assert.equal(state.json.enabled, false)
assert.deepEqual(state.json.sessions, [])
console.log('ok 16 legacy global choice ignored')

// 17. A restart adopts a surviving task only for a session that is on; a task
//     whose session is off is disarmed.
writeFileSync(statePath, `${JSON.stringify({ sessions: { 'session-on': true } }, null, 2)}\n`)
const schedule5 = fakeSchedule()
await schedule5.create({
  title: 'Auto-continue #3 · minimax-api',
  prompt: '<auto_continue>continue</auto_continue>',
  timing: { kind: 'after', after_seconds: 600 },
  target: { kind: 'session', sessionId: 'session-off' },
})
await schedule5.create({
  title: 'Auto-continue #2 · minimax-api',
  prompt: '<auto_continue>continue</auto_continue>',
  timing: { kind: 'after', after_seconds: 600 },
  target: { kind: 'session', sessionId: 'session-on' },
})
const ctx5 = fakeContext(schedule5)
await apply(ctx5, Config({}))
state = await request(ctx5, 'GET', undefined, { sessionId: 'session-on' })
assert.equal(state.json.enabled, true)
assert.equal(state.json.pending.length, 1)
assert.equal(state.json.pending[0].sessionId, 'session-on')
assert.equal(state.json.pending[0].attempts, 2)
assert.equal(state.json.pending[0].source, 'restored')
state = await request(ctx5, 'GET', undefined, { sessionId: 'session-off' })
assert.equal(state.json.enabled, false)
assert.deepEqual(state.json.pending, [])
assert.equal(schedule5.tasks.size, 1)
assert.equal([...schedule5.tasks.values()][0].target.sessionId, 'session-on')
console.log('ok 17 restart adopted the on session and disarmed the off one')

writeFileSync(statePath, `${JSON.stringify({ sessions: {} }, null, 2)}\n`)
console.log('\nall 17 checks passed')

// ---------------------------------------------------------------------------
// A fixed cadence ("continue every N minutes") replaces the adaptive wait.
// ---------------------------------------------------------------------------

// 18. An `interval` action stores the cadence and the next booking waits exactly
//     that long, ignoring the provider hint and the quota probe entirely.
writeFileSync(statePath, `${JSON.stringify({ sessions: { 'session-fixed': true } }, null, 2)}\n`)
const scheduleFixed = fakeSchedule()
const ctxFixed = fakeContext(scheduleFixed)
await apply(ctxFixed, Config({ intervalMinutes: 0 }))
state = await request(ctxFixed, 'GET', undefined, { sessionId: 'session-fixed' })
assert.equal(state.json.intervalMinutes, 0, 'adaptive by default')
state = await request(ctxFixed, 'POST', { action: 'interval', sessionId: 'session-fixed', minutes: 7 })
assert.equal(state.json.intervalMinutes, 7)
assert.deepEqual(JSON.parse(readFileSync(statePath, 'utf8')).intervals, { 'session-fixed': 7 })
await spendLimit(ctxFixed, 'session-fixed', 1)
const fixedBooked = scheduleFixed.calls.filter(call => call[0] === 'create').at(-1)
assert.equal(fixedBooked[1].timing.after_seconds, 420, `expected 420s, got ${String(fixedBooked[1].timing.after_seconds)}`)
assert.ok(fixedBooked[1].title.includes('every 7m'), fixedBooked[1].title)
state = await request(ctxFixed, 'GET', undefined, { sessionId: 'session-fixed' })
assert.equal(state.json.pending[0].source, 'interval')
assert.equal(state.json.pending[0].intervalMinutes, 7)
console.log('ok 18 fixed cadence booked:', JSON.stringify(state.json.pending[0]))

// 19. The provider hint no longer wins once a cadence is booked.
await fire(ctxFixed, 'agent/request-error', {
  turn: 2,
  step: 1,
  provider: 'minimax-api',
  failure: { code: 'RATE_LIMIT', message: 'slow down', status: 429, providerRetryAfterMs: 60_000 },
  signal: new AbortController().signal,
  agent: { session: { id: 'session-fixed', header: { id: 'session-fixed', isSeeded: false } } },
})
const movedFixed = scheduleFixed.calls.filter(call => call[0] === 'edit').at(-1)
assert.equal(movedFixed[1].patch.timing.after_seconds, 420, `hint overrode the cadence: ${String(movedFixed[1].patch.timing.after_seconds)}`)
console.log('ok 19 provider hint did not override the fixed cadence')

// 20. `0` restores the adaptive wait for that conversation.
state = await request(ctxFixed, 'POST', { action: 'interval', sessionId: 'session-fixed', minutes: 0 })
assert.equal(state.json.intervalMinutes, 0)
assert.deepEqual(JSON.parse(readFileSync(statePath, 'utf8')).intervals, { 'session-fixed': 0 })
await spendLimit(ctxFixed, 'session-fixed', 3)
const adaptiveAgain = scheduleFixed.calls.filter(call => call[0] === 'edit').at(-1)
assert.notEqual(adaptiveAgain[1].patch.timing.after_seconds, 420, 'still fixed after reset to 0')
assert.equal(scheduleFixed.calls.filter(call => call[0] === 'create').length, 1)
console.log('ok 20 zero restored the adaptive wait; after', adaptiveAgain[1].patch.timing.after_seconds, 's')

// 21. The cadence survives a restart, read back from the stored state file.
const scheduleRestart = fakeSchedule()
await scheduleRestart.create({
  title: 'Auto-continue #4 · minimax-api · every 15m',
  prompt: '<auto_continue>continue</auto_continue>',
  timing: { kind: 'after', after_seconds: 900 },
  target: { kind: 'session', sessionId: 'session-fixed' },
})
writeFileSync(statePath, `${JSON.stringify({ sessions: { 'session-fixed': true }, intervals: { 'session-fixed': 15 } }, null, 2)}\n`)
const ctxRestart = fakeContext(scheduleRestart)
await apply(ctxRestart, Config({ intervalMinutes: 0 }))
state = await request(ctxRestart, 'GET', undefined, { sessionId: 'session-fixed' })
assert.equal(state.json.intervalMinutes, 15)
assert.equal(state.json.pending[0].intervalMinutes, 15)
assert.equal(state.json.pending[0].source, 'restored')
assert.equal(state.json.pending[0].provider, 'minimax-api')
console.log('ok 21 cadence restored after restart:', JSON.stringify(state.json.pending[0]))

// 22. A cadence outside the schedule range is clamped rather than booked.
writeFileSync(statePath, `${JSON.stringify({ sessions: { 'session-big': true } }, null, 2)}\n`)
const scheduleBig = fakeSchedule()
const ctxBig = fakeContext(scheduleBig)
await apply(ctxBig, Config({ intervalMinutes: 0 }))
state = await request(ctxBig, 'POST', { action: 'interval', sessionId: 'session-big', minutes: 999999 })
assert.equal(state.json.intervalMinutes, 10080, 'clamped to a week')
await spendLimit(ctxBig, 'session-big', 1)
const bigBooked = scheduleBig.calls.filter(call => call[0] === 'create').at(-1)
assert.equal(bigBooked[1].timing.after_seconds, 604800)
console.log('ok 22 oversized cadence clamped to', bigBooked[1].timing.after_seconds, 's')

// 23. The plugin config supplies the default cadence when a session has none.
writeFileSync(statePath, `${JSON.stringify({ sessions: { 'session-cfg': true } }, null, 2)}\n`)
const scheduleCfg = fakeSchedule()
const ctxCfg = fakeContext(scheduleCfg)
await apply(ctxCfg, Config({ intervalMinutes: 3 }))
state = await request(ctxCfg, 'GET', undefined, { sessionId: 'session-cfg' })
assert.equal(state.json.intervalMinutes, 3)
await spendLimit(ctxCfg, 'session-cfg', 1)
const cfgBooked = scheduleCfg.calls.filter(call => call[0] === 'create').at(-1)
assert.equal(cfgBooked[1].timing.after_seconds, 180)
console.log('ok 23 config default cadence booked:', cfgBooked[1].timing.after_seconds, 's')

writeFileSync(statePath, `${JSON.stringify({ sessions: {} }, null, 2)}\n`)
console.log('\nall 23 checks passed')
