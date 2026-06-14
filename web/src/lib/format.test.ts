import { describe, it, expect } from 'vitest';
import { formatCost, formatRows, formatMs, formatEstimateRatio } from './format';

describe('format', () => {
  it('groups cost with up to 2 decimals', () => {
    expect(formatCost(12480.5)).toBe('12,480.5');
    expect(formatCost(8.299)).toBe('8.3');
    expect(formatCost(1000000)).toBe('1,000,000');
  });

  it('rounds and groups row counts as integers', () => {
    expect(formatRows(49999)).toBe('49,999');
    expect(formatRows(1234.7)).toBe('1,235');
  });

  it('renders durations in ms with 2 decimals', () => {
    expect(formatMs(12.3)).toBe('12.30 ms');
    expect(formatMs(0)).toBe('0.00 ms');
  });

  it('expresses estimate divergence as a ≥1 multiplier', () => {
    expect(formatEstimateRatio(100, 10)).toBe('10×');
    expect(formatEstimateRatio(10, 100)).toBe('10×'); // symmetric
    expect(formatEstimateRatio(50, 50)).toBe('1×');
  });

  it('returns an em dash for non-finite or zero inputs', () => {
    expect(formatCost(NaN)).toBe('—');
    expect(formatEstimateRatio(0, 10)).toBe('—');
    expect(formatMs(Infinity)).toBe('—');
  });
});
