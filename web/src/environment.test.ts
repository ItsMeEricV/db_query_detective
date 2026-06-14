import { afterEach, describe, expect, test } from 'vitest';
import { getGatewayApiKey } from '@/environment';

/**
 * The gateway key selects the LLM auth mode: a value → API-key auth (local dev);
 * undefined → the gateway falls back to OIDC (Vercel). The empty-string case
 * matters because docker-compose forwards `""` when the var is unset, and that
 * must behave as absent (→ OIDC), not trip the schema's `.min(1)`.
 */
describe('getGatewayApiKey', () => {
  const KEY = 'VERCEL_AI_GATEWAY_API_KEY';
  afterEach(() => {
    delete process.env[KEY];
  });

  test('undefined when the var is unset', () => {
    delete process.env[KEY];
    expect(getGatewayApiKey()).toBeUndefined();
  });

  test('undefined when empty (docker forwards "" when unset → must read as absent)', () => {
    process.env[KEY] = '';
    expect(getGatewayApiKey()).toBeUndefined();
  });

  test('undefined when whitespace only', () => {
    process.env[KEY] = '   ';
    expect(getGatewayApiKey()).toBeUndefined();
  });

  test('returns the value when set', () => {
    process.env[KEY] = 'vck_test_key_123';
    expect(getGatewayApiKey()).toBe('vck_test_key_123');
  });
});
