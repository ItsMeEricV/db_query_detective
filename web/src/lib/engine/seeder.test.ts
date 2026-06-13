import { describe, it, expect } from 'vitest';
import { makeRng, hashSeed, generateRows, domains, MODES, type ColumnSpec } from './seeder';

const orderedCol: ColumnSpec = {
  name: 'created_at',
  role: 'ordered',
  domain: domains.int(1),
  dist: { cardinality: 100, skew: { kind: 'uniform' }, nullFraction: 0 },
};
const fkCol: ColumnSpec = {
  name: 'user_id',
  role: 'fanOutFk',
  domain: domains.fromPool([10, 20, 30, 40, 50]),
  dist: { cardinality: 5, skew: { kind: 'uniform' }, nullFraction: 0 },
};

const asc = (xs: number[]) => [...xs].sort((a, b) => a - b);

describe('seeder', () => {
  it('produces identical rows for the same seed', () => {
    const gen = () =>
      generateRows([orderedCol, fkCol], 50, MODES.append_order, {}, makeRng(hashSeed('orders')));
    expect(gen()).toEqual(gen());
  });

  it('gives different streams for different (table, mode) seeds', () => {
    expect(hashSeed('orders', 'append_order')).not.toBe(hashSeed('users', 'append_order'));
    expect(hashSeed('orders', 'append_order')).not.toBe(hashSeed('orders', 'fan_out'));
  });

  it('append_order sorts by the ordered column while the FK stays unaligned', () => {
    const rows = generateRows([orderedCol, fkCol], 200, MODES.append_order, {}, makeRng(7));
    const ordered = rows.map((r) => r[0] as number);
    expect(ordered).toEqual(asc(ordered)); // physical correlation ≈ 1

    const fks = rows.map((r) => r[1] as number);
    expect(fks).not.toEqual(asc(fks)); // FK independent of row position — no alignment
  });

  it('shuffled keeps the same values but breaks correlation', () => {
    const ordered = (mode: typeof MODES.append_order) =>
      generateRows([orderedCol, fkCol], 200, mode, {}, makeRng(7)).map((r) => r[0] as number);
    const sorted = ordered(MODES.append_order);
    const shuffled = ordered(MODES.shuffled);

    expect(asc(shuffled)).toEqual(asc(sorted)); // same multiset of values
    expect(shuffled).not.toEqual(sorted); // different physical order
  });

  it('high_skew concentrates the value axis on a few hot values', () => {
    const skewCol: ColumnSpec = {
      name: 'status',
      role: 'skewValue',
      domain: domains.int(1),
      dist: { cardinality: 20, skew: { kind: 'uniform' }, nullFraction: 0 },
    };
    const rows = generateRows([skewCol], 1000, MODES.high_skew, {}, makeRng(3));
    const counts = new Map<number, number>();
    for (const [v] of rows) counts.set(v as number, (counts.get(v as number) ?? 0) + 1);

    // Zipfian head dwarfs the ~50/value a uniform distribution would give.
    expect(Math.max(...counts.values())).toBeGreaterThan(150);
  });
});
