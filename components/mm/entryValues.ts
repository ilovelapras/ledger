import { emptyForm, entriesToForm, type FormContext, type FormMode } from '../../domain/txForm';
import type { TransactionDetail } from '../../db/transactions';
import { toInput } from '../../db/transactions';
import type { FavoriteTemplate } from '../../db/favorites';
import type { EntryValues } from './EntryForm';

const EXTRAS = { time: '', repeat: 'off' as const, repeatEnd: '', installments: 1 };

export function newEntryValues(mode: FormMode, date: string, moneyAccountId: number | null): EntryValues {
  const v = emptyForm(mode, date);
  if (mode === 'transfer') v.fromId = moneyAccountId;
  else v.moneyAccountId = moneyAccountId;
  return { ...v, ...EXTRAS };
}

export function favoriteEntryValues(t: FavoriteTemplate, date: string): EntryValues {
  return { ...emptyForm(t.mode, date), ...t, date, reference: '', ...EXTRAS };
}

/**
 * Values for editing or copying a saved transaction. Returns null when it can't be shown in the
 * simple Income/Expense/Transfer layout (journals, split lines).
 */
export function transactionEntryValues(tx: TransactionDetail, ctx: FormContext): EntryValues | null {
  const v = entriesToForm(
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
  if (v.mode === 'journal' || (v.mode !== 'transfer' && v.lines.length !== 1)) return null;
  return { ...v, ...EXTRAS, time: tx.time ?? '' };
}
