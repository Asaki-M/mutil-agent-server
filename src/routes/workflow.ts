import { Hono } from 'hono'

const workflowRoutes = new Hono()

workflowRoutes.get('/workflow', c => c.json({
  test: 'workflow',
}))

export { workflowRoutes }
