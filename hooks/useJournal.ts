import { create } from 'zustand';
import { transactionRepo } from '../db/repositories/TransactionRepo';
import { accountRepo } from '../db/repositories/AccountRepo';
import type { Transaction, TransactionInput, EntryInput, Account } from '../types';
import { validateTransactionBalance } from '../utils/accounting';

interface JournalState {
  transactions: Transaction[];
  currentTransaction: TransactionInput | null;
  isLoading: boolean;
  error: string | null;
  validationError: string | null;
  
  loadTransactions: (limit?: number, offset?: number) => Promise<void>;
  loadTransactionsByDateRange: (startDate: string, endDate: string) => Promise<void>;
  getTransaction: (id: number) => Transaction | null;
  createTransaction: (input: TransactionInput) => Promise<number>;
  updateTransaction: (id: number, input: TransactionInput) => Promise<boolean>;
  deleteTransaction: (id: number) => Promise<boolean>;
  setCurrentTransaction: (input: TransactionInput | null) => void;
  addEntry: (entry: EntryInput) => void;
  removeEntry: (index: number) => void;
  updateEntry: (index: number, entry: Partial<EntryInput>) => void;
  validateCurrent: () => boolean;
  clearCurrent: () => void;
  getDebitTotal: () => number;
  getCreditTotal: () => number;
  isBalanced: () => boolean;
}

function createEmptyTransaction(): TransactionInput {
  return {
    date: new Date().toISOString().split('T')[0],
    description: '',
    reference: null,
    entries: [],
  };
}

export const useJournalStore = create<JournalState>((set, get) => ({
  transactions: [],
  currentTransaction: createEmptyTransaction(),
  isLoading: false,
  error: null,
  validationError: null,

  loadTransactions: async (limit = 100, offset = 0) => {
    set({ isLoading: true, error: null });
    try {
      const transactions = transactionRepo.getAll(limit, offset);
      set({ transactions, isLoading: false });
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
    }
  },

  loadTransactionsByDateRange: async (startDate: string, endDate: string) => {
    set({ isLoading: true, error: null });
    try {
      const transactions = transactionRepo.getByDateRange(startDate, endDate);
      set({ transactions, isLoading: false });
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
    }
  },

  getTransaction: (id: number) => {
    return transactionRepo.getById(id);
  },

  createTransaction: async (input: TransactionInput) => {
    set({ isLoading: true, error: null, validationError: null });
    try {
      if (!validateTransactionBalance(input.entries)) {
        throw new Error('Transaction must balance: total debits must equal total credits');
      }
      
      if (input.entries.length < 2) {
        throw new Error('Transaction must have at least 2 entries');
      }
      
      const id = transactionRepo.create(input);
      
      await get().loadTransactions();
      set({ currentTransaction: createEmptyTransaction(), isLoading: false });
      return id;
    } catch (e) {
      const msg = (e as Error).message;
      set({ error: msg, validationError: msg, isLoading: false });
      throw e;
    }
  },

  updateTransaction: async (id: number, input: TransactionInput) => {
    set({ isLoading: true, error: null, validationError: null });
    try {
      if (!validateTransactionBalance(input.entries)) {
        throw new Error('Transaction must balance: total debits must equal total credits');
      }
      
      if (input.entries.length < 2) {
        throw new Error('Transaction must have at least 2 entries');
      }
      
      const result = transactionRepo.update(id, input);
      
      if (result) {
        await get().loadTransactions();
      }
      
      set({ isLoading: false });
      return result;
    } catch (e) {
      const msg = (e as Error).message;
      set({ error: msg, validationError: msg, isLoading: false });
      throw e;
    }
  },

  deleteTransaction: async (id: number) => {
    set({ isLoading: true, error: null });
    try {
      const result = transactionRepo.delete(id);
      if (result) {
        await get().loadTransactions();
      }
      set({ isLoading: false });
      return result;
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
      throw e;
    }
  },

  setCurrentTransaction: (input: TransactionInput | null) => {
    set({ currentTransaction: input ?? createEmptyTransaction() });
  },

  addEntry: (entry: EntryInput) => {
    const current = get().currentTransaction;
    if (!current) return;
    
    const newEntries = [...current.entries, entry];
    set({ 
      currentTransaction: { ...current, entries: newEntries },
      validationError: null,
    });
  },

  removeEntry: (index: number) => {
    const current = get().currentTransaction;
    if (!current) return;
    
    const newEntries = current.entries.filter((_, i) => i !== index);
    set({ 
      currentTransaction: { ...current, entries: newEntries },
      validationError: null,
    });
  },

  updateEntry: (index: number, entry: Partial<EntryInput>) => {
    const current = get().currentTransaction;
    if (!current) return;
    
    const newEntries = [...current.entries];
    newEntries[index] = { ...newEntries[index], ...entry };
    set({ 
      currentTransaction: { ...current, entries: newEntries },
      validationError: null,
    });
  },

  validateCurrent: () => {
    const current = get().currentTransaction;
    if (!current) return false;
    
    if (current.entries.length < 2) {
      set({ validationError: 'At least 2 entries required' });
      return false;
    }
    
    if (!validateTransactionBalance(current.entries)) {
      const totalDebit = current.entries.reduce((sum, e) => sum + e.debit, 0);
      const totalCredit = current.entries.reduce((sum, e) => sum + e.credit, 0);
      set({ validationError: `Unbalanced: Debits ${totalDebit.toFixed(2)} ≠ Credits ${totalCredit.toFixed(2)}` });
      return false;
    }
    
    set({ validationError: null });
    return true;
  },

  clearCurrent: () => {
    set({ currentTransaction: createEmptyTransaction(), validationError: null });
  },

  getDebitTotal: () => {
    const current = get().currentTransaction;
    if (!current) return 0;
    return current.entries.reduce((sum, e) => sum + e.debit, 0);
  },
  
  getCreditTotal: () => {
    const current = get().currentTransaction;
    if (!current) return 0;
    return current.entries.reduce((sum, e) => sum + e.credit, 0);
  },
  
  isBalanced: () => {
    const current = get().currentTransaction;
    if (!current) return false;
    return validateTransactionBalance(current.entries);
  },
}));

export function useJournal() {
  return useJournalStore();
}