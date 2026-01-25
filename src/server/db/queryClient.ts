import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  sql,
} from 'drizzle-orm';
import { db, schema } from './index';

type OrderSpec = { column: string; ascending: boolean };
type FilterSpec =
  | { op: 'eq'; column: string; value: unknown }
  | { op: 'gte'; column: string; value: unknown }
  | { op: 'lt'; column: string; value: unknown }
  | { op: 'lte'; column: string; value: unknown }
  | { op: 'in'; column: string; value: unknown[] }
  | { op: 'ilike'; column: string; value: string }
  | { op: 'not'; column: string; operator: string; value: unknown };

type TableMeta = {
  table: any;
  columnsByName: Map<string, any>;
  columnsByKey: Map<string, any>;
  columnKeysByName: Map<string, string>;
  allSelect: Record<string, any>;
  columnKeys: Set<string>;
};

const TABLE_NAME_SYMBOL = Symbol.for('drizzle:Name');
const COLUMN_SYMBOL = Symbol.for('drizzle:Columns');
const tablesByName = new Map<string, TableMeta>();

function buildTableMeta() {
  for (const value of Object.values(schema)) {
    if (!value || typeof value !== 'object') continue;
    const tableName = (value as any)[TABLE_NAME_SYMBOL];
    if (!tableName) continue;

    const columns = (value as any)[COLUMN_SYMBOL] || {};
    const columnsByName = new Map<string, any>();
    const columnsByKey = new Map<string, any>();
    const columnKeysByName = new Map<string, string>();
    const allSelect: Record<string, any> = {};
    const columnKeys = new Set<string>();

    for (const [key, column] of Object.entries(columns)) {
      if (!column || typeof column !== 'object') continue;
      const columnName = (column as any).name;
      if (!columnName) continue;
      columnsByName.set(columnName, column);
      columnsByKey.set(key, column);
      columnKeysByName.set(columnName, key);
      allSelect[columnName] = column;
      columnKeys.add(key);
    }

    tablesByName.set(tableName, {
      table: value,
      columnsByName,
      columnsByKey,
      columnKeysByName,
      allSelect,
      columnKeys,
    });
  }
}

buildTableMeta();

function parseSelectColumns(columns?: string): string[] {
  if (!columns || columns.trim() === '*' || columns.trim() === '') return [];
  return columns.split(',').map((col) => col.trim()).filter(Boolean);
}

function resolveTableMeta(tableName: string): TableMeta {
  const meta = tablesByName.get(tableName);
  if (!meta) {
    throw new Error(`Unknown table: ${tableName}`);
  }
  return meta;
}

function buildSelectShape(meta: TableMeta, columns?: string): Record<string, any> {
  const names = parseSelectColumns(columns);
  if (names.length === 0) return { ...meta.allSelect };
  const shape: Record<string, any> = {};
  for (const name of names) {
    const column = meta.columnsByName.get(name);
    if (!column) {
      throw new Error(`Unknown column ${name} in select`);
    }
    shape[name] = column;
  }
  return shape;
}

function mapRow(meta: TableMeta, row: Record<string, any>) {
  const mapped: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    const columnKey = meta.columnKeysByName.get(key) || key;
    if (!meta.columnKeys.has(columnKey)) continue;
    mapped[columnKey] = value;
  }
  return mapped;
}

function coerceValue(column: any, value: any) {
  if (value === null || value === undefined) return value;
  const dataType = column?.dataType;

  if (dataType === 'date') {
    if (value instanceof Date) return value;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
    return value;
  }

  if (dataType === 'boolean') {
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      if (value === 'true') return true;
      if (value === 'false') return false;
    }
  }

  return value;
}

function coerceRow(meta: TableMeta, row: Record<string, any>) {
  const coerced: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    const column = meta.columnsByKey.get(key);
    coerced[key] = column ? coerceValue(column, value) : value;
  }
  return coerced;
}

