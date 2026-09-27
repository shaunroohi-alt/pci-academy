import type { Collection } from './types'

export interface Doc {
  id: string
}

/** Minimal document store. Implemented by IndexedDB (browser) and memory (tests). */
export interface DocStore {
  get<T extends Doc>(col: Collection, id: string): Promise<T | undefined>
  list<T extends Doc>(col: Collection): Promise<T[]>
  /** Create or replace. */
  put<T extends Doc>(col: Collection, doc: T): Promise<void>
  /** Create only; rejects if the id already exists. */
  insert<T extends Doc>(col: Collection, doc: T): Promise<void>
  delete(col: Collection, id: string): Promise<void>
  clear(col: Collection): Promise<void>
}

export class ImmutableRecordError extends Error {
  constructor(col: string, id: string) {
    super(`${col}/${id} is write-once and cannot be changed.`)
  }
}

export class MemoryStore implements DocStore {
  private data = new Map<Collection, Map<string, unknown>>()
  private col(c: Collection) {
    if (!this.data.has(c)) this.data.set(c, new Map())
    return this.data.get(c)!
  }
  async get<T extends Doc>(c: Collection, id: string) {
    const v = this.col(c).get(id)
    return v === undefined ? undefined : (structuredClone(v) as T)
  }
  async list<T extends Doc>(c: Collection) {
    return [...this.col(c).values()].map((v) => structuredClone(v) as T)
  }
  async put<T extends Doc>(c: Collection, doc: T) {
    this.col(c).set(doc.id, structuredClone(doc))
  }
  async insert<T extends Doc>(c: Collection, doc: T) {
    if (this.col(c).has(doc.id)) throw new ImmutableRecordError(c, doc.id)
    this.col(c).set(doc.id, structuredClone(doc))
  }
  async delete(c: Collection, id: string) {
    this.col(c).delete(id)
  }
  async clear(c: Collection) {
    this.col(c).clear()
  }
}
