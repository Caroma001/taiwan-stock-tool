import type { DatabaseAdapter, DatabaseRow } from "@/lib/database";
import { DatabaseError } from "@/lib/database";
import type {
  StockMarket,
  StockRecord,
  StockRepository,
  StockSearchOptions,
  StockUpsertInput,
} from "@/repositories/contracts/StockRepository";

interface StockRow extends DatabaseRow {
  symbol: string;
  name: string;
  market: string;
  industry: string | null;
  is_active: number;
  updated_at: string;
}

interface CountRow extends DatabaseRow {
  count: number;
}

export class DatabaseStockRepository implements StockRepository {
  constructor(private readonly database: DatabaseAdapter) {}

  async findBySymbol(symbol: string): Promise<StockRecord | null> {
    const normalized = this.normalizeSymbol(symbol);
    const result = await this.database.execute<StockRow>({
      sql: `SELECT symbol, name, market, industry, is_active, updated_at
            FROM stocks
            WHERE symbol = ?
            LIMIT 1`,
      args: [normalized],
    });
    const row = result.rows[0];
    return row ? this.mapRow(row) : null;
  }

  async list(options: StockSearchOptions = {}): Promise<readonly StockRecord[]> {
    const where: string[] = [];
    const args: Array<string | number> = [];

    if (options.activeOnly) where.push("is_active = 1");
    if (options.market) {
      where.push("market = ?");
      args.push(options.market);
    }

    const limit = this.safeInteger(options.limit ?? 100, "limit", 1, 5000);
    const offset = this.safeInteger(options.offset ?? 0, "offset", 0, Number.MAX_SAFE_INTEGER);
    args.push(limit, offset);

    const result = await this.database.execute<StockRow>({
      sql: `SELECT symbol, name, market, industry, is_active, updated_at
            FROM stocks
            ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
            ORDER BY symbol
            LIMIT ? OFFSET ?`,
      args,
    });

    return result.rows.map((row) => this.mapRow(row));
  }

  async count(options: Pick<StockSearchOptions, "activeOnly" | "market"> = {}): Promise<number> {
    const where: string[] = [];
    const args: string[] = [];
    if (options.activeOnly) where.push("is_active = 1");
    if (options.market) {
      where.push("market = ?");
      args.push(options.market);
    }
    const result = await this.database.execute<CountRow>({
      sql: `SELECT COUNT(*) AS count FROM stocks ${where.length ? `WHERE ${where.join(" AND ")}` : ""}`,
      args,
    });
    return Number(result.rows[0]?.count ?? 0);
  }

  async upsert(stock: StockUpsertInput): Promise<void> {
    await this.upsertMany([stock]);
  }

  async upsertMany(stocks: readonly StockUpsertInput[]): Promise<void> {
    if (stocks.length === 0) return;
    await this.database.transaction(async (transaction) => {
      for (const stock of stocks) {
        const symbol = this.normalizeSymbol(stock.symbol);
        const name = stock.name.trim();
        if (!name) throw new DatabaseError("INVALID_ARGUMENT", `Stock ${symbol} has an empty name.`);
        await transaction.execute({
          sql: `INSERT INTO stocks (symbol, name, market, industry, is_active, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(symbol) DO UPDATE SET
                  name = excluded.name,
                  market = excluded.market,
                  industry = excluded.industry,
                  is_active = excluded.is_active,
                  updated_at = excluded.updated_at`,
          args: [
            symbol,
            name,
            stock.market,
            stock.industry ?? null,
            stock.isActive === false ? 0 : 1,
            stock.updatedAt ?? new Date().toISOString(),
          ],
        });
      }
    }, { mode: "write" });
  }

  private mapRow(row: StockRow): StockRecord {
    return {
      symbol: row.symbol,
      name: row.name,
      market: this.asMarket(row.market),
      industry: row.industry,
      isActive: Boolean(row.is_active),
      updatedAt: row.updated_at,
    };
  }

  private normalizeSymbol(symbol: string): string {
    const normalized = symbol.trim();
    if (!/^\d{4,6}$/.test(normalized)) {
      throw new DatabaseError("INVALID_ARGUMENT", `Invalid Taiwan stock symbol: '${symbol}'.`);
    }
    return normalized;
  }

  private safeInteger(value: number, name: string, min: number, max: number): number {
    if (!Number.isSafeInteger(value) || value < min || value > max) {
      throw new DatabaseError("INVALID_ARGUMENT", `${name} must be an integer between ${min} and ${max}.`);
    }
    return value;
  }

  private asMarket(value: string): StockMarket {
    return value === "TWSE" || value === "TPEx" || value === "ESB" ? value : "UNKNOWN";
  }
}
