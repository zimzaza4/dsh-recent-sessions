/**
 * Verification for the recent-session block's two hard parts: WHERE it lands in
 * the shipped sidebar DOM, and WHAT it lists — plus the 活跃会话 (active
 * sessions) section that sits under it: which sessions qualify, in which order,
 * and how each section folds.
 *
 * The plugin is a plain browser module (`window.__ModuleLoader__.load`), so this
 * script reproduces the two things the real page provides — a module table and a
 * mounted sidebar — with jsdom, the React runtime the client ships, and a
 * stand-in for the framework-owned props (the standard session hooks, the owner
 * `wide` flag, and the injected `openSession`).
 *
 * The scenario runs twice: once with the shared `ui-primitives` module (the
 * production path: its `relativeTime` and `StateDot`) and once with that module
 * missing, which exercises the plugin's own fallbacks.
 *
 * Run: node test/anchor.test.mjs
 *
 * React and jsdom are borrowed from a neighbouring install (this plugin
 * intentionally ships no dependencies of its own). `DRS_TEST_NODE_MODULES`
 * points the search at a `node_modules` that publishes all three.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * Every place this checkout may keep the borrowed copies, nearest first: an
 * explicit override and every `node_modules` above this file. Point
 * `DRS_TEST_NODE_MODULES` at a Harness checkout that ships the client packages
 * when this plugin does not sit inside one.
 */
const MODULE_ROOTS = [
  process.env.DRS_TEST_NODE_MODULES,
  join(HERE, '..', 'node_modules'),
  join(HERE, '..', '..', 'node_modules'),
].filter(root => typeof root === 'string' && root.length > 0)

/**
 * Load the runtime from the first candidate root that publishes it.
 * @param name - bare package specifier.
 * @returns the package's main export, resolved through that root.
 */
function loadFromRoots(name) {
  const attempts = []
  for (const root of MODULE_ROOTS) {
    const from = createRequire(join(resolve(root), 'index.js'))
    try {
      const directory = dirname(from.resolve(`${name}/package.json`))
      return {
        from,
        directory,
        exports: from(directory),
      }
    } catch (error) {
      attempts.push(`${root}: ${error.message}`)
    }
  }
  throw new Error([
    `the test cannot resolve ${name}; tried:`,
    ...attempts.map(line => `  ${line}`),
    '  set DRS_TEST_NODE_MODULES to a node_modules publishing react, react-dom and jsdom',
  ].join('\n'))
}

const react = loadFromRoots('react')
const reactDom = loadFromRoots('react-dom')
const jsdom = loadFromRoots('jsdom')
const React = react.exports
const ReactDOM = reactDom.exports
const ReactDOMClient = reactDom.from(join(reactDom.directory, 'client.js'))
const testUtils = reactDom.from(join(reactDom.directory, 'test-utils.js'))
const { JSDOM } = jsdom.exports
const act = React.act ?? testUtils.act

/** The shipped sidebar shell, structurally identical to the rendered snapshot. */
/** The shipped workspace browser (`ui-workspace` WorkspaceBrowser), structurally identical. */
const REGION_HTML = `
<div class="wbRoot">
  <div class="wbSectionHeader">
    <span class="wbSectionLabel">工作区</span>
    <div class="wbSearchSlot">
      <div class="wbSearch">
        <button class="wbSearchButton" type="button" aria-label="搜索"></button>
        <input class="wbSearchInput" type="text" />
      </div>
    </div>
    <div class="wbHeaderActions">
      <button class="wbIconButton" type="button" aria-label="视图选项"></button>
      <button class="wbIconButton" type="button" aria-label="添加工作区"></button>
    </div>
  </div>
  <div class="wbListArea"><div class="wbRow">ToolDev</div></div>
</div>`

const SIDEBAR_HTML = `
<div data-slot="sidebar" style="display: contents;">
  <div class="root" style="width: 300px;">
    <div class="logoRow">
      <button class="brand wide" type="button" aria-label="New session">
        <span class="brandIdentity">
          <span class="brandMark"><div data-slot="sidebar.brand.mark"></div></span>
          <span class="brandName"><div data-slot="sidebar.brand.name">HARNESS</div></span>
        </span>
      </button>
      <button class="iconButton toggle" type="button" aria-label="Collapse sidebar"></button>
    </div>
    <button class="newSession" type="button" aria-label="New session">新会话</button>
    <nav class="panelList"><div data-slot="sidebar.panellist"></div></nav>
    <div class="regionArea"><div data-slot="sidebar.workspaces">${REGION_HTML}</div></div>
    <div class="footArea">
      <div class="footerActions"><div data-slot="sidebar.footer.action"></div></div>
      <div class="settingsArea"><div data-slot="sidebar.settings"></div></div>
    </div>
  </div>
</div>`

const dom = new JSDOM(`<!doctype html><html><body>${SIDEBAR_HTML}</body></html>`, {
  url: 'https://localhost/',
  pretendToBeVisual: true,
})
const { window } = dom
globalThis.window = window
globalThis.document = window.document
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })
globalThis.Event = window.Event
globalThis.HTMLElement = window.HTMLElement
globalThis.Node = window.Node
globalThis.IS_REACT_ACT_ENVIRONMENT = true

// React's legacy value-change polyfill is what jsdom's feature detection selects
// for input events, and it reaches for IE's `attachEvent`. A no-op pair keeps the
// rename field's focus/blur flow testable; a real browser never takes that path.
window.HTMLInputElement.prototype.attachEvent = function attachEvent() {}
window.HTMLInputElement.prototype.detachEvent = function detachEvent() {}

const clientSource = readFileSync(join(HERE, '..', 'client.js'), 'utf8')

/** Stand-in for ui-primitives' exported bucketer (same boundaries). */
function sharedRelativeTime(at, now) {
  const MIN = 60_000
  const HOUR = 3_600_000
  const DAY = 86_400_000
  const diff = Math.max(0, now - at)
  if (diff < MIN) return { unit: 'now', n: 0 }
  if (diff < HOUR) return { unit: 'minutes', n: Math.floor(diff / MIN) }
  if (diff < DAY) return { unit: 'hours', n: Math.floor(diff / HOUR) }
  if (diff < 30 * DAY) return { unit: 'days', n: Math.floor(diff / DAY) }
  if (diff < 365 * DAY) return { unit: 'months', n: Math.floor(diff / (30 * DAY)) }
  return { unit: 'years', n: Math.floor(diff / (365 * DAY)) }
}

