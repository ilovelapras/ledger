import { getDb } from '../schema';
import type { Transaction, TransactionInput, Entry, EntryInput } from '../../types';

export class TransactionRepo {
  private db = getDb();

  create(input: TransactionInput): number {
    let transactionId = 0;
    this.db.withTransactionSync(() => {
      const now = new Date().toISOString();
      
      const txResult = this.db.runSync(
        'INSERT INTO transactions (date, description, reference, created_at) VALUES (?, ?, ?, ?)',
        [input.date, input.description, input.reference ?? null, now]
      );
      transactionId = txResult.lastInsertRowId;

      let totalDebit = 0;
      let totalCredit = 0;
      
      const entryStmt = this.db.prepareSync(
        'INSERT INTO entries (transaction_id, account_id, debit, credit) VALUES (?, ?, ?, ?)'
      );
      
      for (const entry of input.entries) {
        totalDebit += entry.debit;
        totalCredit += entry.credit;
        
        if (entry.debit > 0 && entry.credit > 0) {
          throw new Error('Entry cannot have both debit and credit');
        }
        if (entry.debit === 0 && entry.credit === 0) {
          throw new Error('Entry must have either debit or credit');
        }
        
        entryStmt.executeSync([transactionId, entry.account_id, entry.debit, entry.credit]);
      }
      
      entryStmt.finalizeSync();

      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        throw new Error(`Transaction unbalanced: debits ${totalDebit} != credits ${totalCredit}`);
      }
    });
    return transactionId;
  }

  getById(id: number): Transaction | null {
    const tx = this.db.getFirstSync<Transaction>('SELECT * FROM transactions WHERE id = ?', [id]);
    if (!tx) return null;
    
    const entries = this.db.getAllSync<Entry>(
      'SELECT e.*, a.code, a.name, a.type FROM entries e JOIN accounts a ON e.account_id = a.id WHERE e.transaction_id = ?',
      [id]
    );
    
    return { ...tx, entries };
  }

  getAll(limit = 100, offset = 0): Transaction[] {
    const txs = this.db.getAllSync<Transaction>(
      'SELECT * FROM transactions ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?',
      [limit, offset]
    );
    
    for (const tx of txs) {
      const entries = this.db.getAllSync<Entry>(
        'SELECT e.*, a.code, a.name, a.type FROM entries e JOIN accounts a ON e.account_id = a.id WHERE e.transaction_id = ?',
        [tx.id]
      );
      tx.entries = entries;
    }
    
    return txs;
  }

  getByDateRange(startDate: string, endDate: string): Transaction[] {
    const txs = this.db.getAllSync<Transaction>(
      'SELECT * FROM transactions WHERE date >= ? AND date <= ? ORDER BY date DESC',
      [startDate, endDate]
    );
    
    for (const tx of txs) {
      const entries = this.db.getAllSync<Entry>(
        'SELECT e.*, a.code, a.name, a.type FROM entries e JOIN accounts a ON e.account_id = a.id WHERE e.transaction_id = ?',
        [tx.id]
      );
      tx.entries = entries;
    }
    
    return txs;
  }

  update(id: number, input: TransactionInput): boolean {
    let result = false;
    this.db.withTransactionSync(() => {
      const txResult = this.db.runSync(
        'UPDATE transactions SET date = ?, description = ?, reference = ? WHERE id = ?',
        [input.date, input.description, input.reference ?? null, id]
      );
      
      if (txResult.changes === 0) {
        result = false;
        return;
      }
      
      this.db.runSync('DELETE FROM entries WHERE transaction_id = ?', [id]);
      
      let totalDebit = 0;
      let totalCredit = 0;
      
      const entryStmt = this.db.prepareSync(
        'INSERT INTO entries (transaction_id, account_id, debit, credit) VALUES (?, ?, ?, ?)'
      );
      
      for (const entry of input.entries) {
        totalDebit += entry.debit;
        totalCredit += entry.credit;
        
        if (entry.debit > 0 && entry.credit > 0) {
          throw new Error('Entry cannot have both debit and credit');
        }
        if (entry.debit === 0 && entry.credit === 0) {
          throw new Error('Entry must have either debit or credit');
        }
        
        entryStmt.executeSync([id, entry.account_id, entry.debit, entry.credit]);
      }
      
      entryStmt.finalizeSync();

      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        throw new Error(`Transaction unbalanced: debits ${totalDebit} != credits ${totalCredit}`);
      }

      result = true;
    });
    return result;
  }

  delete(id: number): boolean {
    const result = this.db.runSync('DELETE FROM transactions WHERE id = ?', [id]);
    return result.changes > 0;
  }

  getBalance(accountId: number, asOfDate?: string): number {
    let sql = `
      SELECT 
        SUM(CASE WHEN a.type IN ('asset', 'expense') THEN e.debit - e.credit ELSE e.credit - e.debit END) as balance
      FROM entries e
      JOIN accounts a ON e.account_id = a.id
      JOIN transactions t ON e.transaction_id = t.id
      WHERE e.account_id = ?
    `;
    const params: (number | string)[] = [accountId];
    
    if (asOfDate) {
      sql += ' AND t.date <= ?';
      params.push(asOfDate);
    }
    
    const result = this.db.getFirstSync<{ balance: number }>(sql, params);
    return result?.balance ?? 0;
  }

  getAccountBalances(asOfDate?: string): Map<number, number> {
    let sql = `
      SELECT 
        e.account_id,
        SUM(CASE WHEN a.type IN ('asset', 'expense') THEN e.debit - e.credit ELSE e.credit - e.debit END) as balance
      FROM entries e
      JOIN accounts a ON e.account_id = a.id
      JOIN transactions t ON e.transaction_id = t.id
    `;
    const params: (string)[] = [];
    
    if (asOfDate) {
      sql += ' WHERE t.date <= ?';
      params.push(asOfDate);
    }
    
    sql += ' GROUP BY e.account_id';
    
    const results = this.db.getAllSync<{ account_id: number; balance: number }>(sql, params);
    const map = new Map<number, number>();
    for (const r of results) {
      map.set(r.account_id, r.balance);
    }
    return map;
  }
}

export const transactionRepo = new TransactionRepo();