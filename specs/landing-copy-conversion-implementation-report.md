# Implementation report — landing copy & conversion

Task: `task_f990d0d3005a` · Spec: `specs/landing-copy-conversion.md`

## What was done

Implemented P0/P1 honesty + conversion fixes from the copy/conversion spec on the real Onside landing, without commits and without touching API/DB.

### Files modified

| File | Changes |
|---|---|
| `apps/web/src/routes/index.tsx` | Pre-launch metadata, OG/Twitter, JSON-LD (no free Offer offer claim) |
| `apps/web/src/components/landing/onside-landing.tsx` | Full copy rewrite, narrative reorder (trust → community → fan waitlist → bars), consistent CTAs, ticker live vs benefits fallback, reservation language removed, FAQ without metacopy |
| `apps/web/src/components/landing/onside-app-demo.tsx` | Visible prévia badge + caption, demo labels, no reservation cues, `demo_view_changed` |
| `apps/web/src/components/landing/onside-waitlist.tsx` | Labels/helpers, success/conflict copy, optional phone kept discrete, bar field groups, funnel analytics |
| `apps/web/src/components/landing/onside.css` | Preview badge/caption, dashboard prévia label, bar form groups, final proof, optional field, benefits ticker, mobile tweaks; fixed invalid `shrink` → `flex-shrink` |
| `apps/web/src/lib/analytics.ts` | Funnel events (viewed/started/attempted/validation_failed/submit_failed/submitted) + `demo_view_changed`; no PII |

### Gate decisions applied

- Cold / problem-aware traffic framing
- Reservations & tables removed from narrative, demo, journey visual, bar benefits, dashboard mock
- Phone stays optional and discrete (no invented usage)
- No free claim for bars; click trigger = contact by email, no commitment
- No social proof block (no real proof available)
- Privacy FAQ only states interest + launch email (no invented policy URL)
- Ticker: real elite events when present; otherwise non-factual benefits strip
- No double analytics: form submits only emit funnel events; global `[data-cta]` ignores clicks inside forms
- API/DB untouched

### Narrative order (live)

1. Header · 2. Hero + product preview · 3. Ticker · 4. Problem · 5. Proposal · 6. How it works · 7. Trust · 8. Community · 9. Fan waitlist · 10. Bars + panel · 11. Bar form · 12. FAQ · 13. Final CTA · 14. Footer

## Verification

| Check | Result |
|---|---|
| Biome on changed files | Pass (warnings only: pre-existing `!important` / specificity) |
| `bun run build` in `apps/web` | Pass (client + SSR) |
| `git diff --check` on changed files | Pass |
| Relevant automated tests | None found for landing/waitlist/analytics |
| Spec source checklist (20 items) | 20/20 pass |
| Visual QA desktop (`localhost:3001`) | Pass via Orca browser on existing server |
| Visual QA mobile viewport 390×844 | Pass — menu present, no horizontal overflow, preview badge/caption `display:block` |
| Form empty-submit validation | Pass — fan city/name/email; bar pubName/city/name/email |
| Forbidden claim scan (source + live DOM) | Clean |
| Live metadata | Title/description/OG match pre-launch copy; JSON-LD has no Offer/price |

### Follow-up validation (coordinator status @ 13:13:44Z)

Used the already-running server at `http://localhost:3001` (no new ephemeral dev process). Reloaded Orca browser tab, re-audited live DOM:

- Section order: `top → ticker → produto → definition → como-funciona → trust → community → lista → bares → bar-form → duvidas → final-cta`
- Preview labels live: product badge, product caption, dashboard prévia
- Ticker aria-label: `Benefícios do Onside` (fallback path; no fake agenda)
- No horizontal overflow at 390 and 1081+ widths
- No code corrections required after re-review

### Visual findings

- Hero shows pre-launch eyebrow, future-tense promise, primary CTA “Votar pela minha cidade”
- Preview badge + caption visible (not SR-only)
- Benefits ticker active when API has no elite events
- No “reserva/mesa/sem spam/gratuito para bares” copy in rendered body
- Fan form labels and “Registrar meu voto” present; bar form groups + pilot CTA present

## Pendências / out of scope

- No A/B experiments (Phase 3 of spec)
- Privacy policy page/link still absent (gate: don’t invent)
- Phone purpose still unexplained (gate: don’t invent usage)
- Bar commercial terms after pilot not stated (gate: don’t invent pricing)
- No automated unit/e2e tests added (task said use existing tests only)
- Session did not commit (per instructions)
- Other local dirty worktree files (API/DB/waitlist migration, skills, etc.) were preserved and not part of this delivery
