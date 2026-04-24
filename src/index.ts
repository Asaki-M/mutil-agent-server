import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { apiRoutes } from './routes/api'
import { systemRoutes } from './routes/system'

const app = new Hono()
const port = Number(process.env.PORT ?? '3000')

app.route('/', systemRoutes)
app.route('/api', apiRoutes)

serve({
  fetch: app.fetch,
  port,
}, () => {
  console.log(`Server is running at http://localhost:${port}`)
})
