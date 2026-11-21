# Verifying the browser half

The Client half draws into the running page, so a Host-only check cannot tell you whether it works. Two things are checked: that the code loads and tears down cleanly, and that a real pin/unpin changes the page.

## 1. Offline load and teardown

`test/harness.mjs` runs the Client half against a minimal DOM stub, calls `apply()`, then runs every disposer the framework would run on unload:

```sh
node test/harness.mjs
```

Expected:

```json
{ "apply": { "ok": true }, "teardown": "ok", "cleanups": 3 }
```

A failure here means the module throws on load or leaks on unload; neither needs a browser to reproduce.

## 2. End to end in the running page

The Host half has an opt-in verification channel, off by default. Enable it in your own profile patch layer (not in the installed package):

```yaml
- id: codex-session-pin
  config:
    probe: true
```

Restart the Harness and reload the page. The browser half then polls `GET /codex-session-pin/command` for a few minutes after load, and the Host consumes a command file exactly once and only while it is fresh.

Write a command (UTF-8 **without BOM** — a BOM makes the JSON parse fail):

```json
{ "action": "selftest", "at": 1795236247976, "sessionId": "session-…" }
```

to `~/.dsh/codex-session-pin/command.json`. Available actions:

| Action | Result written to `diag.jsonl` |
| --- | --- |
| `census` | Selector counts on the page: rows, pin buttons, marks, header buttons, current pin set |
| `rows` | Per project: whether ordering is active, computed `display`, and the first rows with their `order` |
| `row` + `sessionId` | One row: flag, mark, button, project, index, computed `order` |
| `ids` | Full Session ids in visual order |
| `selftest` + `sessionId` | Pins through the same call the buttons use, reads the DOM back, unpins, reads back, restores the original set |
| `sync` | Forces one reconciliation pass |

`selftest` reports `ok: true` only when all of these hold: the Session is pinned, the mark is present, the row carries an `order`, the project is ordered, and after unpinning the mark, the `order` and the pin set are back to their starting state.

Read the results:

```sh
# PowerShell
Get-Content "$env:USERPROFILE\.dsh\codex-session-pin\diag.jsonl" -Tail 10
```

## 3. Persistence

Pinning must survive a restart, so check the official file rather than the UI:

```sh
node -e "const d=require(process.env.USERPROFILE+'/.dsh/storages/workspace.json');console.log(d.global.pinnedSessionIds)"
```

The id must appear there while the Session is pinned, and be gone after unpinning. This plugin has no pin state of its own to check.

## What these checks do not establish

They confirm behaviour, not appearance. The pin button's size, spacing and colour beside the host's own controls still need a look, in both light and dark themes.
