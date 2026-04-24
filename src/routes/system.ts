import { Hono } from 'hono'
import { getHealthStatus } from '../service/system.service'

const systemRoutes = new Hono()

systemRoutes.get('/health', (c) => {
  return c.json(getHealthStatus())
})

export { systemRoutes }
