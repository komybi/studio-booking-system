import { MongoClient, ObjectId } from 'mongodb'

type Document = Record<string, any>

class LocalCursor {
  private readonly documents: Document[]
  private sortField: string | null = null
  private sortDirection = 1
  private limitValue: number | null = null

  constructor(documents: Document[]) {
    this.documents = documents
  }

  sort(sort: Record<string, 1 | -1>) {
    const [field, direction] = Object.entries(sort)[0] ?? []
    this.sortField = field ?? null
    this.sortDirection = direction ?? 1
    return this
  }

  limit(value: number) {
    this.limitValue = value
    return this
  }

  async toArray() {
    const result = [...this.documents]
    if (this.sortField) {
      result.sort((left, right) => {
        const leftValue = left[this.sortField!]?.valueOf() ?? 0
        const rightValue = right[this.sortField!]?.valueOf() ?? 0
        return (leftValue > rightValue ? 1 : leftValue < rightValue ? -1 : 0) * this.sortDirection
      })
    }
    return this.limitValue === null ? result : result.slice(0, this.limitValue)
  }
}

class LocalCollection {
  constructor(private readonly documents: Document[], private readonly uniqueFields: Set<string>) {}

  private matches(document: Document, filter: Document) {
    if (filter.$or) return filter.$or.some((condition: Document) => this.matches(document, condition))
    return Object.entries(filter).every(([field, expected]) => {
      const actual = document[field]
      if (expected && typeof expected === 'object' && '$gt' in expected) return actual > expected.$gt
      if (expected && typeof expected === 'object' && '$exists' in expected) return (actual !== undefined) === expected.$exists
      if (expected && typeof expected === 'object' && '$in' in expected) return expected.$in.includes(actual)
      if (expected && typeof expected === 'object' && '$ne' in expected) return actual !== expected.$ne
      if (expected instanceof ObjectId) return String(actual) === String(expected)
      return actual === expected
    })
  }

  private project(document: Document, options?: { projection?: Document }) {
    const projection = options?.projection
    if (!projection) return { ...document }
    return Object.fromEntries(Object.keys(projection).filter((field) => projection[field]).map((field) => [field, document[field]]))
  }

  async findOne(filter: Document, options?: { projection?: Document }) {
    const document = this.documents.find((item) => this.matches(item, filter))
    return document ? this.project(document, options) : null
  }

  find(filter: Document = {}, options?: { projection?: Document }) {
    return new LocalCursor(this.documents.filter((item) => this.matches(item, filter)).map((item) => this.project(item, options)))
  }

  async countDocuments() {
    return this.documents.length
  }

  async insertOne(document: Document) {
    for (const field of this.uniqueFields) {
      const values = Array.isArray(document[field]) ? document[field] : [document[field]]
      for (const value of values) {
        if (value !== undefined && this.documents.some((existing) => (Array.isArray(existing[field]) ? existing[field] : [existing[field]]).includes(value))) {
          throw Object.assign(new Error(`Duplicate value for unique field "${field}"`), { code: 11000 })
        }
      }
    }
    const insertedId = document._id ?? new ObjectId()
    this.documents.push({ ...document, _id: insertedId })
    return { insertedId }
  }

  async updateOne(filter: Document, update: { $set?: Document; $unset?: Document }) {
    const document = this.documents.find((item) => this.matches(item, filter))
    if (document && update.$set) {
      const next = { ...document, ...update.$set }
      for (const field of this.uniqueFields) {
        const values = Array.isArray(next[field]) ? next[field] : [next[field]]
        for (const value of values) {
          if (value !== undefined && this.documents.some((existing) => existing !== document && (Array.isArray(existing[field]) ? existing[field] : [existing[field]]).includes(value))) {
            throw Object.assign(new Error(`Duplicate value for unique field "${field}"`), { code: 11000 })
          }
        }
      }
    }
    if (document && update.$set) Object.assign(document, update.$set)
    if (document && update.$unset) Object.keys(update.$unset).forEach((field) => delete document[field])
    return { matchedCount: document ? 1 : 0, modifiedCount: document ? 1 : 0 }
  }

  async createIndex(keys: Record<string, 1 | -1>, options?: { unique?: boolean; sparse?: boolean }) {
    if (options?.unique) {
      const fields = Object.keys(keys)
      for (const field of fields) {
        const indexedValues = new Set<unknown>()
        for (const document of this.documents) {
          const values = Array.isArray(document[field]) ? document[field] : [document[field]]
          for (const value of values) {
            if (value === undefined) continue
            if (indexedValues.has(value)) throw Object.assign(new Error(`Duplicate value for unique field "${field}"`), { code: 11000 })
            indexedValues.add(value)
          }
        }
        this.uniqueFields.add(field)
      }
    }
    return Object.entries(keys).map(([field, direction]) => `${field}_${direction}`).join('_')
  }

  async deleteOne(filter: Document) {
    const index = this.documents.findIndex((item) => this.matches(item, filter))
    if (index < 0) return { deletedCount: 0 }
    this.documents.splice(index, 1)
    return { deletedCount: 1 }
  }
}

class LocalDb {
  constructor(private readonly collections = new Map<string, Document[]>()) {}
  private readonly uniqueFields = new Map<string, Set<string>>()

  collection(name: string) {
    if (!this.collections.has(name)) this.collections.set(name, [])
    if (!this.uniqueFields.has(name)) this.uniqueFields.set(name, new Set())
    return new LocalCollection(this.collections.get(name)!, this.uniqueFields.get(name)!)
  }
}

const globalForDatabase = globalThis as unknown as { mongo?: MongoClient; localDb?: LocalDb }
export const client = process.env.MONGODB_URI ? globalForDatabase.mongo ?? new MongoClient(process.env.MONGODB_URI) : null
if (client && process.env.NODE_ENV !== 'production') globalForDatabase.mongo = client

export async function getDb() {
  if (!client) {
    globalForDatabase.localDb ??= new LocalDb()
    return globalForDatabase.localDb
  }
  await client.connect()
  return client.db(process.env.MONGODB_DB ?? 'studioflow')
}
