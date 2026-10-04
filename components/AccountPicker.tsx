import React, { useMemo } from 'react';
import { buildTree, flattenTree } from '../domain/accounting';
import type { Account } from '../domain/types';
import { listAccounts } from '../db/accounts';
import { useLedgerQuery, useSettings } from '../hooks/useLedger';
import { Select, type SelectOption } from './ui';

export function useAccounts(includeInactive = false): Account[] {
  return useLedgerQuery((db) => listAccounts(db, includeInactive), [includeInactive]);
}

export function useAccountMap(): Map<number, Account> {
  const accounts = useAccounts(true);
  return useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
}

interface AccountPickerProps {
  value: number | null | undefined;
  onChange: (id: number) => void;
  /** Which postable accounts to offer. Header accounts are always shown (disabled) for context. */
  filter?: (a: Account) => boolean;
  label?: string;
  placeholder?: string;
  error?: string;
  compact?: boolean;
  /** Allow choosing header accounts (e.g. as a parent). */
  allowHeaders?: boolean;
  exclude?: number[];
}

export function AccountPicker({
  value,
  onChange,
  filter = () => true,
  label,
  placeholder = 'Choose account',
  error,
  compact,
  allowHeaders,
  exclude = [],
}: AccountPickerProps) {
  const accounts = useAccounts();
  const { baseCurrency } = useSettings();

  const options = useMemo<SelectOption<number>[]>(() => {
    const matches = new Set(
      accounts.filter((a) => filter(a) && !exclude.includes(a.id) && (allowHeaders || !a.is_placeholder)).map((a) => a.id)
    );
    // Keep ancestors of matching accounts so the hierarchy reads properly.
    const byId = new Map(accounts.map((a) => [a.id, a]));
    const keep = new Set(matches);
    for (const id of matches) {
      let p = byId.get(id)?.parent_id;
      while (p != null && !keep.has(p)) {
        keep.add(p);
        p = byId.get(p)?.parent_id;
      }
    }
    return flattenTree(buildTree(accounts.filter((a) => keep.has(a.id)))).map(({ node, depth }) => {
      const a = node.account;
      return {
        value: a.id,
        label: a.name,
        sublabel: `${a.code}${a.currency !== baseCurrency ? ` · ${a.currency}` : ''}`,
        depth,
        disabled: !matches.has(a.id),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, baseCurrency, filter, allowHeaders, exclude.join(',')]);

  return (
    <Select
      options={options}
      value={value ?? null}
      onChange={onChange}
      label={label}
      title={label ?? 'Account'}
      placeholder={placeholder}
      error={error}
      compact={compact}
    />
  );
}
