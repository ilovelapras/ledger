// The subset of expo-sqlite's synchronous API the repositories use.
// expo-sqlite's SQLiteDatabase satisfies it directly; tests supply a node:sqlite adapter.

export type Param = string | number | null;

export interface Db {
  execSync(sql: string): void;
  runSync(sql: string, params: Param[]): { lastInsertRowId: number; changes: number };
  getFirstSync<T>(sql: string, params: Param[]): T | null;
  getAllSync<T>(sql: string, params: Param[]): T[];
  withTransactionSync(task: () => void): void;
}

export class LedgerError extends Error {}

export function nowStamp(): string {
  return new Date().toISOString();
}
