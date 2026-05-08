import type {
  ExternalToolDSL,
  WorkflowAgentNode,
  WorkflowDSL,
  WorkflowEdge,
  WorkflowEdgeCondition,
} from '../model/workflow'
import { WorkflowMgr } from '../manager/workflow'

interface RunWorkflowInput {
  dsl: WorkflowDSL
  input: string
}

const workflowMgr = new WorkflowMgr()

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object'
}

function toOptionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const text = value.trim()

  return text === '' ? undefined : text
}

function requireText(value: unknown, field: string): string {
  const text = toOptionalText(value)

  if (text == null) {
    throw new Error(`${field} is required`)
  }

  return text
}

function normalizeWorkflowRunInput(body: unknown): RunWorkflowInput {
  if (!isRecord(body)) {
    throw new Error('Invalid workflow payload')
  }

  return {
    dsl: normalizeWorkflowDSL(body.dsl),
    input: requireText(body.input, 'input'),
  }
}

function normalizeWorkflowDSL(value: unknown): WorkflowDSL {
  if (!isRecord(value)) {
    throw new Error('dsl is required')
  }

  if (value.version !== 1) {
    throw new Error('dsl.version must be 1')
  }

  const nodes = normalizeWorkflowNodes(value.nodes)
  const edges = normalizeWorkflowEdges(value.edges)
  const entryNodeId = requireText(value.entryNodeId, 'dsl.entryNodeId')
  const nodeIds = new Set(nodes.map(node => node.id))

  if (!nodeIds.has(entryNodeId)) {
    throw new Error(`Entry node "${entryNodeId}" not found`)
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.from)) {
      throw new Error(`Edge "${edge.id}" from node "${edge.from}" not found`)
    }

    if (!nodeIds.has(edge.to)) {
      throw new Error(`Edge "${edge.id}" to node "${edge.to}" not found`)
    }
  }

  return {
    version: 1,
    id: requireText(value.id, 'dsl.id'),
    name: requireText(value.name, 'dsl.name'),
    description: toOptionalText(value.description),
    entryNodeId,
    nodes,
    edges,
    maxSteps: normalizeMaxSteps(value.maxSteps),
  }
}

function normalizeWorkflowNodes(value: unknown): WorkflowAgentNode[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('dsl.nodes must be a non-empty array')
  }

  const ids = new Set<string>()

  return value.map((node, index) => {
    const normalized = normalizeWorkflowNode(node, index)

    if (ids.has(normalized.id)) {
      throw new Error(`Duplicate node id "${normalized.id}"`)
    }

    ids.add(normalized.id)
    return normalized
  })
}

function normalizeWorkflowNode(value: unknown, index: number): WorkflowAgentNode {
  if (!isRecord(value)) {
    throw new Error(`dsl.nodes[${index}] must be an object`)
  }

  if (value.type !== 'agent') {
    throw new Error(`dsl.nodes[${index}].type must be agent`)
  }

  return {
    id: requireText(value.id, `dsl.nodes[${index}].id`),
    type: 'agent',
    name: requireText(value.name, `dsl.nodes[${index}].name`),
    sysPrompt: requireText(value.sysPrompt, `dsl.nodes[${index}].sysPrompt`),
    model: toOptionalText(value.model),
    input: toOptionalText(value.input),
    description: toOptionalText(value.description),
    tools: normalizeTools(value.tools, `dsl.nodes[${index}].tools`),
    maxToolCalls: normalizeMaxToolCalls(value.maxToolCalls, `dsl.nodes[${index}].maxToolCalls`),
  }
}

function normalizeTools(value: unknown, field: string): ExternalToolDSL[] {
  if (value == null) {
    return []
  }

  if (!Array.isArray(value)) {
    throw new TypeError(`${field} must be an array`)
  }

  return value.map((tool, index) => normalizeTool(tool, `${field}[${index}]`))
}

function normalizeTool(value: unknown, field: string): ExternalToolDSL {
  if (!isRecord(value)) {
    throw new Error(`${field} must be an object`)
  }

  if (!isRecord(value.action)) {
    throw new Error(`${field}.action must be an object`)
  }

  if (value.action.type !== 'node' && value.action.type !== 'http') {
    throw new Error(`${field}.action.type must be node or http`)
  }

  return {
    name: requireText(value.name, `${field}.name`),
    description: requireText(value.description, `${field}.description`),
    action: value.action.type === 'node'
      ? {
          type: 'node',
          endpoint: requireText(value.action.endpoint, `${field}.action.endpoint`),
          params: value.action.params,
        }
      : {
          type: 'http',
          method: normalizeHttpMethod(value.action.method, `${field}.action.method`),
          url: requireText(value.action.url, `${field}.action.url`),
          headers: normalizeHeaders(value.action.headers, `${field}.action.headers`),
          body: value.action.body,
        },
  }
}

function normalizeHeaders(value: unknown, field: string): Record<string, string> | undefined {
  if (value == null) {
    return undefined
  }

  if (!isRecord(value)) {
    throw new Error(`${field} must be an object`)
  }

  return Object.fromEntries(Object.entries(value).map(([key, headerValue]) => [
    key,
    requireText(headerValue, `${field}.${key}`),
  ]))
}

function normalizeHttpMethod(value: unknown, field: string): 'GET' | 'POST' {
  if (value !== 'GET' && value !== 'POST') {
    throw new Error(`${field} must be GET or POST`)
  }

  return value
}

function normalizeWorkflowEdges(value: unknown): WorkflowEdge[] {
  if (value == null) {
    return []
  }

  if (!Array.isArray(value)) {
    throw new TypeError('dsl.edges must be an array')
  }

  const ids = new Set<string>()

  return value.map((edge, index) => {
    const normalized = normalizeWorkflowEdge(edge, index)

    if (ids.has(normalized.id)) {
      throw new Error(`Duplicate edge id "${normalized.id}"`)
    }

    ids.add(normalized.id)
    return normalized
  })
}

function normalizeWorkflowEdge(value: unknown, index: number): WorkflowEdge {
  if (!isRecord(value)) {
    throw new Error(`dsl.edges[${index}] must be an object`)
  }

  return {
    id: requireText(value.id, `dsl.edges[${index}].id`),
    from: requireText(value.from, `dsl.edges[${index}].from`),
    to: requireText(value.to, `dsl.edges[${index}].to`),
    condition: normalizeEdgeCondition(value.condition, `dsl.edges[${index}].condition`),
  }
}

function normalizeEdgeCondition(value: unknown, field: string): WorkflowEdgeCondition | undefined {
  if (value == null) {
    return undefined
  }

  if (!isRecord(value)) {
    throw new Error(`${field} must be an object`)
  }

  if (value.source !== 'fromNodeResult') {
    throw new Error(`${field}.source must be fromNodeResult`)
  }

  return {
    source: 'fromNodeResult',
    prompt: requireText(value.prompt, `${field}.prompt`),
  }
}

function normalizeMaxSteps(value: unknown): number | undefined {
  if (value == null) {
    return undefined
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error('dsl.maxSteps must be a positive integer')
  }

  return value
}

function normalizeMaxToolCalls(value: unknown, field: string): number | undefined {
  if (value == null) {
    return undefined
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`)
  }

  return value
}

async function runWorkflow(body: unknown) {
  const input = normalizeWorkflowRunInput(body)
  const result = await workflowMgr.run(input.dsl, {
    input: input.input,
  })

  return {
    success: result.completed,
    result,
  }
}

export {
  runWorkflow,
}
