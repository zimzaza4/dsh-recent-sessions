# @zimzaza4/dsh-recent-sessions

最近使用的会话，紧跟侧边栏自带的 **工作区** 区块下方：单行列表、限定高度、可滚动，风格与工作区列表一致，并标出每个会话所属的工作区。其下还有 **活跃会话** 区块，只放此刻值得看一眼的会话，按“要你处理的 → 你没看的完成 → 正在工作的”排序。顺带给 **工作区** 区块本体加了个折叠开关。

A bounded, scrollable quick-access block for the DeepSeek Harness Web sidebar: the sessions you most recently worked in, drawn in the workspace list's own row style, placed directly under the shipped **workspace** region — plus an **Active sessions** section under it holding only what is not idle, ranked by what the user most likely has to do about it, and a fold for that shipped workspace region.

```text
┌ sidebar ──────────────────────────┐
│ 🐋 deepseek HARNESS               │  shell: brand row
│ ＋ 新会话                          │  shell: New Session
│ 插件 / 自动化任务 …                 │  shell
│ 工作区          ⌕ ⚙ ⊞ ⌄          │  shell; ⌄ is this plugin's fold
│ ┌───────────────────────────┬──┐ │  (the shipped list, or folded away)
│ │ ToolDev …                  │▍│ │
│ └───────────────────────────┴──┘ │
│ 最近会话                       ⌄  │  ← this plugin (whole header row folds it)
│ ┌───────────────────────────┬──┐ │
│ │   重构编解码器  ToolDev 2分钟│▍│ │  fixed window: 5 rows visible
│ │ ● 调试会话     ToolDev 4分钟│▍│ │  the rest scrolls inside the block
│ │   279a8c6aba…  ToolDev 3小时│▍│ │
│ │   远古会话      未分组  5天 │▍│ │
│ └───────────────────────────┴──┘ │
│ 活跃会话              3        ⌄  │  ← waiting > unread > working
│ ┌───────────────────────────┬──┐ │
│ │ ● 问一个问题    未分组 6分钟│▍│ │  yellow: waiting for an answer
│ │ ● 279a8c6aba…  ToolDev 3小时│▍│ │  yellow: waiting for approval
│ │ ● 远古会话      未分组  5天 │▍│ │  green: finished, not opened since
│ └───────────────────────────┴──┘ │
│ ⚙ 设置                             │  shell: footer
└───────────────────────────────────┘
```

## What it does

