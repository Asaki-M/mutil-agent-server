#!/usr/bin/env node
const { appendFileSync, mkdirSync } = require('node:fs')
const { dirname, join } = require('node:path')

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

async function main() {
  const input = await readInput()
  const file = input.file ?? 'example/mock-review-push-log.jsonl'
  const target = join(process.cwd(), String(file))
  const record = {
    mock: true,
    destination: input.destination ?? 'mock-code-review-system',
    status: input.status ?? 'PASS',
    summary: input.summary ?? '',
    payload: input,
    pushedAt: new Date().toISOString(),
  }

  mkdirSync(dirname(target), { recursive: true })
  appendFileSync(target, `${JSON.stringify(record)}\n`, 'utf8')
  process.stdout.write(JSON.stringify({ ok: true, mock: true, file, destination: record.destination }, null, 2))
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
