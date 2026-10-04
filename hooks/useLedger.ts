import { useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { create } from 'zustand';
import type { Db } from '../db/client';
import { getSettings, type Settings } from '../db/settings';

interface LedgerState {
  /** Bumped after every write so every query hook re-runs. */
  version: number;
  bump: () => void;
}

export const useLedgerStore = create<LedgerState>((set) => ({
  version: 0,
  bump: () => set((s) => ({ version: s.version + 1 })),
}));

export function useDb(): Db {
  return useSQLiteContext();
}

/** Run a synchronous repository read; re-runs when data changes or deps change. */
export function useLedgerQuery<T>(fn: (db: Db) => T, deps: unknown[]): T {
  const db = useDb();
  const version = useLedgerStore((s) => s.version);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => fn(db), [db, version, ...deps]);
}

export function useSettings(): Settings {
  return useLedgerQuery(getSettings, []);
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Run a write, refresh all queries, and surface failures as an alert.
 * Returns the write's result, or undefined if it failed.
 */
export function useMutation() {
  const db = useDb();
  const bump = useLedgerStore((s) => s.bump);
  return useCallback(
    <T,>(fn: (db: Db) => T, failTitle = 'Could not save'): T | undefined => {
      try {
        const result = fn(db);
        bump();
        return result;
      } catch (e) {
        Alert.alert(failTitle, errorMessage(e));
        return undefined;
      }
    },
    [db, bump]
  );
}
