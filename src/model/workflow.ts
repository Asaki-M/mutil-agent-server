interface ToolActionNode {
  type: 'node'
  endpoint: string
  params?: unknown
}

interface ToolActionHttp {
  type: 'http'
  method: 'GET' | 'POST'
  url: string
  headers?: Record<string, string>
  body?: unknown
}

export interface ExternalToolDSL {
  name: string
  description: string
  action: ToolActionNode | ToolActionHttp
}

export interface WorkflowAgentNode {
  id: string
  type: 'agent'
  name: string
  sysPrompt: string
  model?: string
  input?: string
  description?: string
  tools: ExternalToolDSL[]
  maxToolCalls?: number
}

export interface WorkflowEdgeCondition {
  source: 'fromNodeResult'
  prompt: string
}

export interface WorkflowEdge {
  id: string
  from: string
  to: string
  condition?: WorkflowEdgeCondition
}

export interface WorkflowDSL {
  version: 1
  id: string
  name: string
  description?: string
  entryNodeId: string
  nodes: WorkflowAgentNode[]
  edges: WorkflowEdge[]
  maxSteps?: number
}

export interface WorkflowNodeResult {
  nodeId: string
  nodeName: string
  input: string
  tools: WorkflowToolResult[]
  output: string
}

export interface WorkflowToolResult {
  toolName: string
  success: boolean
  input?: unknown
  output: unknown
}

export interface WorkflowRunResult {
  workflowId: string
  workflowName: string
  results: WorkflowNodeResult[]
  completed: boolean
  reason: 'completed' | 'max_steps_reached' | 'no_matched_edge'
}
