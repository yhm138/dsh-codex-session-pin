# dsh-codex-session-pin

Pin and unpin DeepSeek Harness Sessions, and keep pinned Sessions at the top of their project in the sidebar.

English | [简体中文](README.zh.md)

## Why this exists

DeepSeek Harness already ships Session pinning in its Host: `workspaceRegistry.pinSession()` / `unpinSession()` persist a `pinnedSessionIds` set in `~/.dsh/storages/workspace.json`, and the shipped sidebar reads it.

That shipped UI is bypassed as soon as a third-party plugin replaces the `sidebar` slot. [`@michengai/dsh-codex-ui`](https://github.com/MichengAI/dsh-codex-ui) does exactly that: it draws its own Session rows, never reads `pinnedSessionIds`, and does not render the shipped `sidebar.workspaces.session.menu.item` rows — so the built-in pin action disappears from the interface while the data layer still works.

This plugin restores the action on top of the official data:

- a pin toggle in the Session header (a real `conversation.session.header.utilities` slot entry, so it works under any sidebar)
- a pin button on each sidebar Session row, plus a “pin / unpin” row in the row’s `⋯` menu
- a pin marker on pinned rows, and pinned rows ordered ahead of the rest inside their project

## What it does not do

- It does not store pin state. The pin set is the official workspace registry's `pinnedSessionIds`; this plugin has no index file of its own, so it cannot drift from the Host, and a Session pinned here shows up pinned in any other surface that reads the official set.
- It does not take over the sidebar, change row order in React state, or rewrite another plugin's markup. Ordering uses a per-row `order` with the project container switched to `display: flex`; removing the pin removes that inline property, and uninstalling the plugin restores the sidebar's own layout.
- It does not read or write any other plugin's data.

## Requirements

- DeepSeek Harness Host `0.2.1-rc.2` or newer within `0.2.x`.
- A sidebar that either ships the official pin action (nothing to do — the header toggle still works) or is `@michengai/dsh-codex-ui` (the row buttons apply).

## Install

```sh
dsh plugin add dsh-codex-session-pin
```

Or point the plugin manager at the package:

```sh
dsh plugin add npm:dsh-codex-session-pin
```

Restart the Harness after installing; the browser half is a Client module, so a page refresh is needed for it to load.

## Usage

| Where | What |
| --- | --- |
| Session header, right side | A pin button. Click to pin, click again to unpin. |
| Sidebar Session row, on hover | A pin button next to the row’s other quick actions. |
| Sidebar Session row `⋯` menu | “Pin session” / “Unpin session”. |

A pinned Session leads its project and carries a pin mark before its title. Relative order among pinned Sessions follows the official pin order (most recently pinned first).

## Configuration

The plugin has one option, and a normal install does not need it:

```yaml
- id: codex-session-pin
  config:
    probe: true
```

`probe` turns on the verification channel described in [docs/verification.md](docs/verification.md): a JSONL diagnostic sink and a one-shot command channel under `~/.dsh/codex-session-pin/`, used to drive the running page’s own action path when no page automation is available. It is off by default and writes nothing until enabled; with it off the client detects the disabled route and stops polling.

## Routes

The Host half serves three read/write routes on the Harness web server:

| Route | Purpose |
| --- | --- |
| `POST /codex-session-pin/state` | The current `pinnedSessionIds`. |
| `POST /codex-session-pin/toggle` | Fallback pin/unpin for a Client whose `workspaces` service lacks the pin methods. |
| `GET|POST /codex-session-pin/diag`, `/codex-session-pin/command` | The opt-in verification channel; `204 disabled` unless `probe: true`. |

The normal path never uses the toggle route: the browser half calls `ctx.workspaces.pinSession()` / `unpinSession()` directly and keeps the Host route only as a compatibility fallback.

## Compatibility

- Pin state and the official UI share one source of truth, so this plugin is safe to install beside other Session tools. It does not touch `dsh-sessions-manager`’s `star.json` (starred ≠ pinned: that plugin’s star is a separate “favorites” index with its own schema).
- Row enhancement reads only `data-dcu-session`, `.dcu-wb-project-body` and `.dcu-wb-quick-actions` — attributes and classes the sidebar plugin itself publishes — and inserts only nodes this plugin created.
- Every injected node is tracked per plugin generation, so a hot reload does not remove the nodes of a newer generation, and unloading the plugin removes exactly its own nodes.
- If the sidebar implementation changes so those hooks disappear, the row buttons simply do not appear; the Session header toggle keeps working, and no error state is left behind.

## Files

```
index.js            Host half: state / toggle routes, opt-in verification channel
client.js           Client half: header toggle + sidebar row enhancement
cordis.patch.yml    Bundle patch: one plugin row
locale/{en,zh}.json Plugin manager display metadata
icon.svg            Plugin icon
docs/verification.md How the browser half is verified end to end
```

## License

MIT
