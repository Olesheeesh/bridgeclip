'use strict'
// Fork: copy settings, keys, automations and posting history from the installed
// BridgeClip into BridgeClip Fork. The installed app's files are only read.
//
//   node scripts/fork-import-installed.cjs
//
// - Keys: "Local State" holds the OS-protected key that decrypts settings.json,
//   so copying both lets the fork use the same API keys without re-entering them.
// - Automations are imported PAUSED, so the two apps never post the same queue.
// - Bank clips are hard links (no extra disk space). Removing a clip in the fork
//   removes only its own link; the installed app keeps its file.
// - The fork keeps its own library folder (~/BridgeClip Fork).
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
const src = path.join(appData, 'BridgeClip')
const dst = path.join(appData, 'BridgeClip Fork')
if (!fs.existsSync(src)) throw new Error(`Installed BridgeClip data not found: ${src}`)
fs.mkdirSync(dst, { recursive: true })

const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2))

for (const name of ['Local State', 'zernio-accounts.json']) {
  if (fs.existsSync(path.join(src, name))) fs.copyFileSync(path.join(src, name), path.join(dst, name))
}

const settings = JSON.parse(fs.readFileSync(path.join(src, 'settings.json'), 'utf8'))
settings.outputDirectory = path.join(os.homedir(), 'BridgeClip Fork')
writeJson(path.join(dst, 'settings.json'), settings)

let automations = 0
for (const name of fs.readdirSync(src)) {
  if (!/\.json$/.test(name)) continue
  if (/^zernio-(posts|post-attempts)-/.test(name)) fs.copyFileSync(path.join(src, name), path.join(dst, name))
  if (/^automations-[0-9a-f]+\.json$/.test(name)) {
    const data = JSON.parse(fs.readFileSync(path.join(src, name), 'utf8'))
    for (const automation of data.automations ?? []) { automation.enabled = false; automations++ }
    writeJson(path.join(dst, name), data)
  }
}

let linked = 0
let kept = 0
const linkTree = (from, to) => {
  if (!fs.existsSync(from)) return
  fs.mkdirSync(to, { recursive: true })
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, entry.name)
    const b = path.join(to, entry.name)
    if (entry.isDirectory()) linkTree(a, b)
    else if (entry.isFile()) {
      if (fs.existsSync(b)) { kept++; continue }
      fs.linkSync(a, b)
      linked++
    }
  }
}
linkTree(path.join(src, 'automation-bank'), path.join(dst, 'automation-bank'))

console.log(`Imported ${automations} automations (paused), linked ${linked} bank clips${kept ? `, ${kept} already present` : ''}.`)
console.log(`Fork data: ${dst}`)