- **Sits under the 工作区 region**, between the shipped workspace browser and the sidebar footer, and reads as its continuation: the block takes the region's own box (it bleeds to the sidebar edges exactly as `.regionArea` does), its headers are the shipped `.sectionHeader` geometry (36px row, 4px gaps, 4px left padding, the same 4px out-dent on the right), and its chevron is the shipped icon button (28px box, sm radius, secondary ink) — so 置顶对话 / 工作区 / 最近会话 / 活跃会话 sit on one line grid.
- **Three lists, one row style**: **置顶对话** (every session the Workspace registry holds in `pinnedSessionIds`, newest first — pinning marks a session, it does not take it out of 最近会话), **最近会话** (newest first, up to 12 rows) and **活跃会话** (what needs you, ranked waiting → unread completion → working). Each has its own fold state and its own visible-row window (4 / 5 / 3), so the block scrolls inside fixed-height windows and can never take the sidebar's browsing region away from the workspace list.
- **Names each session's Workspace** in the same place the workspace list's own meta sits, using the browser's membership order; a session no Workspace accounts for shows the app's `未分组` / `Ungrouped` wording.
- **Behaves like a workspace row**: hovering a clipped title crawls it at the shipped speed (0.03 px/ms) under the same edge fades, a **hover card** opens after the same delay with the full title, the ago-wrapped time and a state line (`空闲` / `Idle` included, as the shipped card always ends on one), and **double-clicking the title opens a rename dialog** shaped like the workspace list's — the app's own copy (`重命名会话` / `重命名` / `取消` / `关闭`), a field seeded with the row's title and selected, an emptied title never sent, Enter confirming, Escape or the mask closing, and a rejected rename keeping its reason under the field — confirming through the same `sessions.using(…, 'workspaceOperation')` hop the workspace list uses. The dialog is this plugin's own markup on the app's modal surface, portaled to the body, because the shared `Modal` primitive renders nothing from a plugin seat (verified live). Its numbers are the shipped dialog's, measured off both sides of a screenshot pair: the same card fill (`--dsw-alias-bg-layer-2`), a ~70% black scrim with no blur, a 380px frame with **24px** padding, its rows 6px apart (which is what keeps both cards the same 160px tall), and the dialog's own 44px transparent field with a hairline border — not the row-sized field of the list. Rows also stop 6px short of the list's own scrollbar, so the gutter keeps its air and the card opens outside it. No native `title` tooltips anywhere — the shipped rows have none, and one renders as a box this sidebar never shows.
- **Drops what the browser drops**: archived sessions, subagent children, and the provisional blank New Session row (which has no title or time yet).
- **Marks the session you are looking at** with the workspace list's selected surface, and shows the primitive's own state dot for a row that is running, waiting for you, or finished while you were elsewhere — including its 14px spinner for live work, which a hand-set size would shrink.
- **Opens a session on click** through the shipped `uiWorkspace.openSession` — the same path a workspace-row click takes.
- **Folds away** from anywhere on its own section header — the whole row (label, count, chevron) is the button, so there is no tiny chevron to aim at. Each section folds independently and remembers its state; the rail hides the whole block. A section is absent while no session qualifies.
- **Adjusts itself in Settings**: the plugin contributes its own 设置 page, **侧栏会话分区** — one switch per section (工作区 / 置顶对话 / 最近会话 / 活跃会话) that shows or hides it live, and the 活跃会话 linger in seconds. Every control writes the same preferences the sidebar reads, so a toggle lands while the page is still open.
- **A finished row lingers in 活跃会话** for 30 seconds by default (`lingerSeconds`, 0..600, 0 turns it off): a session that stops qualifying — the completion was read, or the turn settled — keeps its row instead of vanishing out from under the pointer, but the row is refreshed to the session's **current** facts, so a conversation that is no longer running shows no state dot (no spinner on settled work) and sorts after the live rows. Clicking it still opens it as usual.
- Follows the app locale (中文 / English) and the theme: every color is a `--dsw-*` token, the scrollbar is the app's own skin (including the sidebar's quiet-bars rule), and every size comes from the shipped sidebar geometry. The status copy behind each dot is the shipped wording (`等待审批` / `计划待审` / `等待回答` / `已完成` / `进行中`), so the block reads like the rest of the app.

## The 活跃会话 section

Directly under the recent list, in the same row style and with its own fold state and window, sits the sessions that are **not idle** — exactly the rows the shipped sidebar decorates with a state dot:

| rank | dot | what it means | where it comes from |
|---|---|---|---|
| 1 | yellow `warning` | the agent is waiting for the user: an approval, a plan review, or an answer | `pendingInteraction.kind` ∈ `approval` / `plan-review` / `question` |
| 2 | green `done` | the turn finished while the user was elsewhere and they have not opened the session since | `completionUnread` |
| 3 | blue `ongoing` | the session, or one of its subagents, is working | `running`, or a running entry in the session's subagent catalog |

Inside a rank rows are newest first. A session that is neither working, nor waiting on the user, nor freshly finished is idle and never enters the block. The header carries the count, so a folded section still says how many sessions want attention.

The selection deliberately mirrors the shipped navigation, including its `visiblePendingKind` allowlist (a pending interaction of some other kind is not surfaced) and its subagent-activity rule — so a session the sidebar leaves undecorated is a session this block leaves out, and the green/yellow/blue dots agree between the two.

## Folding the shipped 工作区 section

