export interface BudgetLine {
  accountId: number;
  name: string;
  icon: string | null;
  budget: number;
  spent: number;
  remaining: number;
  /** spent / budget, 0 when there's no budget. */
  ratio: number;
  over: boolean;
}

export interface BudgetSummary {
  lines: BudgetLine[];
  totalBudget: number;
  totalSpent: number;
  totalRemaining: number;
  ratio: number;
}

/**
 * Budget vs actual for top-level expense categories. Categories without a budget are listed only
 * when something was spent, so the total spent still matches the Stats tab.
 */
export function budgetSummary(
  categories: { id: number; name: string; icon: string | null }[],
  spent: Map<number, number>,
  budgetOf: (id: number) => number
): BudgetSummary {
  const lines: BudgetLine[] = [];
  for (const c of categories) {
    const budget = budgetOf(c.id);
    const s = spent.get(c.id) ?? 0;
    if (budget === 0 && s === 0) continue;
    lines.push({
      accountId: c.id,
      name: c.name,
      icon: c.icon,
      budget,
      spent: s,
      remaining: budget - s,
      ratio: budget > 0 ? s / budget : 0,
      over: budget > 0 && s > budget,
    });
  }
  lines.sort((a, b) => Number(b.budget > 0) - Number(a.budget > 0) || b.ratio - a.ratio || b.spent - a.spent);
  const totalBudget = lines.reduce((s, l) => s + l.budget, 0);
  const totalSpent = lines.reduce((s, l) => s + l.spent, 0);
  return { lines, totalBudget, totalSpent, totalRemaining: totalBudget - totalSpent, ratio: totalBudget ? totalSpent / totalBudget : 0 };
}
