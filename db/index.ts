export * from './schema';
export * from './repositories/AccountRepo';
export * from './repositories/TransactionRepo';
export * from './repositories/EntryRepo';

import { runMigrations } from './schema';

export function initDatabase() {
  const { getDb } = require('./schema');
  const db = getDb();
  runMigrations(db);
  return db;
}