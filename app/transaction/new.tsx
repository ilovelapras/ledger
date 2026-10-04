import React, { useMemo } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { today } from '../../domain/dates';
import { emptyForm, entriesToForm, type FormMode } from '../../domain/txForm';
import { getTransaction, toInput } from '../../db/transactions';
import { useDb } from '../../hooks/useLedger';
import { TransactionForm, useTxFormContext } from '../../components/forms/TransactionForm';
import { EmptyState } from '../../components/ui';

const MODES: FormMode[] = ['payment', 'receipt', 'transfer', 'journal'];

/**
 * Params:
 *   mode       payment | receipt | transfer | journal
 *   accountId  prefill the bank/card (or transfer source)
 *   duplicate  transaction id to copy (dated today, new reference)
 */
export default function NewTransaction() {
  const params = useLocalSearchParams<{ mode?: string; accountId?: string; duplicate?: string }>();
  const db = useDb();
  const ctx = useTxFormContext();

  const initial = useMemo(() => {
    if (params.duplicate && ctx) {
      const tx = getTransaction(db, Number(params.duplicate));
      if (tx) {
        const input = toInput(tx);
        const v = entriesToForm(
          { kind: tx.kind, date: today(), reference: '', description: tx.description, memo: tx.memo, payeeName: tx.payee_name ?? '', entries: input.entries },
          ctx
        );
        return { ...v, date: today(), reference: '' };
      }
    }
    const mode = MODES.includes(params.mode as FormMode) ? (params.mode as FormMode) : 'payment';
    const v = emptyForm(mode, today());
    const acc = params.accountId ? Number(params.accountId) : null;
    if (acc) {
      if (mode === 'transfer') v.fromId = acc;
      else if (mode === 'journal') v.lines[0].accountId = acc;
      else v.moneyAccountId = acc;
    }
    return v;
    // Only compute once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ctx) return <EmptyState title="Missing system accounts" message="Restore accounts 4900, 5900 and 5810 in Accounts." />;
  return <TransactionForm initial={initial} onSaved={(id) => router.replace(`/transaction/${id}`)} />;
}