/** Every props object the StateDot stand-in received, so its geometry can be asserted. */
const dotProps = []

/** Stand-in for ui-primitives' StateDot, marked so the assertions can tell the arms apart. */
function stubStateDot(props) {
  dotProps.push(props)
  return React.createElement('span', { 'data-state': props.state, 'data-dot': 'shared' })
}

/** Stand-in for ui-primitives' HoverCard: the anchor plus a marked card body. */
function stubHoverCard({ anchor, content }) {
  return React.createElement('span', { 'data-hover-card': 'shared' }, [
    React.cloneElement(anchor, { key: 'anchor' }),
    React.createElement('span', { 'data-hover-content': '', key: 'content' }, content),
  ])
}

const MINUTE = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000
const now = Date.now()
const sessions = {
  ids: [
    's-quiet', 's-mid', 's-new', 's-ask', 's-sub', 's-old', 's-far',
    's-blank', 's-archived', 's-subagent', 's-child-a', 's-child-b',
    's-r1', 's-r2', 's-r3', 's-r4', 's-r5', 's-r6', 's-r7', 's-r8',
  ],
  byId: {
    // Newest first: one idle session, then the active ones in fixture order.
    's-quiet': { id: 's-quiet', displayTitle: '静默的会话', updatedAt: now - MINUTE, running: false, blank: false, retainedBy: {} },
    's-mid': { id: 's-mid', displayTitle: '重构编解码器', updatedAt: now - 2 * MINUTE, running: false, blank: false, retainedBy: {} },
    's-new': { id: 's-new', displayTitle: 'FastTest 的调试会话', updatedAt: now - 4 * MINUTE, running: true, blank: false, retainedBy: { mainView: 1 } },
    's-ask': { id: 's-ask', displayTitle: '问一个问题', updatedAt: now - 6 * MINUTE, running: false, blank: false, retainedBy: {} },
    's-sub': { id: 's-sub', displayTitle: '子智能体在跑', updatedAt: now - 8 * MINUTE, running: false, blank: false, retainedBy: {} },
    's-old': { id: 's-old', displayTitle: 'key: 279a8c6aba184a3dad1a', updatedAt: now - 3 * HOUR, running: false, blank: false, retainedBy: {} },
    's-far': { id: 's-far', displayTitle: '远古会话', updatedAt: now - 5 * DAY, running: false, blank: false, retainedBy: {} },
    's-blank': { id: 's-blank', displayTitle: '', updatedAt: now, running: false, blank: true, retainedBy: {} },
    's-archived': { id: 's-archived', displayTitle: 'Archived', updatedAt: now, running: false, blank: false, retainedBy: {} },
    's-subagent': { id: 's-subagent', displayTitle: 'Subagent', updatedAt: now, running: false, blank: false, origin: 'subagent', retainedBy: {} },
    // Children of s-sub: they run, but a subagent child is not a conversation.
    's-child-a': { id: 's-child-a', displayTitle: '子智能体 A', updatedAt: now - 3 * MINUTE, running: true, blank: false, origin: 'subagent', retainedBy: {} },
    's-child-b': { id: 's-child-b', displayTitle: '子智能体 B', updatedAt: now - 3 * MINUTE, running: true, blank: false, origin: 'subagent', retainedBy: {} },
    ...Object.fromEntries(Array.from({ length: 8 }, (_, index) => [
      `s-r${index + 1}`,
      { id: `s-r${index + 1}`, displayTitle: `更早的会话 ${index + 1}`, updatedAt: now - (10 + index) * DAY, running: false, blank: false, retainedBy: {} },
    ])),
  },
  // The subagent catalog the shipped navigation counts running children from.
  projectionsBySession: {
    's-sub': { values: { subagentCatalog: [{ id: 's-child-a' }, { id: 's-child-b' }] } },
  },
}
const workspaces = {
  items: [
    { workspaceId: 'w-tooldev', path: '/work/ToolDev', title: 'ToolDev', sessionIds: ['s-mid', 's-old', 's-new'] },
    { workspaceId: 'w-fasttest', path: '/work/FastTest', title: 'FastTest', sessionIds: ['s-r1', 's-r2'] },
  ],
  archivedSessionIds: ['s-archived'],
  // Pinned by the registry: one idle session, one idle session inside a Workspace,
  // and one id that is archived — a pin the registry may still hold but the list
  // must not show.
  pinnedSessionIds: ['s-mid', 's-quiet', 's-archived'],
  state: 'idle',
  phase: 'ready',
  error: null,
}
const statuses = new Map([
  // An interaction kind the shipped navigation deliberately keeps quiet.
  ['s-quiet', { running: false, pendingInteraction: { kind: 'elicitation' }, completionUnread: false }],
  ['s-mid', { running: false, pendingInteraction: undefined, completionUnread: false }],
  ['s-new', { running: true, pendingInteraction: undefined, completionUnread: false }],
  ['s-ask', { running: false, pendingInteraction: { kind: 'question' }, completionUnread: false }],
  ['s-sub', { running: false, pendingInteraction: undefined, completionUnread: false }],
  ['s-old', { running: false, pendingInteraction: { kind: 'approval' }, completionUnread: false }],
  ['s-far', { running: false, pendingInteraction: undefined, completionUnread: true }],
  ['s-child-a', { running: true, pendingInteraction: undefined, completionUnread: false }],
  ['s-child-b', { running: true, pendingInteraction: undefined, completionUnread: false }],
])

/**
 * Run the whole scenario against one module table.
 * @param label - scenario name for the failure message.
 * @param primitives - the `ui-primitives` value the module table serves, or `undefined` for the fallback arm.
 */
