/**
 * Host half of @local/dsh-recent-sessions.
 *
 * The whole feature is browser-side: the recent-session list reads the Client
 * Session/Workspace snapshots and renders into the sidebar, and every part of
 * it lives in `client.js`, which the Client module table loads because
 * `package.json` declares `dsh.client{ platform: 'web' }`.
 *
 * This module exists so the bundle has a resolvable Host module — the profile
 * row inserted by `cordis.patch.yml` names `@local/dsh-recent-sessions`. It
 * consumes no service, registers no tool, adds no prompt, and therefore cannot
 * affect a profile that installs it. Disabling the bundle in 设置 → 插件 is what
 * removes the block from the page.
 */

export const name = 'recent-sessions';

/** No Host service is consumed — everything happens in the browser. */
export const inject = [];

export function apply() {
  // Intentionally empty. See the module docstring.
}
