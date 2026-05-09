import type { Collection, WithId } from 'mongodb'
import type { WorkflowDSL } from '../model/workflow'
import { getMongoDb } from './mongo'

interface WorkflowDocument {
  workflowId: string
  name: string
  description?: string
  dsl: WorkflowDSL
  createdAt: Date
  updatedAt: Date
}

interface CreateWorkflowRecordInput {
  dsl: WorkflowDSL
}

const WORKFLOW_COLLECTION = 'workflows'

async function getWorkflowCollection(): Promise<Collection<WorkflowDocument>> {
  const db = await getMongoDb()
  const collection = db.collection<WorkflowDocument>(WORKFLOW_COLLECTION)
  await collection.createIndex({ workflowId: 1 }, { unique: true })

  return collection
}

async function createWorkflowRecord(input: CreateWorkflowRecordInput): Promise<WithId<WorkflowDocument>> {
  const collection = await getWorkflowCollection()
  const now = new Date()
  const document: WorkflowDocument = {
    workflowId: input.dsl.id,
    name: input.dsl.name,
    description: input.dsl.description,
    dsl: input.dsl,
    createdAt: now,
    updatedAt: now,
  }

  const result = await collection.insertOne(document)
  const created = await collection.findOne({ _id: result.insertedId })

  if (created == null) {
    throw new Error(`Workflow "${input.dsl.id}" was not created`)
  }

  return created
}

async function findWorkflowRecordById(workflowId: string): Promise<WithId<WorkflowDocument> | undefined> {
  const collection = await getWorkflowCollection()
  const workflow = await collection.findOne({ workflowId })

  return workflow ?? undefined
}

export type {
  WorkflowDocument,
}

export {
  createWorkflowRecord,
  findWorkflowRecordById,
}
