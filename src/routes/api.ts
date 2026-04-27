import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { room } from '../manager/room'
import {
  buildRoomEventSse,
  buildSseEvent,
  normalizeAgentInput,
  normalizeMessageInput,
} from '../service/api.service'

const apiRoutes = new Hono()

apiRoutes.get('/agents', c => c.json({
  agents: room.listAgents().map(agent => ({
    name: agent.name,
    sysPrompt: agent.sysPrompt,
    model: agent.model,
  })),
}))

apiRoutes.post('/agents', async (c) => {
  const body: unknown = await c.req.json()
  const input = normalizeAgentInput(body)
  const agent = room.createAgent(input)

  return c.json({
    success: true,
    agent: {
      name: agent.name,
      sysPrompt: agent.sysPrompt,
      model: agent.model,
    },
  })
})

apiRoutes.delete('/agents/:name', (c) => {
  const name = c.req.param('name')
  const removed = room.removeAgent(name)

  if (!removed) {
    return c.json({
      success: false,
      message: `Agent "${name}" not found`,
    }, 404)
  }

  return c.json({
    success: true,
    name,
  })
})

apiRoutes.post('/messages', async (c) => {
  const body: unknown = await c.req.json()
  const input = normalizeMessageInput(body)

  void room.enqueueConversation(input)

  return c.json({
    success: true,
    message: 'Conversation queued',
    agentCount: room.listAgentNames().length,
    maxRounds: input.maxRounds ?? 3,
  })
})

apiRoutes.get('/events', c => c.json({
  events: room.getEvents(),
}))

apiRoutes.get('/sse', (c) => {
  return streamSSE(c, async (stream) => {
    await stream.writeSSE(buildSseEvent('connected', {
      message: 'SSE connection established',
      agents: room.listAgentNames(),
      eventCount: room.getEvents().length,
    }))

    for (const event of room.getEvents()) {
      await stream.writeSSE(buildRoomEventSse(event))
    }

    const unsubscribe = room.subscribe(async (event) => {
      await stream.writeSSE(buildRoomEventSse(event))
    })

    try {
      await new Promise<void>((resolve) => {
        c.req.raw.signal.addEventListener('abort', () => {
          resolve()
        }, { once: true })
      })
    }
    finally {
      unsubscribe()
    }
  }, async (error, stream) => {
    await stream.writeSSE(buildSseEvent('error', {
      message: error.message,
    }))
  })
})

export { apiRoutes }