function parseConflictTarget(meta: TableMeta, onConflict?: string) {
  if (!onConflict) {
    throw new Error('upsert requires onConflict');
  }
  const names = onConflict.split(',').map((name) => name.trim()).filter(Boolean);
  if (names.length === 0) throw new Error('upsert requires onConflict columns');
  return names.map((name) => {
    const column = meta.columnsByName.get(name);
    if (!column) {
      throw new Error(`Unknown column ${name} in onConflict`);
    }
    return column;
  });
}

class QueryBuilder {
  private action: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private selectColumns?: string;
  private filters: FilterSpec[] = [];
  private orders: OrderSpec[] = [];
  private limitValue?: number;
  private offsetValue?: number;
  private expectSingle: 'none' | 'single' | 'maybe' = 'none';
  private payload?: any;
  private forceEmpty = false;
  private countRequested = false;
  private headOnly = false;
  private upsertOptions?: { onConflict?: string; ignoreDuplicates?: boolean };

  constructor(private tableName: string) {}

  select(columns?: string, options?: { count?: 'exact'; head?: boolean }) {
    this.selectColumns = columns;
    this.countRequested = options?.count === 'exact';
    this.headOnly = options?.head === true;
    return this;
  }

  insert(values: Record<string, any> | Array<Record<string, any>>) {
    this.action = 'insert';
    this.payload = values;
    return this;
  }

