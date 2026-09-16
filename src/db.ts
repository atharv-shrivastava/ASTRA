import Dexie, { type Table } from 'dexie'

export type ResourceType = 'fuel' | 'ration' | 'oxygen' | 'medical' | 'equipment'

export interface InventoryItem {
  id: string
  station: 'Maitri' | 'Bharati' | 'Traverse Camp 1'
  resourceType: ResourceType
  name: string
  quantity: number
  unit: string
  updatedAt: number
  syncStatus: 'local' | 'queued' | 'synced'
}

export interface SyncMutation {
  id?: number
  mutationId: string
  entity: 'inventory'
  operation: 'upsert' | 'delete'
  entityId: string
  payload: InventoryItem
  createdAt: number
  status: 'queued'
}

class AstraLogDB extends Dexie {
  inventory!: Table<InventoryItem, string>
  syncQueue!: Table<SyncMutation, number>

  constructor() {
    super('AstraLogDB')
    this.version(1).stores({
      inventory: 'id, station, resourceType, syncStatus, updatedAt',
      syncQueue: '++id, mutationId, entity, entityId, status, createdAt'
    })
  }
}

export const db = new AstraLogDB()

export async function upsertInventory(item: Omit<InventoryItem, 'updatedAt' | 'syncStatus'>) {
  const record: InventoryItem = {
    ...item,
    updatedAt: Date.now(),
    syncStatus: 'queued'
  }
  await db.transaction('rw', db.inventory, db.syncQueue, async () => {
    await db.inventory.put(record)
    await db.syncQueue.add({
      mutationId: crypto.randomUUID(),
      entity: 'inventory',
      operation: 'upsert',
      entityId: record.id,
      payload: record,
      createdAt: record.updatedAt,
      status: 'queued'
    })
  })
}

export async function seedDemoInventory() {
  const count = await db.inventory.count()
  if (count > 0) return
  const demo: InventoryItem[] = [
    { id: 'FUEL-092', station: 'Maitri', resourceType: 'fuel', name: 'Jet-A1 Fuel Drum', quantity: 4800, unit: 'L', updatedAt: Date.now(), syncStatus: 'local' },
    { id: 'RATION-001', station: 'Maitri', resourceType: 'ration', name: 'Freeze-dried ration packs', quantity: 720, unit: 'packs', updatedAt: Date.now(), syncStatus: 'local' },
    { id: 'OXY-014', station: 'Bharati', resourceType: 'oxygen', name: 'Medical oxygen cylinders', quantity: 38, unit: 'cyl', updatedAt: Date.now(), syncStatus: 'local' },
    { id: 'FUEL-211', station: 'Bharati', resourceType: 'fuel', name: 'Jet-A1 Fuel Drum', quantity: 6200, unit: 'L', updatedAt: Date.now(), syncStatus: 'local' }
  ]
  await db.inventory.bulkPut(demo)
}
