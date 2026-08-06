import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';

/**
 * Security response headers for the API.
 *
 * Extracted from `main.ts` so the regression test in
 * `__tests__/security-headers.spec.ts` guards the **actual** production
 * configuration rather than a copy of it.
 *
 * ## Why `Cache-Control: no-store` is here
 *
 * Cloudflare fronts api.logdit.app as a reverse proxy and terminates TLS, so
 * every request and response — including un-redacted `rawContent` and drafted
 * clinical entries — crosses it in plaintext. Whether Cloudflare is a *transit*
 * processor or a *store* of clinical content turns on whether it caches those
 * responses. See DPIA Annex J.
 *
 * **This was added 2026-08-05 after the assumption behind it turned out to be
 * false.** The compliance record had claimed two independent controls held that
 * line: Cloudflare not caching dynamic responses by default, and the origin
 * sending `no-store`. A test written to guard the second one failed, and the
 * investigation showed why — `helmet()` sets no `Cache-Control` at all. The
 * `no-store` observed in production came from `@nestjs/terminus`, which sets it
 * on the health route only. **Every authenticated route was sending no
 * `Cache-Control` header whatsoever**, leaving a single vendor default as the
 * only thing standing between a US proxy and cached clinical text.
 *
 * So this middleware makes the second control real rather than documented.
 *
 * ## Default-deny, explicit opt-in
 *
 * The header is set in middleware, which runs *before* route handlers. A route
 * that genuinely should be cacheable overrides it with `@Header(...)`, and that
 * write wins because it happens later. `quota.controller.ts` is the only such
 * route today: `@Public()`, returning static config with no personal data.
 *
 * That ordering is the point. Cacheability becomes a decision someone has to
 * make per route, rather than the silent default for anything nobody thought
 * about — and "nobody thought about it" is exactly how clinical endpoints ended
 * up unprotected.
 *
 * **Do not add caching headers to authenticated routes.**
 * See docs/compliance/vendors/cloudflare/ and DPIA Annex J.
 */
export function applySecurityHeaders(app: INestApplication): void {
  app.use(helmet());

  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
}