The shipped workspace browser renders its own header (工作区 · search · view options · add) and never lets the region fold. This plugin gives it one:

- a **chevron button is appended at the right end** of that header, in the same corner the 最近会话 / 活跃会话 chevrons sit in, so the three headers read alike. It is a real `<button>` with `aria-expanded`/`aria-label`, and its box is the shipped icon button's own 28×28 / 4px-gap geometry, so it does not read as a stranger in that row;
- **the 工作区 label folds it too** — clicking the words (or the header's own padding) toggles, so there is no 12px glyph to aim at, and the header's search / view-options / add controls keep their own clicks;
- **while folded, the list area under the header is hidden** and the header stays, because it is the way back. The fold is persisted, and it is remembered across the rail: in the collapsed rail the header has no label to fold from, so the chevron is removed and the list is shown again — nothing can be folded out of reach.

Two properties make that safe on shipped chrome. The region is found **structurally** — the `sidebar.workspaces` slot's parent, the browser root's header, and the sibling after it (the list) — never by hashed CSS-module class names. And the fold is **re-applied on a slow timer**, because the browser rebuilds its header and list whenever the workspace snapshot, the search or the view options change; the same timer that repairs the block's own containers. Unmounting the plugin (disabling the bundle) takes the chevron out and gives the list back.

## Order, and dragging the sections

置顶对话 / 工作区 / 最近会话 / 活跃会话 sit in one column and can be dragged into **any order** — 工作区 may sit first, last, or between the others:

- every section header is a drag handle, and a **blue insertion line** shows where the section will land;
- the line is a real (zero-height) element in the column's flex flow that bleeds to both sidebar edges: straight, full width, drawn either immediately before the section it precedes or on the empty tail when the section goes last — never at the bottom of the sidebar, and never off the end of a long workspace list;
- the order is persisted (`order`) and re-checked on the repair timer, so neither a reorder nor a shell rebuild can leave the column in a state the preference does not describe.

Each plugin section owns **its own container** for exactly this reason: one container could not put the shipped region between 最近会话 and 活跃会话, or 置顶对话 ahead of both. The plugin moves only its own containers — React keeps owning the region.

The column's layout is part of that state too. The region stops growing (`flex: 0 1 auto`) and an empty tail element takes the free space the footer's `margin-top: auto` used to take, so the sections stay together near the top of the sidebar instead of being pushed to the bottom of it. Every section then carries the same 8px gap, folded or not — a folded 工作区 drops the 4px margin that used to separate its header from its list, for the same reason. No `title` tooltips are used anywhere, because a native one renders as a box the sidebar's own tooltips never have.

## Install

The plugin is a profile bundle. It is already installed in the `desktop` profile; to install it elsewhere (or reinstall):

```sh
dsh plugin install link:<path-to-this-folder>
```

or by hand — add the dependency and the bundle row:

```jsonc
// <DSH_HOME>/profiles/<profile>/package.json
{
  "dependencies": { "@zimzaza4/dsh-recent-sessions": "link:<本仓库路径>" },
  "dsh": { "profile": { "bundles": [ /* …, */ "@zimzaza4/dsh-recent-sessions" ] } }
}
```

then `pnpm install` in that profile directory. Disable or uninstall the bundle in **设置 → 插件** to remove the block (the Host half is inert; disabling the bundle is what removes it).

## Why the block is injected rather than seated

The shipped sidebar (`dsh-client-ui-sidebar`, `SidebarRoot`) renders the brand row, New Session, the panel list and the workspace region itself. The only holes are:

| hole | kind | why it cannot host this block |
|---|---|---|
| `sidebar.brand.mark` / `sidebar.brand.name` | single | claiming one replaces the mark or the wordmark inside the brand button |
| `sidebar.workspaces` | single | filled by the workspace browser; claiming it would replace the whole region |
| `sidebar.panellist` | list | rows are panel navigation (插件) |
| `sidebar.footer.action` | list | additive, and inside the footer rather than beside the region |

The shipped workspace region does expose a few child slots (`sidebar.workspaces.directoryFlow`, `sidebar.session.row.leading`, …), but none of them sits between the region and the footer, which is where this block belongs. So the plugin composes two mechanisms:

1. It rides **`sidebar.footer.action`** — an additive, always-mounted list seat — with a component that renders `null` there. That is the only way to get a mounting point that receives the framework's standard hooks (`useSessions`, `useWorkspaces`, `useSessionStatus`) and the owner's `wide` flag without replacing shipped chrome.
2. It renders the visible block through a **React portal** into its own container, inserted as the sibling immediately after the workspace region's wrapper (found structurally: the `data-slot="sidebar.workspaces"` node and its parent, never through hashed CSS-module class names).

The container is a foreign node in a React-owned child list. React only reorders the nodes it created, so the placement survives re-renders; the seat additionally re-checks the anchor on a slow timer and re-inserts the container in the same gap if an ancestor is ever rebuilt, and hides the block while the region is not (yet) there. Nothing about the footer's own layout changes: the portal contributes no element to the footer seat.

## Data and services

| input | source |
|---|---|
| session list, titles, ages, running state | `useSessions` (ui-session standard hook) |
| subagent activity (`projectionsBySession[].values.subagentCatalog`) | `useSessions` (same snapshot the shipped navigation counts from) |
| archive set, workspace membership + titles | `useWorkspaces` → `WorkspaceSnapshot` (`archivedSessionIds`, `items[].sessionIds/title`) |
| pending interaction / unopened completion | `useSessionStatus` |
| `wide` (rail vs expanded) | `sidebar.footer.action` owner props |
| open a session | `ctx.get('uiWorkspace').openSession(sessionId)`, resolved at click time |
| the shipped workspace region, its header, label and list | DOM anchors: the `sidebar.workspaces` slot, its parent, its first child and that child's sibling |
| copy | own locale namespace `recentSessions` (zh + en), declared as the registration's `locale` |

The only Cordis injections are `slots` (the seat) and `locale` (required by a registration that declares a copy namespace).

## Bounds

`--drs-visible-rows` (`5` by default) sizes the recent scroll window and `--drs-active-rows` (`3` by default) the active one; `limit` decides how many sessions the recent list holds. A window's height is `rows × 34px − 2px` (32px rows + 2px gaps), and `scrollbar-gutter: stable` keeps the rows from shifting when the bar appears. `MAX_LIMIT` (50) and the visible-row bounds (2–12) cap hand-set values so the block cannot swallow the sidebar; the active list is never capped, because hiding a session that wants the user is worse than scrolling.

## Preferences and the debug handle

Preferences live in `localStorage` under `dsh-recent-sessions` (`{ limit, visible, collapsed, activeVisible, activeCollapsed, pinnedVisible, pinnedCollapsed, workspacesCollapsed, lingerSeconds, hidden, order }`), so they survive a reload. In the page console:

```js
__DSH_RECENT_SESSIONS__.limit(20)              // hold up to 20 sessions (1..50), persisted
__DSH_RECENT_SESSIONS__.view(8)                // recent rows before scrolling (2..12), persisted
__DSH_RECENT_SESSIONS__.collapse(true)         // fold the 最近会话 section
__DSH_RECENT_SESSIONS__.activeView(4)          // active rows before scrolling (2..12), persisted
__DSH_RECENT_SESSIONS__.collapseActive(true)   // fold the 活跃会话 section
__DSH_RECENT_SESSIONS__.pinnedView(6)          // pinned rows before scrolling (2..12), persisted
__DSH_RECENT_SESSIONS__.collapsePinned(true)   // fold the 置顶对话 section
__DSH_RECENT_SESSIONS__.collapseWorkspaces(true)  // fold the shipped 工作区 region
__DSH_RECENT_SESSIONS__.linger(60)             // keep a finished row in 活跃会话 for 60s (0..600)
__DSH_RECENT_SESSIONS__.show('recent', false)  // hide a section entirely; the same as its Settings switch
__DSH_RECENT_SESSIONS__.order(['pinned', 'active', 'recent', 'workspaces'])  // any permutation, persisted
__DSH_RECENT_SESSIONS__.prefs()                // every value above
__DSH_RECENT_SESSIONS__.container()            // the 最近会话 container element
__DSH_RECENT_SESSIONS__.containers()           // { recent, active }
__DSH_RECENT_SESSIONS__.sections()             // the three sections in the order they sit in
__DSH_RECENT_SESSIONS__.workspaces()           // the shipped region's { root, header, label, list, fold }
```

## Verification

`node test/anchor.test.mjs` reproduces the shipped sidebar DOM with jsdom, mounts the plugin against the client's own React runtime, and asserts:

- the sections land under the workspace region's wrapper, each in its own container with the tail spacer before the footer (the column order is `logoRow, newSession, panelList, regionArea, block:recent, block:active, spacer, footArea`), with the footer seat left empty and the region's box tamed so the sections hug the top;
- ordering, filtering (archived / subagent / blank), the default held row count, relative-time labels in both locales, the current-session mark, and all three dot states;
- every row names its Workspace (`ToolDev` for accounted sessions, `未分组` / `Ungrouped` otherwise) with the full name in the cell's tooltip;
- the active section's membership and order: waiting for an answer → waiting for approval → unread completion → running → subagent-running, newest first inside a rank, with idle sessions and a non-surfaced interaction kind kept out;
- the bounded windows: each container carries its own `--drs-visible-rows` / `--drs-active-rows` from the matching preference, and more rows are held than are visible, so each region scrolls;
- clicking a row calls `openSession` with that id, from either section;
- folding hides one section's rows while keeping its header (and its count) and leaving the other section open — clicking the label folds it just as clicking the header does — the rail hides the whole block, and a removed container is re-injected in the same gap;
- the shipped 工作区 region: the chevron is injected as the header's **last** child, the label and the chevron fold it while the header's own search/add buttons do not, a folded header drops the margin it used to need, the state is persisted both ways, a React rebuild of the region is repaired on the next timer pass, the rail drops the chevron and shows the list again, and unmounting gives the shipped chrome back;
- the row behaviours the shipped workspace rows have: the hover marquee (`scrollLeft` at 0.03 px/ms with `data-scrolled` / `data-clipped` fade masks, the ellipsis dropped while scrolled — Chromium otherwise replaces the whole line with a bare `…` at the far edge — and a clean return on leave), the hover card's content (full title, ago-wrapped time, and a state line that is present even while idle), and double-click rename (the dialog's title and seeded field, its portal to the body, an emptied title sent nowhere, a rejection keeping the dialog open, and cancel or Escape closing it without a request);
- the order preference and the drag: every permutation places the sections where it says, a foreign or duplicated order falls back to the default, dragging a header to a boundary draws the line where the section will land (and on the tail when it goes last), a drop commits that order, a drag that ends without a drop changes nothing and takes the line away, and unmounting leaves none of it behind.

The scenario runs twice — once with a `ui-primitives` stand-in (the production path for `relativeTime` / `StateDot`) and once with that module missing, which exercises the plugin's own fallbacks. The anchor timer is stubbed rather than scheduled, so the repair pass is driven on demand instead of waited for.

React and jsdom are borrowed from a neighbouring install, because this plugin ships no dependencies of its own: the test searches a few known locations and `DRS_TEST_NODE_MODULES` overrides them.

## Files

| file | role |
|---|---|
| `index.js` | Host half: a side-effect-free Cordis plugin so the bundle has an installable row |
| `client.js` | The whole feature: seat registration, container placement under the workspace region, list, copy, styles, and the workspace fold |
| `cordis.patch.yml` | Bundle patch inserting the Host row |
| `test/anchor.test.mjs` | Placement + behavior verification (jsdom + the client's React) |
