# Personalized bar recommendations — QA evidence

Date: 2026-08-20

## Scope

Validation of the fan-profile recommendation trio, feedback/reset controls,
commercial attribution, bar quality protection, and the bounded candidate
loader introduced by `specs/personalized-bar-recommendations.md`.

## Automated verification

- Focused unit and authorization suite: 33 passed, 0 failed.
- Disposable PostGIS integration test: 1 passed, 0 failed. It proved that the
  loader excludes inactive and favorite bars while retaining and ranking a bar
  that matches the fan's onboarding sport.
- The integration database was the loopback-only
  `localhost:5433/findsports_load_test`; no shared or remote database was used.
- The generated migration was applied successfully to that disposable database.

## Candidate-loader performance

The disposable database was populated with 10,000 fans, 10,000 bars, 50,000
events, 20,000 favorites, and 50,000 commercial events.

- Candidate cap: 200 nearest + 100 sport-relevant + 50 recent-intent bars,
  deduplicated before enrichment and scoring.
- Thirty sequential warm loader executions: p50 17.95 ms, p95 19.21 ms,
  maximum 21.58 ms.
- Spatial-pool `EXPLAIN ANALYZE`: 9.611 ms, 342 shared buffers, 200 rows, using
  `bar_geo_active_idx`.
- Product SLO encoded in the load harness: recommendation p95 below 300 ms.

These local measurements establish a development floor, not a production
capacity claim.

## Manual review

- Subscription plan/tier is absent from candidate selection and scoring.
- `bar.isActive` is used only as commercial eligibility, matching its current
  billing meaning.
- Favorites remain outside the recommendation trio and continue in their own
  tab.
- Reset advances only the recommendation behavior boundary; onboarding sports,
  distance, favorites, ratings, account data, and commercial analytics remain.
- Recommendation-attribution writes are secondary telemetry and cannot fail an
  already recorded commercial action.
- The UI exposes the expanded-radius label and reason text without displaying
  an internal score or claiming AI.

## Remaining visual verification

Authenticated browser QA could not be completed in this session because the
in-app browser runtime failed during initialization before a page could open.
Build and static verification do not replace this check. The fan profile trio,
reset confirmation, expanded-radius label, dismissal behavior, responsive card
layout, and pub quality-status panel still need a signed-in browser pass.
