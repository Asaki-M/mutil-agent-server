# Multi Agent Server

Choose your language / 选择语言：

- [English](#english)
- [中文](#中文)

---

## English

A TypeScript + Hono API server for a persistent multi-agent chat room. You can create agents with different system prompts, send a message into the room, and stream room events through Server-Sent Events (SSE).

### Features

- Create, list, and remove agents.
- Queue multi-agent conversations with configurable `maxRounds`.
- Persist room agents and events to `.data/room-state.json`.
- Store workflow DSL definitions in MongoDB and run workflows by `workflowId`.
- Read historical events or subscribe to live events with SSE.
- Use Gemini through Vertex AI via `@google/genai`.

### Tech Stack

- Node.js
- TypeScript
- Hono
- MongoDB
- Google GenAI SDK
- ESLint with Antfu config

### Getting Started

Install dependencies:

```bash
npm install
```

Create a local `.env` file if you need to override the default Google Vertex AI settings:

```bash
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_LOCATION=global
GEMINI_MODEL=gemini-3-flash-preview
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB_NAME=multi-agent-server
PORT=3000
```

Start the development server:

```bash
npm run dev
```

The server starts at:

```text
http://localhost:3000
```

### Scripts

```bash
npm run dev       # Start the local server with watch mode
npm run build     # Type-check and build with TypeScript
npm run start     # Run the compiled server from dist/
npm run lint      # Run ESLint
npm run lint:fix  # Run ESLint with automatic fixes
```

### API

#### Health Check

```bash
curl http://localhost:3000/health
```

#### List Agents

```bash
curl http://localhost:3000/api/agents
```

#### Create Agent

```bash
curl -X POST http://localhost:3000/api/agents \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "planner",
    "sysPrompt": "You are a careful planning agent. Break problems into clear steps."
  }'
```

Optional field: `model`.

#### Remove Agent

```bash
curl -X DELETE http://localhost:3000/api/agents/planner
```

#### Send Message

```bash
curl -X POST http://localhost:3000/api/messages \
  -H 'Content-Type: application/json' \
  -d '{
    "message": "Please discuss a launch plan for a small developer tool.",
    "maxRounds": 2
  }'
```

Optional fields:

- `fromAgentName`: send the message as a specific agent.
- `maxRounds`: maximum conversation rounds. Defaults to `3`.

#### List Room Events

```bash
curl http://localhost:3000/api/events
```

#### Stream Room Events

```bash
curl -N http://localhost:3000/api/sse
```

#### Clear Records

```bash
curl -X DELETE http://localhost:3000/api/records
```

#### Create Workflow

Store a workflow DSL in MongoDB. The request body is the DSL object itself.

```bash
node -e "process.stdout.write(JSON.stringify(require('./example/code-review-workflow.dsl.json').dsl))" \
  | curl -X POST http://localhost:3000/api/workflow \
    -H 'Content-Type: application/json' \
    --data-binary @-
```

The workflow id is `dsl.id`. Creating the same `id` twice returns a MongoDB duplicate-key error because `workflowId` is unique.

#### Run Workflow

Run a stored workflow by `workflowId` with runtime user input:

```bash
curl -X POST http://localhost:3000/api/workflow/run \
  -H 'Content-Type: application/json' \
  -d '{
    "workflowId": "code_review_workflow",
    "input": "Review repo /path/to/project commits abc123, def456 and write reportFile example/reports/review.md"
  }'
```

Runtime `input` is not stored in MongoDB; only the workflow DSL is persisted.

#### Workflow DSL Shape

A workflow is a graph of agent nodes and edges. `entryNodeId` points to the first node, `nodes` define agent behavior and tools, and `edges` define execution order or conditional branching.

```json
{
  "version": 1,
  "id": "code_review_workflow",
  "name": "Code Review Workflow",
  "description": "Review commits and produce a pass result or report.",
  "entryNodeId": "get_commit_content",
  "maxSteps": 8,
  "nodes": [
    {
      "id": "get_commit_content",
      "type": "agent",
      "name": "Commit Reader",
      "sysPrompt": "Read commit content.",
      "input": "Extract repoPath and commits from runtime input.",
      "maxToolCalls": 1,
      "tools": [
        {
          "name": "getCommitContent",
          "description": "Read git commit metadata and diff.",
          "action": {
            "type": "node",
            "endpoint": "/absolute/path/to/example/scripts/get-commit-content.js",
            "params": {}
          }
        }
      ]
    }
  ],
  "edges": [
    {
      "id": "edge_1",
      "from": "get_commit_content",
      "to": "next_agent"
    },
    {
      "id": "edge_fail_to_report",
      "from": "review_code_issues",
      "to": "generate_review_report",
      "condition": {
        "source": "fromNodeResult",
        "prompt": "Choose this edge if reviewStatus is FAIL."
      }
    }
  ]
}
```

Tool action types:

- `node`: runs a whitelisted local Node.js script under `example/scripts/`.
- `http`: calls an HTTP endpoint with `GET` or `POST`.

#### Code Review Workflow Example

`example/code-review-workflow.dsl.json` contains a code-review workflow DSL. It expects runtime input such as:

```json
{
  "repoPath": "/path/to/project",
  "commits": ["abc123", "def456"],
  "reportFile": "example/reports/review.md"
}
```

The example uses local Node.js tools in `example/scripts/` to read git commit content, write a Markdown report, and mock a review-result push.

### Smoke Test Example

Create two agents and start a two-round conversation:

```bash
curl -X POST http://localhost:3000/api/agents \
  -H 'Content-Type: application/json' \
  -d '{"name":"planner","sysPrompt":"You propose clear plans."}'

curl -X POST http://localhost:3000/api/agents \
  -H 'Content-Type: application/json' \
  -d '{"name":"critic","sysPrompt":"You review plans and point out risks."}'

curl -X POST http://localhost:3000/api/messages \
  -H 'Content-Type: application/json' \
  -d '{"message":"Design a simple roadmap for this server.","maxRounds":2}'
```

### Project Structure

```text
src/
  dao/         MongoDB connection and data access objects
  config/      Environment defaults
  manager/     Runtime managers, AI client, persistence, and room logic
  model/       Shared TypeScript models
  routes/      Hono route definitions
  service/     Business logic helpers; currently includes request normalization and SSE helpers
  index.ts     Runtime entry
```

### Notes

- Runtime state is saved in `.data/room-state.json`.
- Workflow DSL records are saved to MongoDB in the `workflows` collection.
- Local secrets should be stored in `.env` and should not be committed.
- Vertex AI authentication must be configured in your local environment before model calls can succeed.

---

## 中文

这是一个基于 TypeScript + Hono 的持久化多 Agent 聊天室 API 服务。你可以创建带有不同系统提示词的 Agent，向房间发送消息，并通过 Server-Sent Events（SSE）实时订阅房间事件。

### 功能特性

- 创建、查看和删除 Agent。
- 发送多 Agent 对话任务，并通过 `maxRounds` 控制最大轮数。
- 将房间 Agent 和事件持久化到 `.data/room-state.json`。
- 将 Workflow DSL 定义存储到 MongoDB，并通过 `workflowId` 运行 Workflow。
- 支持读取历史事件，也支持通过 SSE 订阅实时事件。
- 通过 `@google/genai` 调用 Vertex AI 上的 Gemini 模型。

### 技术栈

- Node.js
- TypeScript
- Hono
- MongoDB
- Google GenAI SDK
- ESLint with Antfu config

### 快速开始

安装依赖：

```bash
npm install
```

如果需要覆盖默认的 Google Vertex AI 配置，可以创建本地 `.env` 文件：

```bash
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_LOCATION=global
GEMINI_MODEL=gemini-3-flash-preview
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB_NAME=multi-agent-server
PORT=3000
```

启动开发服务器：

```bash
npm run dev
```

服务默认地址：

```text
http://localhost:3000
```

### 脚本命令

```bash
npm run dev       # 以 watch 模式启动本地服务
npm run build     # 使用 TypeScript 做类型检查和构建
npm run start     # 运行 dist/ 中的编译产物
npm run lint      # 运行 ESLint
npm run lint:fix  # 运行 ESLint 并自动修复
```

### API

#### 健康检查

```bash
curl http://localhost:3000/health
```

#### 查看 Agent 列表

```bash
curl http://localhost:3000/api/agents
```

#### 创建 Agent

```bash
curl -X POST http://localhost:3000/api/agents \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "planner",
    "sysPrompt": "你是一个谨慎的规划 Agent，请把问题拆解成清晰步骤。"
  }'
```

可选字段：`model`。

#### 删除 Agent

```bash
curl -X DELETE http://localhost:3000/api/agents/planner
```

#### 发送消息

```bash
curl -X POST http://localhost:3000/api/messages \
  -H 'Content-Type: application/json' \
  -d '{
    "message": "请讨论一个小型开发者工具的发布计划。",
    "maxRounds": 2
  }'
```

可选字段：

- `fromAgentName`：以某个指定 Agent 的身份发送消息。
- `maxRounds`：最大对话轮数，默认值为 `3`。

#### 查看房间事件

```bash
curl http://localhost:3000/api/events
```

#### 订阅房间事件流

```bash
curl -N http://localhost:3000/api/sse
```

#### 清空记录

```bash
curl -X DELETE http://localhost:3000/api/records
```

#### 创建 Workflow

将 Workflow DSL 存入 MongoDB。请求体就是 DSL 对象本身。

```bash
node -e "process.stdout.write(JSON.stringify(require('./example/code-review-workflow.dsl.json').dsl))" \
  | curl -X POST http://localhost:3000/api/workflow \
    -H 'Content-Type: application/json' \
    --data-binary @-
```

Workflow id 来自 `dsl.id`。同一个 `id` 重复创建会触发 MongoDB 唯一索引错误，因为 `workflowId` 是唯一的。

#### 运行 Workflow

通过 `workflowId` 从 MongoDB 读取已存储的 DSL，再结合运行时用户输入执行：

```bash
curl -X POST http://localhost:3000/api/workflow/run \
  -H 'Content-Type: application/json' \
  -d '{
    "workflowId": "code_review_workflow",
    "input": "审查 /path/to/project 项目的 commits：abc123, def456，报告输出到 example/reports/review.md"
  }'
```

运行时 `input` 不会存入 MongoDB；数据库只保存 Workflow DSL。

#### Workflow DSL 结构

Workflow 是由 Agent 节点和连线组成的图。`entryNodeId` 指向入口节点，`nodes` 定义 Agent 行为和工具，`edges` 定义执行顺序或条件分支。

```json
{
  "version": 1,
  "id": "code_review_workflow",
  "name": "代码审查 Workflow",
  "description": "审查 commit，并生成通过结果或报告。",
  "entryNodeId": "get_commit_content",
  "maxSteps": 8,
  "nodes": [
    {
      "id": "get_commit_content",
      "type": "agent",
      "name": "Commit 读取 Agent",
      "sysPrompt": "读取 commit 内容。",
      "input": "从运行时输入中提取 repoPath 和 commits。",
      "maxToolCalls": 1,
      "tools": [
        {
          "name": "getCommitContent",
          "description": "读取 git commit 元信息和 diff。",
          "action": {
            "type": "node",
            "endpoint": "/absolute/path/to/example/scripts/get-commit-content.js",
            "params": {}
          }
        }
      ]
    }
  ],
  "edges": [
    {
      "id": "edge_1",
      "from": "get_commit_content",
      "to": "next_agent"
    },
    {
      "id": "edge_fail_to_report",
      "from": "review_code_issues",
      "to": "generate_review_report",
      "condition": {
        "source": "fromNodeResult",
        "prompt": "如果 reviewStatus 是 FAIL，则选择这条边。"
      }
    }
  ]
}
```

工具 action 类型：

- `node`：执行 `example/scripts/` 下白名单内的本地 Node.js 脚本。
- `http`：通过 `GET` 或 `POST` 调用 HTTP 接口。

#### 代码审查 Workflow 示例

`example/code-review-workflow.dsl.json` 提供了一个代码审查 Workflow DSL。运行时输入可以包含：

```json
{
  "repoPath": "/path/to/project",
  "commits": ["abc123", "def456"],
  "reportFile": "example/reports/review.md"
}
```

示例会使用 `example/scripts/` 下的本地 Node.js 工具读取 git commit 内容、写入 Markdown 审查报告，并 mock 推送审查结果。

### 冒烟测试示例

创建两个 Agent，并发起一段两轮对话：

```bash
curl -X POST http://localhost:3000/api/agents \
  -H 'Content-Type: application/json' \
  -d '{"name":"planner","sysPrompt":"你负责提出清晰计划。"}'

curl -X POST http://localhost:3000/api/agents \
  -H 'Content-Type: application/json' \
  -d '{"name":"critic","sysPrompt":"你负责审查计划并指出风险。"}'

curl -X POST http://localhost:3000/api/messages \
  -H 'Content-Type: application/json' \
  -d '{"message":"为这个服务设计一个简单路线图。","maxRounds":2}'
```

### 项目结构

```text
src/
  dao/         MongoDB 连接和数据访问层
  config/      环境变量默认配置
  manager/     运行时管理器、AI 客户端、持久化和房间逻辑
  model/       共享 TypeScript 模型
  routes/      Hono 路由定义
  service/     业务逻辑辅助层；当前主要包含请求归一化和 SSE 辅助逻辑
  index.ts     运行时入口
```

### 注意事项

- 运行时状态会保存到 `.data/room-state.json`。
- Workflow DSL 记录会保存到 MongoDB 的 `workflows` 集合中。
- 本地密钥请放在 `.env` 中，不要提交到仓库。
- 模型调用依赖 Vertex AI，请先在本地环境配置好对应认证。
