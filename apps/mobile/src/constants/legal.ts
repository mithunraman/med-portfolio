/**
 * Canonical URLs for legal and support surfaces.
 *
 * Kept in one place rather than inline at each call site: these change with the
 * domain, and App Review checks that the in-app Privacy Policy link resolves -
 * a stale literal buried in a settings screen is the kind of thing that only
 * surfaces during submission.
 *
 * Pages live on the marketing site (`apps/landing`), so the paths here must
 * track that directory's filenames.
 */
export const LEGAL_URLS = {
  privacy: 'https://logdit.app/privacy.html',
  terms: 'https://logdit.app/terms.html',
  subProcessors: 'https://logdit.app/sub-processors.html',
} as const;

/** Monitored inbox for user-initiated support and data-rights requests. */
export const SUPPORT_EMAIL = 'hello@logdit.app';

/**
 * `mailto:` for the support row. Pre-filling the subject keeps inbound requests
 * triageable without asking the user to describe where they came from.
 */
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
  'Logdit support'
)}`;
