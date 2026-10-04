import type { AuditRecord } from '../domain/types';
import { nowStamp, type Db } from './client';

export function writeAudit(
  db: Db,
  action: AuditRecord['action'],
  entity: string,
  entityId: number,
  before: unknown,
  after: unknown
): void {
  db.runSync(
    'INSERT INTO audit_log (ts, action, entity, entity_id, before_json, after_json) VALUES (?, ?, ?, ?, ?, ?)',
    [
      nowStamp(),
      action,
      entity,
      entityId,
      before == null ? null : JSON.stringify(before),
      after == null ? null : JSON.stringify(after),
    ]
  );
}

export function getAudit(db: Db, entity: string, entityId: number): AuditRecord[] {
  return db.getAllSync<AuditRecord>(
    'SELECT * FROM audit_log WHERE entity = ? AND entity_id = ? ORDER BY id DESC',
    [entity, entityId]
  );
}
