#!/usr/bin/env node
// Fetches the heavy, gitignored Theographic vendor files at the pinned commit.
// Everything else in data/vendor/theographic/ is committed; this restores the
// large files (verses.json, easton.json) needed to re-run the importer.
//
//   node scripts/vendor-fetch.mjs        (or: npm run vendor:fetch)
//
// The repo, commit, and file list come from data/vendor/theographic/snapshot.json,
// so the same pinned bytes are fetched every time. Requires Node 18+ (global fetch).

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const vendorDir = join(here, '..', 'data', 'vendor', 'theographic')
const manifest = JSON.parse(await readFile(join(vendorDir, 'snapshot.json'), 'utf8'))

const { repo, commit, sourcePath, files } = manifest
const toFetch = files.fetched ?? []

if (toFetch.length === 0) {
  console.log('Nothing to fetch.')
  process.exit(0)
}

await mkdir(vendorDir, { recursive: true })

for (const name of toFetch) {
  const url = `https://raw.githubusercontent.com/${repo}/${commit}/${sourcePath}/${name}`
  process.stdout.write(`Fetching ${name} ... `)
  const res = await fetch(url)
  if (!res.ok) {
    console.error(`FAILED (${res.status} ${res.statusText})`)
    process.exit(1)
  }
  const text = await res.text()
  try {
    JSON.parse(text)
  } catch {
    console.error('FAILED (response was not valid JSON)')
    process.exit(1)
  }
  await writeFile(join(vendorDir, name), text)
  console.log(`ok (${(text.length / 1e6).toFixed(1)} MB)`)
}

console.log(`\nFetched ${toFetch.length} file(s) at ${repo}@${commit.slice(0, 10)}.`)
