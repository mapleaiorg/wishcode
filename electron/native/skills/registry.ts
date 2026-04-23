/**
 * Skills system.
 *
 * A skill is a markdown file with YAML frontmatter. The LLM is shown the
 * skill index in its system prompt and auto-invokes skills by matching
 * the user's message against `triggers` (keywords or regex).
 *
 * Frontmatter fields:
 *   ---
 *   name: market-analyst                  # unique ID
 *   title: Market Analyst                 # human label
 *   description: Analyse crypto prices…   # one-liner; shown in palette
 *   triggers:                             # when to activate
 *     - keywords: [price, market, analyze]
 *     - regex: "how\\s+is\\s+.+doing"
 *   tools: [Read, WebFetch, Trade]        # tool subset this skill unlocks
 *   permissions: auto                     # auto | ask | plan
 *   version: 1.0.0
 *   author: WishCode Team                 # optional
 *   ---
 *   <markdown body — prepended to system prompt when active>
 *
 * Skills load from two locations (user wins on name conflict):
 *   1. electron/native/skills/builtin/   (shipped with the app)
 *   2. ~/.wishcode/skills/               (user-installed; one folder per skill)
 *
 * Users can drop a .md file into ~/.wishcode/skills/ and it's picked up on next
 * query. The Skill Editor UI (sidebar) writes to this folder.
 */

import * as fs from 'fs'
import * as path from 'path'
import { paths, ensureAllDirs } from '../core/config.js'
import { createLogger } from '../core/logger.js'

const log = createLogger('skills')

export interface SkillTrigger {
  keywords?: string[]
  regex?: string
}

export interface Skill {
  name: string
  title: string
  description: string
  triggers: SkillTrigger[]
  tools: string[]
  permissions: 'auto' | 'ask' | 'plan'
  version: string
  author?: string
  body: string           // markdown body (system-prompt addendum)
  source: 'builtin' | 'user'
  file: string
}

// ── Frontmatter parser ─────────────────────────────────────────────

function parseFrontmatter(text: string): { front: Record<string, any>; body: string } {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!m) return { front: {}, body: text }
  const body = m[2].trim()
  const front: Record<string, any> = {}
  // Minimal YAML subset: key, key: value, key: [a, b], key:\n  - a\n  - b,
  // nested triggers: -- keywords: [..]
  const lines = m[1].split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim() || line.trim().startsWith('#')) { i++; continue }
    const kv = line.match(/^(\w+):\s*(.*)$/)
    if (kv) {
      const [, key, val] = kv
      const trimmedVal = val.trim()
      if (trimmedVal === '') {
        // Multi-line value follows as indented list or map.
        const items: any[] = []
        let j = i + 1
        while (j < lines.length && (lines[j].startsWith('  ') || lines[j].startsWith('\t'))) {
          const sub = lines[j].trim()
          if (sub.startsWith('- ')) {
            const inner = sub.slice(2).trim()
            // Could be "- keywords: [a, b]" or "- foo"
            const submatch = inner.match(/^(\w+):\s*(.*)$/)
            if (submatch) {
              const obj: Record<string, any> = {}
              obj[submatch[1]] = parseInlineValue(submatch[2])
              // Continuation lines with deeper indent
              let k = j + 1
              while (k < lines.length && (lines[k].startsWith('    ') || lines[k].startsWith('\t\t'))) {
                const cont = lines[k].trim().match(/^(\w+):\s*(.*)$/)
                if (cont) obj[cont[1]] = parseInlineValue(cont[2])
                k++
              }
              items.push(obj)
              j = k - 1
            } else {
              items.push(parseInlineValue(inner))
            }
          }
          j++
        }
        front[key] = items.length > 0 ? items : null
        i = j; continue
      } else {
        front[key] = parseInlineValue(trimmedVal)
      }
    }
    i++
  }
  return { front, body }
}

function parseInlineValue(v: string): any {
  if (v === 'true' || v === 'false') return v === 'true'
  if (v.startsWith('[') && v.endsWith(']')) {
    return v.slice(1, -1).split(',').map(s => s.trim().replace(/^"(.*)"$/, '$1')).filter(Boolean)
  }
  if (/^\d+$/.test(v)) return parseInt(v, 10)
  return v.replace(/^"(.*)"$/, '$1')
}

// ── Load ──────────────────────────────────────────────────────────

