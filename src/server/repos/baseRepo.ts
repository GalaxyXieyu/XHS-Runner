// Base Repository - Common database operations
import { db, schema } from '../db/index';
import { desc, eq, and, like, ilike, inArray, sql, type SQL } from 'drizzle-orm';

// Base repository class with common CRUD operations
export abstract class BaseRepo<TTable> {
  protected table: typeof schema[keyof typeof schema];
  protected tableName: string;

  constructor(table: typeof schema[keyof typeof schema], tableName: string) {
    this.table = table;
    this.tableName = tableName;
  }

  // Get all records
  async findAll() {
    return db.select().from(this.table as any).orderBy(desc((this.table as any).id));
  }

  // Get by ID
  async findById(id: number) {
    const [result] = await db
      .select()
      .from(this.table as any)
      .where(eq((this.table as any).id, id));
    return result ?? null;
  }

  // Find by field
  async findByField(field: keyof TTable & string, value: unknown) {
    return db
      .select()
      .from(this.table as any)
      .where(eq((this.table as any)[field], value as any))
      .orderBy(desc((this.table as any).id));
  }

  // Find by fields (AND condition)
  async findByFields(conditions: Partial<Record<keyof TTable & string, unknown>>) {
    const whereConditions: SQL[] = [];
    for (const [key, value] of Object.entries(conditions)) {
      if (value !== undefined) {
        whereConditions.push(eq((this.table as any)[key], value));
      }
    }
    if (whereConditions.length === 0) {
      return this.findAll();
    }
    return db
      .select()
      .from(this.table as any)
      .where(and(...whereConditions))
      .orderBy(desc((this.table as any).id));
  }

  // Insert
  async create(data: Partial<TTable>) {
    const [result] = await db
      .insert(this.table as any)
      .values(data as any)
      .returning();
    return result;
  }

  // Insert many
  async createMany(data: Partial<TTable>[]) {
    return db.insert(this.table as any).values(data as any);
  }

  // Update by ID
  async update(id: number, data: Partial<TTable>) {
    const [result] = await db
      .update(this.table as any)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(eq((this.table as any).id, id))
      .returning();
    return result ?? null;
  }

  // Update by field
  async updateByField(field: keyof TTable & string, fieldValue: unknown, data: Partial<TTable>) {
    const [result] = await db
      .update(this.table as any)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(eq((this.table as any)[field], fieldValue as any))
      .returning();
    return result ?? null;
  }

  // Delete by ID
  async delete(id: number) {
    await db.delete(this.table as any).where(eq((this.table as any).id, id));
    return { id };
  }

  // Delete by field
  async deleteByField(field: keyof TTable & string, value: unknown) {
    await db.delete(this.table as any).where(eq((this.table as any)[field], value as any));
    return { success: true };
  }

  // Count
  async count() {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(this.table as any);
    return Number(count || 0);
  }

  // Count with condition
  async countByField(field: keyof TTable & string, value: unknown) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(this.table as any)
      .where(eq((this.table as any)[field], value as any));
    return Number(count || 0);
  }

  // Exists check
  async exists(id: number): Promise<boolean> {
    const [result] = await db
      .select({ id: (this.table as any).id })
      .from(this.table as any)
      .where(eq((this.table as any).id, id))
      .limit(1);
    return result !== undefined;
  }

  // Pagination
  async findPage(page = 1, pageSize = 20) {
    const offset = (page - 1) * pageSize;
    const items = await db
      .select()
      .from(this.table as any)
      .orderBy(desc((this.table as any).id))
      .limit(pageSize)
      .offset(offset);
    const total = await this.count();
    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }
}
