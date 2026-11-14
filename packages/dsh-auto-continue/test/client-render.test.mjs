// Render harness for dsh-auto-continue's Web half: a miniature hook runtime, a
// fake fetch, and the real client module. Proves the composer chip renders the
// right labels for on/off/waiting states in English and Thai, and that both
// controls post the right control actions.
import assert from 'node:assert/strict'

let factory
globalThis.window = {
  __ModuleLoader__: {
    load: (definition) => {
      assert.equal(definition.id, '@local/dsh-auto-continue')
      factory = definition.factory
    },
  },
}

await import(new URL('../client.js', import.meta.url).href)
assert.equal(typeof factory, 'function', 'client module registered a factory')

// --- miniature hook runtime -------------------------------------------------
let hooks = []
let hookIndex = 0
let pendingEffects = []

const reactApi = {
  createElement(type, props, ...children) {
    return { type, props: props ?? {}, children }
  },
  useState(initial) {
    const at = hookIndex++
    if (!(at in hooks)) hooks[at] = typeof initial === 'function' ? initial() : initial
    const set = (value) => {
      hooks[at] = typeof value === 'function' ? value(hooks[at]) : value
    }
    return [hooks[at], set]
  },
  useEffect(fn) {
    const at = hookIndex++
    if (hooks[at] === undefined) {
      hooks[at] = true
      pendingEffects.push(fn)
    }
  },
  useMemo(fn) {
    hookIndex++
    return fn()
  },
  useCallback(fn) {
    hookIndex++
    return fn
  },
  useRef(initial) {
    const at = hookIndex++
    if (!(at in hooks)) hooks[at] = { current: initial }
    return hooks[at]
  },
}

/** Forget every hook slot so the next render mounts the component fresh. */
function mountHooks() {
  hooks = []
  hookIndex = 0
  pendingEffects = []
}

/** Render once, then run the effects that render queued, and return the tree. */
function render(component, props) {
  hookIndex = 0
  pendingEffects = []
  const tree = component(props)
  const effects = pendingEffects
  for (const effect of effects) effect()
  return tree
}

/** Let the chip's async fetch settle. */
const flush = async () => {
  for (let index = 0; index < 8; index += 1) await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve, 5))
}

/** All visible text in an element tree. */
function textOf(tree) {
  if (tree === null || tree === undefined) return ''
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree)
  return tree.children.map(textOf).join('')
}

/** Depth-first search for the first element matching a predicate. */
function find(tree, predicate) {
  if (tree === null || tree === undefined || typeof tree !== 'object') return undefined
  if (predicate(tree)) return tree
  for (const child of tree.children) {
    const hit = find(child, predicate)
    if (hit !== undefined) return hit
  }
  return undefined
}

// --- load the real client module -------------------------------------------
const require = (name) => {
  if (name === 'react') return reactApi
  throw new Error(`unexpected client require: ${name}`)
}
const loaded = factory(require)
assert.deepEqual(loaded.inject, ['slots', 'locale'])

let registered
const locale = { active: 'en' }
const ctx = {
  slots: {
    inject: (name, produce) => {
      assert.equal(name, 'conversation.composer.dock')
      registered = produce()
    },
    register: (options, component) => {
      assert.equal(options.name, 'conversation.composer.dock')
      assert.equal(options.id, 'auto-continue')
      return { options, component }
    },
  },
  locale: { getSnapshot: () => ({ active: locale.active }) },
}
loaded.apply(ctx)
const chip = registered.component
assert.equal(typeof chip, 'function', 'chip component registered')

// --- fake Host state and fetch ---------------------------------------------
const calls = []
let served = { enabled: true, supported: true, now: Date.now(), pending: [] }
/** The fake Host: records each request and answers with the served state. */
const serve = async (url, options = {}) => {
  calls.push({ url: String(url), options })
  if (options.method === 'POST') {
    const request = JSON.parse(options.body)
    if (request.action === 'toggle') served = { ...served, enabled: request.enabled ?? !served.enabled }
    if (request.action === 'cancel') served = { ...served, pending: [] }
    return { ok: true, json: async () => served }
  }
  return { ok: true, json: async () => served }
}
globalThis.fetch = serve

/** Mount the chip fresh against one Host state and one locale. */
async function mount({ localeId, state, props = { sessionId: 'session-1' } }) {
  mountHooks()
  locale.active = localeId
  served = state
  let tree = render(chip, props)
  await flush()
  tree = render(chip, props)
  return tree
}
const buttonOf = (tree) => find(tree, node => node.props?.['data-auto-continue'] !== undefined)

// 1. English, switched on and idle.
let tree = await mount({
  localeId: 'en',
  state: { enabled: true, supported: true, now: Date.now(), pending: [] },
})
assert.match(textOf(tree), /Auto: on/u)
assert.equal(buttonOf(tree).props['data-auto-continue'], 'on')
assert.match(buttonOf(tree).props.title, /continues automatically/u)
console.log('ok 1 english on:', textOf(tree))

