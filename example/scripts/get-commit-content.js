#!/usr/bin/env node
const { execFileSync } = require('node:child_process')

function readInput() {
  return new Promise((resolve, reject) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', chunk => data += chunk)
    process.stdin.on('end', () => {
      try {
        resolve(data.trim() === '' ? {} : JSON.parse(data))
      }
      catch (error) {
        reject(error)
      }
    })
  })
}

function git(args) {
  return execFileSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  })
}

function normalizeCommits(value) {
  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean)
  }

  if (typeof value === 'string' && value.trim() !== '') {
    return value.split(',').map(item => item.trim()).filter(Boolean)
  }

  return ['HEAD']
}

async function main() {
  const input = await readInput()
  const commits = normalizeCommits(input.commits ?? input.commit)
  const result = commits.map((commit) => {
    const metadata = git(['show', '--no-patch', '--format=%H%n%an%n%ae%n%ad%n%s', commit]).trim().split('\n')

    return {
      commit,
      hash: metadata[0],
      authorName: metadata[1],
      authorEmail: metadata[2],
      date: metadata[3],
      subject: metadata.slice(4).join('\n'),
      files: git(['diff-tree', '--no-commit-id', '--name-status', '-r', commit]).trim(),
      diff: git(['show', '--format=', '--find-renames', '--find-copies', commit]),
    }
  })

  process.stdout.write(JSON.stringify({ commits: result }, null, 2))
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
