import type {
  ExternalToolDSL,
  WorkflowAgentNode,
  WorkflowDSL,
  WorkflowEdge,
  WorkflowNodeResult,
  WorkflowRunResult,
  WorkflowToolResult,
} from '../model/workflow'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { isAbsolute, resolve, sep } from 'node:path'
import { generateText } from './aiClient'
import { SubAgent } from './subAgent'

interface WorkflowRunOptions {
  input: string
}

interface PlannedToolCall {
  toolName: string
  input?: unknown
}

const DEFAULT_MAX_STEPS = 20
const DEFAULT_MAX_TOOL_CALLS = 5
const TOOL_TIMEOUT_MS = 30_000
const MAX_TOOL_OUTPUT_LENGTH = 120_000
const MAX_NODE_OUTPUT_LENGTH = 80_000
const SCRIPT_ROOT = resolve(process.cwd(), 'example', 'scripts')
const BRANCH_SYSTEM_PROMPT = '你负责根据上游 agent 的执行结果选择 workflow 的下一条边。只返回最匹配的 edge id；如果没有任何边适合，返回 NONE。不要返回解释。'
const TOOL_PLAN_PROMPT = '你负责为当前 agent 节点规划需要调用的工具。根据任务输入和可用工具，返回 JSON 数组。数组项格式为 {"toolName":"工具名","input":{}}。如果不需要工具，返回 []。不要返回 markdown 或解释。'

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text
  }

  return `${text.slice(0, maxLength)}\n\n[truncated ${text.length - maxLength} chars]`
}

function stringifyLimited(value: unknown, maxLength = MAX_TOOL_OUTPUT_LENGTH): string {
  return truncateText(JSON.stringify(value), maxLength)
}

function buildToolContext(toolResults: WorkflowToolResult[]): string {
  if (toolResults.length === 0) {
    return ''
  }

  return [
    '可用工具已执行，结果如下：',
    ...toolResults.map(result => [
      `工具：${result.toolName}`,
      `状态：${result.success ? '成功' : '失败'}`,
      `输入：${stringifyLimited(result.input)}`,
      `结果：${stringifyLimited(result.output)}`,
    ].join('\n')),
  ].join('\n\n')
}

function buildNodeInput(
  options: WorkflowRunOptions,
  results: WorkflowNodeResult[],
  node: WorkflowAgentNode,
): string {
  if (results.length === 0) {
    return node.input == null || node.input === ''
      ? options.input
      : `${node.input}\n\n用户输入：\n${options.input}`
  }

  const previousResult = results[results.length - 1]

  return [
    node.input ?? '请基于上一个节点的结果继续处理。',
    `用户输入：\n${options.input}`,
    `上一个节点 ${previousResult.nodeName} 的结果：\n${truncateText(previousResult.output, MAX_NODE_OUTPUT_LENGTH)}`,
  ].filter(text => text !== '').join('\n\n')
}

function buildToolPlanPrompt(input: string, tools: ExternalToolDSL[], maxToolCalls: number): string {
  return [
    TOOL_PLAN_PROMPT,
    `最多选择 ${maxToolCalls} 次工具调用。`,
    `任务输入：\n${input}`,
    '可用工具：',
    ...tools.map(tool => [
      `名称：${tool.name}`,
      `描述：${tool.description}`,
    ].join('\n')),
  ].filter(text => text !== '').join('\n\n')
}

function parsePlannedToolCalls(text: string, maxToolCalls: number): PlannedToolCall[] {
  const jsonText = extractJsonText(text, '[', ']')

  try {
    const value: unknown = JSON.parse(jsonText)

    if (!Array.isArray(value)) {
      return []
    }

    return value
      .filter((item): item is Record<string, unknown> => item != null && typeof item === 'object')
      .filter(item => typeof item.toolName === 'string')
      .slice(0, maxToolCalls)
      .map(item => ({
        toolName: String(item.toolName),
        input: 'input' in item ? item.input : undefined,
      }))
  }
  catch {
    return []
  }
}

function parseJsonValue(text: string): unknown {
  return JSON.parse(extractJsonText(text, '{', '}')) as unknown
}

function extractJsonText(text: string, startChar: '[' | '{', endChar: ']' | '}'): string {
  const trimmed = text.trim()
  const fenceStart = trimmed.indexOf('```')
  const fenceEnd = fenceStart === -1 ? -1 : trimmed.indexOf('```', fenceStart + 3)
  const candidate = fenceStart === -1 || fenceEnd === -1
    ? trimmed
    : trimmed.slice(fenceStart + 3, fenceEnd).replace(/^json\s*/, '').trim()
  const start = candidate.indexOf(startChar)
  const end = candidate.lastIndexOf(endChar)

  if (start === -1 || end === -1 || end <= start) {
    return candidate
  }

  return candidate.slice(start, end + 1)
}

