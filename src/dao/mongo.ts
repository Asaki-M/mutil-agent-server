import { MongoClient } from 'mongodb'
import { MONGODB_DB_NAME, MONGODB_URI } from '../config/env'

let client: MongoClient | undefined

async function getMongoClient(): Promise<MongoClient> {
  if (client == null) {
    client = new MongoClient(MONGODB_URI)
    await client.connect()
  }

  return client
}

async function getMongoDb() {
  const mongoClient = await getMongoClient()

  return mongoClient.db(MONGODB_DB_NAME)
}

async function closeMongoClient(): Promise<void> {
  if (client == null) {
    return
  }

  await client.close()
  client = undefined
}

export {
  closeMongoClient,
  getMongoDb,
}
