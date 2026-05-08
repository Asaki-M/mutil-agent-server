import { Hono } from 'hono'
import { runWorkflow } from '../service/workflow.service'

const workflowRoutes = new Hono()

workflowRoutes.post('/workflow/run', async (c) => {
  const body: unknown = await c.req.json()

  try {
    return c.json(await runWorkflow(body))
  }
  catch (error) {
    return c.json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to run workflow',
    }, 400)
  }
})

export { workflowRoutes }
