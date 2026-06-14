---
status: accepted
---

# LLM provider: Vercel AI Gateway, not AWS Bedrock

`SPEC.md` milestone 3 names **AWS Bedrock** as the hosted LLM for query
recommendations. We are instead using the **Vercel AI Gateway** (model slug
`anthropic/claude-opus-4.8`) for the hosted web app's recommendation feature.
**This supersedes SPEC.md's Bedrock line.**

## Why

The app already deploys on Vercel (project `db-query-detective`) with Neon, so
the Gateway is the lowest-friction path: in production and preview it
authenticates via Vercel's automatic OIDC, so **no persistent provider secret**
is required there. It also gives unified observability, model fallback, and a
plain `"provider/model"` string interface — no provider-specific SDK package
(`@ai-sdk/amazon-bedrock`) and no AWS credential surface (region + access key +
secret, or a role) spread across every environment. Bedrock would have added
several new env vars; the Gateway adds at most one.

## Consequences

- A single **optional** env var `VERCEL_AI_GATEWAY_API_KEY` is added for local
  development (declared in `web/src/environment.ts`, `.env.docker.example`, and
  `ARCHITECTURE.md`). When absent — i.e. on Vercel — OIDC authenticates the
  Gateway, so prod/preview need no secret.
- The provider stays behind a vendor-agnostic `invokeLlm` interface in
  `web/src/lib/llm/` (per `AGENTS.md`), so swapping back to Bedrock or to a
  direct Anthropic key later is a change inside that module — model slug + auth —
  not a change to callers.
- `SPEC.md`'s "AWS Bedrock" wording in milestone 3 is now stale; treat this RFC
  as the source of truth for the provider decision.
