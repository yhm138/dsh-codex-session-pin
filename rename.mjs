// One-shot rename of the browser half's identifiers for the published package.
import { readFileSync, writeFileSync } from 'node:fs'

const target = process.argv[2]
let source = readFileSync(target, 'utf8')

const pairs = [
  ["id: 'dsh-session-pin'", "id: 'dsh-codex-session-pin'"],
  ["const NS = 'session-pin'", "const NS = 'codex-session-pin'"],
  ['/session-pin/diag', '/codex-session-pin/diag'],
  ['/session-pin/toggle', '/codex-session-pin/toggle'],
  ['/session-pin/command', '/codex-session-pin/command'],
  ["dsh-session-pin: ", "dsh-codex-session-pin: "],
  ['data-dsp-pin', 'data-dcsp-pin'],
  ['data-dsp-mark', 'data-dcsp-mark'],
  ['data-dsp-menu', 'data-dcsp-menu'],
  ['data-dsp-pinned', 'data-dcsp-pinned'],
  ['data-dsp-order', 'data-dcsp-order'],
  ['data-dsp-on', 'data-dcsp-on'],
  ['data-dsp-header', 'data-dcsp-header'],
  ["'data-dsp'", "'data-dcsp'"],
  ['dsp-pin-btn', 'dcsp-pin-btn'],
  ['dsp-mark', 'dcsp-mark'],
  ['window.__dshSessionPin', 'window.__dshCodexSessionPin'],
  ["id: 'session-pin',", "id: 'codex-session-pin',"],
]

let applied = 0
const missing = []
for (const [from, to] of pairs) {
  if (source.includes(from)) {
    source = source.split(from).join(to)
    applied += 1
  } else {
    missing.push(from)
  }
}

writeFileSync(target, source, 'utf8')
console.log('applied:', applied, '/', pairs.length)
if (missing.length) console.log('not found (already renamed or absent):', missing.join(' | '))

const remaining = {
  oldId: source.includes("'dsh-session-pin'"),
  oldRoute: source.includes('/session-pin/'),
  oldAttr: source.includes('data-dsp'),
}
console.log('residual old identifiers:', JSON.stringify(remaining))
console.log('build marker:', (source.match(/const BUILD = '([^']+)'/) || [])[1])
