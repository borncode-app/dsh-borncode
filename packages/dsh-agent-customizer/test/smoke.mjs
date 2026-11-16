#!/usr/bin/env node
// Smoke test for the agent-customizer plugin.
//
// It exercises the live Host route end to end — read, validation, and the
// default model that reaches the profile patch — and restores everything it
// found, so running it never changes what the user has configured.
//
// The standing instructions are not this plugin's business: they belong to
// `dsh-session-instructions`, which contributes one set of instructions to
// every agent of the profile.
//
// Usage: node test/smoke.mjs [--host http://127.0.0.1:53577]
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const hostFlag = args.indexOf('--host')
const host = hostFlag === -1
  ? (process.env.DSH_WEB_URL ?? 'http://127.0.0.1:53577')
  : args[hostFlag + 1]
const endpoint = `${host.replace(/\/+$/, '')}/plugins/agent-customizer`

let failures = 0

/**
 * Record one check.
 *
 * @param {string} name - what the check proves.
 * @param {boolean} ok - whether it held.
 * @param {string} detail - extra reading for a failed check.
 */
function check(name, ok, detail = '') {
  if (ok) {
    console.log(`PASS  ${name}`)
    return
  }
  failures += 1
  console.log(`FAIL  ${name}${detail === '' ? '' : ` — ${detail}`}`)
}

/**
 * Read the whole route answer.
 *
 * @param {RequestInit} [init] - the request to send.
 * @returns {Promise<{ status: number, body: any }>} the status and the parsed body.
 */
async function call(init) {
  const response = await fetch(endpoint, {
    headers: { accept: 'application/json', ...(init?.body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...init,
  })
  let body
  try {
    body = await response.json()
  } catch {
    body = undefined
  }
  return { status: response.status, body }
}

const before = await call({ method: 'GET' })
check('the Host answers the route', before.status === 200, `status ${String(before.status)}`)
check('the answer carries the agent roster', Array.isArray(before.body?.presets) && before.body.presets.length > 0, JSON.stringify(before.body?.presets))
check('the answer carries the provider catalog', Array.isArray(before.body?.providers) && before.body.providers.length > 0, JSON.stringify(before.body?.providers))
check('the answer carries the default model', typeof before.body?.defaultModel?.provider === 'string', JSON.stringify(before.body?.defaultModel))
check('the answer carries no per-agent instructions', before.body?.agents === undefined, JSON.stringify(before.body?.agents))

const originalModel = before.body?.defaultModel ?? {}

// The instructions route is gone: this plugin owns the default model only.
const unknownAction = await call({ method: 'POST', body: JSON.stringify({ action: 'nonsense' }) })
check('an unknown action is refused', unknownAction.status === 400, `status ${String(unknownAction.status)}`)

const retiredAction = await call({ method: 'POST', body: JSON.stringify({ action: 'save-instructions', agent: 'standard', instructions: 'x' }) })
check('a retired instruction action is refused', retiredAction.status === 400, `status ${String(retiredAction.status)}`)

const wrongMethod = await call({ method: 'DELETE' })
check('a wrong method is refused', wrongMethod.status === 405, `status ${String(wrongMethod.status)}`)

// The default model: switch it, read it back, and put it back where it was.
const provider = before.body?.providers?.find((group) => group.models?.length > 0)
const otherModel = provider?.models?.find((entry) => entry.id !== originalModel.model)
if (provider !== undefined && otherModel !== undefined) {
  const switched = await call({ method: 'POST', body: JSON.stringify({ action: 'save-model', provider: provider.id, model: otherModel.id }) })
  check('a model switch is accepted', switched.status === 200, `status ${String(switched.status)}`)
  check('the switched model is served', switched.body?.defaultModel?.model === otherModel.id, JSON.stringify(switched.body?.defaultModel))

  const effort = otherModel.efforts?.[0]
  if (typeof effort === 'string') {
    const withEffort = await call({ method: 'POST', body: JSON.stringify({ action: 'save-model', provider: provider.id, model: otherModel.id, reasoningEffort: effort }) })
    check('a reasoning effort is stored', withEffort.body?.defaultModel?.reasoningEffort === effort, JSON.stringify(withEffort.body?.defaultModel))

    const withoutEffort = await call({ method: 'POST', body: JSON.stringify({ action: 'save-model', provider: provider.id, model: otherModel.id, reasoningEffort: null }) })
    check('an explicit Auto removes the effort', withoutEffort.body?.defaultModel?.reasoningEffort === undefined, JSON.stringify(withoutEffort.body?.defaultModel))
  }
} else {
  check('the provider catalog offers a second model', false, JSON.stringify(provider))
}

const badModel = await call({ method: 'POST', body: JSON.stringify({ action: 'save-model', provider: '', model: '' }) })
check('an empty model is refused', badModel.status === 400, `status ${String(badModel.status)}`)

// Put everything back the way it was.
const restoredModel = await call({
  method: 'POST',
  body: JSON.stringify({
    action: 'save-model',
    provider: originalModel.provider,
    model: originalModel.model,
    reasoningEffort: typeof originalModel.reasoningEffort === 'string' ? originalModel.reasoningEffort : null,
  }),
})
check('the original model is restored', restoredModel.status === 200 && restoredModel.body?.defaultModel?.model === originalModel.model, JSON.stringify(restoredModel.body?.defaultModel))

const finalRead = await call({ method: 'GET' })
check('the Host serves the restored model', finalRead.body?.defaultModel?.model === originalModel.model, JSON.stringify(finalRead.body?.defaultModel))

console.log(failures === 0 ? '\nsmoke test passed' : `\nsmoke test failed: ${String(failures)} check(s)`)
process.exit(failures === 0 ? 0 : 1)
