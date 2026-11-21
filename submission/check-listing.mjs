// Is dsh-codex-session-pin listed yet, and what is still missing?
//
//   node check-listing.mjs
//
// Read-only: checks npm, the GitHub repo, the three catalog indexes, and the
// submission PR. Prints one compact status block; exit code 0 when listed and
// 1 when not, so a scheduled run can tell the two apart at a glance.
import { execFileSync } from 'node:child_process'

const PKG = 'dsh-codex-session-pin'
const REPO = 'yhm138/dsh-codex-session-pin'
const INDEXES = [
  'https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json',
  'https://bruc3van.com/dsh-plugins/index.json',
  'https://awesome-dsh-plugin.com/index.json',
]

async function fetchJson(url, timeoutMs = 20000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { 'cache-control': 'no-cache' } })
    if (!response.ok) return { ok: false, status: response.status }
    return { ok: true, body: await response.json() }
  } catch (error) {
    return { ok: false, error: String((error && error.message) || error) }
  } finally {
    clearTimeout(timer)
  }
}

const lines = []
let listedIn = 0
let checkedIndexes = 0

// 1. npm
const registry = await fetchJson(`https://registry.npmjs.org/${PKG}`)
if (registry.ok) {
  const versions = Object.keys(registry.body.versions || {})
  const latest = registry.body['dist-tags']?.latest
  lines.push(`npm          : ${PKG}@${latest ?? '?'} (${versions.length} version(s): ${versions.join(', ')})`)
} else {
  lines.push(`npm          : unavailable (${registry.status ?? registry.error})`)
}

// 2. GitHub repo age, which the catalog's CI gates on
let ageLine = 'GitHub       : unavailable'
try {
  const repo = await fetchJson(`https://api.github.com/repos/${REPO}`)
  if (repo.ok) {
    const created = new Date(repo.body.created_at)
    const hours = (Date.now() - created.getTime()) / 3_600_000
    const ready = hours >= 24
    ageLine = `GitHub       : public, created ${created.toISOString().slice(0, 16).replace('T', ' ')}Z, age ${hours.toFixed(1)}h -> ${ready ? 'eligible to submit' : `submission gate in ${(24 - hours).toFixed(1)}h`}`
  }
} catch (error) {
  ageLine = `GitHub       : ${String((error && error.message) || error)}`
}
lines.push(ageLine)

// 3. Catalog indexes
for (const url of INDEXES) {
  const label = url.replace(/^https?:\/\//, '').split('/')[0]
  const index = await fetchJson(url, 45000)
  if (!index.ok) {
    lines.push(`catalog ${label.padEnd(9)}: unavailable (${index.status ?? index.error})`)
    continue
  }
  checkedIndexes += 1
  const plugins = index.body.plugins || []
  const hit = plugins.find((plugin) => plugin.name === PKG || String(plugin.repository?.url || '').includes(REPO))
  if (hit) {
    listedIn += 1
    lines.push(`catalog ${label.padEnd(9)}: LISTED as ${hit.title ?? hit.name} [${hit.metadata?.category ?? '?'}]`)
  } else {
    lines.push(`catalog ${label.padEnd(9)}: not listed (${plugins.length} entries scanned)`)
  }
}

// 4. Open submission PR, if one exists
try {
  const prs = execFileSync(
    'gh',
    ['pr', 'list', '--repo', 'awesome-dsh-plugin/awesome-dsh-plugin', '--author', '@me', '--state', 'all', '--json', 'number,title,state,url', '--limit', '20'],
    { encoding: 'utf8', timeout: 30000 },
  )
  const rows = JSON.parse(prs).filter((pr) => /codex-session-pin/i.test(pr.title))
  if (rows.length === 0) lines.push('submission PR: none open')
  else for (const pr of rows) lines.push(`submission PR: #${pr.number} ${pr.state} ${pr.url}`)
} catch {
  lines.push('submission PR: unknown (gh unavailable)')
}

const verdict = listedIn > 0 ? `LISTED in ${listedIn}/${checkedIndexes} catalog index(es)` : `NOT LISTED yet (${checkedIndexes} index(es) reachable)`
lines.push(`verdict      : ${verdict}`)
lines.push(`checked at   : ${new Date().toISOString()}`)

console.log(lines.join('\n'))
process.exitCode = listedIn > 0 ? 0 : 1
