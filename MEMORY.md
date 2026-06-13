# MEMORY.md: The AI Journal

This file is the "journal" of the project and is **always AI-maintained**. It is NOT for humans to edit manually.

## Purpose
This document captures the non-obvious: bugs, quirks, gotchas, and patterns discovered during development. It exists to prevent the AI from repeating mistakes, struggling with known environment issues, or violating established project conventions.

## Structure

Organize memories by category. Each entry should be a short summary linking to a dedicated file (if using Claude Code's auto-memory) or an inline entry if maintaining manually.

---

## Project Context & Quirks

_Record environment-specific discoveries, naming conventions, and infrastructure gotchas here._

- **Example:** The staging database requires an SSH tunnel on port `5433` before running migrations.

---

## Lessons Learned & Edge Cases

_Record "I struggled" moments, surprising API behavior, and non-obvious solutions here._

### Database / ORM
- **Example:** Composite unique constraints on optional fields may fail during upsert when a field is `null`. Always check for existence explicitly or ensure constraint fields are required.

### Infrastructure
- **Example:** `docker compose restart` does NOT re-read `env_file`. Must use `docker compose up -d` to pick up new env vars.

---

## User Preferences & Feedback

_Record corrections, confirmed approaches, and collaboration preferences here._

- **Example:** User prefers bundled PRs for refactors rather than many small ones.
- **Example:** User wants terse responses with no trailing summaries.