function loadSkill(file: string, source: 'builtin' | 'user'): Skill | null {
  try {
    const text = fs.readFileSync(file, 'utf8')
    const { front, body } = parseFrontmatter(text)
    if (!front.name) return null
    const triggers = Array.isArray(front.triggers) ? front.triggers.map(t => {
      const obj: SkillTrigger = {}
      if (t.keywords) obj.keywords = Array.isArray(t.keywords) ? t.keywords : [t.keywords]
      if (t.regex) obj.regex = t.regex
      return obj
    }) : []
    return {
      name: String(front.name),
      title: String(front.title ?? front.name),
      description: String(front.description ?? ''),
      triggers,
      tools: Array.isArray(front.tools) ? front.tools : [],
      permissions: (['auto', 'ask', 'plan'] as const).includes(front.permissions) ? front.permissions : 'auto',
      version: String(front.version ?? '1.0.0'),
      author: front.author ? String(front.author) : undefined,
      body,
      source,
      file,
    }
  } catch (err) {
    log.warn(`failed to load ${file}`, err)
    return null
  }
}

let cache: Skill[] | null = null

function builtinDir(): string {
  // Resolved relative to this file's dist-electron location:
  //   dist-electron/native/skills/registry.js  →  ../../../electron/native/skills/builtin
  //   (in dev, packaged the same folder is dist-electron/native/skills/builtin via copy step — see tsconfig)
  // We check a few paths.
  const candidates = [
    path.join(__dirname, 'builtin'),
    path.join(__dirname, '..', '..', '..', 'electron', 'native', 'skills', 'builtin'),
    path.join(__dirname, '..', '..', 'electron', 'native', 'skills', 'builtin'),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return candidates[0] // fall back; readdirSync will fail gracefully
}

export function loadSkills(force: boolean = false): Skill[] {
  if (cache && !force) return cache
  ensureAllDirs()
  const skills: Skill[] = []

  // Builtin
  try {
    const bdir = builtinDir()
    for (const f of fs.readdirSync(bdir)) {
      if (f.endsWith('.md')) {
        const sk = loadSkill(path.join(bdir, f), 'builtin')
        if (sk) skills.push(sk)
      }
    }
  } catch (err) {
    log.warn('builtin skills dir missing', err)
  }

  // User (subdirs each containing SKILL.md, OR top-level .md files)
  try {
    const udir = paths().skillsDir
    for (const f of fs.readdirSync(udir)) {
      const p = path.join(udir, f)
      let target: string | null = null
      if (f.endsWith('.md')) target = p
      else if (fs.statSync(p).isDirectory()) {
        const inner = path.join(p, 'SKILL.md')
        if (fs.existsSync(inner)) target = inner
      }
      if (target) {
        const sk = loadSkill(target, 'user')
        if (sk) {
          // User overrides builtin on name conflict.
          const idx = skills.findIndex(s => s.name === sk.name)
          if (idx >= 0) skills[idx] = sk
          else skills.push(sk)
        }
      }
    }
  } catch {}

  cache = skills
  log.info(`loaded ${skills.length} skills`, { builtin: skills.filter(s => s.source === 'builtin').length, user: skills.filter(s => s.source === 'user').length })
  return skills
}

export function invalidateSkillsCache(): void { cache = null }

// ── Trigger matching ───────────────────────────────────────────────

export function matchSkills(userMessage: string, skills?: Skill[]): Skill[] {
  const all = skills ?? loadSkills()
  const lower = userMessage.toLowerCase()
  const matched: Skill[] = []
  for (const s of all) {
    for (const trig of s.triggers) {
      if (trig.keywords?.some(k => lower.includes(k.toLowerCase()))) { matched.push(s); break }
      if (trig.regex) {
        try { if (new RegExp(trig.regex, 'i').test(userMessage)) { matched.push(s); break } } catch {}
      }
    }
  }
  return matched
}

/** Build the system-prompt addendum for a set of matched skills. */
export function buildSkillsBlock(skills: Skill[]): string {
  if (skills.length === 0) return ''
  const lines: string[] = ['## Active skills', '']
  for (const s of skills) {
    lines.push(`### ${s.title}`, s.body, '')
  }
  return lines.join('\n')
}

// ── CRUD (user skills) ─────────────────────────────────────────────

export function installSkill(name: string, content: string): Skill {
  ensureAllDirs()
  const safe = name.replace(/[^a-z0-9-_]/gi, '-')
  const file = path.join(paths().skillsDir, `${safe}.md`)
  fs.writeFileSync(file, content, { mode: 0o600 })
  invalidateSkillsCache()
  const sk = loadSkill(file, 'user')
  if (!sk) throw new Error(`installed skill failed to parse: ${file}`)
  return sk
}

export function uninstallSkill(name: string): boolean {
  const dir = paths().skillsDir
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f)
    if (f === `${name}.md`) { fs.unlinkSync(p); invalidateSkillsCache(); return true }
    if (fs.statSync(p).isDirectory() && f === name) {
      fs.rmSync(p, { recursive: true, force: true })
      invalidateSkillsCache()
      return true
    }
  }
  return false
}
