import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { room } from './manager/room'
import { apiRoutes } from './routes/api'
import { systemRoutes } from './routes/system'

const app = new Hono()
const port = Number(process.env.PORT ?? '3000')

async function main(): Promise<void> {
  await room.ready()

  app.route('/', systemRoutes)
  app.route('/api', apiRoutes)

  serve({
    fetch: app.fetch,
    port,
  }, () => {
    console.log(`Server is running at http://localhost:${port}`)
  })
}

void main()
