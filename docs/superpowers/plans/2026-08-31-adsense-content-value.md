# AdSense Content Value Remediation Implementation Plan

**Spec:** `docs/superpowers/specs/2026-08-31-adsense-content-value-design.md`

**Constraint:** Do not commit or push unless the user explicitly asks.

## Task 1: Make editorial evidence enforceable

- [x] Add failing tests for one evidence entry per article, valid review dates, and HTTPS sources.
- [x] Add the minimal typed evidence registry for all eleven article slugs.
- [x] Render article methodology, sources, review date, and citation structured data.
- [x] Use review dates in metadata and sitemap; remove request-time sitemap dates.
- [x] Run focused content and sitemap tests.

## Task 2: Enter AdSense review-safe mode

- [x] Add a failing regression test requiring account verification metadata and forbidding ad-serving code under `src`.
- [x] Keep `google-adsense-account` verification metadata in the root layout.
- [x] Remove global/authenticated ad loaders, ad units, placements, and now-unused components.
- [x] Update About, FAQ, privacy, and terms copy to match the actual review-safe state and future placement policy.
- [x] Run focused tests.

## Task 3: Fix trust and crawl-quality issues

- [x] Add a failing test for HTTP-to-HTTPS redirect configuration.
- [x] Add the smallest Next.js header-matched permanent redirect.
- [x] Darken low-contrast text tokens and make inline content links visibly underlined.
- [x] Add editorial standards and correction handling to About.
- [x] Run focused tests.

## Task 4: Verify the whole site

- [x] Run all tests, lint, production build, and `git diff --check`.
- [x] Inspect generated/local HTML for verification meta and absence of AdSense requests.
- [x] Review the final diff and document the two external deployment actions: deploy and enable infrastructure HTTPS/disable Auto ads before resubmission.
