// ---------------------------------------------------------------------------
// Temporary SQLite database layer (uses Node's built-in `node:sqlite`).
//
// Exposes a tiny `pool` shim with a pg-compatible `query()` / `connect()` API
// so existing code that was written against `pg` continues to work without
// changes. The query layer:
//   - converts `$1, $2, ...` placeholders to SQLite `?` placeholders
//   - rewrites `NOW()` to `datetime('now')`
//   - rewrites Postgres-only `::int` / `::text` casts away
//   - returns rows for `SELECT` and `RETURNING` queries
//   - returns `rowCount` for `INSERT` / `UPDATE` / `DELETE`
//
// Storage: file at `SQLITE_PATH` (defaults to `./data/manhwa-bot.sqlite`).
// On Render's free tier the filesystem is ephemeral — restarts wipe data.
// Set `SQLITE_PATH` to a persistent disk path if you attach one.
// ---------------------------------------------------------------------------

import { DatabaseSync, type StatementSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const SQLITE_PATH = process.env["SQLITE_PATH"] || "./data/manhwa-bot.sqlite";

const parentDir = path.dirname(SQLITE_PATH);
if (parentDir && parentDir !== "." && parentDir !== "/") {
  fs.mkdirSync(parentDir, { recursive: true });
}

const sqlite = new DatabaseSync(SQLITE_PATH);
sqlite.exec("PRAGMA journal_mode = WAL");
sqlite.exec("PRAGMA foreign_keys = ON");

export type QueryResult<R = Record<string, unknown>> = {
  rows: R[];
  rowCount: number;
};

function translateSql(sql: string): string {
  // $1, $2, ...  →  ?
  let s = sql.replace(/\$\d+/g, "?");
  // NOW()  →  datetime('now')
  s = s.replace(/\bNOW\s*\(\s*\)/gi, "datetime('now')");
  // ::int / ::integer / ::text — drop the cast
  s = s.replace(/::\s*(?:int|integer|text|bigint|boolean|bool)/gi, "");
  return s;
}

function isReadingSql(sql: string): boolean {
  const t = sql.trim().toUpperCase();
  if (t.startsWith("SELECT") || t.startsWith("WITH") || t.startsWith("PRAGMA")) {
    return true;
  }
  return /\bRETURNING\b/i.test(sql);
}

function isTransactionControl(sql: string): boolean {
  const t = sql.trim().toUpperCase();
  return (
    t === "BEGIN" ||
    t.startsWith("BEGIN ") ||
    t === "COMMIT" ||
    t.startsWith("COMMIT ") ||
    t === "ROLLBACK" ||
    t.startsWith("ROLLBACK ")
  );
}

function bindParams(stmt: StatementSync, params: unknown[]): unknown[] {
  // node:sqlite accepts string, number, bigint, Buffer, null
  return params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === "boolean") return p ? 1 : 0;
    if (p instanceof Date) return p.toISOString();
    return p as string | number | bigint | Buffer | null;
  });
}

function execQuery(
  sql: string,
  params: unknown[] = [],
): QueryResult {
  if (isTransactionControl(sql)) {
    sqlite.exec(sql);
    return { rows: [], rowCount: 0 };
  }

  const translated = translateSql(sql);

  // Multi-statement DDL (e.g. the schema bootstrap) — only safe when no params.
  if (params.length === 0 && /;\s*\S/.test(translated.trim())) {
    sqlite.exec(translated);
    return { rows: [], rowCount: 0 };
  }

  const stmt = sqlite.prepare(translated);
  const bound = bindParams(stmt, params);

  if (isReadingSql(translated)) {
    const rows = stmt.all(...(bound as never[])) as Record<string, unknown>[];
    return { rows, rowCount: rows.length };
  }

  const result = stmt.run(...(bound as never[]));
  return { rows: [], rowCount: Number(result.changes ?? 0) };
}

type PgClient = {
  query: (sql: string, params?: unknown[]) => Promise<QueryResult>;
  release: () => void;
};

export const pool = {
  query: async (sql: string, params?: unknown[]): Promise<QueryResult> => {
    return execQuery(sql, params ?? []);
  },
  connect: async (): Promise<PgClient> => {
    return {
      query: async (sql: string, params?: unknown[]) =>
        execQuery(sql, params ?? []),
      release: () => {},
    };
  },
};

// Re-export schema (still empty — drizzle is unused at runtime in this build).
export * from "./schema";
