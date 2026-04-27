import type { PersistedRoomState } from '../model/persistence'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const STATE_FILE = join(process.cwd(), '.data', 'room-state.json')

async function loadRoomState(): Promise<PersistedRoomState | undefined> {
  try {
    const content = await readFile(STATE_FILE, 'utf8')
    const state: unknown = JSON.parse(content)

    if (!isRoomState(state)) {
      return undefined
    }

    return state
  }
  catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return undefined
    }

    throw error
  }
}

async function saveRoomState(state: PersistedRoomState): Promise<void> {
  await mkdir(dirname(STATE_FILE), { recursive: true })

  const tempFile = `${STATE_FILE}.${process.pid}.tmp`
  await writeFile(tempFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  await rename(tempFile, STATE_FILE)
}

async function clearRoomState(): Promise<void> {
  await rm(STATE_FILE, { force: true })
}

function isRoomState(value: unknown): value is PersistedRoomState {
  return typeof value === 'object'
    && value != null
    && 'version' in value
    && value.version === 1
    && 'updatedAt' in value
    && typeof value.updatedAt === 'string'
    && 'agents' in value
    && Array.isArray(value.agents)
    && 'events' in value
    && Array.isArray(value.events)
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

export {
  clearRoomState,
  loadRoomState,
  saveRoomState,
}
