import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

export const BudgetSchema = z.object({
  targetDurationSeconds: z.number().positive(),
  maxScenes: z.number().int().positive(),
  maxPaidMotionScenes: z.number().int().nonnegative(),
  maxPaidMotionSeconds: z.number().nonnegative(),
  maxCostPerShortInr: z.number().nonnegative(),
  paidMotionCostPerSecondInr: z.number().nonnegative()
});

export type Budget = z.infer<typeof BudgetSchema>;

export async function loadBudget(cwd = process.cwd()): Promise<Budget> {
  const text = await readFile(path.join(cwd, 'config', 'budget.json'), 'utf8');
  return BudgetSchema.parse(JSON.parse(text) as unknown);
}
