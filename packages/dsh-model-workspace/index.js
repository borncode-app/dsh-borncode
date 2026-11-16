/**
 * The Host half of the Model workspace shortcut.
 *
 * The visible part of this plugin is its Client half: one row in the sidebar's
 * More menu. A bundle row still needs a Host module to exist, and this one
 * deliberately does nothing beyond staying mounted — no HTTP route, no tools,
 * no timers, no configuration.
 *
 * Keeping the Host half inert is the point: the shortcut only navigates, so a
 * failure here can never affect the page it points at.
 */

export const name = 'model-workspace'

/**
 * Stay mounted and hold nothing.
 *
 * @param {object} ctx - the plugin context, unused.
 * @param {object} config - the row configuration, unused.
 */
export function apply() {
  // The Client half (`client.js`) owns everything this plugin does.
}
