import { getDb } from '../schema';
import type { Entry, EntryInput } from '../../types';

export class EntryRepo {
  private db = getDb();

  create(transactionId: number, entry: EntryInput): number {
    if (entry.debit > 0 && entry.credit > 0) {
      throw new Error('Entry cannot have both debit and credit');
    }
    if (entry.debit === 0 && entry.credit === 0) {
      throw new Error('Entry must have either debit or credit');
    }

    const result = this.db.runSync(
      'INSERT INTO entries (transaction_id, account_id, debit, credit) VALUES (?, ?, ?, ?)',
      [transactionId, entry.account_id, entry.debit, entry.credit]
    );
    return result.lastInsertRowId;
  }

  getByTransactionId(transactionId: number): Entry[] {
    return this.db.getAllSync<Entry>(
      'SELECT e.*, a.code, a.name, a.type FROM entries e JOIN accounts a ON e.account_id = a.id WHERE e.transaction_id = ?',
      [transactionId]
    );
  }

  getByAccountId(accountId: number, limit = 100): Entry[] {
    return this.db.getAllSync<Entry>(
      `SELECT e.*, a.code, a.name, a.type 
       FROM entries e 
       JOIN accounts a ON e.account_id = a.id 
       JOIN transactions t ON e.transaction_id = t.id
       WHERE e.account_id = ? 
       ORDER BY t.date DESC, t.created_at DESC 
       LIMIT ?`,
      [accountId, limit]
    );
  }

  delete(id: number): boolean {
    const result = this.db.runSync('DELETE FROM entries WHERE id = ?', [id]);
    return result.changes > 0;
  }

  getTrialBalance(asOfDate?: string): Array<{ account_id: number; debit: number; credit: number }> {
    let sql = `
      SELECT 
        e.account_id,
        SUM(e.debit) as debit,
        SUM(e.credit) as credit
      FROM entries e
      JOIN transactions t ON e.transaction_id = t.id
    `;
    const params: string[] = [];
    
    if (asOfDate) {
      sql += ' WHERE t.date <= ?';
      params.push(asOfDate);
    }
    
    sql += ' GROUP BY e.account_id';
    
    return this.db.getAllSync(sql, params);
  }
}

export const entryRepo = new EntryRepo();