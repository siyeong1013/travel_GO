import { describe, expect, it } from 'vitest';
import { budgetText, readBudget } from '@/features/expenses/budgetForm';

describe('budget field', () => {
  it('reads an amount in the settlement currency, or no budget when empty', () => {
    expect(readBudget('1,000,000', 'KRW')).toEqual({ budget: 1_000_000 });
    expect(readBudget('250.5', 'USD')).toEqual({ budget: 25_050 });
    expect(readBudget('  ', 'KRW')).toEqual({ budget: null });
    expect(readBudget('0', 'KRW')).toEqual({ error: '0보다 큰 금액을 입력해 주세요.' });
    expect(readBudget('12.5', 'JPY')).toEqual({
      error: '금액을 숫자로 입력해 주세요. 소수점은 쓸 수 없어요.',
    });
  });

  it('starts from the current budget', () => {
    expect(budgetText(25_050, 'USD')).toBe('250.50');
    expect(budgetText(null, 'KRW')).toBe('');
  });
});
