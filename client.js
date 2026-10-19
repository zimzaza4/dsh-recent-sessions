/**
 * Browser half of @zimzaza4/dsh-recent-sessions.
 *
 * A "最近会话" (recent sessions) block in the Web sidebar: the sessions the user
 * most recently worked in, drawn in the workspace list's own style, placed in
 * the gap between the brand row and the New Session button.
 *
 * ## Why the block is injected instead of seated
 *
 * The shipped sidebar (`ui-sidebar`'s `SidebarRoot`) renders the brand row and
 * New Session itself, and the only holes near them are `sidebar.brand.mark` /
 * `sidebar.brand.name` (single-occupancy — claiming one would replace the lettermark)
 * and `sidebar.workspaces` (single, already filled by the workspace browser,
 * and below New Session rather than above it). There is no seat for a new block
 * between the brand row and New Session, so this plugin:
 *
 *   1. rides `sidebar.footer.action` — an additive, always-mounted list seat —
 *      with a component that renders `null` there, which is the only way to get
 *      a mounting point with the framework's standard session hooks
 *      (`useSessions`, `useWorkspaces`, `useSessionStatus`) without replacing
 *      shipped chrome; and
 *   2. renders the visible block through a React portal into its own container,
 *      inserted into the sidebar column as the sibling right after the logo row.
 *
 * The container is a foreign node in a React-owned list. React only reorders the
 * nodes it created, so the placement survives re-renders; the seat also re-checks
 * the anchor on a slow timer and re-inserts if an ancestor was ever replaced.
 *
 * ## The active block
 *
 * A second section sits directly under the recent list, in the same row style:
 * the sessions that are not idle — exactly the rows the shipped sidebar
 * decorates with a state dot. It is ordered by what the user has to do about
 * them, most urgent first, newest first inside a rank:
 *
 *   1. `warning` — a pending interaction (the agent is waiting for an approval,
 *      a plan review, or an answer); the shipped yellow dot.
 *   2. `done` — the turn finished while the user was elsewhere and they have not
 *      opened the session since; the shipped green dot.
 *   3. `ongoing` — the session, or one of its subagents, is working; the shipped
 *      blue dot.
 *
 * A session that is neither working, nor waiting on the user, nor freshly
 * finished is idle, and idle sessions stay out of the active block entirely.
 *
 * ## Folding the shipped 工作区 section
 *
 * The workspace browser renders its own header (label, search, view options,
 * add) and never lets the region fold. This plugin gives it a fold: a chevron
 * button is appended at the right end of that header — the same corner this
 * plugin's own 最近会话 / 活跃会话 chevrons sit in — a real button with a real
 * `aria-expanded`, drawn at the shipped icons' own size and hover surface, and
 * the whole label is a second hit target, so nobody has to hit a 12px glyph.
 * While folded, everything the header draws under itself is hidden; the header
 * stays, because it is the way back.
 *
 * Two properties make that safe: the region is found structurally (the
 * `sidebar.workspaces` slot's parent, the browser root's header, and the sibling
 * after it), never by hashed CSS-module class names; and the fold is re-applied
 * on the same slow timer as the containers, because the browser rebuilds its
 * header and list whenever the workspace snapshot, the search or the view options
 * change. In the collapsed rail the header has no label to fold from, so the
 * chevron is removed and the list is shown again.
 *
 * ## The section order, and dragging a section
 *
 * The three sections — the shipped 工作区 region and this plugin's 最近会话 and
 * 活跃会话 — are ordered by a stored preference, and every header is a drag
 * handle: press one, drag, and the section lands where the insertion line is.
 * The line is a real, zero-height element in the column's flow, bleeds to both
 * sidebar edges, and sits either immediately before the section it precedes or
 * on the empty tail when the section goes last — so it is straight, full width,
 * and always where the section will actually land.
 *
 * Two sections own one container each for exactly this reason: the preference can
 * put the shipped region *between* 最近会话 and 活跃会话, which a single container
 * cannot express. The region itself is never moved by React — the plugin owns the
 * two containers and moves only those — and the placement is re-checked on the
 * repair timer, so neither a reorder nor a shell rebuild can leave the column in
 * a state the preference does not describe.
 *
 * The column's own layout is part of that state: the region stops growing
 * (`flex: 0 1 auto`), an empty tail element takes the free space the footer's
 * `margin-top: auto` used to take, and every section carries the same 8px gap, so
 * the three sections stay together near the top of the sidebar instead of being
 * pushed to its bottom.
 *
 * ## Data
 *
 * Rows come from the same framework hooks the workspace browser reads, so the
 * two lists cannot disagree about a session's title, age, running state, or
 * archive state. Each row also names the Workspace the session belongs to
 * (resolved from the same membership order the browser groups by), or the
 * ungrouped label. Clicking a row opens that session through the shipped
 * `uiWorkspace` service (`openSession`), which is the same path a workspace-row
 * click takes.
 *
 * ## Bounds
 *
 * Each list is a fixed-height scroll region: `--drs-visible-rows` (5 by default)
 * rows of 最近会话, `--drs-active-rows` (3) rows of 活跃会话 and `--drs-pinned-rows`
 * (4) rows of 置顶对话 are visible, and the rest scroll inside them, so the block
 * can never take the sidebar's browsing region away from the workspace list. The
 * regions use the app's own scrollbar skin, and therefore the sidebar's
 * quiet-bars rule too.
 *
 * Preferences (row count, visible rows, folded state — one set per section) live
 * in `localStorage` under `dsh-recent-sessions`; `window.__DSH_RECENT_SESSIONS__`
 * exposes them for hand tuning without a rebuild.
 */
