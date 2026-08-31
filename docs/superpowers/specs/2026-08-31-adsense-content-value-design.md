# AdSense Content Value Remediation Design

## Goal

Address the repeated AdSense "low value content" rejection by making every article's editorial value verifiable and by preventing ad requests on thin, legal, error, login, or user-generated pages during review.

## Approved approach

- Keep the existing eleven long-form articles. Their length and topic coverage are already substantial.
- Add article-specific review notes: a substantive review date, a concrete verification method, and primary sources where the subject has an authoritative source.
- Show those notes on each article and expose the same review date and citations in metadata, structured data, and the sitemap.
- Add an editorial policy to the About page covering authorship, examples, source selection, review, and corrections.
- Enter a review-safe state: keep the AdSense account verification meta tag, but remove all ad scripts and ad units from public, authenticated, legal, error, and user-generated pages.
- Correct public copy so it does not claim ads are currently displayed or displayed inside private ledgers.
- Add a permanent HTTP-to-HTTPS redirect in Next.js and keep infrastructure-level HTTPS enforcement as a deployment check.
- Stop assigning the current time to every sitemap entry and improve the low-contrast text/link styling found during the audit.

## Content model

Each article has one evidence entry keyed by its existing slug:

- `reviewedAt`: truthful date of the substantive editorial review.
- `methodology`: article-specific explanation of how examples and claims were checked.
- `sources`: zero or more primary-source links with publisher and title.

The evidence registry is deliberately separate from article bodies so the existing articles do not need repetitive boilerplate changes. A coverage test prevents publishing an article without review evidence.

## Ad placement policy after approval

This change does not pre-build speculative ad placement logic. After AdSense approval, ads may be reintroduced only on substantial public content pages. Login, invitation, error, legal, authenticated ledger, and other user-generated/private screens remain ad-free.

## Verification

- Unit tests cover evidence completeness, source URLs, review dates, sitemap dates, review-safe ad code, and HTTPS redirect configuration.
- Full test, lint, and production build run before completion.
- A local production-page inspection confirms verification metadata is present while AdSense scripts and units are absent.

