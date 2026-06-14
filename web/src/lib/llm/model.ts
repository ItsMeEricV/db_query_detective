import { createGateway } from 'ai';
import { getGatewayApiKey } from '@/environment';

/**
 * The ONE vendor-aware module (AGENTS.md: vendor-agnostic call sites). Callers
 * ask for "the recommendation model"; which provider/model answers is decided
 * here. Swapping providers later is a change to this file alone.
 *
 * `anthropic/claude-opus-4.8` is live on the Vercel AI Gateway (verified against
 * the gateway's model list). See RFC 0001 for the provider choice.
 */
const RECOMMENDATION_MODEL = 'anthropic/claude-opus-4.8';

/**
 * The configured AI Gateway model for query recommendations. Authentication
 * resolves in order: the explicit `VERCEL_AI_GATEWAY_API_KEY` (local dev), else
 * the gateway provider's automatic OIDC on Vercel when the key is undefined.
 */
export function recommendationModel() {
  const gateway = createGateway({ apiKey: getGatewayApiKey() });
  return gateway(RECOMMENDATION_MODEL);
}
