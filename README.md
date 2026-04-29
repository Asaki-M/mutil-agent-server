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
- Read historical events or subscribe to live events with SSE.
- Use Gemini through Vertex AI via `@google/genai`.

### Tech Stack

- Node.js
- TypeScript
- Hono
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
  config/      Environment defaults
  manager/     Runtime managers, AI client, persistence, and room logic
  model/       Shared TypeScript models
  routes/      Hono route definitions
  service/     Business logic helpers; currently includes request normalization and SSE helpers
  index.ts     Runtime entry
```

### Notes

- Runtime state is saved in `.data/room-state.json`.
- Local secrets should be stored in `.env` and should not be committed.
- Vertex AI authentication must be configured in your local environment before model calls can succeed.

---

## 中文

这是一个基于 TypeScript + Hono 的持久化多 Agent 聊天室 API 服务。你可以创建带有不同系统提示词的 Agent，向房间发送消息，并通过 Server-Sent Events（SSE）实时订阅房间事件。

### 功能特性

- 创建、查看和删除 Agent。
- 发送多 Agent 对话任务，并通过 `maxRounds` 控制最大轮数。
- 将房间 Agent 和事件持久化到 `.data/room-state.json`。
- 支持读取历史事件，也支持通过 SSE 订阅实时事件。
- 通过 `@google/genai` 调用 Vertex AI 上的 Gemini 模型。

### 技术栈

- Node.js
- TypeScript
- Hono
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
  config/      环境变量默认配置
  manager/     运行时管理器、AI 客户端、持久化和房间逻辑
  model/       共享 TypeScript 模型
  routes/      Hono 路由定义
  service/     业务逻辑辅助层；当前主要包含请求归一化和 SSE 辅助逻辑
  index.ts     运行时入口
```

### 注意事项

- 运行时状态会保存到 `.data/room-state.json`。
- 本地密钥请放在 `.env` 中，不要提交到仓库。
- 模型调用依赖 Vertex AI，请先在本地环境配置好对应认证。
