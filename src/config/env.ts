import 'dotenv/config'

function getEnv(name: string, fallback: string): string {
  const value = process.env[name]

  return value == null || value === '' ? fallback : value
}

const GOOGLE_CLOUD_PROJECT = getEnv('GOOGLE_CLOUD_PROJECT', 'rosy-embassy-472909-d8')
const GOOGLE_CLOUD_LOCATION = getEnv('GOOGLE_CLOUD_LOCATION', 'global')
const GEMINI_MODEL = getEnv('GEMINI_MODEL', 'gemini-3-flash-preview')
const MONGODB_URI = getEnv('MONGODB_URI', 'mongodb://localhost:27017')
const MONGODB_DB_NAME = getEnv('MONGODB_DB_NAME', 'multi-agent-server')

export {
  GEMINI_MODEL,
  GOOGLE_CLOUD_LOCATION,
  GOOGLE_CLOUD_PROJECT,
  MONGODB_DB_NAME,
  MONGODB_URI,
}
