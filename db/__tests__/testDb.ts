// node:sqlite adapter implementing the Db interface, so repository SQL runs for real in Jest.
import { DatabaseSync } from 'node:sqlite';
import type { Db, Param } from '../client';
import { migrate } from '../schema';

export function createTestDb(): Db {
  const raw = new DatabaseSync(':memory:');
  const db: Db = {
    execSync: (sql) => raw.exec(sql),
    runSync: (sql, params: Param[]) => {
      const r = raw.prepare(sql).run(...params);
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    getFirstSync: <T,>(sql: string, params: Param[]) => (raw.prepare(sql).get(...params) as T | undefined) ?? null,
    getAllSync: <T,>(sql: string, params: Param[]) => raw.prepare(sql).all(...params) as T[],
    // Like expo-sqlite, nesting is an error (BEGIN inside a transaction throws).
    withTransactionSync: (task) => {
      raw.exec('BEGIN');
      try {
        task();
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
  migrate(db);
  return db;
}
