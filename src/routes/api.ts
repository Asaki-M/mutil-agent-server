import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import {
  buildRoomEventSse,
  buildSseConnectedEvent,
  buildSseEvent,
  clearRecords,
  createAgent,
  enqueueMessage,
  getRoomEvents,
  listAgents,
  listEvents,
  removeAgent,
  subscribeRoomEvents,
} from '../service/api.service'

const apiRoutes = new Hono()

apiRoutes.get('/agents', c => c.json(listAgents()))

apiRoutes.post('/agents', async (c) => {
  const body: unknown = await c.req.json()
  return c.json(createAgent(body))
})

apiRoutes.delete('/agents/:name', (c) => {
  const result = removeAgent(c.req.param('name'))

  return c.json(result.body, result.status)
})

apiRoutes.post('/messages', async (c) => {
  const body: unknown = await c.req.json()
  return c.json(enqueueMessage(body))
})

apiRoutes.get('/events', c => c.json(listEvents()))

apiRoutes.delete('/records', async (c) => {
  return c.json(await clearRecords())
})

apiRoutes.get('/sse', (c) => {
  return streamSSE(c, async (stream) => {
    await stream.writeSSE(buildSseConnectedEvent())

    for (const event of getRoomEvents()) {
      await stream.writeSSE(buildRoomEventSse(event))
    }

    const unsubscribe = subscribeRoomEvents(async (event) => {
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
