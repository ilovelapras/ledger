// Saved entry templates (Money Manager bookmarks / favourites).

import type { TxFormValues } from '../domain/txForm';
import { LedgerError, nowStamp, type Db } from './client';

export interface Favorite {
  id: number;
  name: string;
  kind: 'payment' | 'receipt' | 'transfer';
  template_json: string;
  sort_order: number;
  created_at: string;
}

export type FavoriteTemplate = Omit<TxFormValues, 'date' | 'reference'>;

export function listFavorites(db: Db): (Favorite & { template: FavoriteTemplate })[] {
  return db
    .getAllSync<Favorite>('SELECT * FROM favorites ORDER BY sort_order, id', [])
    .map((f) => ({ ...f, template: JSON.parse(f.template_json) as FavoriteTemplate }));
}

export function saveFavorite(db: Db, name: string, values: TxFormValues): number {
  if (!name.trim()) throw new LedgerError('Give the favourite a name.');
  if (values.mode === 'journal') throw new LedgerError('Only income, expense and transfer can be saved.');
  const { date: _d, reference: _r, ...template } = values;
  const max = db.getFirstSync<{ m: number | null }>('SELECT MAX(sort_order) AS m FROM favorites', [])?.m ?? 0;
  return db.runSync(
    'INSERT INTO favorites (name, kind, template_json, sort_order, created_at) VALUES (?, ?, ?, ?, ?)',
    [name.trim(), values.mode, JSON.stringify(template), max + 1, nowStamp()]
  ).lastInsertRowId;
}

export function renameFavorite(db: Db, id: number, name: string): void {
  if (!name.trim()) throw new LedgerError('Give the favourite a name.');
  db.runSync('UPDATE favorites SET name = ? WHERE id = ?', [name.trim(), id]);
}

export function deleteFavorite(db: Db, id: number): void {
  db.runSync('DELETE FROM favorites WHERE id = ?', [id]);
}
