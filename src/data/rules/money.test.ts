import { describe, expect, it } from 'vitest';
import { convertAmount, isRate, parseAmount } from '@/data/rules/money';

describe('parseAmount', () => {
  it('reads amounts into minor units of the currency', () => {
    expect(parseAmount('12,000', 'KRW')).toBe(12000);
    expect(parseAmount('1200', 'JPY')).toBe(1200);
    expect(parseAmount('12.34', 'USD')).toBe(1234);
    expect(parseAmount('12.3', 'USD')).toBe(1230);
    expect(parseAmount('12', 'USD')).toBe(1200);
  });

  it('rejects more decimals than the currency has, and non-positive or huge amounts', () => {
    for (const [text, currency] of [
      ['12.345', 'USD'],
      ['1.5', 'KRW'],
      ['0', 'KRW'],
      ['-5', 'KRW'],
      ['abc', 'KRW'],
      ['1,000,000,000,001', 'KRW'],
    ]) {
      expect(parseAmount(text!, currency!), `${text} ${currency}`).toBeNull();
    }
  });
});

describe('isRate', () => {
  it('accepts positive decimal strings with up to 10 decimals', () => {
    expect(isRate('9.0412')).toBe(true);
    expect(isRate('0.000724')).toBe(true);
    for (const value of ['0', '0.0', '-1', '1e3', '1.12345678901', '', 9.04]) {
      expect(isRate(value), String(value)).toBe(false);
    }
  });
});

describe('convertAmount', () => {
  it('converts between minor units with one half-up rounding', () => {
    expect(convertAmount(1234, 'JPY', 'KRW', '9.0412')).toBe(11157); // 11,156.84
    expect(convertAmount(1234, 'USD', 'KRW', '1380.5')).toBe(17035); // $12.34 → 17,035.37
    expect(convertAmount(10000, 'KRW', 'USD', '0.000724')).toBe(724); // → $7.24
    expect(convertAmount(100000, 'VND', 'KRW', '0.0543')).toBe(5430);
    expect(convertAmount(5, 'JPY', 'KRW', '0.5')).toBe(3); // 2.5 rounds up
    expect(convertAmount(777, 'KRW', 'KRW', '1')).toBe(777);
  });
});
