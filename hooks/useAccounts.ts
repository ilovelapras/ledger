import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { accountRepo } from '../db/repositories/AccountRepo';
import { transactionRepo } from '../db/repositories/TransactionRepo';
import type { Account, AccountType } from '../types';

interface AccountState {
  accounts: Account[];
  accountsByType: Record<AccountType, Account[]>;
  tree: Account[];
  balances: Map<number, number>;
  isLoading: boolean;
  error: string | null;
  
  loadAccounts: (activeOnly?: boolean) => Promise<void>;
  loadTree: (activeOnly?: boolean) => Promise<void>;
  loadBalances: (asOfDate?: string) => Promise<void>;
  getAccount: (id: number) => Account | undefined;
  getAccountBalance: (id: number, asOfDate?: string) => number;
  createAccount: (account: Omit<Account, 'id' | 'created_at' | 'children' | 'balance'>) => Promise<number>;
  updateAccount: (id: number, updates: Partial<Omit<Account, 'id' | 'created_at' | 'children' | 'balance'>>) => Promise<boolean>;
  deleteAccount: (id: number) => Promise<boolean>;
  setActive: (id: number, isActive: number) => Promise<boolean>;
  refresh: () => Promise<void>;
}

export const useAccountStore = create<AccountState>()(
  persist(
    (set, get) => ({
      accounts: [],
      accountsByType: {
        asset: [],
        liability: [],
        equity: [],
        income: [],
        expense: [],
      },
      tree: [],
      balances: new Map(),
      isLoading: false,
      error: null,

      loadAccounts: async (activeOnly = true) => {
        set({ isLoading: true, error: null });
        try {
          const accounts = accountRepo.getAll(activeOnly);
          const byType: Record<AccountType, Account[]> = {
            asset: [],
            liability: [],
            equity: [],
            income: [],
            expense: [],
          };
          
          for (const acc of accounts) {
            (byType[acc.type] as Account[]).push(acc);
          }
          
          set({ accounts, accountsByType: byType, isLoading: false });
        } catch (e) {
          set({ error: (e as Error).message, isLoading: false });
        }
      },

      loadTree: async (activeOnly = true) => {
        set({ isLoading: true, error: null });
        try {
          const tree = accountRepo.getTree(activeOnly);
          set({ tree, isLoading: false });
        } catch (e) {
          set({ error: (e as Error).message, isLoading: false });
        }
      },

      loadBalances: async (asOfDate?: string) => {
        try {
          const balances = transactionRepo.getAccountBalances(asOfDate);
          set({ balances });
        } catch (e) {
          set({ error: (e as Error).message });
        }
      },

      getAccount: (id: number) => {
        return get().accounts.find(a => a.id === id);
      },

      getAccountBalance: (id: number, asOfDate?: string) => {
        const cached = get().balances.get(id);
        if (cached !== undefined && !asOfDate) return cached;
        
        return transactionRepo.getBalance(id, asOfDate);
      },

      createAccount: async (account) => {
        set({ isLoading: true, error: null });
        try {
          const id = accountRepo.create(account);
          await get().refresh();
          return id;
        } catch (e) {
          set({ error: (e as Error).message, isLoading: false });
          throw e;
        }
      },

      updateAccount: async (id, updates) => {
        set({ isLoading: true, error: null });
        try {
          const result = accountRepo.update(id, updates);
          if (result) await get().refresh();
          return result;
        } catch (e) {
          set({ error: (e as Error).message, isLoading: false });
          throw e;
        }
      },

      deleteAccount: async (id) => {
        set({ isLoading: true, error: null });
        try {
          const result = accountRepo.delete(id);
          if (result) await get().refresh();
          return result;
        } catch (e) {
          set({ error: (e as Error).message, isLoading: false });
          throw e;
        }
      },

      setActive: async (id, isActive) => {
        set({ isLoading: true, error: null });
        try {
          const result = accountRepo.setActive(id, isActive);
          if (result) await get().refresh();
          return result;
        } catch (e) {
          set({ error: (e as Error).message, isLoading: false });
          throw e;
        }
      },

      refresh: async () => {
        await Promise.all([
          get().loadAccounts(),
          get().loadTree(),
          get().loadBalances(),
        ]);
      },
    }),
    {
      name: 'account-storage',
      partialize: (state) => ({
        accounts: state.accounts,
        tree: state.tree,
      }),
    }
  )
);

export function useAccounts() {
  const store = useAccountStore();
  return store;
}