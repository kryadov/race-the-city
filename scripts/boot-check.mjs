/**
 * Does the built app actually start?
 *
 * Nothing else asks. v0.82.0 shipped a black screen: a const was read at module
 * scope one line before it was created, TypeScript couldn't see it (the access
 * was inside a function), the unit tests never load main.ts, and the build was
 * clean. The site was down and every check was green.
 *
 * Usage: node scripts/boot-check.mjs   (after npm run build)
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync, readdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { extname, join } from 'node:path'

const DIST = 'dist'
const PORT = 4319
// charset matters: without it the browser decodes the page as latin-1 and the
// gear character we compare against arrives as mojibake.
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
}

if (!existsSync(DIST)) {
  console.error('boot-check: no dist/ — run `npm run build` first')
  process.exit(1)
}

const bundle = readdirSync(join(DIST, 'assets')).find((f) => /^index-.*\.js$/.test(f))
if (!bundle) {
  console.error('boot-check: no index bundle in dist/assets')
  process.exit(1)
}

// The canvas and the touch controls are built in main.ts's first lines, so they
// prove nothing. The ⚙ is built near its last: it only exists if nothing threw.
const PAGE = `<!doctype html><html><body>
<div id="app"></div><div id="ui"></div><div id="out">PENDING</div>
<script>
  // Tell the app it's under boot-check: infinite CSS/WAAPI animations never let
  // this headless run's virtual-time budget settle, so --dump-dom would hang.
  window.__BOOTCHECK = 1
  window.__err = ''
  addEventListener('error', (e) => { window.__err = String(e.message || e.error) })
  addEventListener('unhandledrejection', (e) => { window.__err = String(e.reason) })
</script>
<script type="module" src="./assets/${bundle}"></script>
<script>
  var GEAR = '⚙'
  setTimeout(() => {
    var canvas = document.querySelector('#app canvas')
    var gear = [].slice.call(document.querySelectorAll('#ui button')).some(function (b) { return b.textContent === GEAR })
    document.title = canvas && gear ? 'BOOTED' : 'DEAD canvas=' + !!canvas + ' gear=' + gear + ' err=' + window.__err
  }, 2500)
</script></body></html>`

const server = createServer(async (req, res) => {
  const url = (req.url ?? '/').split('?')[0]
  if (url === '/boot.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    return res.end(PAGE)
  }
  try {
    const body = await readFile(join(DIST, url))
    res.writeHead(200, { 'Content-Type': TYPES[extname(url)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404).end()
  }
})

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((p) => existsSync(p))

if (!CHROME) {
  console.log('boot-check: no Chrome found — skipping')
  process.exit(0)
}

server.listen(PORT, () => {
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--enable-unsafe-swiftshader',
    '--no-sandbox',
    '--virtual-time-budget=9000',
    '--dump-dom',
    `http://localhost:${PORT}/boot.html`,
  ])
  let dom = ''
  chrome.stdout.on('data', (d) => (dom += d))
  chrome.on('close', () => {
    server.close()
    // Read the title, not the body: the page's own source contains the words.
    const title = /<title>([^<]*)<\/title>/.exec(dom)?.[1] ?? ''
    if (title === 'BOOTED') {
      console.log('boot-check: OK — the app starts')
      process.exit(0)
    }
    console.error('boot-check: FAILED —', title || 'no verdict; the page never ran')
    process.exit(1)
  })
})
