#!/usr/bin/env node
const { mkdirSync, writeFileSync } = require('node:fs')
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

function buildMarkdown(input) {
  if (typeof input.markdown === 'string' && input.markdown.trim() !== '') {
    return input.markdown
  }

  return [
    '# Code Review Report',
    '',
    `生成时间：${new Date().toISOString()}`,
    '',
    '## 摘要',
    '',
    input.summary ?? '未提供摘要。',
    '',
    '## 问题',
    '',
    input.issues ?? '未提供问题详情。',
    '',
  ].join('\n')
}

async function main() {
  const input = await readInput()
  const file = input.file ?? 'example/code-review-report.md'
  const target = join(process.cwd(), String(file))
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, buildMarkdown(input), 'utf8')
  process.stdout.write(JSON.stringify({ ok: true, file }, null, 2))
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
