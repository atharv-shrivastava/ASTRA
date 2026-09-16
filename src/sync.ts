import { encode } from '@msgpack/msgpack'
import { db, type SyncMutation } from './db'

export async function buildSyncPacket() {
  const queued = await db.syncQueue.where('status').equals('queued').toArray()
  const jsonBytes = new TextEncoder().encode(JSON.stringify(queued)).byteLength
  const packed = encode(queued)
  const savingsPercent = jsonBytes === 0 ? 0 : Math.max(0, (1 - packed.byteLength / jsonBytes) * 100)
  return { queued, packed, jsonBytes, packedBytes: packed.byteLength, savingsPercent }
}

export async function simulateSatelliteSync() {
  const packet = await buildSyncPacket()
  if (packet.queued.length === 0) return { ...packet, synced: 0 }

  // Deliberately local for the SIH prototype. A production deployment should POST
  // packet.packed to the approved government-controlled synchronization endpoint.
  await new Promise((resolve) => setTimeout(resolve, 700))

  await db.transaction('rw', db.syncQueue, db.inventory, async () => {
    await db.syncQueue.clear()
    for (const mutation of packet.queued as SyncMutation[]) {
      await db.inventory.update(mutation.entityId, { syncStatus: 'synced' })
    }
  })

  return { ...packet, synced: packet.queued.length }
}
