import { Hono } from 'hono'

const systemRoutes = new Hono()

systemRoutes.get('/health', (c) => {
  return c.json({
    ok: true,
    timestamp: new Date().toISOString(),
  })
})

export { systemRoutes }
