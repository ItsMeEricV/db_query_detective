import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getCachedDemoQueries, setCachedDemoQueries, getDemoQueriesSnapshot } from './session';

const KEY = 'dqd.demo_queries';
const query = { title: 't', description: 'd', complexity: 1, sql: 'SELECT 1' };

let store: Map<string, string>;

beforeEach(() => {
  store = new Map();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    },
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('demo-query cache', () => {
  it('degrades a malformed cache blob to an empty list', () => {
    store.set(KEY, '{not valid json');
    expect(getCachedDemoQueries()).toEqual([]);
  });

  it('degrades a schema-invalid blob to an empty list', () => {
    store.set(KEY, JSON.stringify([{ title: 't' }])); // missing fields
    expect(getCachedDemoQueries()).toEqual([]);
  });

  it('round-trips a valid cache', () => {
    setCachedDemoQueries([query]);
    expect(getCachedDemoQueries()).toEqual([query]);
  });

  it('returns a stable snapshot reference until the cache changes', () => {
    setCachedDemoQueries([query]);
    const a = getDemoQueriesSnapshot();
    const b = getDemoQueriesSnapshot();
    expect(b).toBe(a); // same reference — required by useSyncExternalStore

    setCachedDemoQueries([query, { ...query, title: 'u' }]);
    expect(getDemoQueriesSnapshot()).not.toBe(a); // new reference after a write
  });
});
