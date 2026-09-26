// IndexedDB document store. Material stays in this browser profile.
import { openDB, type IDBPDatabase } from 'idb'
import { ImmutableRecordError, type Doc, type DocStore } from './docstore'
import { COLLECTIONS, type Collection } from './types'

const DB_VERSION = 1

export class IndexedDBStore implements DocStore {
  private db: Promise<IDBPDatabase>

  constructor(name: string) {
    this.db = openDB(name, DB_VERSION, {
      upgrade(db) {
        for (const c of COLLECTIONS) if (!db.objectStoreNames.contains(c)) db.createObjectStore(c, { keyPath: 'id' })
      },
    })
  }

  async get<T extends Doc>(col: Collection, id: string) {
    return (await (await this.db).get(col, id)) as T | undefined
  }
  async list<T extends Doc>(col: Collection) {
    return (await (await this.db).getAll(col)) as T[]
  }
  async put<T extends Doc>(col: Collection, doc: T) {
    await (await this.db).put(col, doc)
  }
  async insert<T extends Doc>(col: Collection, doc: T) {
    try {
      await (await this.db).add(col, doc)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'ConstraintError') throw new ImmutableRecordError(col, doc.id)
      throw e
    }
  }
  async delete(col: Collection, id: string) {
    await (await this.db).delete(col, id)
  }
  async clear(col: Collection) {
    await (await this.db).clear(col)
  }
  async close() {
    ;(await this.db).close()
  }
}
