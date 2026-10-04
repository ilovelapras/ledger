import { getDb } from '../schema';
import type { Account, AccountType } from '../../types';

export class AccountRepo {
  private db = getDb();

  create(account: Omit<Account, 'id' | 'created_at' | 'children' | 'balance'>): number {
    const now = new Date().toISOString();
    const result = this.db.runSync(
      'INSERT INTO accounts (code, name, type, parent_id, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [account.code, account.name, account.type, account.parent_id ?? null, account.is_active ?? 1, now]
    );
    return result.lastInsertRowId;
  }

  getById(id: number): Account | null {
    return this.db.getFirstSync<Account>('SELECT * FROM accounts WHERE id = ?', [id]) ?? null;
  }

  getByCode(code: string): Account | null {
    return this.db.getFirstSync<Account>('SELECT * FROM accounts WHERE code = ?', [code]) ?? null;
  }

  getAll(activeOnly = true): Account[] {
    const sql = activeOnly 
      ? 'SELECT * FROM accounts WHERE is_active = 1 ORDER BY code'
      : 'SELECT * FROM accounts ORDER BY code';
    return this.db.getAllSync<Account>(sql);
  }

  getByType(type: AccountType, activeOnly = true): Account[] {
    const sql = activeOnly
      ? 'SELECT * FROM accounts WHERE type = ? AND is_active = 1 ORDER BY code'
      : 'SELECT * FROM accounts WHERE type = ? ORDER BY code';
    return this.db.getAllSync<Account>(sql, [type]);
  }

  getChildren(parentId: number): Account[] {
    return this.db.getAllSync<Account>('SELECT * FROM accounts WHERE parent_id = ? ORDER BY code', [parentId]);
  }

  getTree(activeOnly = true): Account[] {
    const accounts = this.getAll(activeOnly);
    const map = new Map<number, Account>();
    const roots: Account[] = [];

    for (const acc of accounts) {
      map.set(acc.id, { ...acc, children: [] });
    }

    for (const acc of accounts) {
      const node = map.get(acc.id)!;
      if (acc.parent_id) {
        const parent = map.get(acc.parent_id);
        if (parent) {
          parent.children!.push(node);
        } else {
          roots.push(node);
        }
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  update(id: number, updates: Partial<Omit<Account, 'id' | 'created_at' | 'children' | 'balance'>>): boolean {
    const fields: string[] = [];
    const values: (string | number | null)[] = [];
    
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }
    
    if (fields.length === 0) return false;
    
    values.push(id);
    const result = this.db.runSync(`UPDATE accounts SET ${fields.join(', ')} WHERE id = ?`, values);
    return result.changes > 0;
  }

  delete(id: number): boolean {
    const children = this.getChildren(id);
    if (children.length > 0) return false;
    
    const result = this.db.runSync('DELETE FROM accounts WHERE id = ?', [id]);
    return result.changes > 0;
  }

  setActive(id: number, isActive: number): boolean {
    return this.update(id, { is_active: isActive });
  }
}

export const accountRepo = new AccountRepo();