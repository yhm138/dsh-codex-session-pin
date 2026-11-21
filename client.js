// Browser half of dsh-session-pin.
//
// Two surfaces, one data source (the official Workspace pin set):
//
//   1. A pin toggle in the Session header (`conversation.session.header.utilities`)
//      — a real slot, so it works on any sidebar implementation.
//   2. A DOM enhancement of the session list drawn by a third-party sidebar
//      (currently `@michengai/dsh-codex-ui`, which renders its own rows and never
//      reads the official pin set): a hover pin button, a menu row, a leading
//      marker on pinned rows, and pinned rows ordered first inside their project.
//      Only nodes this plugin created are added or removed, and the ordering uses
//      CSS `order`, so React keeps owning the DOM structure.
//
// Pin state itself is never stored here: it is `ctx.workspaces.pinnedSessionIds`,
// persisted by the Host in `~/.dsh/storages/workspace.json`.
window.__ModuleLoader__.load({
  id: 'dsh-codex-session-pin',
  factory(require) {
    const React = require('react')

    const NS = 'codex-session-pin'
    // Bumped on every edit so a diagnostics report names the code that ran.
    const BUILD = 'v12'
    const EMPTY_IDS = Object.freeze([])
    const ROW_SELECTOR = '[data-dcu-session]'
    const BODY_SELECTOR = '.dcu-wb-project-body'
    const PIN_ATTR = 'data-dcsp-pin'
    const MARK_ATTR = 'data-dcsp-mark'
    const MENU_ATTR = 'data-dcsp-menu'
    const PINNED_ATTR = 'data-dcsp-pinned'
    const ORDER_ATTR = 'data-dcsp-order'

    const ICON_PIN_OUTLINE =
      '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M6 2h4l-.6 3.2 2.1 2.1v1.2H4.5V7.3l2.1-2.1z"/><path d="M8 8.5V14"/></svg>'
    const ICON_PIN_FILLED =
      '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M6 2h4l-.6 3.2 2.1 2.1v1.2H4.5V7.3l2.1-2.1z"/><path d="M8 8.8V14" fill="none" stroke-width="1.4"/></svg>'
    const ICON_PIN_MARK =
      '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">' +
      '<path d="M6 1.5h4a.7.7 0 0 1 .68.87l-.5 2.6 1.9 1.9a.7.7 0 0 1 .2.5v1.1a.7.7 0 0 1-.7.7H4.42a.7.7 0 0 1-.7-.7V7.37c0-.19.07-.36.2-.5l1.9-1.9-.5-2.6A.7.7 0 0 1 6 1.5Z"/>' +
      '<path d="M8 9.2v4.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'

    const CSS = `
.dcsp-mark{display:inline-flex;flex:none;align-items:center;justify-content:center;width:12px;height:12px;color:var(--dsw-alias-brand-primary);opacity:.9}
.dcsp-pin-btn{color:inherit}
.dcsp-pin-btn[data-dcsp-on="1"]{color:var(--dsw-alias-brand-primary)}
/* The extra attribute beats the sidebar's own display:block rule, and the open
   guard keeps a collapsed project collapsed. */
${BODY_SELECTOR}[data-open="true"][${ORDER_ATTR}]{display:flex;flex-direction:column}
${BODY_SELECTOR}[${ORDER_ATTR}] > .dcu-wb-session[${PINNED_ATTR}="1"]{order:-1}
`

    /** String guard shared by every id read from the DOM. */
    function asId(value) {
      return typeof value === 'string' && value.length > 0 ? value : undefined
    }

    function postDiag(payload) {
      try {
        fetch('/codex-session-pin/diag', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
        }).catch(() => {})
      } catch {
        // Diagnostics never affect the user action.
      }
    }

    /** Wait without animation frames: a hidden window produces none. */
    function sleep(ms) {
      return new Promise((resolve) => window.setTimeout(resolve, ms))
    }

    function applyInner(ctx) {
        const disposers = []
        postDiag({ kind: 'client-boot', build: BUILD, url: typeof window !== 'undefined' ? window.location.href : '' })
        const workspaces = () => {
          try {
            return ctx.get('workspaces')
          } catch {
            return undefined
          }
        }
        const pinnedIds = () => {
          const service = workspaces()
          const list = service === undefined ? undefined : service.list
          if (list === undefined || typeof list.getSnapshot !== 'function') return EMPTY_IDS
          const snapshot = list.getSnapshot()
          return snapshot && Array.isArray(snapshot.pinnedSessionIds) ? snapshot.pinnedSessionIds : EMPTY_IDS
        }
        const isPinned = (sessionId) => pinnedIds().indexOf(sessionId) !== -1
        const t = (key, params) => {
          try {
            return ctx.locale.bind(NS)(key, params)
          } catch {
            return key
          }
        }

        // A duplicate namespace registration throws, and a hot reload loads this
        // half again in the same page; a failed dictionary must never prevent the
        // surfaces from mounting, so it is caught and reported.
        disposers.push(
          ctx.effect(() => {
            try {
              return ctx.locale.register(NS, {
                zh: {
                  pin: '置顶会话',
                  unpin: '取消置顶',
                  pinned: '已置顶',
                },
                en: {
                  pin: 'Pin session',
                  unpin: 'Unpin session',
                  pinned: 'Pinned',
                },
              })
            } catch (error) {
              postDiag({ kind: 'locale-failed', build: BUILD, message: String((error && error.message) || error) })
              return () => {}
            }
          }, 'dsh-codex-session-pin: dictionaries'),
        )

        // Assigned by the list surface below; the header surface only needs it to
        // ask the list surfaces for a refresh after a mutation.
        let scheduleSync = () => {}

        /**
         * Change one Session's pin state through the official Client service,
         * falling back to this bundle's Host route only when that service is
         * absent or predates the pin methods.
         */
        async function setPinned(sessionId, nextPinned) {
          const service = workspaces()
          const viaService =
            service !== undefined &&
            typeof service.pinSession === 'function' &&
            typeof service.unpinSession === 'function'
          try {
            postDiag({ kind: 'action-start', sessionId, pinned: nextPinned, viaService })
            const startedAt = Date.now()
            if (viaService) {
              if (nextPinned) await service.pinSession(sessionId)
              else await service.unpinSession(sessionId)
              postDiag({ kind: 'action', via: 'workspaces', sessionId, pinned: nextPinned, ms: Date.now() - startedAt })
            } else {
              const response = await fetch('/codex-session-pin/toggle', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ sessionId, pinned: nextPinned }),
              })
              const payload = await response.json().catch(() => null)
              if (!response.ok || payload === null || payload.ok !== true) {
                throw new Error((payload && payload.error) || 'request failed (' + response.status + ')')
              }
              postDiag({ kind: 'action', via: 'host-route', sessionId, pinned: nextPinned })
            }
            scheduleSync()
          } catch (error) {
            const message = String((error && error.message) || error)
            postDiag({ kind: 'action-failed', sessionId, pinned: nextPinned, message })
            throw error
          }
        }

        // ---- surface 1: Session header toggle -------------------------------
        function PinHeaderButton(props) {
          const sessionId = asId(props.sessionId)
          const ids = React.useSyncExternalStore(
            (listener) => {
              const service = workspaces()
              const list = service === undefined ? undefined : service.list
              if (list === undefined || typeof list.subscribe !== 'function') return () => {}
              return list.subscribe(listener)
            },
            pinnedIds,
            () => EMPTY_IDS,
          )
          const [busy, setBusy] = React.useState(false)
          if (sessionId === undefined) return null
          const pinned = ids.indexOf(sessionId) !== -1
          const label = pinned ? t('unpin') : t('pin')
          const onClick = (event) => {
            event.preventDefault()
            event.stopPropagation()
            if (busy) return
            setBusy(true)
            setPinned(sessionId, !pinned)
              .catch(() => {})
              .finally(() => setBusy(false))
          }
          return React.createElement(
            'button',
            {
              type: 'button',
              className: 'dcsp-pin-btn',
              'data-dcsp-on': pinned ? '1' : '0',
              'data-dcsp-header': '',
              'aria-label': label,
              'aria-pressed': pinned,
              title: label,
              disabled: busy,
              onClick,
              style: {
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 26,
                height: 26,
                padding: 0,
                border: 'none',
                borderRadius: 6,
                background: 'transparent',
                color: pinned ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-label-secondary)',
                cursor: busy ? 'default' : 'pointer',
                opacity: busy ? 0.6 : 1,
              },
            },
            React.createElement('span', {
              style: { display: 'inline-flex' },
              dangerouslySetInnerHTML: { __html: pinned ? ICON_PIN_FILLED : ICON_PIN_OUTLINE },
            }),
          )
        }

        disposers.push(
          ctx.slots.inject('conversation.session.header.utilities', () =>
            ctx.slots.register(
              {
                name: 'conversation.session.header.utilities',
                id: 'codex-session-pin',
                order: 5,
                locale: NS,
              },
              PinHeaderButton,
            ),
          ),
        )

        // ---- surface 2: session list DOM enhancement ------------------------
        let styleElement
        let frame = 0
        // Every node this generation injected, so cleanup touches nothing a
        // newer generation of the same plugin owns.
        const owned = new Set()
        const stats = { syncs: 0, rows: 0, pinnedRows: 0, pinButtons: 0, menus: 0, orderedGroups: 0, lastReport: '' }

        if (typeof document !== 'undefined') {
          try {
          styleElement = document.createElement('style')
          styleElement.setAttribute('data-dcsp', '')
          styleElement.textContent = CSS
          document.head.appendChild(styleElement)

          const makePinButton = (sessionId, pinned, template) => {
            const button = document.createElement('button')
            button.type = 'button'
            button.className = (template && template.className ? template.className + ' ' : '') + 'dcsp-pin-btn'
            button.setAttribute(PIN_ATTR, sessionId)
            button.setAttribute('data-dcsp-on', pinned ? '1' : '0')
            const label = pinned ? t('unpin') : t('pin')
            button.setAttribute('aria-label', label)
            button.setAttribute('aria-pressed', pinned ? 'true' : 'false')
            button.title = label
            button.innerHTML = pinned ? ICON_PIN_FILLED : ICON_PIN_OUTLINE
            button.addEventListener('click', (event) => {
              event.preventDefault()
              event.stopPropagation()
              setPinned(sessionId, !isPinned(sessionId)).catch(() => {})
            })
            owned.add(button)
            return button
          }

          const syncRow = (row, pinnedSet, pinRank) => {
            const sessionId = asId(row.getAttribute('data-dcu-session'))
            if (sessionId === undefined) return false
            const pinned = pinnedSet.has(sessionId)
            const flag = pinned ? '1' : '0'
            if (row.getAttribute(PINNED_ATTR) !== flag) row.setAttribute(PINNED_ATTR, flag)
            // Rank pinned rows in the official pin order (most recently pinned
            // first). Only this element's own inline property is written, so
            // removal restores the sidebar's own layout exactly.
            if (pinned) {
              const rank = pinRank.get(sessionId)
              const order = String(-1000 + (rank === undefined ? 0 : rank))
              if (row.style.order !== order) row.style.order = order
            } else if (row.style.order !== '') {
              row.style.removeProperty('order')
            }

            const existingMark = row.querySelector(':scope > [' + MARK_ATTR + ']')
            if (pinned && existingMark === null) {
              const mark = document.createElement('span')
              mark.className = 'dcsp-mark'
              mark.setAttribute(MARK_ATTR, '')
              mark.setAttribute('aria-hidden', 'true')
              mark.title = t('pinned')
              mark.innerHTML = ICON_PIN_MARK
              owned.add(mark)
              row.insertBefore(mark, row.firstChild)
            } else if (!pinned && existingMark !== null && owned.has(existingMark)) {
              owned.delete(existingMark)
              existingMark.remove()
            }

            const quick = row.querySelector('.dcu-wb-quick-actions')
            if (quick !== null) {
              let existing = quick.querySelector(':scope > [' + PIN_ATTR + ']')
              // A button injected by an earlier generation of this plugin is
              // replaced rather than adopted, so the two never both own it.
              if (existing !== null && !owned.has(existing)) {
                existing.remove()
                existing = null
              }
              if (existing === null) {
                const proto = quick.querySelector('button')
                if (proto !== null) quick.insertBefore(makePinButton(sessionId, pinned, proto), quick.firstChild)
              } else if (existing.getAttribute('data-dcsp-on') !== flag) {
                const label = pinned ? t('unpin') : t('pin')
                existing.setAttribute('data-dcsp-on', flag)
                existing.setAttribute('aria-pressed', pinned ? 'true' : 'false')
                existing.setAttribute('aria-label', label)
                existing.title = label
                existing.innerHTML = pinned ? ICON_PIN_FILLED : ICON_PIN_OUTLINE
              }
            }
            return pinned
          }

          const syncGroup = (body, pinnedSet) => {
            let hasPinned = false
            for (const row of body.children) {
              if (!(row instanceof HTMLElement) || !row.matches(ROW_SELECTOR)) continue
              const sessionId = asId(row.getAttribute('data-dcu-session'))
              if (sessionId !== undefined && pinnedSet.has(sessionId)) {
                hasPinned = true
                break
              }
            }
            if (hasPinned) {
              if (!body.hasAttribute(ORDER_ATTR)) body.setAttribute(ORDER_ATTR, '')
            } else if (body.hasAttribute(ORDER_ATTR)) {
              body.removeAttribute(ORDER_ATTR)
            }
            return hasPinned
          }

          /** Add the pin row to the open Session menu. */
          const syncMenu = (pinnedSet) => {
            const row = document.querySelector(ROW_SELECTOR + '.dcu-wb-menu-open')
            if (row === null) return
            const sessionId = asId(row.getAttribute('data-dcu-session'))
            if (sessionId === undefined) return
            let menu
            for (const candidate of document.querySelectorAll('[role="menu"]')) {
              if (candidate.hasAttribute('data-dsm-sub')) continue
              const rect = candidate.getBoundingClientRect()
              if (rect.width > 0 && rect.height > 0) menu = candidate
            }
            if (menu === undefined || menu.querySelector('[' + MENU_ATTR + ']') !== null) return
            const proto = menu.querySelector('[role="menuitem"]')
            if (proto === null) return
            const viewport = menu.querySelector('[role="presentation"]') || menu.firstElementChild
            if (viewport === null) return
            const pinned = pinnedSet.has(sessionId)
            const wrap = proto.parentElement ? proto.parentElement.cloneNode(false) : document.createElement('div')
            if (proto.parentElement && proto.parentElement.className) wrap.className = proto.parentElement.className
            const item = document.createElement('button')
            item.type = 'button'
            item.setAttribute('role', 'menuitem')
            item.className = proto.className
            item.setAttribute(MENU_ATTR, '')
            const icon = document.createElement('span')
            icon.style.cssText =
              'display:inline-flex;flex:none;width:16px;height:16px;align-items:center;justify-content:center;color:' +
              (pinned ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-label-secondary)')
            icon.innerHTML = pinned ? ICON_PIN_FILLED : ICON_PIN_OUTLINE
            const label = document.createElement('span')
            label.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'
            label.textContent = pinned ? t('unpin') : t('pin')
            item.appendChild(icon)
            item.appendChild(label)
            item.addEventListener('click', (event) => {
              event.preventDefault()
              event.stopPropagation()
              document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
              setPinned(sessionId, !pinned).catch(() => {})
            })
            wrap.appendChild(item)
            owned.add(wrap)
            viewport.insertBefore(wrap, viewport.firstElementChild)
            stats.menus += 1
            postDiag({ kind: 'menu-injected', build: BUILD, sessionId, pinned })
          }

          /** What the page currently contains, so a report names real selectors. */
          const census = () => ({
            kind: 'census',
            url: window.location.href,
            viewport: { w: window.innerWidth, h: window.innerHeight },
            rows: document.querySelectorAll(ROW_SELECTOR).length,
            codexSessions: document.querySelectorAll('.dcu-wb-session').length,
            projectBodies: document.querySelectorAll(BODY_SELECTOR).length,
            treeitems: document.querySelectorAll('[role="treeitem"]').length,
            asides: document.querySelectorAll('aside').length,
            pinButtons: document.querySelectorAll('[' + PIN_ATTR + ']').length,
            marks: document.querySelectorAll('[' + MARK_ATTR + ']').length,
            headerButtons: document.querySelectorAll('[data-dcsp-header]').length,
            pinnedIds: pinnedIds(),
            hasWorkspacesService: workspaces() !== undefined && typeof workspaces().pinSession === 'function',
          })

          /** Visual order per project: pinned rows first, with the CSS in effect. */
          const rowsReport = () => {
            const groups = []
            for (const body of document.querySelectorAll(BODY_SELECTOR)) {
              const head = body.parentElement === null ? null : body.parentElement.querySelector('.dcu-wb-project-head')
              const nodes = [...body.querySelectorAll(':scope > ' + ROW_SELECTOR)]
              const ordered = nodes
                .map((node) => ({
                  node,
                  order: Number.parseFloat(window.getComputedStyle(node).order) || 0,
                  top: Math.round(node.getBoundingClientRect().top),
                }))
                .sort((left, right) => left.order - right.order || left.top - right.top)
              groups.push({
                project: head === null ? '' : (head.textContent || '').trim().slice(0, 24),
                ordered: body.hasAttribute(ORDER_ATTR),
                display: window.getComputedStyle(body).display,
                count: nodes.length,
                first: ordered.slice(0, 3).map((entry) => ({
                  id: String(entry.node.getAttribute('data-dcu-session')).slice(-8),
                  pinned: entry.node.getAttribute(PINNED_ATTR) === '1',
                  mark: entry.node.querySelector('[' + MARK_ATTR + ']') !== null,
                  button: entry.node.querySelector('[' + PIN_ATTR + ']') !== null,
                  order: entry.order,
                  top: entry.top,
                })),
              })
            }
            return { kind: 'rows', pinnedIds: pinnedIds(), groups }
          }

          /** Everything about one Session row: flags, injected nodes and siblings. */
          const rowInfo = (sessionId) => {
            const row = document.querySelector('[data-dcu-session="' + sessionId + '"]')
            if (row === null) return { kind: 'row', sessionId, found: false, pinned: isPinned(sessionId) }
            const body = row.closest(BODY_SELECTOR)
            const siblings = body === null ? [] : [...body.querySelectorAll(':scope > ' + ROW_SELECTOR)]
            const head = body === null || body.parentElement === null ? null : body.parentElement.querySelector('.dcu-wb-project-head')
            const button = row.querySelector('[' + PIN_ATTR + ']')
            return {
              kind: 'row',
              sessionId,
              found: true,
              pinned: isPinned(sessionId),
              rowFlag: row.getAttribute(PINNED_ATTR),
              mark: row.querySelector(':scope > [' + MARK_ATTR + ']') !== null,
              button: button !== null,
              buttonOn: button === null ? null : button.getAttribute('data-dcsp-on'),
              title: (row.querySelector('.dcu-wb-session-title-text') || {}).textContent || '',
              project: head === null ? '' : (head.textContent || '').trim().slice(0, 32),
              groupOrdered: body !== null && body !== undefined && body.hasAttribute(ORDER_ATTR),
              groupDisplay: body === null ? null : window.getComputedStyle(body).display,
              index: siblings.indexOf(row),
              order: Number.parseFloat(window.getComputedStyle(row).order) || 0,
              firstPinnedIndex: siblings.findIndex((node) => node.getAttribute(PINNED_ATTR) === '1'),
              firstUnpinnedIndex: siblings.findIndex((node) => node.getAttribute(PINNED_ATTR) !== '1'),
            }
          }

          /** Full session ids in visual order, so a probe can address an exact row. */
          const idsReport = () => {
            const rows = [...document.querySelectorAll(ROW_SELECTOR)]
              .map((node) => {
                const rect = node.getBoundingClientRect()
                return {
                  id: node.getAttribute('data-dcu-session'),
                  order: Number.parseFloat(window.getComputedStyle(node).order) || 0,
                  top: Math.round(rect.top),
                  onScreen: rect.height > 0 && rect.top > 0 && rect.top < window.innerHeight,
                }
              })
              .sort((left, right) => left.order - right.order || left.top - right.top)
            return { kind: 'ids', count: rows.length, rows: rows.slice(0, 10) }
          }

          const sync = () => {
            frame = 0
            if (!document.head.contains(styleElement)) document.head.appendChild(styleElement)
            const ids = pinnedIds()
            const pinnedSet = new Set(ids)
            const pinRank = new Map(ids.map((id, index) => [id, index]))
            let rows = 0
            let pinnedRows = 0
            let buttons = 0
            for (const row of document.querySelectorAll(ROW_SELECTOR)) {
              if (syncRow(row, pinnedSet, pinRank)) pinnedRows += 1
              if (row.querySelector('[' + PIN_ATTR + ']') !== null) buttons += 1
              rows += 1
            }
            let orderedGroups = 0
            for (const body of document.querySelectorAll(BODY_SELECTOR)) if (syncGroup(body, pinnedSet)) orderedGroups += 1
            syncMenu(pinnedSet)
            stats.syncs += 1
            stats.rows = rows
            stats.pinnedRows = pinnedRows
            stats.pinButtons = buttons
            stats.orderedGroups = orderedGroups
            const report = rows + '/' + buttons + '/' + pinnedRows + '/' + orderedGroups
            if (report !== stats.lastReport) {
              stats.lastReport = report
              postDiag({ kind: 'sync', rows, pinButtons: buttons, pinnedRows, orderedGroups })
            }
          }

          const scheduleSyncFrame = () => {
            if (frame !== 0) return
            frame = window.setTimeout(runSync, 16)
          }
          scheduleSync = scheduleSyncFrame

          // A thrown sync must never leave the list half-done or kill the
          // observer chain: report it once and re-arm on the next mutation.
          let lastFailure = ''
          function runSync() {
            try {
              sync()
            } catch (error) {
              const message = String((error && error.stack) || error).slice(0, 400)
              if (message !== lastFailure) {
                lastFailure = message
                postDiag({ kind: 'sync-failed', build: BUILD, message })
              }
              frame = 0
            }
          }

          const observer = new MutationObserver(scheduleSyncFrame)
          observer.observe(document.body, { childList: true, subtree: true })
          disposers.push(() => observer.disconnect())

          // React-driven pin changes need not mutate the sidebar DOM, so the
          // official store is observed too.
          const subscribeStore = () => {
            const service = workspaces()
            const list = service === undefined ? undefined : service.list
            if (list === undefined || typeof list.subscribe !== 'function') return undefined
            return list.subscribe(scheduleSyncFrame)
          }
          let unsubscribeStore = subscribeStore()
          const retry = window.setInterval(() => {
            if (unsubscribeStore !== undefined) {
              window.clearInterval(retry)
              return
            }
            unsubscribeStore = subscribeStore()
          }, 1000)
          disposers.push(() => {
            window.clearInterval(retry)
            if (unsubscribeStore !== undefined) unsubscribeStore()
          })

          // Generation-safe teardown: remove only the nodes this generation
          // created, and strip only the attributes it set, so a newer generation
          // of the same plugin (a hot reload) keeps working.
          disposers.push(() => {
            if (frame !== 0) window.clearTimeout(frame)
            for (const node of owned) node.remove()
            owned.clear()
            for (const node of document.querySelectorAll('[' + PINNED_ATTR + ']')) node.removeAttribute(PINNED_ATTR)
            for (const node of document.querySelectorAll('[' + ORDER_ATTR + ']')) node.removeAttribute(ORDER_ATTR)
            for (const node of document.querySelectorAll(ROW_SELECTOR)) {
              if (node.style && node.style.order !== '') node.style.removeProperty('order')
            }
            if (styleElement && styleElement.parentNode) styleElement.remove()
          })

          /**
           * End-to-end check of this plugin's own action path: pin through the
           * same call the buttons make, read the DOM back, unpin, read again.
           */
          const selfTest = async (sessionId) => {
            const before = pinnedIds().slice()
            const result = { kind: 'self-test', build: BUILD, sessionId, before }
            try {
              await setPinned(sessionId, true)
              await sleep(400)
              scheduleSyncFrame()
              await sleep(400)
              const row = document.querySelector('[data-dcu-session="' + sessionId + '"]')
              result.pinnedAfterPin = isPinned(sessionId)
              result.markAfterPin = row !== null && row.querySelector('[' + MARK_ATTR + ']') !== null
              result.rowFlagAfterPin = row === null ? null : row.getAttribute(PINNED_ATTR)
              result.rowOrderAfterPin = row === null ? null : row.style.order
              const body = row === null ? null : row.closest(BODY_SELECTOR)
              result.groupOrdered = body !== null && body !== undefined && body.hasAttribute(ORDER_ATTR)
              const button = row === null ? null : row.querySelector('[' + PIN_ATTR + ']')
              result.buttonPresent = button !== null
              result.buttonOn = button === null ? null : button.getAttribute('data-dcsp-on')
              await setPinned(sessionId, false)
              await sleep(400)
              scheduleSyncFrame()
              await sleep(400)
              const rowAfter = document.querySelector('[data-dcu-session="' + sessionId + '"]')
              result.pinnedAfterUnpin = isPinned(sessionId)
              result.markAfterUnpin = rowAfter !== null && rowAfter.querySelector('[' + MARK_ATTR + ']') !== null
              result.rowOrderAfterUnpin = rowAfter === null ? null : rowAfter.style.order
              result.restored = JSON.stringify(pinnedIds().slice()) === JSON.stringify(before)
              result.ok =
                result.pinnedAfterPin === true &&
                result.markAfterPin === true &&
                result.rowOrderAfterPin !== '' &&
                result.groupOrdered === true &&
                result.pinnedAfterUnpin === false &&
                result.markAfterUnpin === false &&
                result.rowOrderAfterUnpin === '' &&
                result.restored === true
            } catch (error) {
              result.ok = false
              result.error = String((error && error.message) || error)
            }
            postDiag(result)
            return result
          }

          window.__dshCodexSessionPin = {
            version: 1,
            pinnedIds,
            isPinned,
            setPinned,
            selfTest,
            census,
            rowsReport,
            rowInfo,
            idsReport,
            sync: scheduleSyncFrame,
            stats,
            hasWorkspacesService: () => workspaces() !== undefined && typeof workspaces().pinSession === 'function',
          }

          scheduleSyncFrame()
          // Deferred reports are cancelled on unload: a timer that outlives the
          // surfaces would read a global this plugin already deleted.
          let disposed = false
          disposers.push(() => {
            disposed = true
          })
          const readyTimer = window.setTimeout(() => {
            if (disposed) return
            postDiag({
              kind: 'client-ready',
              build: BUILD,
              url: window.location.href,
              hasWorkspacesService: workspaces() !== undefined && typeof workspaces().pinSession === 'function',
              rows: stats.rows,
              pinButtons: stats.pinButtons,
              pinnedIds: pinnedIds(),
            })
          }, 600)
          disposers.push(() => window.clearTimeout(readyTimer))

          // Same-origin fetch of this plugin's own Host route. The Host renames a
          // live command file away before reading it, so each command runs at
          // most once. The Host answers `disabled` when its Config leaves `probe`
          // off, and polling stops for this page at once: an installed release
          // performs no recurring work. Otherwise the window closes a few minutes
          // after load.
          let running = false
          const deadline = Date.now() + 10 * 60 * 1000
          const poll = window.setInterval(async () => {
            if (running) return
            if (Date.now() > deadline) {
              window.clearInterval(poll)
              return
            }
            running = true
            try {
              const response = await fetch('/codex-session-pin/command', { cache: 'no-store' })
              if (response.status === 204) {
                window.clearInterval(poll)
                return
              }
              if (response.ok) {
                const raw = await response.text()
                let command
                try {
                  command = JSON.parse(raw)
                } catch {
                  command = undefined
                }
                const action = command === undefined ? undefined : command.action
                if (action !== undefined && action !== 'none' && action !== 'disabled') {
                  postDiag({ kind: 'command-received', build: BUILD, action })
                  // Commands are matched case-insensitively so a hand-written
                  // command file cannot fail on capitalisation alone.
                  const wanted = String(action).toLowerCase()
                  try {
                    if (wanted === 'selftest' && typeof command.sessionId === 'string') {
                      await selfTest(command.sessionId)
                    } else if (wanted === 'census') {
                      postDiag(census())
                    } else if (wanted === 'rows') {
                      postDiag(rowsReport())
                    } else if (wanted === 'row' && typeof command.sessionId === 'string') {
                      postDiag(rowInfo(command.sessionId))
                    } else if (wanted === 'ids') {
                      postDiag(idsReport())
                    } else if (wanted === 'sync') {
                      scheduleSyncFrame()
                      postDiag({ kind: 'client-sync-on-demand', rows: stats.rows, pinButtons: stats.pinButtons })
                    } else {
                      postDiag({ kind: 'command-unknown', action })
                    }
                  } catch (error) {
                    postDiag({ kind: 'command-error', action, message: String((error && error.message) || error) })
                  }
                }
              }
            } catch {
              // A refused probe is not an error state for the user's session.
            } finally {
              running = false
            }
          }, 1500)
          disposers.push(() => window.clearInterval(poll))
          } catch (fatal) {
            postDiag({ kind: 'list-surface-failed', build: BUILD, message: String((fatal && fatal.stack) || fatal).slice(0, 600) })
          }
        }

        ctx.effect(() => () => {
          for (const dispose of disposers.reverse()) {
            try {
              dispose()
            } catch {
              // A surface already torn down by its owner needs no cleanup.
            }
          }
          try {
            delete window.__dshCodexSessionPin
          } catch {
            // A non-configurable global is left in place; it is inert.
          }
        }, 'dsh-codex-session-pin: surfaces')
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        // A failure anywhere below becomes a diagnostic line: the page console is
        // not visible to support, and a silently blank surface is the worst outcome.
        try {
          applyInner(ctx)
        } catch (error) {
          postDiag({ kind: 'apply-failed', build: BUILD, message: String((error && error.stack) || error).slice(0, 600) })
          throw error
        }
      },
    }
  },
})
