#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const errors = []

const requiredFiles = [
  'README.md',
  'LICENSE.md',
  '.gitignore',
  'docs/GETTING_STARTED.md',
  'docs/REPOSITORY_HOUSEKEEPING.md',
  '.github/workflows/housekeeping.yml',
]

for (const file of requiredFiles) {
  if (!existsSync(path.join(root, file))) {
    errors.push(`Missing required repository file: ${file}`)
  }
}

const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
if (packageJson.private !== true) {
  errors.push('package.json must set "private": true for this proprietary repository.')
}
if (packageJson.license !== 'Proprietary') {
  errors.push('package.json license must remain "Proprietary".')
}
if (packageJson.author?.name !== 'OpeniBank Research Team') {
  errors.push('package.json author.name must be "OpeniBank Research Team".')
}
if (packageJson.repository?.url !== 'https://github.com/openibank/openibank-desk.git') {
  errors.push('package.json repository.url must match the OpeniBank Desk GitHub repository.')
}

const readText = (file) => readFileSync(path.join(root, file), 'utf8')

const readme = readText('README.md')
if (!readme.includes('OpeniBank Research Team')) {
  errors.push('README.md must mention "OpeniBank Research Team".')
}
if (!readme.includes('Proprietary')) {
  errors.push('README.md must clearly mark the repository as proprietary.')
}

const license = readText('LICENSE.md')
if (!license.includes('All rights reserved')) {
  errors.push('LICENSE.md must contain an all-rights-reserved notice.')
}

const gitignore = readText('.gitignore')
for (const pattern of ['node_modules/', 'dist/', 'dist-electron/', '.env', '*.tsbuildinfo', '.ibank/']) {
  if (!gitignore.includes(pattern)) {
    errors.push(`.gitignore is missing expected entry: ${pattern}`)
  }
}

let trackedFiles = []
try {
  trackedFiles = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean)
} catch {
  // Local worktrees outside git are allowed; GitHub Actions will run the full check.
}

const disallowedPrefixes = [
  'node_modules/',
  'dist/',
  'dist-electron/',
  'release/',
  'coverage/',
  '.cache/',
  '.idea/',
  '.vscode/',
  '.ibank/',
  '.openibank/',
]

const disallowedSuffixes = ['.tsbuildinfo', '.log']
const disallowedNames = new Set(['.DS_Store'])

for (const file of trackedFiles) {
  if (disallowedPrefixes.some((prefix) => file.startsWith(prefix))) {
    errors.push(`Tracked file should not be committed: ${file}`)
    continue
  }
  if (disallowedSuffixes.some((suffix) => file.endsWith(suffix))) {
    errors.push(`Tracked generated/log artifact should not be committed: ${file}`)
    continue
  }
  if (disallowedNames.has(path.basename(file))) {
    errors.push(`Tracked OS artifact should not be committed: ${file}`)
  }
}

if (errors.length > 0) {
  console.error('Repository housekeeping check failed:\n')
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

console.log('Repository housekeeping check passed.')