function buildToolUrl(url: string): string {
  if (/^https?:\/\//.test(url)) {
    return url
  }

  return new URL(url, `http://localhost:${process.env.PORT ?? '3000'}`).toString()
}

function buildToolScriptPath(endpoint: string): string {
  const script = isAbsolute(endpoint) ? endpoint : resolve(process.cwd(), endpoint)

  if (!script.startsWith(`${SCRIPT_ROOT}${sep}`) || !script.endsWith('.js')) {
    throw new Error('Node tool endpoint must be a js file under example/scripts')
  }

  return script
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function buildToolPayload(base: unknown, input: unknown): unknown {
  if (input == null) {
    return base ?? {}
  }

  if (isRecord(base) && 'script' in base) {
    return {
      ...base,
      input,
    }
  }

  if (isRecord(base) && isRecord(input)) {
    return {
      ...base,
      ...input,
    }
  }

  return input
}

async function readToolResponse(response: Response): Promise<unknown> {
  const text = await response.text()

  if (text === '') {
    return null
  }

  try {
    return JSON.parse(text) as unknown
  }
  catch {
    return text
  }
}

async function executeTool(tool: ExternalToolDSL, input?: unknown): Promise<WorkflowToolResult> {
  try {
    const output = tool.action.type === 'node'
      ? await executeNodeTool(tool, input)
      : await executeHttpTool(tool, input)

    return {
      toolName: tool.name,
      success: true,
      input,
      output,
    }
  }
  catch (error) {
    return {
      toolName: tool.name,
      success: false,
      input,
      output: error instanceof Error ? error.message : 'Tool execution failed',
    }
  }
}

async function executeNodeTool(tool: ExternalToolDSL, input?: unknown): Promise<unknown> {
  if (tool.action.type !== 'node') {
    return undefined
  }

  const stdout = await runNodeScript(buildToolScriptPath(tool.action.endpoint), buildToolPayload(tool.action.params, input))

  try {
    return parseJsonValue(stdout)
  }
  catch {
    return truncateText(stdout, MAX_TOOL_OUTPUT_LENGTH)
  }
}

async function runNodeScript(script: string, input: unknown): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    let settled = false
    const child = spawn('node', [script], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []

    const timeout = setTimeout(() => {
      if (settled) {
        return
      }

      settled = true
      child.kill('SIGKILL')
      reject(new Error(`Script timed out after ${TOOL_TIMEOUT_MS}ms`))
    }, TOOL_TIMEOUT_MS)
    const cleanup = () => {
      clearTimeout(timeout)
      child.stdout.destroy()
      child.stderr.destroy()
      child.stdin.destroy()
    }

    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.on('error', (error) => {
      if (settled) {
        return
      }

      settled = true
      cleanup()
      reject(error)
    })
    child.on('close', (code) => {
      if (settled) {
        return
      }

      settled = true
      cleanup()

      if (code !== 0) {
        reject(new Error(Buffer.concat(stderr).toString('utf8') || `Script exited with code ${code}`))
        return
      }

      resolvePromise(truncateText(Buffer.concat(stdout).toString('utf8'), MAX_TOOL_OUTPUT_LENGTH))
    })

    child.stdin.end(JSON.stringify(input ?? {}))
  })
}