// 2. Thai, switched off.
tree = await mount({
  localeId: 'th',
  state: { enabled: false, supported: true, now: Date.now(), pending: [] },
})
assert.match(textOf(tree), /ต่ออัตโนมัติ: ปิด/u)
assert.equal(buttonOf(tree).props['data-auto-continue'], 'off')
console.log('ok 2 thai off:', textOf(tree))

// 3. A booked continuation shows the countdown and offers cancel.
tree = await mount({
  localeId: 'th',
  state: {
    enabled: true,
    supported: true,
    now: Date.now(),
    pending: [{ sessionId: 'session-1', dueAt: Date.now() + 2 * 60_000, attempts: 2, provider: 'minimax-api', source: 'quota', taskId: 'task-1' }],
  },
})
assert.match(textOf(tree), /จะต่อในอีก/u)
assert.match(textOf(tree), /2 น\./u)
assert.equal(buttonOf(tree).props['data-auto-continue'], 'waiting')
const cancel = find(tree, node => node.type === 'button' && node.children.includes('×'))
assert.ok(cancel !== undefined, 'cancel control renders while waiting')
assert.match(cancel.props.title, /ยกเลิก/u)
console.log('ok 3 thai waiting:', textOf(tree))

// 4. Clicking the main control posts a toggle and adopts the answer.
tree = await mount({
  localeId: 'en',
  state: { enabled: true, supported: true, now: Date.now(), pending: [] },
})
await buttonOf(tree).props.onClick()
await flush()
tree = render(chip, { sessionId: 'session-1' })
const toggleCall = calls.filter(call => call.options?.method === 'POST').at(-1)
assert.equal(JSON.parse(toggleCall.options.body).action, 'toggle')
assert.equal(JSON.parse(toggleCall.options.body).sessionId, 'session-1')
assert.match(textOf(tree), /Auto: off/u)
console.log('ok 4 toggle posted and adopted:', textOf(tree))

// 5. Clicking cancel posts the cancel action for this session.
tree = await mount({
  localeId: 'en',
  state: {
    enabled: true,
    supported: true,
    now: Date.now(),
    pending: [{ sessionId: 'session-1', dueAt: Date.now() + 60_000, attempts: 1, provider: 'minimax-api', source: 'quota', taskId: 'task-2' }],
  },
})
const cancelButton = find(tree, node => node.type === 'button' && node.children.includes('×'))
await cancelButton.props.onClick()
await flush()
const cancelCall = calls.filter(call => call.options?.method === 'POST').at(-1)
assert.equal(JSON.parse(cancelCall.options.body).action, 'cancel')
assert.equal(JSON.parse(cancelCall.options.body).sessionId, 'session-1')
console.log('ok 5 cancel posted:', cancelCall.options.body)

// 6. A pending booking for another conversation does not show on this one.
tree = await mount({
  localeId: 'th',
  state: {
    enabled: true,
    supported: true,
    now: Date.now(),
    pending: [{ sessionId: 'session-other', dueAt: Date.now() + 60_000, attempts: 1, provider: 'minimax-api', source: 'quota', taskId: 'task-3' }],
  },
})
assert.doesNotMatch(textOf(tree), /จะต่อในอีก/u)
console.log('ok 6 other session isolated:', textOf(tree))

// 7. An unsupported Host still renders a control that explains itself.
tree = await mount({
  localeId: 'en',
  state: { enabled: true, supported: false, now: Date.now(), pending: [] },
})
assert.match(buttonOf(tree).props.title, /schedule service/u)
console.log('ok 7 unsupported host explained')

// 8. Every request names the conversation the chip belongs to.
tree = await mount({
  localeId: 'en',
  state: { enabled: true, supported: true, now: Date.now(), pending: [] },
  props: { sessionId: 'session-2' },
})
const pollCall = calls.filter(call => call.options.method !== 'POST').at(-1)
assert.equal(pollCall.url, '/plugins/auto-continue?sessionId=session-2')
await buttonOf(tree).props.onClick()
await flush()
const namedToggle = calls.filter(call => call.options?.method === 'POST').at(-1)
assert.equal(JSON.parse(namedToggle.options.body).sessionId, 'session-2')
console.log('ok 8 requests name the conversation:', pollCall.url)

// 9. A chip with no session id falls back to the plain route and still renders.
globalThis.fetch = serve
tree = await mount({
  localeId: 'en',
  state: { enabled: false, supported: true, now: Date.now(), pending: [] },
  props: {},
})
const plainCall = calls.filter(call => call.options.method !== 'POST').at(-1)
assert.equal(plainCall.url, '/plugins/auto-continue')
assert.match(textOf(tree), /Auto: off/u)
console.log('ok 9 no session id falls back to the plain route:', plainCall.url)

// 10. A failed fetch leaves the chip quiet instead of crashing the dock.
globalThis.fetch = async () => {
  throw new Error('offline')
}
mountHooks()
tree = render(chip, { sessionId: 'session-1' })
await flush()
assert.equal(tree, null)
console.log('ok 10 failed fetch renders nothing')

console.log('\nall 10 render checks passed')
// The chip keeps a polling timer alive, exactly as it does in the page.
process.exit(0)
