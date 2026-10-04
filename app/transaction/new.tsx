import React, { useMemo } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { today } from '../../domain/dates';
import type { FormMode } from '../../domain/txForm';
import { buildFormContext } from '../../db/formContext';
import { listFavorites } from '../../db/favorites';
import { getSetting } from '../../db/settings';
import { getTransaction } from '../../db/transactions';
import { useDb } from '../../hooks/useLedger';
import { EntryForm } from '../../components/mm/EntryForm';
import { favoriteEntryValues, newEntryValues, transactionEntryValues } from '../../components/mm/entryValues';

/**
 * Params:
 *   mode       payment | receipt | transfer   (default: expense)
 *   date       YYYY-MM-DD                     (default: today; set when adding from a calendar day)
 *   accountId  prefill the account / transfer source
 *   toId       transfer destination (e.g. "Pay card")
 *   amount     prefill the amount (decimal text)
 *   copy       transaction id to copy (dated today)
 *   favorite   favourite id to start from
 */
export default function NewTransaction() {
  const p = useLocalSearchParams<{ mode?: string; date?: string; accountId?: string; toId?: string; amount?: string; copy?: string; favorite?: string }>();
  const db = useDb();

  const initial = useMemo(() => {
    const date = p.date && /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date : today();
    if (p.favorite) {
      const f = listFavorites(db).find((x) => x.id === Number(p.favorite));
      if (f) return favoriteEntryValues(f.template, date);
    }
    if (p.copy) {
      const tx = getTransaction(db, Number(p.copy));
      const v = tx ? transactionEntryValues(tx, buildFormContext(db)) : null;
      if (v) return { ...v, date, time: '', reference: '' };
    }
    const mode: FormMode = p.mode === 'receipt' || p.mode === 'transfer' ? p.mode : 'payment';
    const last = getSetting(db, 'last_money_account');
    const acct = p.accountId ? Number(p.accountId) : last ? Number(last) : null;
    const v = newEntryValues(mode, date, acct);
    if (mode === 'transfer' && p.toId) v.toId = Number(p.toId);
    if (p.amount) {
      if (mode === 'transfer') v.sent = p.amount;
      else v.lines[0].amount = p.amount;
    }
    return v;
    // Computed once per screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <EntryForm initial={initial} onSaved={(_, again) => !again && router.back()} />;
}
