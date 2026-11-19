import assert from 'node:assert/strict'
import test from 'node:test'

/**
 * The plugin contributes guidance only, so these tests check what it says and
 * that it registers no guard at all.
 */

/** A fake context recording what the plugin registered. */
function fakeContext() {
  const captured = { guard: null, sections: [], intervals: 0, logger: [] }
  const ctx = {
    logger: () => ({ info: (line) => captured.logger.push(line), warn: () => {} }),
    effect: (factory) => {
      const dispose = factory()
      return () => dispose?.()
    },
    interval: () => {
      captured.intervals += 1
      return () => {}
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

/**
 * Load the plugin and wait for its first probe.
 *
 * @param {object} [overrides] - Config overrides.
 * @returns {Promise<object>} the capture.
 */
async function load(overrides = {}) {
  const { apply, Config } = await import('../index.js')
  const { ctx, captured } = fakeContext()
  apply(ctx, Config(overrides))
  await new Promise((resolve) => setTimeout(resolve, 600))
  return captured
}

test('no guard is registered: nothing is blocked', async () => {
  const captured = await load()
  assert.equal(captured.guard, null, 'the plugin must not deny any call')
})

test('exactly one prompt section is contributed', async () => {
  const captured = await load()
  assert.equal(captured.sections.length, 1)
  assert.equal(captured.sections[0].name, 'docker-kiri')
})

test('the section describes the active context and the builder', async () => {
  const captured = await load()
  const text = captured.sections[0].text()
  assert.match(text, /<docker-kiri>/)
  assert.match(text, /<\/docker-kiri>/)
  // It states the engine's nature rather than prescribing kiri-only syntax.
  assert.match(text, /standard Docker Engine endpoint|Docker-compatible engine/)
  assert.match(text, /buildx builder/)
})

test('the guidance never tells the model to block or deny', async () => {
  const captured = await load()
  const text = captured.sections[0].text()
  assert.doesNotMatch(text, /deny|denied|block|refuse/i)
})

test('plain docker commands are described as already reaching kiri', async () => {
  const captured = await load()
  const text = captured.sections[0].text()
  // When kiri is active, or the machine is told how to select it, the section
  // must make clear that ordinary commands work without extra flags.
  assert.match(text, /docker compose up|docker context use kiri|Plain docker commands/)
})

test('a refresh interval is armed', async () => {
  const captured = await load()
  assert.equal(captured.intervals, 1)
})

test('the load-time log reports, it does not warn', async () => {
  const captured = await load()
  assert.ok(captured.logger.some((line) => line.includes('no command is blocked')))
})

test('the builder probe can be turned off', async () => {
  const captured = await load({ reportBuilder: false })
  const text = captured.sections[0].text()
  assert.doesNotMatch(text, /buildx builder/)
})