  update(values: Record<string, any>) {
    this.action = 'update';
    this.payload = values;
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  upsert(values: Record<string, any> | Array<Record<string, any>>, options?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.action = 'upsert';
    this.payload = values;
    this.upsertOptions = options;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ op: 'eq', column, value });
    return this;
  }

  gte(column: string, value: unknown) {
    this.filters.push({ op: 'gte', column, value });
    return this;
  }

  lt(column: string, value: unknown) {
    this.filters.push({ op: 'lt', column, value });
    return this;
  }

  lte(column: string, value: unknown) {
    this.filters.push({ op: 'lte', column, value });
    return this;
  }

  in(column: string, value: unknown[]) {
    if (!value || value.length === 0) {
      this.forceEmpty = true;
      return this;
    }
    this.filters.push({ op: 'in', column, value });
    return this;
  }

  ilike(column: string, value: string) {
    this.filters.push({ op: 'ilike', column, value });
    return this;
  }

  not(column: string, operator: string, value: unknown) {
    this.filters.push({ op: 'not', column, operator, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orders.push({ column, ascending: options?.ascending !== false });
    return this;
  }

  limit(count: number) {
    this.limitValue = count;
    return this;
  }

  range(from: number, to: number) {
    this.offsetValue = from;
    this.limitValue = Math.max(0, to - from + 1);
    return this;
  }

  maybeSingle() {
    this.expectSingle = 'maybe';
    return this;
  }

  single() {
    this.expectSingle = 'single';
    return this;
  }

  then(resolve: (value: any) => any, reject?: (reason: any) => any) {
    return this.execute().then(resolve, reject);
  }

  private buildConditions(meta: TableMeta) {
    const conditions = this.filters.map((filter) => {
      const column = meta.columnsByName.get(filter.column);
      if (!column) {
        throw new Error(`Unknown column ${filter.column}`);
      }
      const value = coerceValue(column, filter.value);

      switch (filter.op) {
        case 'eq':
          if (value === null) return isNull(column);
          return eq(column, value as any);
        case 'gte':
          return gte(column, value as any);
        case 'lt':
          return lt(column, value as any);
        case 'lte':
          return lte(column, value as any);
        case 'in':
          return inArray(column, (filter.value as any[]).map((item) => coerceValue(column, item)) as any[]);
        case 'ilike':
          return ilike(column, filter.value);
        case 'not':
          if (filter.operator === 'is' && filter.value === null) {
            return isNotNull(column);
          }
          throw new Error(`Unsupported not operator: ${filter.operator}`);
      }
    });

    if (conditions.length === 0) return undefined;
    if (conditions.length === 1) return conditions[0];
    return and(...conditions);
  }

  private buildOrderBy(meta: TableMeta) {
    return this.orders.map((order) => {
      const column = meta.columnsByName.get(order.column);
      if (!column) {
        throw new Error(`Unknown column ${order.column}`);
      }
      return order.ascending ? asc(column) : desc(column);
    });
  }

  private applySingle(rows: any[], count?: number) {
    if (this.expectSingle === 'none') {
      return { data: rows, count, error: null };
    }

    if (rows.length > 1) {
      return { data: null, count, error: new Error('Multiple rows returned') };
    }

    if (rows.length === 0) {
      return this.expectSingle === 'single'
        ? { data: null, count, error: new Error('No rows returned') }
        : { data: null, count, error: null };
    }

    return { data: rows[0], count, error: null };
  }

  private mapPayload(meta: TableMeta, payload: any) {
    if (!payload) return payload;
    if (Array.isArray(payload)) {
      return payload.map((row) => coerceRow(meta, mapRow(meta, row)));
    }
    return coerceRow(meta, mapRow(meta, payload));
  }

  private async execute() {
    try {
      if (this.forceEmpty) {
        return this.applySingle([]);
      }

      const meta = resolveTableMeta(this.tableName);
      const selectShape = this.selectColumns ? buildSelectShape(meta, this.selectColumns) : null;
      const conditions = this.buildConditions(meta);
      const orders = this.buildOrderBy(meta);

      if (this.action === 'select') {
        let countValue: number | undefined;
        if (this.countRequested) {
          let countQuery = db
            .select({ count: sql<number>`count(*)` })
            .from(meta.table);
          if (conditions) countQuery = countQuery.where(conditions);
          const result = await countQuery;
          const raw = result?.[0]?.count ?? 0;
          countValue = Number(raw);
        }

        if (this.headOnly) {
          return { data: null, count: countValue, error: null };
        }

        let query = db.select(selectShape || meta.allSelect).from(meta.table);
        if (conditions) query = query.where(conditions);
        if (orders.length > 0) query = query.orderBy(...orders);
        if (this.limitValue !== undefined) query = query.limit(this.limitValue);
        if (this.offsetValue !== undefined) query = query.offset(this.offsetValue);
        const rows = await query;
        return this.applySingle(rows, countValue);
      }

      if (this.action === 'insert') {
        const values = this.mapPayload(meta, this.payload);
        let query = db.insert(meta.table).values(values);
        if (selectShape) {
          query = query.returning(selectShape);
          const rows = await query;
          return this.applySingle(rows);
        }
        await query;
        return { data: null, error: null };
      }

      if (this.action === 'update') {
        const values = this.mapPayload(meta, this.payload);
        let query = db.update(meta.table).set(values);
        if (conditions) query = query.where(conditions);
        if (selectShape) {
          query = query.returning(selectShape);
          const rows = await query;
          return this.applySingle(rows);
        }
        await query;
        return { data: null, error: null };
      }

      if (this.action === 'upsert') {
        const values = this.mapPayload(meta, this.payload);
        const target = parseConflictTarget(meta, this.upsertOptions?.onConflict);
        if (this.upsertOptions?.ignoreDuplicates !== true) {
          throw new Error('upsert only supports ignoreDuplicates=true currently');
        }

        let query = db.insert(meta.table).values(values).onConflictDoNothing({ target });
        if (selectShape) {
          query = query.returning(selectShape);
          const rows = await query;
          return this.applySingle(rows);
        }
        await query;
        return { data: null, error: null };
      }

      if (this.action === 'delete') {
        let query = db.delete(meta.table);
        if (conditions) query = query.where(conditions);
        if (selectShape) {
          query = query.returning(selectShape);
          const rows = await query;
          return this.applySingle(rows);
        }
        await query;
        return { data: null, error: null };
      }

      return { data: null, error: new Error('Unknown query action') };
    } catch (error: any) {
      return { data: null, error };
    }
  }
}

export type QueryClient = {
  from(tableName: string): QueryBuilder;
};

const queryClient: QueryClient = {
  from(tableName: string) {
    return new QueryBuilder(tableName);
  },
};

export function getQueryClient() {
  return queryClient;
}
