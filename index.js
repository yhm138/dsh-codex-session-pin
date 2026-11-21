// Host half of dsh-codex-session-pin.
//
// The feature itself lives in the official Workspace registry: `pinSession`,
// `unpinSession` and `pinnedSessionIds` are already implemented and persisted in
// `~/.dsh/storages/workspace.json`. This plugin never keeps a second pin index.
// The Host half only adds:
//
//   1. state / toggle routes, so a Client whose `workspaces` service predates the
//      pin methods still works;
//   2. an opt-in (`config.probe`) diagnostic sink and command channel, used to
//      verify the browser half from the Host side without page automation. Both
//      are off by default and write nothing until enabled.
import { mkdir, appendFile, readFile, rename, stat, truncate, unlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import z from '@deepseek-ai/schemastery'

const STATE_DIR = join(homedir(), '.dsh', 'codex-session-pin')
const DIAG_FILE = join(STATE_DIR, 'diag.jsonl')
const COMMAND_FILE = join(STATE_DIR, 'command.json')
const DIAG_MAX_BYTES = 512 * 1024
const COMMAND_MAX_AGE_MS = 60_000

export const inject = ['webServer']

// The Loader validates a row's config against this schema at activation.
export const Config = z.object({
  probe: z.boolean(),
})

/** Read a JSON body with a hard size cap; malformed input yields `{}`. */
async function readJsonBody(req, limit = 8192) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new Error('request body too large')
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return {}
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

/** Only accept the ids the registry itself would accept. */
function asSessionId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 ? value : undefined
}

export function apply(ctx, config) {
  const probe = config !== undefined && config !== null && config.probe === true
  const disposers = []
  const registry = () => ctx.get('workspaceRegistry')

  disposers.push(
    ctx.webServer.register({
      kind: 'exact',
      path: '/codex-session-pin/state',
      handler: async (_req, res) => {
        const workspaces = registry()
        sendJson(res, 200, {
          ok: true,
          pinnedSessionIds: workspaces === undefined ? [] : [...workspaces.pinnedSessionIds],
        })
      },
    }),
  )

  // Fallback command path for a Client that cannot reach `ctx.workspaces`.
  disposers.push(
    ctx.webServer.register({
      kind: 'exact',
      path: '/codex-session-pin/toggle',
      handler: async (req, res) => {
        const workspaces = registry()
        if (workspaces === undefined) {
          sendJson(res, 503, { ok: false, error: 'workspace registry unavailable' })
          return
        }
        let body
        try {
          body = await readJsonBody(req)
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error && error.message) })
          return
        }
        const sessionId = asSessionId(body.sessionId)
        if (sessionId === undefined) {
          sendJson(res, 400, { ok: false, error: 'sessionId required' })
          return
        }
        try {
          if (body.pinned === true) await workspaces.pinSession(sessionId)
          else await workspaces.unpinSession(sessionId)
        } catch (error) {
          sendJson(res, 409, { ok: false, error: String(error && error.message ? error.message : error) })
          return
        }
        sendJson(res, 200, { ok: true, pinnedSessionIds: [...workspaces.pinnedSessionIds] })
      },
    }),
  )

  // Verification channel. The route always exists so the browser half can tell
  // "disabled" (204) from "missing" (the app shell's HTML); with `probe` off it
  // answers 204 and never touches the filesystem.
  disposers.push(
    ctx.webServer.register({
      kind: 'exact',
      path: '/codex-session-pin/diag',
      handler: async (req, res) => {
        if (!probe) {
          sendJson(res, 204, { ok: true, action: 'disabled' })
          return
        }
        let body
        try {
          body = await readJsonBody(req, 128 * 1024)
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error && error.message) })
          return
        }
        const line = `${JSON.stringify({ at: new Date().toISOString(), ...body })}\n`
        try {
          await mkdir(STATE_DIR, { recursive: true })
          const info = await stat(DIAG_FILE).catch(() => undefined)
          if (info !== undefined && info.size > DIAG_MAX_BYTES) await truncate(DIAG_FILE, 0)
          await appendFile(DIAG_FILE, line, 'utf8')
        } catch {
          // Diagnostics are best-effort: a failed write must never fail the action.
        }
        sendJson(res, 200, { ok: true })
      },
    }),
  )

  // The command file is consumed exactly once (renamed away before reading) and
  // only while fresh, so a stale file can never drive the page later.
  disposers.push(
    ctx.webServer.register({
      kind: 'exact',
      path: '/codex-session-pin/command',
      handler: async (_req, res) => {
        if (!probe) {
          sendJson(res, 204, { ok: true, action: 'disabled' })
          return
        }
        const claimed = `${COMMAND_FILE}.${process.pid}.${Date.now()}.claimed`
        try {
          await rename(COMMAND_FILE, claimed)
        } catch {
          sendJson(res, 200, { ok: true, action: 'none' })
          return
        }
        try {
          const raw = await readFile(claimed, 'utf8')
          const command = JSON.parse(raw)
          const age = Date.now() - Number(command.at ?? 0)
          if (!Number.isFinite(age) || age < 0 || age > COMMAND_MAX_AGE_MS) {
            sendJson(res, 200, { ok: true, action: 'expired' })
            return
          }
          sendJson(res, 200, { ok: true, ...command })
        } catch (error) {
          sendJson(res, 200, { ok: false, action: 'invalid', error: String(error && error.message) })
        } finally {
          await unlink(claimed).catch(() => {})
        }
      },
    }),
  )

  ctx.effect(() => () => {
    for (const dispose of disposers.reverse()) {
      try {
        dispose()
      } catch {
        // A route already torn down by its owner needs no further cleanup.
      }
    }
  }, 'dsh-codex-session-pin: routes')
}
