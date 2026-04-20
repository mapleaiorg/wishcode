#!/usr/bin/env node
/**
 * Patch the dev-mode Electron.app bundle so the macOS menu bar shows
 * "OpeniBank" instead of "Electron" when running `electron:dev`.
 *
 * In dev we launch the Electron binary shipped inside node_modules,
 * and macOS reads the app name from that .app's Info.plist (specifically
 * CFBundleName / CFBundleDisplayName / CFBundleExecutable). Changing
 * `app.setName()` at runtime does NOT rename the menu bar entry —
 * that string is locked in at process-exec time from the bundle.
 *
 * This script is a no-op on non-macOS platforms and on packaged builds
 * (electron-builder writes its own Info.plist using `productName`).
 *
 * Idempotent: re-running it simply re-applies the same values.
 */

import { copyFileSync, existsSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)
const REPO_ROOT  = join(__dirname, '..')

const APP_NAME = 'OpeniBank'
const BUNDLE_ID = 'ai.hermon.ibank.desktop'

if (process.platform !== 'darwin') {
  console.log('[patch-dev-name] not macOS — skipping.')
  process.exit(0)
}

const plistPath = join(
  REPO_ROOT,
  'node_modules',
  'electron',
  'dist',
  'Electron.app',
  'Contents',
  'Info.plist',
)

if (!existsSync(plistPath)) {
  console.warn(`[patch-dev-name] Info.plist not found at ${plistPath}; did \`npm install\` run?`)
  process.exit(0)
}

let xml = readFileSync(plistPath, 'utf8')
const before = xml

function replaceKeyValue(key, nextValue) {
  // Replace the <string> immediately following <key>key</key>.
  const re = new RegExp(
    `(<key>${key}</key>\\s*<string>)([^<]*)(</string>)`,
    'g',
  )
  xml = xml.replace(re, (_m, a, _b, c) => `${a}${nextValue}${c}`)
}

replaceKeyValue('CFBundleName',         APP_NAME)
replaceKeyValue('CFBundleDisplayName',  APP_NAME)
replaceKeyValue('CFBundleExecutable',   APP_NAME)
replaceKeyValue('CFBundleIdentifier',   BUNDLE_ID)

if (xml !== before) {
  writeFileSync(plistPath, xml, 'utf8')
  console.log(`[patch-dev-name] patched Info.plist → ${APP_NAME} (${BUNDLE_ID})`)
} else {
  console.log('[patch-dev-name] Info.plist already patched.')
}

const macosDir = join(REPO_ROOT, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS')
const fromBin = join(macosDir, 'Electron')
const toBin   = join(macosDir, APP_NAME)
const distDir = join(REPO_ROOT, 'node_modules', 'electron', 'dist')
const aliasApp = join(distDir, `${APP_NAME}.app`)
const pathFile = join(REPO_ROOT, 'node_modules', 'electron', 'path.txt')

try {
  if (existsSync(fromBin) && !existsSync(toBin)) {
    // Symlink keeps the original for `postinstall` idempotency.
    symlinkSync('Electron', toBin)
    console.log(`[patch-dev-name] created MacOS/${APP_NAME} → Electron symlink.`)
  }
} catch (e) {
  console.warn('[patch-dev-name] could not create executable symlink:', e?.message)
}

try {
  if (!existsSync(aliasApp)) {
    symlinkSync('Electron.app', aliasApp)
    console.log(`[patch-dev-name] created dist/${APP_NAME}.app → Electron.app symlink.`)
  }
  writeFileSync(pathFile, `${APP_NAME}.app/Contents/MacOS/${APP_NAME}`, 'utf8')
  console.log(`[patch-dev-name] updated electron/path.txt → ${APP_NAME}.app/Contents/MacOS/${APP_NAME}`)
} catch (e) {
  console.warn('[patch-dev-name] could not alias the app bundle path:', e?.message)
  try {
    if (existsSync(aliasApp)) unlinkSync(aliasApp)
  } catch {}
  try {
    writeFileSync(pathFile, 'Electron.app/Contents/MacOS/Electron', 'utf8')
  } catch {}
}

const sourceIcon = join(REPO_ROOT, 'build', 'icon.icns')
const targetIcon = join(
  REPO_ROOT,
  'node_modules',
  'electron',
  'dist',
  'Electron.app',
  'Contents',
  'Resources',
  'electron.icns',
)

try {
  if (existsSync(sourceIcon)) {
    copyFileSync(sourceIcon, targetIcon)
    console.log('[patch-dev-name] copied custom macOS dock icon.')
  } else {
    console.warn(`[patch-dev-name] build/icon.icns not found at ${sourceIcon}`)
  }
} catch (e) {
  console.warn('[patch-dev-name] could not update dock icon:', e?.message)
}
