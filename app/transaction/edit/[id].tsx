import React, { useMemo } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { entriesToForm } from '../../../domain/txForm';
import { getTransaction, toInput } from '../../../db/transactions';
import { useDb } from '../../../hooks/useLedger';
import { TransactionForm, useTxFormContext } from '../../../components/forms/TransactionForm';
import { EmptyState } from '../../../components/ui';

export default function EditTransaction() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDb();
  const ctx = useTxFormContext();

  const loaded = useMemo(() => {
    const tx = getTransaction(db, Number(id));
    if (!tx || !ctx) return null;
    const values = entriesToForm(
      {
        kind: tx.kind,
        date: tx.date,
        reference: tx.reference,
        description: tx.description,
        memo: tx.memo,
        payeeName: tx.payee_name ?? '',
        entries: toInput(tx).entries,
      },
      ctx
    );
    const friendly = tx.kind === 'payment' || tx.kind === 'receipt' || tx.kind === 'transfer' || tx.kind === 'journal';
    return { values, tx, fixedKind: friendly && values.mode === tx.kind ? undefined : tx.kind };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!loaded) return <EmptyState title="Transaction not found" />;
  return (
    <TransactionForm
      initial={loaded.values}
      editId={loaded.tx.id}
      fixedKind={loaded.fixedKind}
      onSaved={() => router.back()}
    />
  );
}