async function executeHttpTool(tool: ExternalToolDSL, input?: unknown): Promise<unknown> {
  if (tool.action.type !== 'http') {
    return undefined
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TOOL_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(buildToolUrl(tool.action.url), {
      method: tool.action.method,
      headers: tool.action.headers,
      body: tool.action.method === 'POST' ? JSON.stringify(buildToolPayload(tool.action.body, input)) : undefined,
      signal: controller.signal,
    })
  }
  catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Tool "${tool.name}" timed out after ${TOOL_TIMEOUT_MS}ms`)
    }

    throw error
  }
  finally {
    clearTimeout(timeout)
  }

  const output = await readToolResponse(response)

  if (!response.ok) {
    throw new Error(`Tool "${tool.name}" failed with status ${response.status}: ${stringifyLimited(output)}`)
  }

  return output
}

function buildBranchPrompt(currentResult: WorkflowNodeResult, edges: WorkflowEdge[]): string {
  return [
    `上游节点 ${currentResult.nodeName} 的执行结果：`,
    truncateText(currentResult.output, MAX_NODE_OUTPUT_LENGTH),
    '候选边：',
    ...edges.map(edge => [
      `edge id: ${edge.id}`,
      `condition: ${edge.condition?.prompt ?? '无条件默认边'}`,
    ].join('\n')),
  ].join('\n\n')
}

export class WorkflowMgr {
  async run(dsl: WorkflowDSL, options: WorkflowRunOptions): Promise<WorkflowRunResult> {
    const nodes = new Map(dsl.nodes.map(node => [node.id, node]))
    const results: WorkflowNodeResult[] = []
    const maxSteps = dsl.maxSteps ?? DEFAULT_MAX_STEPS
    let currentNodeId: string | undefined = dsl.entryNodeId

    for (let step = 0; currentNodeId != null && step < maxSteps; step += 1) {
      const node = nodes.get(currentNodeId)
      if (node == null) {
        throw new Error(`Workflow node "${currentNodeId}" not found`)
      }

      const input = buildNodeInput(options, results, node)
      const nodeResult = await this.runNode(node, input)

      const result: WorkflowNodeResult = {
        nodeId: node.id,
        nodeName: node.name,
        input,
        tools: nodeResult.tools,
        output: nodeResult.output,
      }
      results.push(result)

      currentNodeId = await this.selectNextNodeId(dsl.edges.filter(edge => edge.from === node.id), result, nodes)
    }

    if (currentNodeId != null) {
      return this.buildRunResult(dsl, results, false, 'max_steps_reached')
    }

    const reason = results.length === 0 ? 'no_matched_edge' : 'completed'
    return this.buildRunResult(dsl, results, reason === 'completed', reason)
  }

  private async selectNextNodeId(
    edges: WorkflowEdge[],
    result: WorkflowNodeResult,
    nodes: Map<string, WorkflowAgentNode>,
  ): Promise<string | undefined> {
    if (edges.length === 0) {
      return undefined
    }

    if (edges.length === 1 && edges[0].condition == null) {
      return this.normalizeNextNodeId(edges[0].to, nodes)
    }

    const selectedEdgeId = (await generateText({
      systemInstruction: BRANCH_SYSTEM_PROMPT,
      contents: [{
        role: 'user',
        parts: [{ text: buildBranchPrompt(result, edges) }],
      }],
    })).trim()

    if (selectedEdgeId === 'NONE') {
      return undefined
    }

    const nextNodeId = edges.find(edge => edge.id === selectedEdgeId)?.to

    return this.normalizeNextNodeId(nextNodeId, nodes)
  }

  private normalizeNextNodeId(nextNodeId: string | undefined, nodes: Map<string, WorkflowAgentNode>): string | undefined {
    if (nextNodeId == null) {
      return undefined
    }

    if (!nodes.has(nextNodeId)) {
      throw new Error(`Workflow next node "${nextNodeId}" not found`)
    }

    return nextNodeId
  }

  private async runNode(node: WorkflowAgentNode, input: string): Promise<{ output: string, tools: WorkflowToolResult[] }> {
    const agent = new SubAgent({
      name: node.name,
      sysPrompt: node.sysPrompt,
      model: node.model,
    })
    const toolResults: WorkflowToolResult[] = []
    const maxToolCalls = node.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS

    if (node.tools.length === 0 || maxToolCalls <= 0) {
      const reply = await agent.sendText({ message: input })

      return {
        output: reply.text,
        tools: toolResults,
      }
    }

    const planReply = await agent.sendText({
      message: buildToolPlanPrompt(input, node.tools, maxToolCalls),
    })
    const plannedToolCalls = parsePlannedToolCalls(planReply.text, maxToolCalls)

    for (const plannedToolCall of plannedToolCalls) {
      const tool = node.tools.find(item => item.name === plannedToolCall.toolName)
      if (tool == null) {
        toolResults.push({
          toolName: plannedToolCall.toolName,
          success: false,
          input: plannedToolCall.input,
          output: `Tool "${plannedToolCall.toolName}" not found`,
        })
        continue
      }

      toolResults.push(await executeTool(tool, plannedToolCall.input))
    }

    const finalReply = await agent.sendText({
      message: [
        '请基于任务输入和已执行的工具结果给出最终回答。',
        `任务输入：\n${input}`,
        buildToolContext(toolResults),
      ].join('\n\n'),
    })

    return {
      output: finalReply.text,
      tools: toolResults,
    }
  }

  private buildRunResult(
    dsl: WorkflowDSL,
    results: WorkflowNodeResult[],
    completed: boolean,
    reason: WorkflowRunResult['reason'],
  ): WorkflowRunResult {
    return {
      workflowId: dsl.id,
      workflowName: dsl.name,
      results,
      completed,
      reason,
    }
  }
}
