import { create } from 'zustand';
import { transactionRepo } from '../db/repositories/TransactionRepo';
import { accountRepo } from '../db/repositories/AccountRepo';
import type { 
  BalanceSheetData, 
  ProfitLossData, 
  TrialBalanceData,
  Account 
} from '../types';
import { calculateBalance, getNormalBalance } from '../utils/accounting';

interface ReportState {
  balanceSheet: BalanceSheetData | null;
  profitLoss: ProfitLossData | null;
  trialBalance: TrialBalanceData[] | null;
  asOfDate: string | null;
  isLoading: boolean;
  error: string | null;
  
  generateBalanceSheet: (asOfDate?: string) => Promise<BalanceSheetData>;
  generateProfitLoss: (startDate?: string, endDate?: string) => Promise<ProfitLossData>;
  generateTrialBalance: (asOfDate?: string) => Promise<TrialBalanceData[]>;
  generateAllReports: (asOfDate?: string) => Promise<void>;
  setDate: (date: string | null) => void;
}

function emptyBalanceSheet(): BalanceSheetData {
  return {
    assets: [],
    liabilities: [],
    equity: [],
    totalAssets: 0,
    totalLiabilities: 0,
    totalEquity: 0,
  };
}

function emptyProfitLoss(): ProfitLossData {
  return {
    income: [],
    expenses: [],
    totalIncome: 0,
    totalExpenses: 0,
    netIncome: 0,
  };
}

export const useReportStore = create<ReportState>((set, get) => ({
  balanceSheet: null,
  profitLoss: null,
  trialBalance: null,
  asOfDate: null,
  isLoading: false,
  error: null,

  generateBalanceSheet: async (asOfDate?: string) => {
    set({ isLoading: true, error: null });
    try {
      const date = asOfDate ?? new Date().toISOString().split('T')[0];
      const balances = transactionRepo.getAccountBalances(date);
      
      const allAccounts = accountRepo.getAll(true);
      
      const assets: BalanceSheetData['assets'] = [];
      const liabilities: BalanceSheetData['liabilities'] = [];
      const equity: BalanceSheetData['equity'] = [];
      
      let totalAssets = 0;
      let totalLiabilities = 0;
      let totalEquity = 0;
      
      for (const acc of allAccounts) {
        const balance = balances.get(acc.id) ?? 0;
        if (balance === 0) continue;
        
        const item = { account: acc, balance };
        
        switch (acc.type) {
          case 'asset':
            assets.push(item);
            totalAssets += balance;
            break;
          case 'liability':
            liabilities.push(item);
            totalLiabilities += balance;
            break;
          case 'equity':
            equity.push(item);
            totalEquity += balance;
            break;
        }
      }
      
      const netIncome = get().profitLoss?.netIncome ?? 0;
      if (netIncome !== 0) {
        const retainedEarnings = allAccounts.find(a => a.code === '3100');
        if (retainedEarnings) {
          equity.push({ account: retainedEarnings, balance: netIncome });
          totalEquity += netIncome;
        }
      }
      
      const result: BalanceSheetData = {
        assets,
        liabilities,
        equity,
        totalAssets,
        totalLiabilities,
        totalEquity,
      };
      
      set({ balanceSheet: result, asOfDate: date, isLoading: false });
      return result;
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
      throw e;
    }
  },

  generateProfitLoss: async (startDate?: string, endDate?: string) => {
    set({ isLoading: true, error: null });
    try {
      const end = endDate ?? new Date().toISOString().split('T')[0];
      const start = startDate ?? new Date(new Date(end).getFullYear(), 0, 1).toISOString().split('T')[0];
      
      const transactions = transactionRepo.getByDateRange(start, end);
      const balances = new Map<number, { debit: number; credit: number }>();
      
      for (const tx of transactions) {
        if (!tx.entries) continue;
        for (const entry of tx.entries) {
          const existing = balances.get(entry.account_id) ?? { debit: 0, credit: 0 };
          existing.debit += entry.debit;
          existing.credit += entry.credit;
          balances.set(entry.account_id, existing);
        }
      }
      
      const allAccounts = accountRepo.getAll(true);
      
      const income: ProfitLossData['income'] = [];
      const expenses: ProfitLossData['expenses'] = [];
      
      let totalIncome = 0;
      let totalExpenses = 0;
      
      for (const acc of allAccounts) {
        const bal = balances.get(acc.id);
        if (!bal) continue;
        
        const balance = calculateBalance(acc.type, bal.debit, bal.credit);
        if (balance === 0) continue;
        
        const item = { account: acc, balance };
        
        if (acc.type === 'income') {
          income.push(item);
          totalIncome += balance;
        } else if (acc.type === 'expense') {
          expenses.push(item);
          totalExpenses += balance;
        }
      }
      
      const result: ProfitLossData = {
        income,
        expenses,
        totalIncome,
        totalExpenses,
        netIncome: totalIncome - totalExpenses,
      };
      
      set({ profitLoss: result, isLoading: false });
      return result;
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
      throw e;
    }
  },

  generateTrialBalance: async (asOfDate?: string) => {
    set({ isLoading: true, error: null });
    try {
      const date = asOfDate ?? new Date().toISOString().split('T')[0];
      const balances = transactionRepo.getAccountBalances(date);
      const allAccounts = accountRepo.getAll(true);
      
      const result: TrialBalanceData[] = [];
      
      for (const acc of allAccounts) {
        const balance = balances.get(acc.id) ?? 0;
        if (balance === 0) continue;
        
        const normalBalance = getNormalBalance(acc.type);
        const debit = normalBalance === 'debit' && balance > 0 ? balance : 0;
        const credit = normalBalance === 'credit' && balance > 0 ? balance : 0;
        const debitNeg = normalBalance === 'debit' && balance < 0 ? Math.abs(balance) : 0;
        const creditNeg = normalBalance === 'credit' && balance < 0 ? Math.abs(balance) : 0;
        
        result.push({
          account: acc,
          debit: debit + creditNeg,
          credit: credit + debitNeg,
          balance,
        });
      }
      
      set({ trialBalance: result, isLoading: false });
      return result;
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
      throw e;
    }
  },

  generateAllReports: async (asOfDate?: string) => {
    set({ isLoading: true, error: null });
    try {
      await Promise.all([
        get().generateProfitLoss(),
        get().generateBalanceSheet(asOfDate),
        get().generateTrialBalance(asOfDate),
      ]);
      set({ isLoading: false });
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
      throw e;
    }
  },

  setDate: (date: string | null) => {
    set({ asOfDate: date });
  },
}));

export function useReports() {
  return useReportStore();
}