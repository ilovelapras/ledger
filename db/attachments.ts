// Receipt photos linked to transactions. The image files live in the app's document directory;
// this table only stores their URIs.

import { nowStamp, type Db } from './client';

export interface Attachment {
  id: number;
  transaction_id: number;
  uri: string;
  created_at: string;
}

export function listAttachments(db: Db, transactionId: number): Attachment[] {
  return db.getAllSync<Attachment>('SELECT * FROM attachments WHERE transaction_id = ? ORDER BY id', [transactionId]);
}

export function addAttachment(db: Db, transactionId: number, uri: string): number {
  return db.runSync('INSERT INTO attachments (transaction_id, uri, created_at) VALUES (?, ?, ?)', [
    transactionId,
    uri,
    nowStamp(),
  ]).lastInsertRowId;
}

/** Removes the row and returns the URI so the caller can delete the file. */
export function removeAttachment(db: Db, id: number): string | null {
  const row = db.getFirstSync<{ uri: string }>('SELECT uri FROM attachments WHERE id = ?', [id]);
  db.runSync('DELETE FROM attachments WHERE id = ?', [id]);
  return row?.uri ?? null;
}
