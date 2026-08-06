# Waitlist forms ↔ schema alignment report

**Task:** `task_2393134039da`  
**Date:** 2026-08-06  
**Outcome:** succeeded

## What changed

Aligned landing waitlist forms and consumers to the schema source of truth (no `name` / `bairro`).

### Files modified (this task)

| File | Change |
|------|--------|
| `packages/db/src/schema/waitlist.ts` | Mechanical fix: import `unique` + `index`; keep composite unique `(email, role, city)` |
| `packages/api/src/routers/waitlist.ts` | `join` input: fan `{email,city,phone?}`, pub `{email,city,phone?,pubName required}`; insert without name/bairro |
| `apps/web/src/components/landing/onside-waitlist.tsx` | Fan = city+email; pub = pubName+city+email; no phone UI; payloads/validation/analytics field keys updated |
| `apps/web/src/components/landing/waitlist-form.tsx` | Legacy consumer aligned (no name/bairro/phone UI; pubName required for pub) |
| `apps/web/src/routes/internal_.waitlist.tsx` | Admin table/CSV/search without name/bairro |
| `apps/web/src/components/landing/onside.css` | Bar form 3-field layout; removed phone/optional-field styles used only by old forms |

## Form contracts (UI)

- **Fan:** city, email only (matches `utils/index.html` ~326–349)
- **Pub:** pubName, city, email only (matches ~353–361)
- **Phone:** optional on API only; not rendered on landing forms
- **pubName:** required in form + Zod for `role=pub`; column remains nullable
- **Unique:** `email + role + city`; conflict message/classification preserved

## Validations run

| Check | Result |
|-------|--------|
| Biome on changed files | OK (pre-existing `!important` / specificity warnings only) |
| `tsc` packages/db | OK |
| `tsc` packages/api | Pre-existing unused `subscription` in pub/pubs (unrelated) |
| `tsc` apps/web | Same pre-existing + auth-form-field/dashboard noise (unrelated) |
| `bun run build --filter=web` | OK |
| `git diff --check` | OK |
| Dedicated waitlist unit tests | None present |
| Visual (Orca browser @ localhost:3001) | Desktop 1280×800 + mobile 390×844: fan 2 fields, pub 3 fields; client validation errors render |

## Pendências

1. **DB not migrated in this task** (by instruction). Migration `0010_waitlist_city.sql` was subsequently completed before publication with a legacy-row backfill, removal of `name`/`bairro`, nullable `pubName`, city index and composite uniqueness.
2. Pre-existing typecheck noise outside waitlist surface left untouched.
3. End-to-end join against a real DB not exercised here (would require migrated schema + network).

## Not done (intentionally)

- No commit
- No `db:push` / `db:migrate`
- No reversion of unrelated local work
