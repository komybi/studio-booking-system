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
  constructor(private readonly documents: Document[]) {}

  private matches(document: Document, filter: Document) {
    if (filter.$or) return filter.$or.some((condition: Document) => this.matches(document, condition))
    return Object.entries(filter).every(([field, expected]) => {
      const actual = document[field]
      if (expected && typeof expected === 'object' && '$gt' in expected) return actual > expected.$gt
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
    const insertedId = document._id ?? new ObjectId()
    this.documents.push({ ...document, _id: insertedId })
    return { insertedId }
  }

  async updateOne(filter: Document, update: { $set?: Document }) {
    const document = this.documents.find((item) => this.matches(item, filter))
    if (document && update.$set) Object.assign(document, update.$set)
    return { matchedCount: document ? 1 : 0, modifiedCount: document ? 1 : 0 }
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

  collection(name: string) {
    if (!this.collections.has(name)) this.collections.set(name, [])
    return new LocalCollection(this.collections.get(name)!)
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
