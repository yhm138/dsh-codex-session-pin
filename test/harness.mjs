// Offline harness: run the Client half's apply() against a minimal DOM stub so a
// load-time or unload-time exception is reproduced without a browser.
//
//   node test/harness.mjs
//
// Printed result: apply outcome, teardown outcome, and how many disposers ran.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(join(ROOT, 'client.js'), 'utf8')

class ClassList {
  add() {}
  remove() {}
  contains() {
    return false
  }
}

class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase()
    this.children = []
    this.attributes = new Map()
    this.style = {
      cssText: '',
      order: '',
      setProperty(key, value) {
        this[key] = value
      },
      removeProperty(key) {
        this[key] = ''
      },
    }
    this.classList = new ClassList()
    this.className = ''
    this.dataset = {}
    this.parentElement = null
    this.textContent = ''
    this.innerHTML = ''
  }
  setAttribute(key, value) {
    this.attributes.set(key, String(value))
  }
  getAttribute(key) {
    return this.attributes.has(key) ? this.attributes.get(key) : null
  }
  hasAttribute(key) {
    return this.attributes.has(key)
  }
  removeAttribute(key) {
    this.attributes.delete(key)
  }
  appendChild(node) {
    this.children.push(node)
    node.parentElement = this
    return node
  }
  insertBefore(node, reference) {
    const at = reference === null ? 0 : this.children.indexOf(reference)
    this.children.splice(at < 0 ? 0 : at, 0, node)
    node.parentElement = this
    return node
  }
  remove() {}
  querySelector() {
    return null
  }
  querySelectorAll() {
    return []
  }
  closest() {
    return null
  }
  matches() {
    return false
  }
  addEventListener() {}
  removeEventListener() {}
  getBoundingClientRect() {
    return { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }
  }
}

const head = new El('head')
const body = new El('body')

globalThis.document = {
  head,
  body,
  documentElement: new El('html'),
  createElement: (tag) => new El(tag),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {},
  removeEventListener() {},
  hidden: false,
}

globalThis.window = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id),
  requestAnimationFrame: (fn) => setTimeout(fn, 0),
  addEventListener() {},
  removeEventListener() {},
  getComputedStyle: () => ({ display: 'block', order: '0' }),
  innerWidth: 1440,
  innerHeight: 900,
  location: { href: 'dsh-app://app/' },
}

globalThis.MutationObserver = class {
  observe() {}
  disconnect() {}
}

globalThis.fetch = async () => ({
  ok: true,
  status: 200,
  text: async () => '',
  json: async () => ({ ok: true }),
})

const ReactStub = {
  createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  useState: (initial) => [initial, () => {}],
  useEffect: () => {},
  useMemo: (fn) => fn(),
  useRef: (value) => ({ current: value }),
  memo: (component) => component,
  Fragment: 'Fragment',
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
}

let loaded
globalThis.window.__ModuleLoader__ = {
  load: ({ factory }) => {
    loaded = factory
  },
}

const moduleCache = new Map()
function fakeRequire(id) {
  if (id === 'react') return ReactStub
  if (!moduleCache.has(id)) moduleCache.set(id, {})
  return moduleCache.get(id)
}

const cleanups = []
const ctx = {
  get: () => undefined,
  effect: (fn) => {
    const dispose = fn()
    if (typeof dispose === 'function') cleanups.push(dispose)
    return () => {}
  },
  on: () => () => {},
  slots: {
    inject: (_name, callback) => {
      const dispose = callback()
      if (typeof dispose === 'function') cleanups.push(dispose)
      return () => {}
    },
    register: (_options, component) => {
      if (typeof component !== 'function') throw new Error('registration needs a component')
      return () => {}
    },
  },
  locale: {
    register: () => () => {},
    bind: () => (key) => key,
  },
}

let outcome
try {
  // eslint-disable-next-line no-eval
  eval(source)
  const plugin = loaded(fakeRequire)
  if (!plugin || typeof plugin.apply !== 'function') throw new Error('factory returned no apply')
  plugin.apply(ctx)
  outcome = { ok: true, exposesGlobal: typeof globalThis.window.__dshCodexSessionPin }
} catch (error) {
  outcome = { ok: false, message: String((error && error.stack) || error) }
}

let teardownError
try {
  for (const dispose of cleanups.reverse()) dispose()
} catch (error) {
  teardownError = String((error && error.stack) || error)
}

console.log(
  JSON.stringify({ apply: outcome, teardown: teardownError ?? 'ok', cleanups: cleanups.length }, null, 2),
)
process.exitCode = outcome.ok === true && teardownError === undefined ? 0 : 1