async function scenario(label, primitives) {
  window.localStorage.removeItem('dsh-recent-sessions')

  // A pristine shipped region: no scenario may inherit the fold the previous one left.
  const regionSlot = document.querySelector('[data-slot="sidebar.workspaces"]')
  const pristine = document.createElement('div')
  pristine.innerHTML = REGION_HTML
  regionSlot.replaceChildren(pristine.firstElementChild)

  /**
   * The plugin repairs its own DOM on a slow timer. The intervals are captured
   * here instead of scheduled, so the scenario can run exactly one repair pass on
   * demand — which is how the "React rebuilt the region" case is driven.
   */
  const intervals = new Map()
  let nextIntervalId = 0
  const realSetInterval = window.setInterval
  const realClearInterval = window.clearInterval
  window.setInterval = (handler) => {
    nextIntervalId += 1
    intervals.set(nextIntervalId, handler)
    return nextIntervalId
  }
  window.clearInterval = (id) => { intervals.delete(id) }
  const tick = async () => { await act(async () => { for (const handler of [...intervals.values()]) handler() }) }

  /** Capture the module definition the plugin registers with the page's loader. */
  let definition
  window.__ModuleLoader__ = { load: (value) => { definition = value } }
  // The module body only touches page globals, which are installed above.
  new Function(clientSource)()
  assert.equal(definition.id, '@zimzaza4/dsh-recent-sessions', 'module id')

  const plugin = definition.factory((specifier) => {
    if (specifier === 'react') return React
    if (specifier === 'react-dom') return ReactDOM
    if (specifier === '@deepseek-ai/dsh-client-ui-primitives') {
      if (primitives === undefined) throw new Error('module not served')
      return primitives
    }
    throw new Error(`unexpected module request: ${specifier}`)
  })
  assert.equal(typeof plugin.apply, 'function', 'apply export')

  /** Slot registry + locale + the two shipped services the rows hop through, recorded for asserts. */
  const registrations = []
  const opened = []
  const renamed = []
  const slots = {
    inject: (_key, callback) => callback(),
    register: (options, Component) => {
      registrations.push({ options, Component })
      return () => {}
    },
  }
  const ctx = {
    get: (name) => {
      if (name === 'slots') return slots
      if (name === 'locale') return { register: () => () => {} }
      if (name === 'uiWorkspace') return { openSession: (id) => { opened.push(id) } }
      if (name === 'sessions') {
        // The shipped rename hop: `sessions.using(id, { source }, ref => ref.binding.session.rename(title))`.
        return {
          using: (sessionId, settings, callback) => {
            const record = { sessionId, source: settings.source, title: undefined }
            renamed.push(record)
            const result = callback({
              binding: { session: { rename: (title) => { record.title = title } } },
            })
            return Promise.resolve(result)
          },
        }
      }
      return undefined
    },
    effect: (callback) => callback(),
    reflect: { get: () => undefined },
  }

  plugin.apply(ctx)
  assert.equal(registrations.length, 2, 'two registrations: the sidebar block and the settings page')
  const sidebarSeat = registrations.find(entry => entry.options.name === 'sidebar.footer.action')
  const settingsSeat = registrations.find(entry => entry.options.name === 'settings.section')
  assert.ok(sidebarSeat !== undefined, 'the block rides the additive footer seat')
  assert.equal(sidebarSeat.options.locale, 'recentSessions', 'and owns its copy namespace')
  assert.ok(settingsSeat !== undefined, 'the settings page registers into settings.section')
  assert.equal(settingsSeat.options.id, '@zimzaza4/dsh-recent-sessions', 'under this plugin id')
  const { options, Component } = sidebarSeat
  const Settings = settingsSeat.Component
  const injected = options.inject()
  // The status store the seat reads: a fresh Map reference is what tells React a
  // status really changed, exactly as the shipped store's snapshots do.
  const statusStore = { value: statuses }

  const propsFor = (wide) => ({
    wide,
    useSessions: (selector) => selector(sessions),
    useWorkspaces: (selector) => selector(workspaces),
    useSessionStatus: (selector) => selector(statusStore.value),
    t: undefined,
    ...injected,
  })

  const seat = document.querySelector('[data-slot="sidebar.footer.action"]')
  const root = ReactDOMClient.createRoot(seat)
  const render = async (wide) => { await act(async () => { root.render(React.createElement(Component, propsFor(wide))) }) }

  const containerOf = (id) => document.querySelector(`[data-dsh-recent-sessions="${id}"]`)
  const section = (name) => containerOf(name).querySelector(`[data-section="${name}"]`)
  const headIn = (name) => section(name).querySelector('.drs-head')
  const rowsIn = (name) => [...section(name).querySelectorAll('.drs-row')]
  const titlesIn = (name) => rowsIn(name).map(element => element.querySelector('.drs-title').textContent)
  const workspacesIn = (name) => rowsIn(name).map(element => element.querySelector('.drs-workspace').textContent)
  const statesIn = (name) => rowsIn(name).map(element => {
    const dot = element.querySelector('.drs-slot [data-state]')
    return dot === null ? undefined : dot.getAttribute('data-state')
  })
  const labelsIn = (name) => rowsIn(name).map(element => {
    const hidden = element.querySelector('.drs-sr')
    return hidden === null ? undefined : hidden.textContent
  })
  const region = () => window.__DSH_RECENT_SESSIONS__.workspaces()
  const regionHeader = () => region().header
  const regionList = () => region().list
  const foldButton = () => regionHeader().querySelector('.drs-ws-fold')
  const regionArea = () => document.querySelector('[data-slot="sidebar.workspaces"]').parentElement
  const spacer = () => document.querySelector('[data-drs-sidebar-spacer]')
  const column = document.querySelector('[data-slot="sidebar"]').firstElementChild
  const columnOrder = () => [...column.children].map(node => {
    if (node.hasAttribute('data-dsh-recent-sessions')) return `block:${node.getAttribute('data-dsh-recent-sessions')}`
    if (node.hasAttribute('data-drs-sidebar-spacer')) return 'spacer'
    return node.className
  })

  // ── placement ─────────────────────────────────────────────────────────────
  await render(true)
  assert.ok(containerOf('recent') !== null, 'the recent container is injected')
  assert.ok(containerOf('active') !== null, 'the active container is injected')
  assert.ok(containerOf('pinned') !== null, 'the pinned container is injected')
  assert.deepEqual(columnOrder(), [
    'logoRow', 'newSession', 'panelList', 'regionArea', 'block:pinned', 'block:recent', 'block:active', 'spacer', 'footArea',
  ], 'the sections sit under the 工作区 region, with the tail spacer before the footer')
  assert.equal(seat.textContent, '', 'the footer seat itself stays empty')
  assert.equal(containerOf('pinned').nextElementSibling, containerOf('recent'), 'the recent section follows the pinned one')
  assert.equal(containerOf('recent').nextElementSibling, containerOf('active'), 'the active section follows the recent one')
  assert.equal(spacer().previousElementSibling, containerOf('active'), 'and the tail spacer follows the last section')
  // The region hugs its content and the tail takes the free space, so the three
  // sections sit together near the top instead of at the bottom of the sidebar.
  assert.equal(regionArea().style.flex, '0 1 auto', 'the workspace region stops growing')
  assert.equal(regionArea().style.marginBottom, '4px', 'and carries the same trailing 4px every other section has')
  assert.equal(column.querySelector('.footArea').style.marginTop, 'auto', 'while the footer keeps the bottom')

  // ── the recent list ───────────────────────────────────────────────────────
  assert.deepEqual(titlesIn('recent').slice(0, 7), [
    '静默的会话',                          // 1min, idle, and a kind the navigation keeps quiet
    '重构编解码器',                        // 2min, idle
    'FastTest 的调试会话',                 // 4min, running
    '问一个问题',                          // 6min, waiting for an answer
    '子智能体在跑',                        // 8min, subagents running
    'key: 279a8c6aba184a3dad1a',         // 3h, waiting for approval
    '远古会话',                           // 5d, finished and unopened
  ], 'newest first with blank/archived/subagent rows dropped')
  assert.equal(rowsIn('recent').length, 12, 'the default list holds twelve sessions')
  assert.equal(headIn('recent').querySelector('.drs-label').textContent, 'Recent sessions', 'English copy under en-US')
  assert.equal(rowsIn('recent')[1].querySelector('.drs-time').textContent, '2min')
  assert.equal(rowsIn('recent')[2].getAttribute('aria-current'), 'true', 'the displayed session is marked')
  assert.equal(statesIn('recent')[0], undefined, 'an idle row shows no dot')
  assert.equal(statesIn('recent')[1], undefined, 'an unknown interaction kind is not a dot either')
  const runningDot = rowsIn('recent')[2].querySelector('[data-state]')
  assert.ok(runningDot !== null, 'running row carries a state dot')
  assert.equal(runningDot.getAttribute('data-state'), 'ongoing', 'live activity')
  if (primitives !== undefined) assert.equal(runningDot.getAttribute('data-dot'), 'shared', 'dot comes from ui-primitives')
  assert.equal(statesIn('recent')[5], 'warning', 'pending interaction')
  assert.equal(statesIn('recent')[6], 'done', 'unopened completion reminder')
  if (primitives !== undefined) {
    assert.ok(dotProps.some(call => call.state === 'ongoing'), 'a running row asks the primitive for its spinner')
    assert.ok(dotProps.every(call => call.size === undefined),
      'and never forces a size — that is what would shrink the shipped 14px spinner')
  }

  // ── the pinned list ───────────────────────────────────────────────────────
  assert.equal(headIn('pinned').querySelector('.drs-label').textContent, 'Pinned', 'the pinned section has its own header')
  assert.equal(headIn('pinned').querySelector('.drs-count').textContent, '2',
    'it counts the pinned sessions the registry still lists')
  assert.deepEqual(titlesIn('pinned'), ['静默的会话', '重构编解码器'],
    'newest first — and the archived id the registry still pins is not shown')
  assert.deepEqual(workspacesIn('pinned'), ['Ungrouped', 'ToolDev'], 'pinned rows keep the workspace column')
  assert.deepEqual(labelsIn('pinned'), [undefined, undefined], 'a pinned idle session carries no status dot')
  assert.ok(titlesIn('recent').includes('静默的会话'),
    'pinning marks a session; it does not take it out of 最近会话')

  // ── workspace labels ──────────────────────────────────────────────────────
  assert.deepEqual(workspacesIn('recent').slice(0, 6), [
    'Ungrouped', 'ToolDev', 'ToolDev', 'Ungrouped', 'Ungrouped', 'ToolDev',
  ], 'each row names its owning workspace, the ungrouped bucket included')
  assert.equal(rowsIn('recent')[0].querySelector('.drs-title').getAttribute('title'), null,
    'rows carry no native tooltip: the hover marquee is what reveals a long title')

  // ── the hover card ────────────────────────────────────────────────────────
  if (primitives === undefined) {
    assert.equal(section('recent').querySelector('[data-hover-card]'), null,
      'without ui-primitives the rows render bare rather than break')
  } else {
    const card = section('recent').querySelector('[data-hover-content]')
    assert.ok(card !== null, 'each row carries the shipped hover card')
    assert.equal(card.querySelector('.drs-hover-title').textContent, '静默的会话', 'holding the full title')
    assert.equal(card.querySelector('.drs-hover-time').textContent, '1min ago',
      'the ago-wrapped relative time the shipped card uses')
    assert.equal(card.querySelector('.drs-hover-status').textContent, 'Idle',
      'and a state line even for an idle session, as the shipped card ends on one')
    const waitingCard = section('active').querySelector('[data-hover-content]')
    assert.equal(waitingCard.querySelector('.drs-hover-status').textContent, 'Waiting for answer',
      'a session that is waiting says so in its card')
    const runningCard = [...section('recent').querySelectorAll('[data-hover-content]')][2]
    assert.equal(runningCard.querySelector('.drs-hover-status').textContent, 'Running',
      'and a working one names its live state')
  }

  // ── the active list: membership, order, dots ──────────────────────────────
  assert.equal(headIn('active').querySelector('.drs-label').textContent, 'Active sessions', 'the active section has its own header')
  assert.equal(headIn('active').querySelector('.drs-count').textContent, '5', 'the header counts the active sessions')
  assert.deepEqual(titlesIn('active'), [
    '问一个问题',                          // 1 — waiting on the user (question)
    'key: 279a8c6aba184a3dad1a',         // 1 — waiting on the user (approval)
    '远古会话',                           // 2 — finished and not opened since
    'FastTest 的调试会话',                 // 3 — running
    '子智能体在跑',                        // 3 — a subagent is running
  ], 'ranked: waiting > unread completion > working, newest first inside a rank')
  assert.deepEqual(statesIn('active'), ['warning', 'warning', 'done', 'ongoing', 'ongoing'], 'the active dots')
  assert.deepEqual(workspacesIn('active'), ['Ungrouped', 'ToolDev', 'Ungrouped', 'ToolDev', 'Ungrouped'])
  assert.deepEqual(labelsIn('active'), [
    'Waiting for answer',
    'Waiting for approval',
    'Completed',
    'Running',
    '2 subagents running',
  ], 'each active dot names its state for screen readers')
  const idleIds = ['静默的会话', '重构编解码器', '更早的会话 1']
  for (const title of idleIds) {
    assert.ok(!titlesIn('active').includes(title), `${title} is neither working nor fresh and stays out of the active list`)
  }
  assert.ok(!titlesIn('active').includes('子智能体 A'), 'a subagent child is not a session of its own')

  // ── the linger over 活跃会话 ───────────────────────────────────────────────
  // A session that stops qualifying keeps its row for the configured window, so a
  // completion the user is reading does not vanish out from under the pointer.
  const settledFar = new Map(statusStore.value)
  settledFar.set('s-far', { running: false, pendingInteraction: undefined, completionUnread: false })
  statusStore.value = settledFar
  await render(true)
  assert.ok(titlesIn('active').includes('远古会话'),
    'a row that just stopped qualifying lingers in 活跃会话 instead of closing at once')
  const held = rowsIn('active').find(row => row.querySelector('.drs-title').textContent === '远古会话')
  assert.equal(held.querySelector('.drs-slot [data-state]'), null,
    'a row that has settled shows no state dot: no spinner on a conversation that is not running')
  assert.equal(titlesIn('active').at(-1), '远古会话', 'and it sorts after the live rows while it lingers')
  await act(async () => { window.__DSH_RECENT_SESSIONS__.linger(0) })
  await render(true)
  assert.ok(!titlesIn('active').includes('远古会话'), 'turning the linger off drops it on the next pass')
  await act(async () => { window.__DSH_RECENT_SESSIONS__.linger(30) })
  statusStore.value = statuses
  await render(true)
  assert.ok(titlesIn('active').includes('远古会话'), 'and it comes straight back once it qualifies again')

  // ── the settings page ─────────────────────────────────────────────────────
  const settingsHost = document.createElement('div')
  document.body.append(settingsHost)
  const settingsRoot = ReactDOMClient.createRoot(settingsHost)
  const renderSettings = async () => {
    await act(async () => { settingsRoot.render(React.createElement(Settings, { t: undefined })) })
  }
  await renderSettings()
  const switches = [...settingsHost.querySelectorAll('input[type="checkbox"]')]
  assert.equal(switches.length, 4, 'one visibility switch per section')
  assert.ok(switches.every(node => node.checked === true), 'and all four sections start shown')
  assert.equal(settingsHost.querySelector('.drs-settings-number').value, '30', 'the linger starts at 30 seconds')

  await act(async () => { switches[2].click() })
  assert.equal(window.__DSH_RECENT_SESSIONS__.prefs().hidden.recent, true, 'the switch records the section as hidden')
  assert.equal(containerOf('recent').style.display, 'none', 'and the sidebar hides that section at once')
  assert.equal(containerOf('pinned').style.display, '', 'leaving the other sections alone')
  assert.equal(containerOf('active').style.display, '')
  await act(async () => { switches[2].click() })
  assert.equal(containerOf('recent').style.display, '', 'toggling it back shows the section again')

  await act(async () => { switches[0].click() })
  assert.equal(window.__DSH_RECENT_SESSIONS__.prefs().hidden.workspaces, true, 'the shipped region can be hidden too')
  assert.equal(regionArea().style.display, 'none', 'and it leaves the column')
  await act(async () => { switches[0].click() })
  assert.equal(regionArea().style.display, '', 'and comes back when switched on')
  assert.equal(columnOrder()[3], 'regionArea', 'in its old place')

  // The number field is a controlled input, and jsdom never delivers React's
  // synthetic change for one. What is checked is the field's binding to the store
  // and the store's own clamping — the write path the field calls.
  const number = () => settingsHost.querySelector('.drs-settings-number')
  assert.equal(number().value, '30', 'the field shows the stored linger')
  await act(async () => { window.__DSH_RECENT_SESSIONS__.linger(45) })
  await renderSettings()
  assert.equal(window.__DSH_RECENT_SESSIONS__.prefs().lingerSeconds, 45, 'the linger can be set')
  assert.equal(number().value, '45', 'and the field follows the store')
  await act(async () => { window.__DSH_RECENT_SESSIONS__.linger(9999) })
  assert.equal(window.__DSH_RECENT_SESSIONS__.prefs().lingerSeconds, 600, 'a value past the ceiling clamps')
  await act(async () => { window.__DSH_RECENT_SESSIONS__.linger(0) })
  await renderSettings()
  assert.equal(number().value, '0', 'zero is allowed, and turns the linger off')
  await act(async () => { window.__DSH_RECENT_SESSIONS__.linger(30) })
  await act(async () => { settingsRoot.unmount() })

  // ── bounded scroll regions ────────────────────────────────────────────────
  assert.equal(containerOf('recent').style.getPropertyValue('--drs-visible-rows'), '5',
    'the recent window height comes from the visible-row preference')
  assert.equal(containerOf('active').style.getPropertyValue('--drs-active-rows'), '3',
    'the active window has its own, smaller preference')
  assert.ok(rowsIn('recent').length > 5, 'more rows are held than are visible, so the recent region scrolls')
  assert.ok(rowsIn('active').length > 3, 'and so does the active one')
  await act(async () => { window.__DSH_RECENT_SESSIONS__.view(3) })
  assert.equal(containerOf('recent').style.getPropertyValue('--drs-visible-rows'), '3', 'hand-set recent rows apply')
  await act(async () => { window.__DSH_RECENT_SESSIONS__.view(5) })
  await act(async () => { window.__DSH_RECENT_SESSIONS__.activeView(2) })
  assert.equal(containerOf('active').style.getPropertyValue('--drs-active-rows'), '2', 'hand-set active rows apply')
  await act(async () => { window.__DSH_RECENT_SESSIONS__.activeView(3) })

  // ── locale ────────────────────────────────────────────────────────────────
  Object.defineProperty(window.navigator, 'language', { value: 'zh-CN', configurable: true })
  await render(true)
  assert.equal(headIn('recent').querySelector('.drs-label').textContent, '最近会话', 'Chinese copy under zh-CN')
  assert.equal(headIn('active').querySelector('.drs-label').textContent, '活跃会话', 'the active header too')
  assert.equal(headIn('active').getAttribute('aria-label'), '收起活跃会话', 'the active header is labelled for screen readers')
  assert.equal(rowsIn('recent')[1].querySelector('.drs-time').textContent, '2分钟', 'Chinese relative time (matches the workspace rows)')
  assert.equal(workspacesIn('recent')[3], '未分组', 'Chinese ungrouped label')
  assert.deepEqual(labelsIn('active'), [
    '等待回答', '等待审批', '已完成', '进行中', '2 个子智能体运行中',
  ], 'Chinese status copy, worded as the shipped rows word it')
  Object.defineProperty(window.navigator, 'language', { value: 'en-US', configurable: true })
  await render(true)

  // ── row limit ─────────────────────────────────────────────────────────────
  await act(async () => { window.__DSH_RECENT_SESSIONS__.limit(2) })
  assert.equal(rowsIn('recent').length, 2, 'hand-set row limit applies to the recent list')
  assert.equal(rowsIn('active').length, 5, 'and never hides a session that needs the user')
  await act(async () => { window.__DSH_RECENT_SESSIONS__.limit(6) })
  assert.equal(rowsIn('recent').length, 6, 'the limit is restored')

  // ── opening ───────────────────────────────────────────────────────────────
  await act(async () => { rowsIn('active')[0].click() })
  assert.deepEqual(opened, ['s-ask'], 'clicking an active row opens that session')
  await act(async () => { rowsIn('recent')[0].click() })
  assert.deepEqual(opened, ['s-ask', 's-quiet'], 'recent rows open through the same path')

  // ── folding, one section at a time ────────────────────────────────────────
  // The header is itself the button, so the label and the count are part of the
  // hit target and the chevron is never the only way in.
  assert.equal(headIn('recent').tagName, 'BUTTON', 'the header row is the fold control')
  await act(async () => { headIn('recent').querySelector('.drs-label').click() })
  assert.equal(headIn('recent').getAttribute('aria-expanded'), 'false', 'the header reports its folded state')
  assert.equal(section('recent').querySelector('.drs-list'), null, 'clicking the label folds the recent section')
  assert.ok(headIn('recent') !== null, 'a folded section keeps its header')
  assert.equal(window.__DSH_RECENT_SESSIONS__.prefs().collapsed, true, 'recent fold state persisted')
  assert.ok(section('active').querySelector('.drs-list') !== null, 'folding recent leaves the active section open')

  await act(async () => { headIn('active').click() })
  assert.equal(section('active').querySelector('.drs-list'), null, 'clicking the header folds the active section')
  assert.ok(headIn('active') !== null, 'folded active section keeps its header')
  assert.equal(headIn('active').querySelector('.drs-count').textContent, '5', 'and keeps its count, so a folded alert still reads')
  assert.equal(window.__DSH_RECENT_SESSIONS__.prefs().activeCollapsed, true, 'active fold state persisted')

  await act(async () => { headIn('pinned').querySelector('.drs-label').click() })
  assert.equal(section('pinned').querySelector('.drs-list'), null, 'clicking the label folds the pinned section')
  assert.equal(headIn('pinned').getAttribute('aria-expanded'), 'false', 'and the header reports it')
  assert.equal(window.__DSH_RECENT_SESSIONS__.prefs().pinnedCollapsed, true, 'pinned fold state persisted')

  await act(async () => { headIn('recent').click() })
  await act(async () => { headIn('active').click() })
  await act(async () => { headIn('pinned').click() })
  assert.ok(section('recent').querySelector('.drs-list') !== null, 'the recent section unfolds again')
  assert.ok(section('active').querySelector('.drs-list') !== null, 'the active section unfolds again')
  assert.ok(section('pinned').querySelector('.drs-list') !== null, 'the pinned section unfolds again')

  // ── folding the shipped 工作区 region ──────────────────────────────────────
  assert.ok(region() !== null, 'the shipped workspace region is found structurally')
  assert.equal(regionHeader().className, 'wbSectionHeader', 'its root hosts the section header')
  assert.equal(regionList().className, 'wbListArea', 'and the header is followed by the list area')
  assert.ok(foldButton() !== null, 'the fold affordance is injected into that header')
  assert.equal(regionHeader().lastElementChild, foldButton(),
    'and sits at the right end of the row, where the recent and active chevrons sit')
  assert.equal(foldButton().getAttribute('aria-expanded'), 'true', 'the region starts open')
  assert.equal(regionHeader().getAttribute('data-drs-workspaces-fold'), 'open', 'the header carries its state')
  assert.equal(regionList().style.display, '', 'and the shipped list is untouched')

  // The label is the big target — clicking the words folds it, no 12px glyph to hit.
  await act(async () => { region().label.click() })
  assert.equal(regionHeader().getAttribute('data-drs-workspaces-fold'), 'collapsed', 'the header records the fold')
  assert.equal(regionHeader().style.marginBottom, '0px',
    'and drops the margin that used to separate it from its list, so every section gap stays the same')
  assert.equal(regionList().style.display, 'none', 'the shipped workspace list is hidden')
  assert.equal(foldButton().getAttribute('aria-expanded'), 'false', 'the chevron reports it')
  assert.equal(window.__DSH_RECENT_SESSIONS__.prefs().workspacesCollapsed, true, 'and the fold is persisted')

  // The header's own controls are not fold targets.
  await act(async () => { regionHeader().querySelector('.wbSearchButton').click() })
  assert.equal(window.__DSH_RECENT_SESSIONS__.prefs().workspacesCollapsed, true, 'the search button does not fold the region')
  await act(async () => { regionHeader().querySelector('.wbIconButton').click() })
  assert.equal(window.__DSH_RECENT_SESSIONS__.prefs().workspacesCollapsed, true, 'neither does the add-workspace button')

  // The chevron folds too, and it is a real button, so keyboard activation takes the same path.
  await act(async () => { foldButton().click() })
  assert.equal(regionHeader().getAttribute('data-drs-workspaces-fold'), 'open', 'the chevron unfolds the region')
  assert.equal(regionList().style.display, '', 'and the shipped list is shown again')
  assert.equal(window.__DSH_RECENT_SESSIONS__.prefs().workspacesCollapsed, false, 'the state is persisted both ways')

  // React rebuilds the whole region on a workspace or search change: the injected
  // chevron and the hidden list both disappear, and the timer's next pass puts the
  // fold back — this is the case the periodic repair exists for.
  await act(async () => { foldButton().click() })
  assert.equal(regionList().style.display, 'none', 'folded again')
  const rebuilt = document.createElement('div')
  rebuilt.innerHTML = REGION_HTML
  regionSlot.replaceChildren(rebuilt.firstElementChild)
  assert.equal(foldButton(), null, 'the rebuild dropped the injected chevron')
  assert.equal(regionList().style.display, '', 'and un-hid the list')
  await tick()
  assert.ok(foldButton() !== null, 'the repair pass puts the chevron back')
  assert.equal(regionHeader().lastElementChild, foldButton(), 'still at the right end')
  assert.equal(regionList().style.display, 'none', 'and hides the shipped list again')

  // ── the section order, and dragging a section somewhere else ──────────────
  const rect = (top, height) => ({
    top, bottom: top + height, height, left: 0, right: 300, width: 300, x: 0, y: top,
    toJSON: () => ({}),
  })
  /** Lay the three sections out as the browser would, in their current DOM order. */
  const stubRects = () => {
    let top = 0
    for (const id of window.__DSH_RECENT_SESSIONS__.sections()) {
      const node = id === 'workspaces' ? regionArea() : containerOf(id)
      const height = id === 'workspaces' ? 200 : 120
      node.getBoundingClientRect = () => rect(top, height)
      top += height
    }
  }
  const drag = (type, node, clientY) => {
    node.dispatchEvent(new window.MouseEvent(type, { bubbles: true, cancelable: true, clientY }))
  }
  const line = () => document.querySelector('[data-drs-drop-line]')
  const DEFAULT_ORDER = [
    'logoRow', 'newSession', 'panelList', 'regionArea', 'block:pinned', 'block:recent', 'block:active', 'spacer', 'footArea',
  ]

  // The order preference drives the placement: any permutation of the four wins.
  await act(async () => { window.__DSH_RECENT_SESSIONS__.order(['recent', 'workspaces', 'active', 'pinned']) })
  assert.deepEqual(columnOrder(), [
    'logoRow', 'newSession', 'panelList', 'block:recent', 'regionArea', 'block:active', 'block:pinned', 'spacer', 'footArea',
  ], 'the recent section can sit before the workspace region')
  await act(async () => { window.__DSH_RECENT_SESSIONS__.order(['active', 'recent', 'workspaces', 'pinned']) })
  assert.deepEqual(columnOrder(), [
    'logoRow', 'newSession', 'panelList', 'block:active', 'block:recent', 'regionArea', 'block:pinned', 'spacer', 'footArea',
  ], 'and the workspace region can sit ahead of the pinned one, with the tail spacer still under the last section')
  await act(async () => { window.__DSH_RECENT_SESSIONS__.order(['recent', 'recent', 'nope', 'pinned']) })
  assert.deepEqual(window.__DSH_RECENT_SESSIONS__.prefs().order, ['workspaces', 'pinned', 'recent', 'active'],
    'a duplicated or foreign order falls back to the default')
  assert.deepEqual(columnOrder(), DEFAULT_ORDER, 'and the sections go back to it')

  // Dragging a header moves its section: to the top, then to the end of the list.
  stubRects()
  await act(async () => { drag('dragstart', headIn('active'), 520) })
  await act(async () => { drag('dragover', document, 10) })
  assert.ok(line() !== null, 'the insertion line appears while a section is dragged')
  assert.equal(line().nextElementSibling, regionArea(), 'and sits where the section would land')
  await act(async () => { drag('drop', document, 10) })
  assert.equal(line(), null, 'the line goes away with the drop')
  assert.deepEqual(window.__DSH_RECENT_SESSIONS__.prefs().order, ['active', 'workspaces', 'pinned', 'recent'],
    'the dropped section takes the place the line was drawn at')
  assert.deepEqual(columnOrder(), [
    'logoRow', 'newSession', 'panelList', 'block:active', 'regionArea', 'block:pinned', 'block:recent', 'spacer', 'footArea',
  ], 'and the column follows the preference')

  stubRects()
  await act(async () => { drag('dragstart', headIn('recent'), 400) })
  await act(async () => { drag('dragover', document, 900) })
  assert.equal(line().nextElementSibling, spacer(),
    'an end-of-list drop draws the line under the last section, not at the bottom of the sidebar')
  await act(async () => { drag('dragend', document, 900) })
  assert.equal(line(), null, 'a drag that ends without a drop takes the line away')
  assert.deepEqual(window.__DSH_RECENT_SESSIONS__.prefs().order, ['active', 'workspaces', 'pinned', 'recent'],
    'and leaves the order alone')
  await act(async () => { window.__DSH_RECENT_SESSIONS__.order(['workspaces', 'pinned', 'recent', 'active']) })
  assert.deepEqual(columnOrder(), DEFAULT_ORDER, 'the default order is restored for the checks that follow')

  // ── the row behaviours the shipped workspace rows have ────────────────────
  // Hover marquee: the title clips its own text, so crawling is `scrollLeft` plus
  // the stylesheet's fade-mask hooks. The frame clock is captured so a crawl can
  // be stepped by hand instead of waited for.
  const frames = []
  const realRequestFrame = window.requestAnimationFrame
  const realCancelFrame = window.cancelAnimationFrame
  window.requestAnimationFrame = (handler) => { frames.push(handler); return frames.length }
  window.cancelAnimationFrame = () => {}

  const firstRow = () => rowsIn('recent')[0]
  const titleEl = () => firstRow().querySelector('.drs-title')
  const scrolls = []
  Object.defineProperty(titleEl(), 'scrollWidth', { value: 300, configurable: true })
  Object.defineProperty(titleEl(), 'clientWidth', { value: 100, configurable: true })
  titleEl().scrollTo = (options) => { scrolls.push(options.left); titleEl().scrollLeft = options.left }

  await act(async () => {
    firstRow().dispatchEvent(new window.MouseEvent('pointerover', { bubbles: true }))
  })
  assert.ok(frames.length > 0, 'hovering a row starts the title crawl')
  await act(async () => { frames.shift()(1000) })
  assert.equal(scrolls.at(-1), 0, 'the crawl starts at the left edge')
  assert.equal(titleEl().dataset.clipped, '', 'the right fade appears while text remains beyond the edge')
  assert.equal(titleEl().dataset.scrolled, undefined, 'and nothing is faded on the left yet')
  await act(async () => { frames.shift()(1100) })
  assert.equal(scrolls.at(-1), 3, 'the crawl runs at the shipped 0.03 px/ms')
  assert.equal(titleEl().dataset.scrolled, '', 'the left fade comes on once the title has moved')

  await act(async () => {
    firstRow().dispatchEvent(new window.MouseEvent('pointerout', { bubbles: true }))
  })
  assert.equal(scrolls.at(-1), 0, 'leaving the row returns the title to its start')
  assert.equal(titleEl().dataset.scrolled, undefined, 'and takes both fades off')
  assert.equal(titleEl().dataset.clipped, undefined, 'both of them')
  const sheet = document.querySelector('style[data-plugin-css]')
  assert.ok(sheet !== null && sheet.textContent.includes('.drs-title[data-scrolled]{text-overflow:clip}'),
    'a scrolled title drops its ellipsis — Chromium otherwise renders a bare "…" at the far edge')
  window.requestAnimationFrame = realRequestFrame
  window.cancelAnimationFrame = realCancelFrame

  // Double-click rename: the modal the workspace list opens, in this plugin's own
  // markup (the shared Modal renders nothing from a plugin seat, so the shape is
  // ours and it portals itself to the body).
  const setValue = async (input, value) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    await act(async () => {
      setter.call(input, value)
      input.dispatchEvent(new window.Event('input', { bubbles: true }))
    })
  }
  const dblclick = async () => {
    await act(async () => {
      firstRow().querySelector('.drs-title').dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }))
    })
  }
  const modal = () => document.querySelector('.drs-modal')
  const modalField = () => modal().querySelector('.drs-rename-dialog')
  const openedBefore = opened.length

  await dblclick()
  assert.ok(modal() !== null, 'double-clicking a title opens the rename dialog')
  assert.equal(modal().querySelector('.drs-modal-title').textContent, 'Rename session', 'titled like the shipped one')
  assert.equal(modalField().value, '静默的会话', 'seeded with the current title')
  assert.equal(modal().parentElement, document.body, 'portaled to the body, clear of the sidebar')
  assert.equal(opened.length, openedBefore, 'and the double click did not also open the session')
  assert.equal(modal().querySelector('.drs-btn-primary').disabled, false, 'confirm is live for a non-empty title')

  await setValue(modalField(), '   ')
  await act(async () => { modal().querySelector('.drs-btn-primary').click() })
  assert.equal(renamed.length, 0, 'a title that trims to nothing is not sent anywhere')
  assert.ok(modal() !== null, 'and the dialog stays open')

  await setValue(modalField(), '改过的名字')
  await act(async () => { modal().querySelector('.drs-btn-primary').click() })
  assert.deepEqual(renamed, [{ sessionId: 's-quiet', source: 'workspaceOperation', title: '改过的名字' }],
    'confirming renames through the shipped sessions service')
  assert.equal(modal(), null, 'and the dialog closes')

  await dblclick()
  await act(async () => { modal().querySelector('.drs-btn-outline').click() })
  assert.equal(modal(), null, 'cancel closes the dialog')
  assert.equal(renamed.length, 1, 'and sends nothing')

  await dblclick()
  await act(async () => {
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })
  assert.equal(modal(), null, 'Escape closes it too')
  assert.equal(renamed.length, 1, 'without sending anything')

  // ── rail + repair ─────────────────────────────────────────────────────────
  await render(false)
  assert.equal(containerOf('recent').style.display, 'none', 'rail hides the recent section')
  assert.equal(containerOf('active').style.display, 'none', 'and the active one')
  assert.equal(containerOf('pinned').style.display, 'none', 'and the pinned one')
  assert.equal(foldButton(), null, 'the rail has no label to fold from, so the chevron goes away')
  assert.equal(regionHeader().hasAttribute('data-drs-workspaces-fold'), false, 'and so does the fold mark')
  assert.equal(regionList().style.display, '', 'and the shipped list is shown again, so nothing stays out of reach')
  assert.equal(window.__DSH_RECENT_SESSIONS__.prefs().workspacesCollapsed, true, 'while the fold itself is remembered')

  await render(true)
  assert.equal(containerOf('recent').style.display, '', 'expanded shows the recent section again')
  assert.equal(containerOf('pinned').style.display, '', 'and the pinned one')
  assert.ok(foldButton() !== null, 'and the fold affordance comes back')
  assert.equal(regionList().style.display, 'none', 'with the list still folded')
  await act(async () => { region().label.click() })
  assert.equal(regionList().style.display, '', 'clicking the label unfolds it again')

  containerOf('recent').remove()
  assert.ok(window.__DSH_RECENT_SESSIONS__.container() !== null, 'a removed container is re-injected')
  assert.deepEqual(columnOrder(), [
    'logoRow', 'newSession', 'panelList', 'regionArea', 'block:pinned', 'block:recent', 'block:active', 'spacer', 'footArea',
  ], 'and re-injected in the same gap, under the workspace region')

  await act(async () => { root.unmount() })
  assert.equal(foldButton(), null, 'unmounting (the bundle was disabled) takes the chevron back out')
  assert.equal(regionList().style.display, '', 'and gives the shipped list back')
  assert.equal(regionArea().style.flex, '', 'the region grows again')
  assert.equal(document.querySelector('[data-drs-sidebar-spacer]'), null, 'and nothing of the plugin is left behind')
  window.setInterval = realSetInterval
  window.clearInterval = realClearInterval
  console.log(`recent-sessions (${label}): placement, listing, active ranking, locale, limits, open, fold, workspace fold, drag, rail, repair — OK`)
}

await scenario('shared ui-primitives', {
  relativeTime: sharedRelativeTime,
  StateDot: stubStateDot,
  HoverCard: stubHoverCard,
})
await scenario('without ui-primitives', undefined)