window.__ModuleLoader__.load({
	id: '@zimzaza4/dsh-recent-sessions',
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;

		const React = require('react');
		const ReactDOM = require('react-dom');

		/**
		 * The shared primitives are a platform module; they are loaded
		 * defensively because this plugin must not take the sidebar down if a
		 * future build stops publishing them — both uses below degrade to a
		 * local equivalent.
		 */
		let primitives;
		try {
			primitives = require('@deepseek-ai/dsh-client-ui-primitives');
		} catch (error) {
			primitives = undefined;
		}

		const h = React.createElement;
		const PLUGIN_ID = '@zimzaza4/dsh-recent-sessions';

		/** Additive sidebar seat this plugin rides; its occupant renders null. */
		const SEAT = 'sidebar.footer.action';

		/** The locale namespace this plugin owns and declares on its registration. */
		const NS = 'recentSessions';

		/** Marks this plugin's injected container inside the sidebar column. */
		const CONTAINER_ATTR = 'data-dsh-recent-sessions';

		/** Marks the shipped 工作区 header while this plugin makes it foldable; the value is the state. */
		const FOLD_ATTR = 'data-drs-workspaces-fold';

		/** Marks the insertion line this plugin moves to the boundary a drag is aiming at. */
		const LINE_ATTR = 'data-drs-drop-line';

		/** Marks the empty tail this plugin keeps between the last section and the footer. */
		const SPACER_ATTR = 'data-drs-sidebar-spacer';

		/** The four sidebar sections, in their default order. */
		const SECTION_IDS = ['workspaces', 'pinned', 'recent', 'active'];

		/** The sections this plugin draws itself; the shipped region is the fourth. */
		const LIST_IDS = SECTION_IDS.filter(id => id !== 'workspaces');

		/**
		 * One entry per list this plugin draws: the locale key for its title, the
		 * copy prefix that selects its fold wording, the preference that folds it, the
		 * custom property that caps its visible rows, and its list class. Kept as a
		 * table so the seat renders three identical blocks without three copies of
		 * the same JSX.
		 */
		const LISTS = [
			{
				id: 'pinned',
				title: 'pin.title',
				prefix: 'pin.',
				collapsedKey: 'pinnedCollapsed',
				rowsVar: '--drs-pinned-rows',
				listClass: 'drs-list drs-list-pinned',
			},
			{
				id: 'recent',
				title: 'title',
				prefix: '',
				collapsedKey: 'collapsed',
				rowsVar: '--drs-visible-rows',
				listClass: 'drs-list',
			},
			{
				id: 'active',
				title: 'active.title',
				prefix: 'active.',
				collapsedKey: 'activeCollapsed',
				rowsVar: '--drs-active-rows',
				listClass: 'drs-list drs-list-active',
			},
		];

		/** Marks the shipped 工作区 label, the fold button's larger sibling hit target. */
		const LABEL_ATTR = 'data-drs-workspaces-label';

		/** The fold affordance this plugin inserts into that header. */
		const FOLD_CLASS = 'drs-ws-fold';

		/** `localStorage` key holding every preference this plugin owns. */
		const PREFS_KEY = 'dsh-recent-sessions';

		/** Window event announcing a preference write; the mounted block listens. */
		const PREFS_EVENT = 'dsh-recent-sessions-change';

		/**
		 * How many sessions the list holds. The block shows only
		 * {@link DEFAULT_VISIBLE} rows at a time and scrolls for the rest, so the
		 * list never takes the sidebar's browsing region away.
		 */
		const DEFAULT_LIMIT = 12;

		/** Hard ceiling for a hand-set row count. */
		const MAX_LIMIT = 50;

		/** Rows the recent list shows before it scrolls. */
		const DEFAULT_VISIBLE = 5;

		/** Rows the active-session list shows before it scrolls. */
		const DEFAULT_ACTIVE_VISIBLE = 3;

		/** Rows the pinned list shows before it scrolls. */
		const DEFAULT_PINNED_VISIBLE = 4;

		/**
		 * How long a session that just stopped qualifying stays in 活跃会话, so a
		 * completion the user is reading does not blink away the moment it is read.
		 * 0 turns the linger off.
		 */
		const DEFAULT_LINGER_SECONDS = 30;

		/** Bounds for a hand-set linger. */
		const MAX_LINGER_SECONDS = 600;

		/** Bounds for a hand-set visible row count. */
		const MIN_VISIBLE = 2;
		const MAX_VISIBLE = 12;

		/** Row pitch (32px row + the 2px gap) the window height is computed from. */
		const ROW_PITCH_PX = 34;

		/** How often the relative-time labels are recomputed while visible. */
		const CLOCK_MS = 30_000;

		/** How often the injected container re-checks that it is still in place. */
		const ANCHOR_MS = 1_500;

		/** Bundle marker; surfaced on the debug handle and in the block's tooltip. */
		const BUILD = 'recent-sessions/0.7.0';

		/** Simplified Chinese copy (the key-set source of truth). */
		const ZH = {
			'title': '最近会话',
			'collapse': '收起最近会话',
			'expand': '展开最近会话',
			'active.title': '活跃会话',
			'active.collapse': '收起活跃会话',
			'active.expand': '展开活跃会话',
			'pin.title': '置顶对话',
			'pin.collapse': '收起置顶对话',
			'pin.expand': '展开置顶对话',
			'settings.label': '侧栏会话分区',
			'settings.hint': '这些分区排在侧栏「工作区」下方；关掉哪一个，它就整段从侧栏移除，随时可以再打开。',
			'settings.workspaces': '工作区',
			'settings.show': '显示',
			'settings.linger': '活跃会话里已完成的行再保留',
			'settings.seconds': '秒',
			'running': '进行中',
			'running.subagents.one': '{n} 个子智能体运行中',
			'running.subagents.other': '{n} 个子智能体运行中',
			'waiting': '等待你处理',
			'waiting.approval': '等待审批',
			'waiting.planReview': '计划待审',
			'waiting.question': '等待回答',
			'done': '已完成',
			'idle': '空闲',
			'rename': '重命名',
			'rename.title': '重命名会话',
			'rename.field': '会话名称',
			'cancel': '取消',
			'close': '关闭',
			'workspaces.collapse': '收起工作区列表',
			'workspaces.expand': '展开工作区列表',
			'workspace.none': '未分组',
			'time.now': '刚刚',
			'time.ago': '{t}前',
			'time.minutes': '{n}分钟',
			'time.hours': '{n}小时',
			'time.days': '{n}天',
			'time.months': '{n}个月',
			'time.years': '{n}年',
		};

		/** English copy; complete against {@link ZH}. */
		const EN = {
			'title': 'Recent sessions',
			'collapse': 'Collapse recent sessions',
			'expand': 'Expand recent sessions',
			'active.title': 'Active sessions',
			'active.collapse': 'Collapse active sessions',
			'active.expand': 'Expand active sessions',
			'pin.title': 'Pinned',
			'pin.collapse': 'Collapse pinned sessions',
			'pin.expand': 'Expand pinned sessions',
			'settings.label': 'Sidebar sections',
			'settings.hint': 'These sections sit under 工作区 in the sidebar. Turning one off removes it from the sidebar; turn it back on any time.',
			'settings.workspaces': 'Workspaces',
			'settings.show': 'Show',
			'settings.linger': 'Keep finished rows in Active for another',
			'settings.seconds': 's',
			'running': 'Running',
			'running.subagents.one': '{n} subagent running',
			'running.subagents.other': '{n} subagents running',
			'waiting': 'Waiting for you',
			'waiting.approval': 'Waiting for approval',
			'waiting.planReview': 'Plan awaiting review',
			'waiting.question': 'Waiting for answer',
			'done': 'Completed',
			'idle': 'Idle',
			'rename': 'Rename',
			'rename.title': 'Rename session',
			'rename.field': 'Session name',
			'cancel': 'Cancel',
			'close': 'Close',
			'workspaces.collapse': 'Collapse the workspace list',
			'workspaces.expand': 'Expand the workspace list',
			'workspace.none': 'Ungrouped',
			'time.now': 'now',
			'time.ago': '{t} ago',
			'time.minutes': '{n}min',
			'time.hours': '{n}h',
			'time.days': '{n}d',
			'time.months': '{n}mo',
			'time.years': '{n}y',
		};

		/**
		 * Styles for the injected block. Geometry and tokens mirror the
		 * workspace browser's rows (`ui-workspace` Rows.module.css): 8px row
		 * radius, 32px session rows, an 16px leading status cell, 14px titles,
		 * 12px tertiary timestamps, and the same hover/selected surface. Classes
		 * are prefixed `drs-` so they cannot collide with a shipped style.
		 */
		const CSS = [
			// The block mirrors the shipped workspace region's own box: it bleeds
			// out to the sidebar edges exactly as `.regionArea` does, so its header
			// sits on the same left and right line as the 工作区 header.
			// Our own box mirrors the shipped region's: the same edge inset the
			// shipped `.root` declares, so the two headers end on the same line. The
			// vertical rhythm lives in the headers and in the region's own margins
			// (see {@link placeContainers}), which keeps every gap at 8px.
			'.drs{--dsh-session-list-edge-inset:var(--dsh-sidebar-inline-padding);margin:2px calc(-1 * var(--dsh-sidebar-inline-padding)) 0 -4px;padding-left:4px;padding-right:var(--dsh-session-list-edge-inset);display:flex;flex-direction:column;box-sizing:border-box}',
			// Header geometry copied from the shipped `.sectionHeader`: 36px row,
			// 4px gaps, 4px left padding, the same 4px out-dent on the right. The
			// label grows to fill the row (there is no search slot here), which is
			// what keeps it hard against the left edge under `flex-end`.
			'.drs-head{flex:none;display:flex;align-items:center;justify-content:flex-end;gap:4px;height:36px;margin:2px -4px 4px 0;padding:0 0 0 4px;box-sizing:border-box;border:none;border-radius:var(--dsw-radius-md,8px);background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;text-align:left;cursor:pointer}',
			'.drs-head:focus-visible{outline:2px solid var(--dsw-alias-label-primary);outline-offset:-2px}',
			'.drs-label{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;line-height:20px}',
			// The chevron is the shipped icon button: 28px box, sm radius, secondary
			// ink — the same box the 工作区 row puts its search and add icons in, and
			// the only thing in the row that lights up on hover, exactly like those.
			'.drs-chevron{flex:none;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:var(--dsw-radius-sm,6px);color:var(--dsw-alias-label-secondary)}',
			'.drs-chevron:hover{background:var(--dsw-alias-interactive-bg-hover)}',
			// The drag insertion line: one element this plugin moves to the boundary a
			// drag is aiming at. It is a real (zero-height) item in the column's flex
			// flow, bleeding to both sidebar edges, so it is straight, full width and
			// never clipped — a shadow on a rounded box is none of those.
			'[' + LINE_ATTR + ']{flex:none;height:0;border-top:2px solid var(--dsw-alias-state-business-primary);margin:-1px calc(-1 * var(--dsh-sidebar-inline-padding,12px));pointer-events:none}',
			// The tail the sections end against: it takes the free space the footer
			// used to take, so the end-of-list insertion line can be drawn right
			// under the last section instead of at the bottom of the sidebar.
			'[' + SPACER_ATTR + ']{flex:1 1 auto;min-height:0}',
			'.drs-arrow{transition:transform 150ms ease-in-out}',
			'.drs-arrow-open{transform:rotate(90deg)}',
			'.drs-list{display:flex;flex-direction:column;gap:2px;margin-right:calc(-1 * var(--dsh-session-list-edge-inset));max-height:calc(var(--drs-visible-rows,'
				+ DEFAULT_VISIBLE + ') * ' + ROW_PITCH_PX + 'px - 2px);overflow-y:auto;overflow-x:hidden;scrollbar-gutter:stable}',
			'.drs-row{display:flex;align-items:center;width:100%;height:32px;padding:0 8px;box-sizing:border-box;flex:none;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;text-align:left;cursor:pointer}',
			// The row stops short of the list's own scrollbar, as the shipped rows do: the
			// gutter keeps its air, and the hover card therefore opens outside it.
			'.drs-list{padding-right:6px}',
			'.drs-row:hover{background:var(--dsw-alias-interactive-bg-hover)}',
			'.drs-row:focus-visible{outline:2px solid var(--dsw-alias-label-primary);outline-offset:-2px}',
			'.drs-row-current{background:var(--dsw-alias-interactive-bg-hover)}',
			// The status cell paints the primitive's own geometry without it: a 14px
			// spinner for live work, a 10px box with a 6px core for the solid states.
			'.drs-spin{flex:none;width:14px;height:14px;border:2px solid var(--dsw-alias-state-business-primary);border-top-color:transparent;border-radius:50%;animation:drs-spin .9s linear infinite}',
			'@keyframes drs-spin{to{transform:rotate(360deg)}}',
			'.drs-dot{flex:none;display:inline-flex;align-items:center;justify-content:center;width:10px;height:10px}',
			'.drs-dot-core{width:6px;height:6px;border-radius:50%;background:currentColor}',
			'.drs-dot[data-state="warning"]{color:var(--dsw-alias-state-warn-primary)}',
			'.drs-dot[data-state="done"]{color:var(--dsw-alias-state-success-primary)}',
			'.drs-dot[data-state="idle"]{color:var(--dsw-alias-state-idle-primary)}',
			// The hover card, in the shipped card's own type and ink: the surface under
			// it is the app's tooltip, which is dark in every theme.
			'.drs-hover{display:flex;flex-direction:column;gap:8px}',
			'.drs-hover-title{color:#fff;overflow-wrap:break-word;font-size:14px;line-height:20px}',
			'.drs-hover-time{color:#cfd3d6;font-size:12px;line-height:16px}',
			'.drs-hover-status{color:#adb2b8;display:flex;align-items:center;gap:8px;font-size:12px;line-height:20px}',
			'.drs-slot{flex:none;width:16px;height:20px;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary)}',
			'.drs-title{flex:1 1 0;min-width:0;margin:0 6px 0 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:20px}',
			// The shipped rows' marquee fades: the title clips its own text, and these
			// masks soften whichever edge still has text behind it.
			'.drs-title[data-scrolled]{mask-image:linear-gradient(90deg,transparent,#000 12px)}',
			'.drs-title[data-clipped]{mask-image:linear-gradient(270deg,transparent,#000 12px)}',
			'.drs-title[data-scrolled][data-clipped]{mask-image:linear-gradient(90deg,transparent,#000 12px calc(100% - 12px),transparent)}',
			// While the title is scrolled, the ellipsis has to go: Chromium keeps
			// reserving one glyph for it and, at the far edge, replaces the whole line
			// with a bare "…" — verified in a probe page. The fade masks above already
			// soften both edges, so clipping is the honest state here.
			'.drs-title[data-scrolled]{text-overflow:clip}',
			// Double-click rename lives in the dialog below; only its error line is a
			// list-side style, and the field there is `.drs-rename-dialog`.
			'.drs-rename-error{color:var(--dsw-alias-state-error-primary);margin-top:6px;font-size:12px;line-height:18px}',
			// The rename dialog: the app's modal surface, mask and field on our own markup,
			// because the shared Modal renders nothing from a plugin seat. Measured against
			// the shipped dialog: the same card fill, a ~70% black scrim with no blur, a
			// 380px card, and the dialog's own full-width field.
			'.drs-modal{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.7);animation:drs-fade-in .16s ease-out}',
			'@keyframes drs-fade-in{0%{opacity:0}to{opacity:1}}',
			'@media (prefers-reduced-motion:reduce){.drs-modal{animation:none}}',
			// Padding and gaps are the shipped dialog's, measured from both screenshots:
			// its frame is 24px on every side while its rows sit close together (6px),
			// which is what keeps the two cards the same 160px tall.
			'.drs-modal-card{box-sizing:border-box;display:flex;flex-direction:column;gap:6px;width:min(380px,100vw - 48px);padding:24px;border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-alias-bg-layer-2,var(--dsw-specific-menu));box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-primary)}',
			'.drs-modal-head{display:flex;align-items:center;justify-content:space-between;gap:16px}',
			'.drs-modal-title{margin:0;font-size:16px;font-weight:500;line-height:24px}',
			'.drs-modal-close{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:none;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}',
			'.drs-modal-close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
			'.drs-modal-footer{display:flex;justify-content:flex-end;gap:8px}',
			'.drs-btn{height:32px;padding:0 16px;border:.5px solid transparent;border-radius:var(--dsw-radius-md,8px);font:inherit;font-size:14px;line-height:20px;cursor:pointer}',
			'.drs-btn-outline{border-color:var(--dsw-alias-border-l4);background:transparent;color:var(--dsw-alias-label-primary)}',
			'.drs-btn-outline:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
			'.drs-btn-primary{border-color:transparent;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}',
			'.drs-btn:disabled{opacity:.4;cursor:default}',
			// The settings page this plugin contributes: the app's own type and tokens,
			// one row per section plus the linger.
			'.drs-settings{display:flex;flex-direction:column;gap:2px}',
			'.drs-settings-hint{margin:0 0 10px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
			'.drs-settings-row{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:42px;padding:6px 0}',
			'.drs-settings-label{color:var(--dsw-alias-label-primary);font-size:14px;line-height:20px}',
			'.drs-settings-value{display:inline-flex;align-items:center;gap:8px}',
			'.drs-settings-number{box-sizing:border-box;width:76px;height:32px;padding:0 8px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md,8px);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;line-height:20px;text-align:center;outline:none}',
			'.drs-settings-number:focus{border-color:var(--dsw-alias-state-business-primary)}',
			'.drs-settings-unit{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
			// The dialog field is the shipped rename dialog's own: full width, transparent,
			// a hairline border and a 44px row — not the row-sized field of the list.
			'.drs-rename-dialog{box-sizing:border-box;width:100%;height:44px;padding:7px 14px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-lg,12px);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;font-weight:400;line-height:22px;outline:none}',
			'.drs-rename-dialog:focus{border-color:var(--dsw-alias-state-business-primary)}',
			'.drs-row-renaming{cursor:default}',
			'.drs-workspace{flex:none;max-width:40%;margin-right:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:20px;color:var(--dsw-alias-label-tertiary)}',
			'.drs-time{flex:none;font-size:12px;line-height:20px;color:var(--dsw-alias-label-tertiary)}',
			'.drs-group{display:flex;flex-direction:column;min-width:0}',
			'.drs-group+.drs-group{margin-top:6px}',
			'.drs-count{flex:none;margin-right:4px;font-size:12px;line-height:20px;color:var(--dsw-alias-label-tertiary)}',
			'.drs-list-active{max-height:calc(var(--drs-active-rows,'
				+ DEFAULT_ACTIVE_VISIBLE + ') * ' + ROW_PITCH_PX + 'px - 2px)}',
			'.drs-list-pinned{max-height:calc(var(--drs-pinned-rows,'
				+ DEFAULT_PINNED_VISIBLE + ') * ' + ROW_PITCH_PX + 'px - 2px)}',
			'.drs-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}',
			'.' + FOLD_CLASS + '{flex:none;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:none;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}',
			'.' + FOLD_CLASS + ':hover{background:var(--dsw-alias-interactive-bg-hover)}',
			'.' + FOLD_CLASS + ':focus-visible{outline:2px solid var(--dsw-alias-label-primary);outline-offset:-2px}',
			'.' + FOLD_CLASS + ' svg{transition:transform 150ms ease-in-out;transform:rotate(90deg)}',
			'[' + FOLD_ATTR + '="collapsed"] .' + FOLD_CLASS + ' svg{transform:none}',
			'[' + LABEL_ATTR + ']{cursor:pointer}',
			// The shipped header folds on any click that is not one of its own
			// controls, so the whole row advertises the pointer — as this plugin's
			// own headers do. The search field and the icon buttons set their own
			// cursors and keep them.
			'[' + FOLD_ATTR + ']{cursor:pointer}',
		].join('');

		/** Install the block's stylesheet once, keyed by plugin id. */
		function installStyles() {
			if (typeof document === 'undefined') return;
			const key = PLUGIN_ID + '/recent-sessions.css';
			let tag = document.querySelector('style[data-plugin-css=' + JSON.stringify(key) + ']');
			if (tag === null) {
				tag = document.createElement('style');
				tag.dataset.plugin = PLUGIN_ID;
				tag.dataset.pluginCss = key;
				document.head.appendChild(tag);
			}
			if (tag.textContent !== CSS) tag.textContent = CSS;
		}

		/**
		 * Resolve a client service by name, tolerating a missing publication.
		 * @param ctx - client plugin context.
		 * @param name - service key.
		 * @returns the service, or `undefined`.
		 */
		function resolveService(ctx, name) {
			let value;
			try {
				value = ctx.get(name);
			} catch (error) {
				value = undefined;
			}
			if (value === undefined || value === null) {
				try {
					value = ctx.reflect?.get?.(name);
				} catch (error) {
					value = undefined;
				}
			}
			return value === null ? undefined : value;
		}

		/** Substitute `{name}` placeholders in one dictionary template. */
		function substitute(template, params) {
			if (params === undefined) return template;
			return template.replace(/\{(\w+)\}/g, (match, name) => (
				Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
			));
		}

		/**
		 * Copy for a seat that carries no locale namespace (or none is bound
		 * yet): the browser's language picks the dictionary.
		 */
		function fallbackT(key, params) {
			const language = typeof navigator === 'undefined' ? 'en' : String(navigator.language ?? 'en');
			const dictionary = language.toLowerCase().startsWith('zh') ? ZH : EN;
			const template = dictionary[key] ?? EN[key];
			return template === undefined ? key : substitute(template, params);
		}

		/** Shared bucketing when ui-primitives is unavailable (same boundaries). */
		function localRelativeTime(at, now) {
			const MIN = 60_000;
			const HOUR = 3_600_000;
			const DAY = 86_400_000;
			const diff = Math.max(0, now - at);
			if (diff < MIN) return { unit: 'now', n: 0 };
			if (diff < HOUR) return { unit: 'minutes', n: Math.floor(diff / MIN) };
			if (diff < DAY) return { unit: 'hours', n: Math.floor(diff / HOUR) };
			if (diff < 30 * DAY) return { unit: 'days', n: Math.floor(diff / DAY) };
			if (diff < 365 * DAY) return { unit: 'months', n: Math.floor(diff / (30 * DAY)) };
			return { unit: 'years', n: Math.floor(diff / (365 * DAY)) };
		}

		/**
		 * Whether a module export can be rendered: a plain function, or a `memo` /
		 * `forwardRef` / `lazy` component — which is an object carrying React's own
		 * `$$typeof` tag. `Button` is one of those, so a function-only check would
		 * silently drop it.
		 */
		function isComponent(value) {
			return typeof value === 'function'
				|| (value !== null && typeof value === 'object' && typeof value.$$typeof === 'symbol');
		}

		/**
		 * Resolve one shared primitive however this build happens to publish it: as
		 * the export itself, as a `default` on the export, or as a `default` on the
		 * module. Nothing is ever assumed about its shape beyond being renderable, so
		 * a missing or reshaped export degrades to this plugin's own fallback instead
		 * of breaking a row.
		 * @param names - candidate export names, in order of preference.
		 * @returns the component, or `null` when none of them is one.
		 */
		function primitive() {
			for (const bag of [primitives, primitives === undefined || primitives === null ? undefined : primitives.default]) {
				if (bag === undefined || bag === null) continue;
				for (const name of arguments) {
					const found = bag[name];
					if (isComponent(found)) return found;
					if (found !== null && typeof found === 'object' && isComponent(found.default)) return found.default;
				}
			}
			return null;
		}

		/** Resolve a shared *function* (never a component) with the same fallbacks. */
		function primitiveFunction(names) {
			for (const bag of [primitives, primitives === undefined || primitives === null ? undefined : primitives.default]) {
				if (bag === undefined || bag === null) continue;
				if (typeof bag[names] === 'function') return bag[names];
			}
			return null;
		}

		const relativeTime = primitiveFunction('relativeTime') ?? localRelativeTime;
		const StateDot = primitive('StateDot');
		const HoverCard = primitive('HoverCard');
		const Switch = primitive('Switch');

		/** Localized trailing timestamp, matching the workspace rows' vocabulary. */
		function timeLabel(updatedAt, now, t) {
			const bucket = relativeTime(updatedAt, now);
			return bucket.unit === 'now' ? t('time.now') : t('time.' + bucket.unit, { n: bucket.n });
		}

		/**
		 * The hover card's relative time: the shipped card wraps the distance in its
		 * own ago template, so "5分钟" reads "5分钟前" there and "just now" stays bare.
		 */
		function hoverTimeLabel(updatedAt, t) {
			const bucket = relativeTime(updatedAt, Date.now());
			return bucket.unit === 'now'
				? t('time.now')
				: t('time.ago', { t: t('time.' + bucket.unit, { n: bucket.n }) });
		}

		/**
		 * A row's hover card: the full title, how long ago it moved, and the state it
		 * is in — always a state line, `空闲` / `Idle` included, exactly as the shipped
		 * card ends on one. What it leaves out are the sections this plugin has no
		 * counterpart for (a Session's scheduled tasks, the archive note).
		 * @param facts - one row's facts.
		 * @param t - translator.
		 * @returns the card's body.
		 */
		function hoverCardContent(facts, t) {
			const state = facts.state ?? 'idle';
			return h('div', { className: 'drs-hover' }, [
				h('div', { className: 'drs-hover-title', key: 'title' }, facts.title),
				h('div', { className: 'drs-hover-time', key: 'time' }, hoverTimeLabel(facts.updatedAt, t)),
				h('div', { className: 'drs-hover-status', key: 'state' }, [
					React.cloneElement(statusDot(state), { key: 'dot' }),
					h('span', { key: 'label' }, dotLabel(state, facts, t)),
				]),
			]);
		}

		/** Clamp a stored or hand-set row limit. */
		function clampLimit(value) {
			if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) return DEFAULT_LIMIT;
			return Math.min(MAX_LIMIT, Math.floor(value));
		}

		/** Clamp a stored or hand-set visible row count for the recent list. */
		function clampVisible(value) {
			if (typeof value !== 'number' || !Number.isFinite(value) || value < MIN_VISIBLE) return DEFAULT_VISIBLE;
			return Math.min(MAX_VISIBLE, Math.floor(value));
		}

		/** Clamp a stored or hand-set visible row count for the active list. */
		function clampActiveVisible(value) {
			if (typeof value !== 'number' || !Number.isFinite(value) || value < MIN_VISIBLE) return DEFAULT_ACTIVE_VISIBLE;
			return Math.min(MAX_VISIBLE, Math.floor(value));
		}

		/** Clamp a stored or hand-set visible row count for the pinned list. */
		function clampPinnedVisible(value) {
			if (typeof value !== 'number' || !Number.isFinite(value) || value < MIN_VISIBLE) return DEFAULT_PINNED_VISIBLE;
			return Math.min(MAX_VISIBLE, Math.floor(value));
		}

		/** Clamp a stored or hand-set linger, in seconds; 0 keeps the old behaviour. */
		function clampLinger(value) {
			if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return DEFAULT_LINGER_SECONDS;
			return Math.min(MAX_LINGER_SECONDS, Math.floor(value));
		}

		/** Clamp the stored per-section visibility, one boolean per section id. */
		function clampHidden(value) {
			const hidden = {};
			for (const id of SECTION_IDS) hidden[id] = value !== undefined && value !== null && value[id] === true;
			return hidden;
		}

		/** The preference defaults, shared by the reader's failure branch and the debug handle. */
		const PREF_DEFAULTS = {
			limit: DEFAULT_LIMIT,
			visible: DEFAULT_VISIBLE,
			collapsed: false,
			activeVisible: DEFAULT_ACTIVE_VISIBLE,
			activeCollapsed: false,
			pinnedVisible: DEFAULT_PINNED_VISIBLE,
			pinnedCollapsed: false,
			workspacesCollapsed: false,
			lingerSeconds: DEFAULT_LINGER_SECONDS,
			hidden: clampHidden(undefined),
			order: [...SECTION_IDS],
		};

		/**
		 * Clamp a stored section order to a permutation of {@link SECTION_IDS}: a
		 * foreign, truncated or duplicated list falls back to the default order.
		 * @param value - the stored value.
		 * @returns a fresh, valid order.
		 */
		function clampOrder(value) {
			if (!Array.isArray(value) || value.length !== SECTION_IDS.length) return [...SECTION_IDS];
			const seen = new Set();
			for (const id of value) {
				if (!SECTION_IDS.includes(id) || seen.has(id)) return [...SECTION_IDS];
				seen.add(id);
			}
			return [...value];
		}

		/**
		 * Read `{ limit, visible, collapsed, activeVisible, activeCollapsed,
		 * pinnedVisible, pinnedCollapsed, workspacesCollapsed, order }`; a hostile or
		 * absent store yields defaults.
		 */
		function readPrefs() {
			try {
				const raw = window.localStorage.getItem(PREFS_KEY);
				const parsed = raw === null ? undefined : JSON.parse(raw);
				return {
					limit: clampLimit(parsed?.limit),
					visible: clampVisible(parsed?.visible),
					collapsed: parsed?.collapsed === true,
					activeVisible: clampActiveVisible(parsed?.activeVisible),
					activeCollapsed: parsed?.activeCollapsed === true,
					pinnedVisible: clampPinnedVisible(parsed?.pinnedVisible),
					pinnedCollapsed: parsed?.pinnedCollapsed === true,
					workspacesCollapsed: parsed?.workspacesCollapsed === true,
					lingerSeconds: clampLinger(parsed?.lingerSeconds),
					hidden: clampHidden(parsed?.hidden),
					order: clampOrder(parsed?.order),
				};
			} catch (error) {
				return { ...PREF_DEFAULTS };
			}
		}

		/**
		 * Merge one preference write, persist it, and tell the mounted block.
		 * A storage refusal (private mode) still applies for this session.
		 */
		function writePrefs(patch) {
			const next = { ...readPrefs(), ...patch };
			next.limit = clampLimit(next.limit);
			next.visible = clampVisible(next.visible);
			next.activeVisible = clampActiveVisible(next.activeVisible);
			next.pinnedVisible = clampPinnedVisible(next.pinnedVisible);
			next.lingerSeconds = clampLinger(next.lingerSeconds);
			next.hidden = clampHidden(next.hidden);
			next.order = clampOrder(next.order);
			try {
				window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
			} catch (error) {
				// Storage is unavailable; the in-memory write below still applies.
			}
			window.dispatchEvent(new Event(PREFS_EVENT));
			return next;
		}

		/**
		 * The sidebar column: the shell renders the `sidebar` slot into a
		 * `display: contents` wrapper whose first element child is the column
		 * (`SidebarRoot`'s `div.root`).
		 * @returns the column element, or `null` before the shell has mounted.
		 */
		function sidebarColumn() {
			if (typeof document === 'undefined') return null;
			const host = document.querySelector('[data-slot="sidebar"]');
			const column = host === null ? null : host.firstElementChild;
			return column instanceof HTMLElement ? column : null;
		}

		/**
		 * The sidebar's workspace region wrapper: the parent of the
		 * `sidebar.workspaces` slot. The block lives directly under it, so 工作区
		 * reads first and 最近会话 / 活跃会话 follow — the same order the sections
		 * are draggable into.
		 * @param column - the sidebar column element.
		 * @returns the region wrapper, or `null` until the shell drew it.
		 */
		function workspaceArea(column) {
			const slot = column.querySelector('[data-slot="sidebar.workspaces"]');
			const area = slot === null ? null : slot.parentElement;
			return area !== null && area.parentElement === column ? area : null;
		}

		/**
		 * This plugin's container for one section, keyed by section id. The two
		 * sections own one container each, because the order preference can put the
		 * shipped 工作区 region *between* them — a single container cannot express
		 * that.
		 * @param id - `recent` or `active`.
		 * @returns the container element, created (but not placed) on demand.
		 */
		function ensureContainer(id) {
			let container = document.querySelector('[' + CONTAINER_ATTR + '="' + id + '"]');
			if (container === null) {
				container = document.createElement('div');
				container.setAttribute(CONTAINER_ATTR, id);
			}
			return container;
		}

		/**
		 * The three sections as they currently sit in the column, top to bottom:
		 * `{ id, node }` for the shipped region and for each placed container. Only
		 * the section boxes matter here — they are square-cornered, so an inset
		 * shadow reads as a straight line across the whole block.
		 * @returns the sections in DOM order.
		 */
		function sectionElements() {
			const column = sidebarColumn();
			if (column === null) return [];
			const region = workspaceArea(column);
			const sections = [];
			for (const node of column.children) {
				if (node === region) sections.push({ id: 'workspaces', node });
				else if (node.hasAttribute(CONTAINER_ATTR)) {
					sections.push({ id: node.getAttribute(CONTAINER_ATTR), node });
				}
			}
			return sections;
		}

		/**
		 * Whether the column already lists the three sections in `order`; anything
		 * else (a container still unplaced, a foreign order) needs a placement pass.
		 * @param column - the sidebar column element.
		 * @param region - the shipped workspace region wrapper.
		 * @param order - the desired order.
		 * @returns whether the DOM already agrees.
		 */
		function placementMatches(column, region, order) {
			const present = [];
			for (const node of column.children) {
				if (node === region) present.push('workspaces');
				else if (node.hasAttribute(CONTAINER_ATTR)) present.push(node.getAttribute(CONTAINER_ATTR));
			}
			return present.length === order.length && present.every((id, index) => id === order[index]);
		}

		/**
		 * The sidebar's footer: the column's direct child that carries the settings
		 * slot. Found by walking up from the slot, never by a hashed class name.
		 * @param column - the sidebar column element.
		 * @returns the footer element, or `null`.
		 */
		function sidebarFooter(column) {
			const settings = column.querySelector('[data-slot="sidebar.settings"]');
			let node = settings;
			while (node !== null && node.parentElement !== column) node = node.parentElement;
			return node;
		}

		/**
		 * The empty tail between the last section and the footer. It takes the free
		 * space the footer's `margin-top: auto` used to take, which is what lets the
		 * end-of-list insertion line be drawn immediately under the last section
		 * while the footer still sits at the bottom of the sidebar.
		 * @param column - the sidebar column element.
		 * @returns the spacer element.
		 */
		function ensureSpacer(column) {
			let spacer = document.querySelector('[' + SPACER_ATTR + ']');
			if (spacer === null) {
				spacer = document.createElement('div');
				spacer.setAttribute(SPACER_ATTR, PLUGIN_ID);
			}
			const footer = sidebarFooter(column);
			if (footer !== null && spacer.nextElementSibling !== footer) column.insertBefore(spacer, footer);
			else if (footer === null && spacer.parentElement !== column) column.appendChild(spacer);
			return spacer;
		}

		/**
		 * Bring the column into the state the preferences describe: every section
		 * container placed around the shipped region in the stored order, the tail
		 * spacer under the last of them, the region hugging its own content instead
		 * of eating the free space, and the footer at the bottom. Re-running this is
		 * idempotent and cheap; it is what repairs the placement if React ever
		 * rebuilt the column.
		 * @returns one entry per {@link LIST_IDS} id; each is `null` while the shell
		 * is absent.
		 */
		function placeContainers() {
			const column = sidebarColumn();
			const region = column === null ? null : workspaceArea(column);
			if (region === null) {
				const absent = {};
				for (const id of LIST_IDS) absent[id] = null;
				return absent;
			}
			const containers = {};
			for (const id of LIST_IDS) containers[id] = ensureContainer(id);
			ensureSpacer(column);
			region.style.flex = '0 1 auto';
			// A 工作区 the user hid in Settings is taken out of the flow entirely, so the
			// remaining sections close up around it.
			region.style.display = readPrefs().hidden.workspaces === true ? 'none' : '';
			// Every section gap is 8px: our sections carry their own 4px trailing
			// margin inside the container (the shipped header's). The region carries
			// it in its own box instead, so it reads the same wherever it is dragged.
			region.style.marginTop = '2px';
			region.style.marginBottom = '4px';
			const foot = sidebarFooter(column);
			if (foot !== null && foot !== region) foot.style.marginTop = 'auto';
			const order = readPrefs().order;
			if (!placementMatches(column, region, order)) {
				const regionIndex = order.indexOf('workspaces');
				let previous = region;
				order.forEach((id, index) => {
					if (id === 'workspaces') return;
					const node = containers[id];
					if (index < regionIndex) {
						// Successive inserts before the same anchor keep the call order.
						column.insertBefore(node, region);
						return;
					}
					column.insertBefore(node, previous.nextSibling);
					previous = node;
				});
			}
			return containers;
		}

		/**
		 * The shipped 工作区 (workspace browser) region, found structurally and
		 * never through hashed CSS-module class names: the `sidebar.workspaces`
		 * slot renders one root, whose first child is the section header — label,
		 * search, view options, add — and whose second child is the list area.
		 * @returns `{ root, header, label, list, fold }`, or `null` while the
		 * browser is absent. `label` and `fold` are `null` in the rail, where the
		 * header draws neither.
		 */
		function workspaceRegion() {
			if (typeof document === 'undefined') return null;
			const slot = document.querySelector('[data-slot="sidebar.workspaces"]');
			const root = slot === null ? null : slot.firstElementChild;
			const header = root === null ? null : root.firstElementChild;
			if (!(header instanceof HTMLElement)) return null;
			return {
				root,
				header,
				label: workspaceLabel(header),
				list: header.nextElementSibling,
				fold: header.querySelector('.' + FOLD_CLASS),
			};
		}

		/**
		 * The header's own title span — the 工作区 / 会话 label — tagged on first
		 * sight so the injection below stays findable. The expanded header's first
		 * span child is the label; the rail renders none, which is what tells the
		 * two states apart.
		 * @param header - the shipped section header.
		 * @returns the label element, or `null` in the rail.
		 */
		function workspaceLabel(header) {
			const tagged = header.querySelector('[' + LABEL_ATTR + ']');
			if (tagged !== null) return tagged;
			for (const child of header.children) {
				if (child.tagName !== 'SPAN') continue;
				child.setAttribute(LABEL_ATTR, '');
				return child;
			}
			return null;
		}

		/** The chevron the fold button draws: right when folded, down when open. */
		function foldGlyph() {
			const SVG = 'http://www.w3.org/2000/svg';
			const svg = document.createElementNS(SVG, 'svg');
			svg.setAttribute('width', '14');
			svg.setAttribute('height', '14');
			svg.setAttribute('viewBox', '0 0 12 12');
			svg.setAttribute('aria-hidden', 'true');
			svg.setAttribute('focusable', 'false');
			const path = document.createElementNS(SVG, 'path');
			path.setAttribute('d', 'M4.5 2.5 L8.5 6 L4.5 9.5');
			path.setAttribute('fill', 'none');
			path.setAttribute('stroke', 'currentColor');
			path.setAttribute('stroke-width', '1.4');
			path.setAttribute('stroke-linecap', 'round');
			path.setAttribute('stroke-linejoin', 'round');
			svg.appendChild(path);
			return svg;
		}

		/**
		 * The fold affordance, at the right end of the shipped header row — the
		 * same corner this plugin's own 最近会话 / 活跃会话 chevrons sit in, so the
		 * three sections read alike. A real icon button carrying the shipped
		 * icons' geometry and hover surface; it deliberately has no listener of
		 * its own — the delegated handler below folds on activation, so mouse,
		 * Enter and Space all take one path.
		 * @param header - the shipped section header.
		 * @param t - translator.
		 * @param folded - whether the region is folded.
		 * @returns the injected button.
		 */
		function ensureFoldButton(header, t, folded) {
			let button = header.querySelector('.' + FOLD_CLASS);
			if (button === null) {
				button = document.createElement('button');
				button.type = 'button';
				button.className = FOLD_CLASS;
				button.appendChild(foldGlyph());
			}
			if (header.lastElementChild !== button) header.appendChild(button);
			// No `title`: the app's own tooltips are styled, and a native one reads
			// as a foreign box hanging over the sidebar. The label is enough.
			button.setAttribute('aria-label', t(folded ? 'workspaces.expand' : 'workspaces.collapse'));
			button.setAttribute('aria-expanded', folded ? 'false' : 'true');
			return button;
		}

		/**
		 * Elements this plugin hid, so unfolding restores exactly what it changed
		 * and nothing the shipped browser styles inline itself.
		 */
		const hiddenByFold = new Set();

		/**
		 * Put the fold away in the DOM: the header keeps its state, everything the
		 * browser draws under it is hidden, and anything this plugin hid is shown
		 * again.
		 * @param folded - whether the region's list must be hidden.
		 */
		function applyWorkspaceFold(folded) {
			const region = workspaceRegion();
			if (region === null) return;
			const { header, list } = region;
			// The shipped header's 4px bottom margin separates it from the list.
			// With the list hidden there is nothing to separate, and leaving the
			// margin in makes the gap under a folded 工作区 wider than every other
			// section gap — so it goes away exactly while folded.
			header.style.marginBottom = folded ? '0' : '';
			if (!folded) {
				for (const node of [...hiddenByFold]) {
					node.style.display = '';
					hiddenByFold.delete(node);
				}
				header.setAttribute(FOLD_ATTR, 'open');
				return;
			}
			header.setAttribute(FOLD_ATTR, 'collapsed');
			for (const node of [...hiddenByFold]) if (!node.isConnected) hiddenByFold.delete(node);
			if (list instanceof HTMLElement && list.style.display !== 'none') {
				list.style.display = 'none';
				hiddenByFold.add(list);
			}
		}

		/**
		 * Whether a click is aimed at the fold control: the injected chevron, the
		 * shipped label (the label's own box, which is the large target), or the
		 * header's own padding. Clicks on the search and action clusters are not —
		 * they live in their own children, so they never match.
		 * @param target - the event target.
		 * @param region - the shipped region.
		 * @returns whether the fold should toggle.
		 */
		function workspaceFoldTarget(target, region) {
			// Duck-typed rather than `instanceof Node`: the check must hold in any
			// DOM the page hands the event over in, without leaning on a global.
			if (target === null || typeof target !== 'object' || typeof target.nodeType !== 'number') return false;
			if (region.fold !== null && region.fold.contains(target)) return true;
			if (target === region.header) return true;
			return region.label !== null && region.label.contains(target);
		}

		/**
		 * One repair pass over the shipped workspace region: keep the chevron in
		 * the header, and keep the list hidden exactly while `folded`. This is what
		 * the slow timer re-runs, because the browser rebuilds its own header and
		 * list whenever the workspace snapshot, the search or the view options
		 * change.
		 * @param enabled - whether the expanded sidebar makes the region foldable.
		 * @param folded - whether the region is folded.
		 * @param t - translator.
		 */
		function syncWorkspaceFold(enabled, folded, t) {
			const region = workspaceRegion();
			if (region === null) return;
			if (!enabled) {
				// The rail's header carries no label, so nothing there is foldable —
				// and nothing may stay hidden once the region is out of reach.
				applyWorkspaceFold(false);
				if (region.fold !== null) region.fold.remove();
				region.header.removeAttribute(FOLD_ATTR);
				region.header.removeAttribute('draggable');
				return;
			}
			ensureFoldButton(region.header, t, folded);
			// The header is also this section's drag handle, like the other two.
			region.header.setAttribute('draggable', 'true');
			applyWorkspaceFold(folded);
		}

		/**
		 * Make the shipped 工作区 section foldable from its own header, and keep
		 * that fold across the browser's own re-renders.
		 * @param enabled - whether the expanded sidebar (with a label to fold from) is showing.
		 * @param folded - whether the region's list is folded away.
		 * @param t - translator.
		 */
		function useWorkspaceFold(enabled, folded, t) {
			const latest = React.useRef({ t });
			latest.current = { t };
			React.useEffect(() => {
				if (!enabled) return undefined;
				const onClick = (event) => {
					const region = workspaceRegion();
					if (region === null) return;
					if (!workspaceFoldTarget(event.target, region)) return;
					writePrefs({ workspacesCollapsed: !readPrefs().workspacesCollapsed });
				};
				document.addEventListener('click', onClick);
				return () => { document.removeEventListener('click', onClick) };
			}, [enabled]);
			React.useEffect(() => {
				const sync = () => { syncWorkspaceFold(enabled, folded, latest.current.t) };
				sync();
				const handle = window.setInterval(sync, ANCHOR_MS);
				return () => { window.clearInterval(handle) };
			}, [enabled, folded]);
			// Unmounting (the bundle was disabled) gives the shipped chrome back:
			// no stray chevron, no list left hidden with nothing to unfold it.
			React.useEffect(() => () => { syncWorkspaceFold(false, false, latest.current.t) }, []);
		}

		/** The section currently being dragged, or `null`. */
		let draggedSectionId = null;

		/**
		 * The section a drag would pick up, or `null` when the node is not a section
		 * header. Only the headers drag: the shipped workspace list keeps its own
		 * drag-and-drop for reordering sessions, and those drags never match here.
		 * @param node - the event target.
		 * @returns the section id, or `null`.
		 */
		function draggedSection(node) {
			if (node === null || typeof node !== 'object' || typeof node.closest !== 'function') return null;
			const region = workspaceRegion();
			if (region !== null && region.header === node) return 'workspaces';
			const header = node.closest('.drs-head');
			const container = header === null ? null : header.closest('[' + CONTAINER_ATTR + ']');
			return container === null ? null : container.getAttribute(CONTAINER_ATTR);
		}

		/**
		 * Where a drop at `clientY` belongs among the sections the user is *not*
		 * dragging: the first section whose middle is below the pointer, or the end.
		 * @param clientY - the pointer's viewport y.
		 * @param draggedId - the section being dragged.
		 * @returns an index among the remaining sections.
		 */
		function dropIndexAt(clientY, draggedId) {
			const rest = sectionElements().filter(section => section.id !== draggedId);
			for (let index = 0; index < rest.length; index += 1) {
				const rect = rest[index].node.getBoundingClientRect();
				if (clientY < rect.top + rect.height / 2) return index;
			}
			return rest.length;
		}

		/**
		 * The insertion line element, created on demand. One element is reused for
		 * every boundary: it is moved in the column's flow rather than restyled, so
		 * it always spans the sidebar the same way.
		 * @returns the line element.
		 */
		function ensureDropLine() {
			let line = document.querySelector('[' + LINE_ATTR + ']');
			if (line === null) {
				line = document.createElement('div');
				line.setAttribute(LINE_ATTR, PLUGIN_ID);
			}
			return line;
		}

		/**
		 * Draw the insertion line at the boundary a drag is aiming at: immediately
		 * before the section it precedes, or immediately before the tail spacer when
		 * the section goes last. Both are in the column's own flow, so the line ends
		 * up exactly where the section will land, straight and full width, and — for
		 * the end of the list — right under the last section rather than at the
		 * bottom of the sidebar or off the end of a long workspace list.
		 * @param index - the target index among the sections the user is not dragging.
		 * @param draggedId - the section being dragged.
		 */
		function markDrop(index, draggedId) {
			const column = sidebarColumn();
			if (column === null) return;
			const rest = sectionElements().filter(section => section.id !== draggedId);
			const boundary = index >= rest.length
				? (rest.length === 0 ? null : ensureSpacer(column))
				: rest[index].node;
			clearDrop();
			if (boundary === null || boundary.parentElement !== column) return;
			column.insertBefore(ensureDropLine(), boundary);
		}

		/**
		 * Take the insertion line out of the column. The sweep by attribute also
		 * clears a line left behind by a page or bundle reload that happened
		 * mid-drag, which the plugin itself no longer holds a reference to.
		 */
		function clearDrop() {
			if (typeof document === 'undefined') return;
			for (const node of document.querySelectorAll('[' + LINE_ATTR + ']')) {
				if (node.parentElement !== null) node.parentElement.removeChild(node);
			}
		}

		/**
		 * Move one section to a boundary of the others and persist the result.
		 * @param id - the section being dragged.
		 * @param index - its new index among the *other* sections.
		 */
		function reorderSection(id, index) {
			const rest = readPrefs().order.filter(other => other !== id);
			rest.splice(Math.max(0, Math.min(index, rest.length)), 0, id);
			writePrefs({ order: rest });
		}

		/**
		 * Make the three section headers drag handles: press a header, drag, and the
		 * section lands where the insertion line is. Listeners live on the document
		 * so they survive the browser rebuilding its own header, and the drag state
		 * is module-scoped so a drag that ends outside the sidebar still settles.
		 * @param enabled - whether the expanded sidebar (whose headers exist) is showing.
		 */
		function useSectionDrag(enabled) {
			React.useEffect(() => {
				// A reload during an earlier drag can leave a line with nobody to
				// clear it.
				clearDrop();
				if (!enabled) return undefined;
				const onDragStart = (event) => {
					const id = draggedSection(event.target);
					if (id === null) return;
					draggedSectionId = id;
					const transfer = event.dataTransfer;
					if (transfer !== undefined && transfer !== null) {
						transfer.effectAllowed = 'move';
						transfer.setData('text/plain', id);
					}
				};
				const onDragOver = (event) => {
					if (draggedSectionId === null) return;
					event.preventDefault();
					const transfer = event.dataTransfer;
					if (transfer !== undefined && transfer !== null) transfer.dropEffect = 'move';
					markDrop(dropIndexAt(event.clientY, draggedSectionId), draggedSectionId);
				};
				const onDrop = (event) => {
					if (draggedSectionId === null) return;
					event.preventDefault();
					reorderSection(draggedSectionId, dropIndexAt(event.clientY, draggedSectionId));
					draggedSectionId = null;
					clearDrop();
				};
				const onDragEnd = () => {
					draggedSectionId = null;
					clearDrop();
				};
				document.addEventListener('dragstart', onDragStart);
				document.addEventListener('dragover', onDragOver);
				document.addEventListener('drop', onDrop);
				document.addEventListener('dragend', onDragEnd);
				return () => {
					document.removeEventListener('dragstart', onDragStart);
					document.removeEventListener('dragover', onDragOver);
					document.removeEventListener('drop', onDrop);
					document.removeEventListener('dragend', onDragEnd);
					draggedSectionId = null;
					clearDrop();
				};
			}, [enabled]);
		}

		/**
		 * Mount-time container handle for every section: resolves the containers as
		 * soon as the shell exists and keeps watching, because the block must appear
		 * without a page reload once the sidebar is (re)built — and because the
		 * sections move whenever the order preference changes.
		 * @param hidden - whether the rail must hide every section.
		 * @param orderKey - the stored order, joined, so the effect re-runs on a real
		 * reorder rather than on every preference read.
		 * @param windows - one visible-row count per {@link LIST_IDS} id, published on
		 * each container as its own `rowsVar` custom property.
		 * @param hiddenSections - the stored per-section visibility map.
		 * @returns one entry per {@link LIST_IDS} id, `null` until it is available.
		 */
		function useContainers(hidden, orderKey, windows, hiddenSections) {
			const empty = React.useMemo(() => {
				const blank = {};
				for (const id of LIST_IDS) blank[id] = null;
				return blank;
			}, []);
			const [containers, setContainers] = React.useState(empty);
			// A hidden 工作区 leaves the column at once, not on the next repair pass.
			React.useEffect(() => {
				const column = sidebarColumn();
				const region = column === null ? null : workspaceArea(column);
				if (region !== null) region.style.display = hiddenSections.workspaces === true ? 'none' : '';
			}, [containers, hiddenSections]);
			React.useEffect(() => {
				let alive = true;
				const sync = () => {
					const next = placeContainers();
					if (!alive) return;
					setContainers(current => (
						LIST_IDS.every(id => current[id] === next[id]) ? current : next
					));
				};
				sync();
				const handle = window.setInterval(sync, ANCHOR_MS);
				return () => {
					alive = false;
					window.clearInterval(handle);
				};
			}, [orderKey]);
			const rowCounts = LIST_IDS.map(id => windows[id]);
			React.useEffect(() => {
				for (const list of LISTS) {
					const node = containers[list.id];
					if (node === undefined || node === null) continue;
					// The rail hides everything; a section the user hid in Settings hides
					// only itself, so the remaining sections close up with their own 8px.
					node.style.display = hidden || hiddenSections[list.id] === true ? 'none' : '';
					node.style.setProperty(list.rowsVar, String(windows[list.id]));
				}
			}, [containers, hidden, hiddenSections, rowCounts[0], rowCounts[1], rowCounts[2]]);			return containers;
		}

		/**
		 * Reloading clock for relative labels; stops while the block is hidden
		 * so a collapsed sidebar costs nothing.
		 * @param enabled - whether the block is visible.
		 * @returns the current epoch ms, refreshed on a slow interval.
		 */
		function useClock(enabled) {
			const [now, setNow] = React.useState(() => Date.now());
			React.useEffect(() => {
				if (!enabled) return undefined;
				setNow(Date.now());
				const handle = window.setInterval(() => { setNow(Date.now()) }, CLOCK_MS);
				return () => { window.clearInterval(handle) };
			}, [enabled]);
			return now;
		}

		/**
		 * `{ limit, visible, collapsed, activeVisible, activeCollapsed }`, kept in
		 * sync with the stored preferences through the {@link PREFS_EVENT} write
		 * announcement.
		 * @returns the current preferences and their setter.
		 */
		function usePrefs() {
			const [prefs, setPrefs] = React.useState(readPrefs);
			React.useEffect(() => {
				const sync = () => { setPrefs(readPrefs()) };
				window.addEventListener(PREFS_EVENT, sync);
				return () => { window.removeEventListener(PREFS_EVENT, sync) };
			}, []);
			return [prefs, setPrefs];
		}

		/**
		 * Which Workspace accounts for each Session, by the browser's own rule
		 * (the first Workspace whose manual order includes it).
		 * @param items - Workspace Controller rows.
		 * @returns session id → Workspace title.
		 */
		function workspaceTitles(items) {
			const titles = new Map();
			for (const workspace of Array.isArray(items) ? items : []) {
				if (workspace === null || typeof workspace !== 'object') continue;
				for (const id of Array.isArray(workspace.sessionIds) ? workspace.sessionIds : []) {
					if (!titles.has(id)) titles.set(id, workspace.title);
				}
			}
			return titles;
		}

		/**
		 * The pending interactions the shipped navigation surfaces, by kind. The
		 * allowlist is the shipped one (`visiblePendingKind`), so a session the
		 * sidebar deliberately keeps quiet stays quiet here too; the value is the
		 * locale-key suffix behind the yellow dot.
		 */
		const PENDING_LABELS = new Map([
			['approval', 'approval'],
			['plan-review', 'planReview'],
			['question', 'question'],
		]);

		/**
		 * The interaction kind a session is waiting on, or `undefined` when it is
		 * not waiting on the user.
		 * @param status - the session's UI status, if known.
		 * @returns the locale-key suffix, or `undefined`.
		 */
		function pendingKind(status) {
			const kind = status?.pendingInteraction?.kind;
			return kind === undefined ? undefined : PENDING_LABELS.get(kind);
		}

		/**
		 * How many of a session's subagents are running, by the shipped
		 * navigation's own rule: the parent's catalog entries whose live status is
		 * running. A snapshot without the projection counts none.
		 * @param list - Session Controller list snapshot.
		 * @param parentId - the parent session id.
		 * @param statuses - Session status snapshot.
		 * @returns the running subagent count.
		 */
		function runningChildCount(list, parentId, statuses) {
			const catalog = list?.projectionsBySession?.[parentId]?.values?.subagentCatalog;
			if (!Array.isArray(catalog)) return 0;
			let count = 0;
			for (const child of catalog) {
				if (child === null || typeof child !== 'object' || typeof child.id !== 'string') continue;
				const status = typeof statuses?.get === 'function' ? statuses.get(child.id) : undefined;
				if ((status?.running ?? list?.byId?.[child.id]?.running) === true) count += 1;
			}
			return count;
		}

		/**
		 * The status dot a row shows, mirroring the shipped rows: a pending
		 * interaction outranks live activity, live activity (the session's own or
		 * a running subagent's) outranks the finished-but-unread reminder. A row
		 * with no state is idle.
		 * @param facts - one row's facts.
		 * @returns a state for {@link StateDot}, or `undefined` for no dot.
		 */
		function stateOf(facts) {
			if (facts.pending !== undefined) return 'warning';
			if (facts.running || facts.subagents > 0) return 'ongoing';
			if (facts.unread) return 'done';
			return undefined;
		}

		/**
		 * One row's facts, from the same two snapshots the workspace browser and
		 * the shipped rows read.
		 * @param session - Session Controller summary.
		 * @param id - its session id.
		 * @param owners - session id → Workspace title.
		 * @param list - Session Controller list snapshot (subagent catalogs).
		 * @param statuses - Session status snapshot (`useSessionStatus` value).
		 * @returns the facts, with `state` already resolved.
		 */
		function sessionFacts(session, id, owners, list, statuses) {
			const status = typeof statuses?.get === 'function' ? statuses.get(id) : undefined;
			const facts = {
				id,
				title: typeof session.displayTitle === 'string' && session.displayTitle.length > 0
					? session.displayTitle
					: String(id),
				updatedAt: session.updatedAt,
				running: (status?.running ?? session.running) === true,
				subagents: runningChildCount(list, id, statuses),
				pending: pendingKind(status),
				unread: status?.completionUnread === true,
				current: (session.retainedBy?.mainView ?? 0) > 0,
				workspace: owners.get(id),
			};
			facts.state = stateOf(facts);
			return facts;
		}

		/**
		 * Every session this block may list: host-list members that are ordinary
		 * top-level sessions (no subagent children), not archived, and not the
		 * provisional blank New Session row — the same visibility rule the
		 * workspace browser applies — in host order.
		 * @param list - Session Controller list snapshot.
		 * @param archive - registry-global archived session ids.
		 * @param items - Workspace Controller rows (membership + titles).
		 * @param statuses - Session status snapshot.
		 * @returns rows ready to render, each with its {@link stateOf} state.
		 */
		function listedRows(list, archive, items, statuses) {
			const archived = new Set(archive ?? []);
			const owners = workspaceTitles(items);
			const ids = Array.isArray(list?.ids) ? list.ids : [];
			const byId = list?.byId ?? {};
			const rows = [];
			for (const id of ids) {
				const session = byId[id];
				if (session === undefined || session === null) continue;
				if (session.blank === true || session.origin === 'subagent') continue;
				if (archived.has(id)) continue;
				rows.push(sessionFacts(session, id, owners, list, statuses));
			}
			return rows;
		}

		/**
		 * The 最近会话 list: every listed session, newest first, capped at `limit`.
		 * @param limit - maximum rows.
		 * @returns rows ready to render.
		 */
		function selectRecent(list, archive, items, statuses, limit) {
			const rows = listedRows(list, archive, items, statuses);
			rows.sort((left, right) => right.updatedAt - left.updatedAt);
			return rows.slice(0, limit);
		}

		/**
		 * The active list's order: what the user owes the agent first, then the
		 * completions they have not looked at, then live work.
		 */
		const ACTIVE_RANK = { warning: 0, done: 1, ongoing: 2 };

		/**
		 * A row's rank in 活跃会话. A lingering row that no longer carries a state of
		 * its own sorts after every live one, so it never pushes work down the list.
		 * @param state - the row's state, or `undefined` once it stopped qualifying.
		 * @returns the sort rank.
		 */
		function activeRank(state) {
			return ACTIVE_RANK[state] ?? 3;
		}

		/** The active list's order, shared by the live selection and the linger. */
		function compareActive(left, right) {
			const byRank = activeRank(left.state) - activeRank(right.state);
			return byRank === 0 ? right.updatedAt - left.updatedAt : byRank;
		}

		/**
		 * Linger over the active list: the rows that qualify right now, plus every row
		 * that qualified within the last `lingerMs`. A session that has just been read
		 * keeps its row until the window runs out instead of blinking away under the
		 * pointer — but it is refreshed to the session's *current* facts, so a row that
		 * has settled stops claiming to be running and shows no state dot at all.
		 * @param qualifying - the rows that qualify now, already ranked.
		 * @param lookup - every listed row by id, for refreshing a lingering one.
		 * @param memory - the previous pass's map of id → `{ facts, expiresAt }`.
		 * @param nowMs - the current epoch ms.
		 * @param lingerMs - how long a row lingers; 0 disables the whole carry-over.
		 * @returns `{ rows, memory, nextExpiry }`; `nextExpiry` is `null` while nothing
		 * is merely lingering, which is what the timer keys on.
		 */
		function lingerActive(qualifying, lookup, memory, nowMs, lingerMs) {
			const next = new Map();
			for (const facts of qualifying) next.set(facts.id, { facts, expiresAt: nowMs + lingerMs });
			let nextExpiry = null;
			if (lingerMs > 0 && memory !== undefined && memory !== null) {
				for (const [id, held] of memory) {
					if (next.has(id)) continue;
					if (held.expiresAt <= nowMs) continue;
					const fresh = lookup.get(id);
					// A session the registry no longer lists (archived, deleted) goes.
					if (fresh === undefined) continue;
					next.set(id, { facts: fresh, expiresAt: held.expiresAt });
					nextExpiry = nextExpiry === null ? held.expiresAt : Math.min(nextExpiry, held.expiresAt);
				}
			}
			const rows = [...next.values()].map(entry => entry.facts);
			rows.sort(compareActive);
			return { rows, memory: next, nextExpiry };
		}

		/**
		 * The 活跃会话 list: only the listed sessions that are waiting on the
		 * user, freshly finished, or still working — ranked by
		 * {@link ACTIVE_RANK}, newest first inside a rank. Idle sessions are not
		 * active and stay out.
		 * @returns rows ready to render.
		 */
		function selectActive(list, archive, items, statuses) {
			const rows = listedRows(list, archive, items, statuses)
				.filter(facts => facts.state !== undefined);
			rows.sort(compareActive);
			return rows;
		}

		/**
		 * The 置顶对话 list: every listed session the Workspace registry holds in
		 * `pinnedSessionIds`, newest first. A pinned session stays in 最近会话 too —
		 * pinning marks a session as worth keeping at hand, it does not move it — and
		 * an id the registry no longer lists (archived, blank, subagent) is dropped
		 * by {@link listedRows} like anywhere else.
		 * @param pinnedIds - the registry's pinned Session ids.
		 * @returns rows ready to render.
		 */
		function selectPinned(list, archive, items, statuses, pinnedIds) {
			if (!Array.isArray(pinnedIds) || pinnedIds.length === 0) return [];
			const pinned = new Set(pinnedIds);
			const rows = listedRows(list, archive, items, statuses)
				.filter(facts => pinned.has(facts.id));
			rows.sort((left, right) => right.updatedAt - left.updatedAt);
			return rows;
		}

		/** The localized status word behind a dot, for screen readers and the hover card. */
		function dotLabel(state, facts, t) {
			if (state === 'idle') return t('idle');
			if (state === 'warning') {
				return facts.pending === undefined ? t('waiting') : t('waiting.' + facts.pending);
			}
			if (state === 'done') return t('done');
			if (facts.running) return t('running');
			return t(facts.subagents === 1 ? 'running.subagents.one' : 'running.subagents.other', { n: facts.subagents });
		}

		/**
		 * The status dot, with the primitive's own geometry: `ongoing` is a 14px
		 * spinner and every solid state a 10px box with a 6px core. Passing a size
		 * would shrink the spinner, which is the one place the difference shows.
		 */
		function statusDot(state) {
			if (StateDot !== null) return h(StateDot, { state });
			if (state === 'ongoing') {
				return h('span', { className: 'drs-spin', 'aria-hidden': 'true', 'data-state': state });
			}
			return h('span', { className: 'drs-dot', 'aria-hidden': 'true', 'data-state': state },
				h('span', { className: 'drs-dot-core' }));
		}

		/** The collapse chevron: points right when folded, down when open. */
		function chevron(open) {
			return h('svg', {
				className: 'drs-arrow' + (open ? ' drs-arrow-open' : ''),
				width: 14,
				height: 14,
				viewBox: '0 0 12 12',
				'aria-hidden': 'true',
				focusable: 'false',
			}, h('path', {
				d: 'M4.5 2.5 L8.5 6 L4.5 9.5',
				fill: 'none',
				stroke: 'currentColor',
				strokeWidth: 1.4,
				strokeLinecap: 'round',
				strokeLinejoin: 'round',
			}));
		}

		/** Overflow below this many pixels is not worth crawling for. */
		const MIN_TITLE_REVEAL_PX = 8;

		/** The shipped rows' marquee speed, in CSS pixels per millisecond. */
		const TITLE_MARQUEE_PX_PER_MS = 0.03;

		/**
		 * Place a clipping title's scroll offset and publish the stylesheet's
		 * fade-mask hooks — `data-scrolled` while it has left its start (left fade)
		 * and `data-clipped` while text remains beyond the right edge (right fade).
		 * One to one with the shipped rows, so the two lists move and fade alike.
		 * @param title - the row's clipping title element.
		 * @param left - scroll offset in CSS pixels.
		 * @param range - the title's maximum scroll offset.
		 */
		function placeTitle(title, left, range) {
			if (typeof title.scrollTo === 'function') title.scrollTo({ left, behavior: 'instant' });
			else title.scrollLeft = left;
			if (left > 0) title.dataset.scrolled = '';
			else delete title.dataset.scrolled;
			if (left < range) title.dataset.clipped = '';
			else delete title.dataset.clipped;
		}

		/** Return a title to its resting state: at the start, both fade masks off. */
		function restTitle(title) {
			if (typeof title.scrollTo === 'function') title.scrollTo({ left: 0, behavior: 'instant' });
			else title.scrollLeft = 0;
			delete title.dataset.scrolled;
			delete title.dataset.clipped;
		}

		/**
		 * Marquee a title wider than its one-line cell while its row is hovered: the
		 * title clips its own text, so entering crawls it at the shipped constant
		 * speed until the far edge is in view, and leaving returns it to the start.
		 * Reduced motion jumps to the far edge instead of crawling.
		 * @param title - ref to the row's clipping title element.
		 * @returns stable pointer enter/leave handlers for the row.
		 */
		function useTitleMarquee(title) {
			const frame = React.useRef(0);
			React.useEffect(() => () => { window.cancelAnimationFrame(frame.current) }, []);
			return React.useMemo(() => ({
				enter: () => {
					const element = title.current;
					if (element === null) return;
					const range = element.scrollWidth - element.clientWidth;
					if (range <= MIN_TITLE_REVEAL_PX) return;
					const reduced = typeof window.matchMedia === 'function'
						&& window.matchMedia('(prefers-reduced-motion: reduce)').matches;
					if (reduced) {
						placeTitle(element, range, range);
						return;
					}
					window.cancelAnimationFrame(frame.current);
					let previous;
					let position = 0;
					const step = (now) => {
						position += previous === undefined ? 0 : (now - previous) * TITLE_MARQUEE_PX_PER_MS;
						previous = now;
						placeTitle(element, Math.min(position, range), range);
						if (position < range) frame.current = window.requestAnimationFrame(step);
					};
					frame.current = window.requestAnimationFrame(step);
				},
				leave: () => {
					window.cancelAnimationFrame(frame.current);
					if (title.current !== null) restTitle(title.current);
				},
			}), [title]);
		}

		/**
		 * One session row: status cell, title, owning Workspace, trailing relative
		 * time. It is a component of its own because the two behaviours the shipped
		 * workspace rows have — the hover marquee on the title, and double-click
		 * rename — are per-row state, and a row has to swap its own button for the
		 * rename field while it is being edited.
		 * @param props - the row's facts, the clock, the translator, and the two hops.
		 * @returns the row element.
		 */
		function SessionRow(props) {
			const { facts, now, t, onOpen, onRenameRequest } = props;
			const state = facts.state;
			const titleRef = React.useRef(null);
			const marquee = useTitleMarquee(titleRef);
			const workspace = facts.workspace === undefined
				? t('workspace.none')
				: String(facts.workspace);
			const children = [
				h('span', { className: 'drs-slot', key: 'slot' }, state === undefined ? null : statusDot(state)),
				h('span', {
					className: 'drs-title',
					key: 'title',
					ref: titleRef,
					onDoubleClick: (event) => {
						event.stopPropagation();
						onRenameRequest(facts.id, facts.title);
					},
				}, facts.title),
				h('span', {
					className: 'drs-workspace',
					key: 'workspace',
				}, workspace),
				h('span', { className: 'drs-time', key: 'time' }, timeLabel(facts.updatedAt, now, t)),
			];
			if (state !== undefined) {
				children.push(h('span', { className: 'drs-sr', key: 'sr' }, dotLabel(state, facts, t)));
			}
			const className = 'drs-row' + (facts.current ? ' drs-row-current' : '');
			const row = h('button', {
				type: 'button',
				className,
				'aria-current': facts.current ? 'true' : undefined,
				onPointerEnter: marquee.enter,
				onPointerLeave: marquee.leave,
				onClick: () => { onOpen(facts.id) },
			}, children);
			// The shipped rows carry a hover card; ours is the same card's content on
			// the same primitive, so it appears, positions and fades like theirs.
			if (HoverCard === null) return row;
			return h(HoverCard, {
				anchor: row,
				openDelayMs: 500,
				content: hoverCardContent(facts, t),
			});
		}

		/**
		 * The rename dialog, matching the one the workspace list opens: a modal on the
		 * app's modal surface, seeded with the row's display title, an emptied title
		 * blocked, Enter confirming, and a rejected rename keeping its reason under the
		 * field. Mounted only while a request is open, so the draft seeds once.
		 *
		 * It is built here rather than on the shared `Modal` primitive: that component
		 * renders nothing from a plugin seat (verified live), so the shape is ours and
		 * the portal is explicit. Portaling to `document.body` is what keeps it out of
		 * the sidebar's overflow and stacking context.
		 * @param props - the request, the translator, and the close/rename hops.
		 * @returns the modal.
		 */
		function RenameDialog(props) {
			const { request, t, onClose, onRename } = props;
			const [draft, setDraft] = React.useState(request.title);
			const [busy, setBusy] = React.useState(false);
			const [error, setError] = React.useState(null);
			const composing = React.useRef(false);
			const fieldRef = React.useRef(null);
			const trimmed = draft.trim();
			const blocked = busy || trimmed === '';
			const close = () => { if (!busy) onClose() };
			const confirm = () => {
				// The field is the source of truth at confirm time, so a keystroke the
				// controlled value somehow missed can never rename to the stale title.
				const next = (fieldRef.current === null ? draft : fieldRef.current.value).trim();
				if (busy || next === '') return;
				setBusy(true);
				setError(null);
				Promise.resolve(onRename(request.id, next)).then(() => {
					setBusy(false);
					onClose();
				}).catch((reason) => {
					setBusy(false);
					setError(reason instanceof Error ? reason.message : String(reason));
				});
			};
			// Escape closes from anywhere, the way a modal owns it, and the capture
			// phase keeps it away from the editor behind the dialog.
			React.useEffect(() => {
				const onKeyDown = (event) => {
					if (event.key !== 'Escape') return;
					event.stopPropagation();
					onClose();
				};
				document.addEventListener('keydown', onKeyDown, true);
				return () => { document.removeEventListener('keydown', onKeyDown, true) };
			}, [onClose]);
			const dialog = h('div', {
				className: 'drs-modal',
				role: 'presentation',
				onMouseDown: (event) => { if (event.target === event.currentTarget) close() },
			}, h('div', {
				className: 'drs-modal-card',
				role: 'dialog',
				'aria-modal': 'true',
				'aria-label': t('rename.title'),
			}, [
				h('div', { className: 'drs-modal-head', key: 'head' }, [
					h('h2', { className: 'drs-modal-title', key: 'title' }, t('rename.title')),
					h('button', {
						className: 'drs-modal-close',
						key: 'close',
						type: 'button',
						'aria-label': t('close'),
						onClick: close,
					}, h('svg', {
						width: 14,
						height: 14,
						viewBox: '0 0 14 14',
						'aria-hidden': 'true',
						fill: 'none',
						stroke: 'currentColor',
						strokeWidth: 1.4,
						strokeLinecap: 'round',
					}, h('path', { d: 'M3.2 3.2 10.8 10.8 M10.8 3.2 3.2 10.8' }))),
				]),
				h('input', {
					key: 'field',
					className: 'drs-rename-dialog',
					type: 'text',
					ref: fieldRef,
					value: draft,
					'aria-label': t('rename.field'),
					'data-modal-autofocus': true,
					disabled: busy,
					onFocus: (event) => { event.target.select() },
					onChange: (event) => { setDraft(event.target.value); setError(null) },
					onCompositionStart: () => { composing.current = true },
					onCompositionEnd: () => { composing.current = false },
					onKeyDown: (event) => {
						if (event.key === 'Enter' && !composing.current) {
							event.preventDefault();
							confirm();
						}
					},
				}),
				error === null ? null : h('div', { key: 'error', className: 'drs-rename-error', role: 'alert' }, error),
				h('div', { className: 'drs-modal-footer', key: 'footer' }, [
					h('button', {
						className: 'drs-btn drs-btn-outline',
						key: 'cancel',
						type: 'button',
						disabled: busy,
						onClick: close,
					}, t('cancel')),
					h('button', {
						className: 'drs-btn drs-btn-primary',
						key: 'confirm',
						type: 'button',
						disabled: blocked,
						onClick: confirm,
					}, t('rename')),
				]),
			]));
			return ReactDOM.createPortal(dialog, document.body);
		}

		/**
		 * One section header, in the shipped 工作区 header's own style: the label,
		 * the active count where there is one, and the chevron that folds the body
		 * away. The header is itself the button — the whole row is the hit target,
		 * so the label folds the section just as the chevron does — and it is also
		 * the drag handle, so the section can be moved.
		 * @param label - already-localized section title.
		 * @param prefix - '' for the recent section, 'active.' for the active one;
		 * it selects the expand/collapse copy keys.
		 * @param collapsed - whether this section's body is folded away.
		 * @param count - rows held, shown only when there are any.
		 * @param t - translator.
		 * @param onToggle - folds/unfolds this section.
		 * @returns the header element.
		 */
		function sectionHead(label, prefix, collapsed, count, t, onToggle) {
			const action = t(prefix + (collapsed ? 'expand' : 'collapse'));
			const children = [h('span', { className: 'drs-label', key: 'label' }, label)];
			if (count > 0) children.push(h('span', { className: 'drs-count', key: 'count' }, String(count)));
			children.push(h('span', { className: 'drs-chevron', key: 'chevron', 'aria-hidden': 'true' }, chevron(!collapsed)));
			return h('button', {
				type: 'button',
				key: 'head',
				className: 'drs-head',
				draggable: true,
				// `aria-label` only: a native `title` renders as an unstyled box that
				// does not belong in this sidebar, and the chevron says it anyway.
				'aria-label': action,
				'aria-expanded': collapsed ? 'false' : 'true',
				onClick: onToggle,
			}, children);
		}

		/**
		 * The settings page this plugin contributes: one switch per section, plus how
		 * long 活跃会话 holds a row that just stopped qualifying. Every control writes
		 * the same preferences the sidebar reads and announces the write, so a toggle
		 * lands in the sidebar while the page is still open.
		 * @param props - the seat's locale translator.
		 * @returns the page body.
		 */
		function RecentSessionsSettings(props) {
			const t = typeof props.t === 'function' ? props.t : fallbackT;
			const [prefs, setPrefs] = usePrefs();
			const hidden = prefs.hidden ?? clampHidden(undefined);
			const sections = [
				{ id: 'workspaces', label: t('settings.workspaces') },
				{ id: 'pinned', label: t('pin.title') },
				{ id: 'recent', label: t('title') },
				{ id: 'active', label: t('active.title') },
			];
			const switchFor = (id, label, shown) => {
				const onChange = (next) => {
					setPrefs(writePrefs({ hidden: { ...hidden, [id]: next !== true } }));
				};
				if (Switch === null) {
					// Without the primitive a plain checkbox keeps the row usable.
					return h('input', {
						key: 'switch',
						type: 'checkbox',
						checked: shown,
						'aria-label': label,
						onChange: (event) => { onChange(event.target.checked) },
					});
				}
				return h(Switch, { key: 'switch', checked: shown, label, onChange });
			};
			return h('div', { className: 'drs-settings' }, [
				h('p', { className: 'drs-settings-hint', key: 'hint' }, t('settings.hint')),
				...sections.map(row => h('div', { className: 'drs-settings-row', key: row.id }, [
					h('span', { className: 'drs-settings-label', key: 'label' }, row.label),
					switchFor(row.id, row.label, hidden[row.id] !== true),
				])),
				h('div', { className: 'drs-settings-row', key: 'linger' }, [
					h('span', { className: 'drs-settings-label', key: 'label' }, t('settings.linger')),
					h('span', { className: 'drs-settings-value', key: 'value' }, [
						h('input', {
							key: 'input',
							className: 'drs-settings-number',
							// A text field with a numeric keyboard: the stepper arrows of a
							// number input cannot be styled to belong here, and this keeps
							// the value readable while it is being typed.
							type: 'text',
							inputMode: 'numeric',
							maxLength: 4,
							value: String(prefs.lingerSeconds ?? DEFAULT_LINGER_SECONDS),
							'aria-label': t('settings.linger'),
							onChange: (event) => {
								const next = Number(event.target.value.trim());
								if (!Number.isFinite(next)) return;
								setPrefs(writePrefs({ lingerSeconds: clampLinger(next) }));
							},
						}),
						h('span', { className: 'drs-settings-unit', key: 'unit' }, t('settings.seconds')),
					]),
				]),
			]);
		}

		/**
		 * The seat occupant: it renders nothing where the footer seat is and
		 * portals the visible block into the injected container.
		 * @param props - owner `wide`, the standard session hooks and locale
		 * seat, and this registration's injected `openSession`.
		 * @returns the portal, or `null` while no container exists.
		 */
		function RecentSessions(props) {
			const list = props.useSessions(state => state);
			const workspaces = props.useWorkspaces(state => state);
			const statuses = props.useSessionStatus(state => state);
			const t = typeof props.t === 'function' ? props.t : fallbackT;
			const [prefs, setPrefs] = usePrefs();
			// The rail has no room for the block; a folded block keeps its header
			// (and therefore the affordance that unfolds it).
			const wide = props.wide !== false;
			const limit = prefs.limit ?? DEFAULT_LIMIT;
			const order = prefs.order ?? SECTION_IDS;
			const windows = {
				pinned: prefs.pinnedVisible ?? DEFAULT_PINNED_VISIBLE,
				recent: prefs.visible ?? DEFAULT_VISIBLE,
				active: prefs.activeVisible ?? DEFAULT_ACTIVE_VISIBLE,
			};
			const containers = useContainers(!wide, order.join(','), windows, prefs.hidden ?? clampHidden(undefined));
			// The rename dialog's request: one at a time.
			const [renameRequest, setRenameRequest] = React.useState(null);
			const now = useClock(wide);
			// Sections the user hid in Settings; `hidden` is the stored map.
			const hiddenSections = prefs.hidden ?? clampHidden(undefined);
			// The linger's memory and its expiry ticker: only a session that stopped
			// qualifying schedules a timer, and it fires at the earliest expiry.
			const lingerMs = (prefs.lingerSeconds ?? DEFAULT_LINGER_SECONDS) * 1000;
			const lingerMemory = React.useRef(new Map());
			const [lingerTick, setLingerTick] = React.useState(0);
			// The shipped 工作区 section is folded from its own header, and every
			// header is a drag handle; see {@link useWorkspaceFold} and
			// {@link useSectionDrag}. Both work whether or not this block itself has
			// anything to show, so they are not behind the early returns below.
			useWorkspaceFold(wide, prefs.workspacesCollapsed === true, t);
			useSectionDrag(wide);
			// Unmounting (the bundle was disabled) gives the shipped sidebar back.
			React.useEffect(() => () => { restoreSidebarChrome() }, []);
			const archive = workspaces?.archivedSessionIds;
			const items = workspaces?.items;
			const rows = React.useMemo(
				() => selectRecent(list, archive, items, statuses, limit),
				[list, archive, items, statuses, limit],
			);
			const active = React.useMemo(() => {
				// The lookup holds every listed session, so a lingering row can be
				// refreshed to what the session is *now* rather than what it was.
				const listed = selectRecent(list, archive, items, statuses, Number.POSITIVE_INFINITY);
				const lookup = new Map(listed.map(facts => [facts.id, facts]));
				return lingerActive(
					selectActive(list, archive, items, statuses),
					lookup,
					lingerMemory.current,
					Date.now(),
					lingerMs,
				);
			}, [list, archive, items, statuses, lingerMs, lingerTick]);
			React.useEffect(() => { lingerMemory.current = active.memory }, [active]);
			React.useEffect(() => {
				if (active.nextExpiry === null) return undefined;
				const handle = window.setTimeout(
					() => { setLingerTick(tick => tick + 1) },
					Math.max(0, active.nextExpiry - Date.now()) + 30,
				);
				return () => { window.clearTimeout(handle) };
			}, [active, lingerTick]);
			const pinned = React.useMemo(
				() => selectPinned(list, archive, items, statuses, workspaces?.pinnedSessionIds),
				[list, archive, items, statuses, workspaces?.pinnedSessionIds],
			);
			if (!wide) return null;
			if (LIST_IDS.every(id => containers[id] === null)) return null;
			const byId = { pinned, recent: rows, active: active.rows };
			const portals = [];
			for (const descriptor of LISTS) {
				if (hiddenSections[descriptor.id] === true) continue;
				const sectionRows = byId[descriptor.id];
				const container = containers[descriptor.id];
				if (sectionRows.length === 0 || container === null || container === undefined) continue;
				const folded = prefs[descriptor.collapsedKey] === true;
				portals.push(ReactDOM.createPortal(
					h('div', { className: 'drs', 'data-plugin': PLUGIN_ID, 'data-build': BUILD }, h('div', {
						className: 'drs-group',
						'data-section': descriptor.id,
						key: descriptor.id,
					}, [
						sectionHead(t(descriptor.title), descriptor.prefix, folded, descriptor.id === 'recent' ? 0 : sectionRows.length, t, () => {
							setPrefs(writePrefs({ [descriptor.collapsedKey]: !folded }));
						}),
						folded
							? null
							: h('div', { className: descriptor.listClass, key: 'list' },
								sectionRows.map(item => h(SessionRow, {
									key: item.id,
									facts: item,
									now,
									t,
									onOpen: props.openSession,
									onRenameRequest: (id, title) => { setRenameRequest({ id, title }) },
								}))),
					])),
					container,
				));
			}
			if (renameRequest !== null) {
				portals.push(h(RenameDialog, {
					key: 'rename',
					request: renameRequest,
					t,
					onClose: () => { setRenameRequest(null) },
					onRename: props.renameSession,
				}));
			}
			return portals;
		}

		/**
		 * Give the shipped sidebar back: the region grows and spaces itself as it
		 * shipped, the footer takes the free space again, and this plugin's
		 * containers, tail spacer and insertion line go away. Runs when the bundle
		 * is disabled, so nothing of ours is left behind.
		 */
		function restoreSidebarChrome() {
			clearDrop();
			const column = sidebarColumn();
			if (column === null) return;
			const region = workspaceArea(column);
			if (region !== null) {
				region.style.flex = '';
				region.style.display = '';
				region.style.marginTop = '';
				region.style.marginBottom = '';
			}
			const foot = sidebarFooter(column);
			if (foot !== null) foot.style.marginTop = '';
			for (const node of [document.querySelector('[' + SPACER_ATTR + ']'), ...LIST_IDS.map(ensureContainer)]) {
				if (node !== null && node.parentElement !== null) node.parentElement.removeChild(node);
			}
		}

		/** The slot registry is the one hard service dependency; the locale face is required by the seat. */
		const inject = ['slots', 'locale'];

		/**
		 * Register the block's seat and its copy.
		 * @param ctx - client root context.
		 * @returns the slot injection disposer.
		 */
		function apply(ctx) {
			const slots = ctx.get('slots');
			if (slots === undefined || slots === null) return;
			const locale = ctx.get('locale');
			if (locale !== undefined && locale !== null && typeof locale.register === 'function') {
				ctx.effect(() => locale.register(NS, { zh: ZH, en: EN }), PLUGIN_ID + ': dictionaries');
			}
			installStyles();

			/**
			 * Opening a session is resolved at click time: ui-workspace
			 * publishes `uiWorkspace` from its own apply, and activation order
			 * between the two plugins is not constrained.
			 */
			const openSession = (sessionId) => {
				const service = resolveService(ctx, 'uiWorkspace');
				if (service !== undefined && typeof service.openSession === 'function') {
					service.openSession(sessionId);
				}
			};

			/**
			 * Renaming goes through the same hop the shipped workspace rows use: the
			 * client `sessions` service, with the `workspaceOperation` source, so the
			 * title projection updates exactly as it does from the workspace list. The
			 * promise resolves on success and rejects with the reason, which is what
			 * the dialog puts under its field. Resolved at use time for the same reason
			 * {@link openSession} is, and silent when a build stops publishing it.
			 */
			const renameSession = (sessionId, title) => {
				const service = resolveService(ctx, 'sessions');
				if (service === undefined || typeof service.using !== 'function') return Promise.resolve();
				return Promise.resolve(service.using(sessionId, { source: 'workspaceOperation' }, (reference) => (
					reference.binding.session.rename(title)
				))).then((result) => {
					if (result !== null && result !== undefined && result.ok === false) {
						throw new Error(result.error === undefined ? 'rename rejected' : String(result.error.message));
					}
				});
			};

			if (typeof window !== 'undefined') {
				window.__DSH_RECENT_SESSIONS__ = {
					version: BUILD,
					/** How many sessions the 最近会话 list holds (persisted); clamps to 1..{@link MAX_LIMIT}. */
					limit: (n) => { writePrefs({ limit: clampLimit(n) }) },
					/** Recent rows shown before that list scrolls (persisted); clamps to {@link MIN_VISIBLE}..{@link MAX_VISIBLE}. */
					view: (n) => { writePrefs({ visible: clampVisible(n) }) },
					/** Fold or unfold the 最近会话 section (persisted). */
					collapse: (flag) => { writePrefs({ collapsed: flag === true }) },
					/** Active rows shown before that list scrolls (persisted); clamps to {@link MIN_VISIBLE}..{@link MAX_VISIBLE}. */
					activeView: (n) => { writePrefs({ activeVisible: clampActiveVisible(n) }) },
					/** Fold or unfold the 活跃会话 section (persisted). */
					collapseActive: (flag) => { writePrefs({ activeCollapsed: flag === true }) },
					/** Pinned rows shown before that list scrolls (persisted); clamps to {@link MIN_VISIBLE}..{@link MAX_VISIBLE}. */
					pinnedView: (n) => { writePrefs({ pinnedVisible: clampPinnedVisible(n) }) },
					/** Fold or unfold the 置顶对话 section (persisted). */
					collapsePinned: (flag) => { writePrefs({ pinnedCollapsed: flag === true }) },
					/** How long a row lingers in 活跃会话, in seconds (persisted); clamps to 0..{@link MAX_LINGER_SECONDS}. */
					linger: (seconds) => { writePrefs({ lingerSeconds: clampLinger(seconds) }) },
					/** Show or hide one section (persisted); `id` is one of {@link SECTION_IDS}. */
					show: (id, flag) => {
						if (!SECTION_IDS.includes(id)) return;
						writePrefs({ hidden: { ...readPrefs().hidden, [id]: flag !== true } });
					},
					/** Fold or unfold the shipped 工作区 section (persisted). */
					collapseWorkspaces: (flag) => { writePrefs({ workspacesCollapsed: flag === true }) },
					/** Reorder the sections (persisted); accepts any permutation of {@link SECTION_IDS}. */
					order: (ids) => { writePrefs({ order: clampOrder(ids) }) },
					/** The injected container of the recent section, for inspecting the placement by hand. */
					container: () => placeContainers().recent,
					/** Every section container this plugin owns. */
					containers: () => placeContainers(),
					/** The sections in the order they currently sit in the column. */
					sections: () => sectionElements().map(section => section.id),
					/** The shipped workspace region this plugin folds, for inspecting the anchors by hand. */
					workspaces: () => workspaceRegion(),
					/** Current preferences. */
					prefs: () => readPrefs(),
				};
			}

			const disposes = [
				slots.inject(SEAT, () => slots.register({
					name: SEAT,
					id: PLUGIN_ID,
					order: 100,
					locale: NS,
					inject: () => ({ openSession, renameSession }),
				}, RecentSessions)),
				// The settings page: every switch there writes this plugin's own
				// preferences, so the sidebar follows it live through PREFS_EVENT.
				slots.inject('settings.section', () => slots.register({
					name: 'settings.section',
					id: PLUGIN_ID,
					order: 30,
					label: () => (locale !== undefined && locale !== null && typeof locale.bind === 'function'
						? locale.bind(NS)('settings.label')
						: 'recent-sessions'),
					locale: NS,
				}, RecentSessionsSettings)),
			];
			return () => {
				for (const dispose of disposes) {
					if (typeof dispose === 'function') dispose();
				}
			};
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
