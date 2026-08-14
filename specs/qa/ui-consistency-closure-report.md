# UI consistency audit — closure QA report

Date: 2026-08-12  
Task: finalize `specs/onside-app-ui-consistency-audit.md` on current worktree  
Browser: Orca page `8522ce40-7f76-489b-8580-1214b91a5199` @ `http://127.0.0.1:3001`

## What this pass did

- Read both specs fully and treated the existing worktree redesign as baseline (no reset, no discard).
- Static audit: Hugeicons, acid+paper contrast, zinc/red/black leftovers, ellipsis, radius save hang.
- Fixed concrete product-surface defects found (see below).
- Browser QA on reachable public/auth/onboarding routes + redirect proof for protected routes.
- Verification: client+SSR build, web typecheck, focused Biome (error level), `git diff --check`, Hugeicons search.

## Fixes applied in this closure pass

| File | Fix |
| --- | --- |
| `apps/web/src/routes/(dashboard)/dashboard_.profile.tsx` | Acid selection uses **ink** text (AA); zinc/black/red → Onside tokens; radius save wrapped in try/catch/finally + error alert (no stuck `savingRadius`); view toggles 44×44 + `aria-pressed`; typographic ellipsis; profile image `width`/`height`; link/hover live-text |
| `apps/web/src/routes/internal_.manage-users.tsx` | red/black → live/ink tokens; acid avatar text ink; ban badge Onside; min-h-11 actions; biome-ignore explanation |
| `apps/web/src/components/admin/event-form.tsx` | Error text uses `live-text` + `role="alert"`; ellipsis |
| `apps/web/src/components/admin/pub-avatar.tsx` | Upload error uses `live-text` + alert role |
| `apps/web/src/routes/(dashboard)/dashboard.tsx` | Retry link uses `live-text` for small-text AA |

Preserved entire prior redesign diff (no files restored/discarded).

## Static results

| Check | Result |
| --- | --- |
| Hugeicons (`@hugeicons/react`, `@hugeicons/core-free-icons`) | **0 matches** in `apps/web/src` |
| Presentation icons | Reicon direct imports across product + landing |
| Acid + paper text | **None remaining** after profile fix |
| `git diff --check` | **pass** (exit 0) |
| `bunx tsc --noEmit -p apps/web/tsconfig.json` | **baseline only**: `packages/api/src/routers/pub.ts(6,3)` unused `subscription` (exit 2) |
| `bun run --filter web build` | **pass** (client + SSR) |
| Biome error-level on files touched this pass | **pass** |
| Biome on `apps/web/src/index.css` | known Tailwind v4 parse/format noise (pre-existing in worktree; not a product regression) |

## Browser matrix actually executed

### Viewports (via `orca exec "set viewport W H"`)

320×700, 375×812, 760×900, 1024×768, 1100×800, 1440×900

### Routes inspected (anonymous session)

| Route | Outcome |
| --- | --- |
| `/` | Onside landing, skip link, no FindSports, no H-overflow at all tested widths |
| `/login` | Onside split auth, labels, password toggle (Mostrar/Ocultar), CTA 48px, no overflow |
| `/signup` | Role group SOU UM + aria-pressed; empty submit → 4× `aria-invalid` + alerts; role toggle Torcedor/Dono de Bar works |
| `/onboarding/fan` | Steps 1→2; sports grid (Reicon/abbrev); progress named; no overflow |
| `/onboarding/pub` | Steps 1→2; labeled form fields + required; CTA “Escolher meu plano” on last step (code) |
| `/pub/does-not-exist` | Public shell (ENTRAR/CRIAR CONTA); not-found copy after load |
| `/pub/00000000-0000-0000-0000-000000000000` | Same not-found path; public shell |
| `/dashboard` | **Redirect → `/login`** (guard) |
| `/dashboard/profile` | **Redirect → `/login`** |
| `/plan` | **Redirect → `/login`** |
| `/admin` | **Redirect → `/login`** |
| `/admin/billing` | **Redirect → `/login`** |
| `/internal` | **Redirect → `/login`** |
| `/internal/waitlist` | **Redirect → `/login`** |
| `/internal/manage-users` | **Redirect → `/login`** |

No FindSports chrome on any reachable product surface. Landing inactive FindSports files (`navbar`/`footer`/`faq`/legacy) are **not** imported by `routes/index.tsx` (active entry is `OnsideLanding`).

### Interactions verified

- Signup empty submit: inline errors + `aria-invalid=true` on 4 fields
- Signup role toggle: `aria-pressed` correct for Dono de Bar
- Fan onboarding advance to sports step
- Pub onboarding advance to form step with labels
- Password show/hide label flip
- Keyboard Tab reaches interactive control with visible outline
- Pub public shell for anonymous visitor (login/signup CTAs, not fan avatar)

### Not reachable without inventing credentials (documented, not faked)

Authenticated fan/pub/admin/impersonation states for:

- dashboard discovery (geo, favorites, map hover sync)
- profile tabs deep interaction with live session data
- admin events create/edit/delete + plan limit banners
- plan checkout / billing portal
- internal waitlist export + manage-users ban/impersonate

Guards correctly force login; no DB mutation and no invented credentials were used.

### Tooling limits

- `prefers-reduced-motion: reduce` could not be forced in Orca browser (`matchMedia` stays false). Foundations include `@media (prefers-reduced-motion: reduce)` in `onside-foundations.css`.
- True 200% browser zoom not available as a first-class command; 320px viewport used as dense layout proxy.
- Some inline text links measure &lt;44px height (e.g. “Cadastre-se grátis”); primary controls/CTAs meet 44–48px.

## Residual risks

1. **Auth-gated visual QA** for fan/pub/admin/internal remains for a human or credentialed follow-up session.
2. **Legacy unused components** (`auth-card`, `auth-form-field`, `user-menu`, `edit-profile-form`) still exist with older styles; not in active import tree — left in place per “no unsafe dead-code cleanup mixed with functional work.”
3. **Typecheck baseline** unused `subscription` in `packages/api` unchanged (out of UI scope).
4. **Live as icon/status color** remains in several places; small body/links migrated to `live-text` where this pass touched; remaining large/mono status uses brand live intentionally.
5. **MMA sport tile** shows mono abbrev “MMA” + name “MMA / UFC” (aria-label is full name). Acceptable per Reicon/abbrev rule; slightly redundant visually.

## Artifacts

- `specs/qa/route-tour.json` — route redirect/title/onside summary
- `specs/qa/viewport-matrix.json` — viewport overflow matrix for public routes
- This report

## Acceptance snapshot

| Criterion | Status |
| --- | --- |
| No Hugeicons in active app tree | Met |
| No acid-as-text-on-paper remaining | Met (after fix) |
| No false FindSports on active routes | Met for reachable routes |
| Public shells session-aware | Met (pub not-found shows login/signup) |
| Build client+SSR | Met |
| Typecheck only known baseline | Met |
| Focused Biome on closure edits | Met |
| Visual matrix in connected browser | Met for anonymous/public; gated routes documented |
