import { Controller, Get, Header, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { applySecurityHeaders } from '../security-headers';

@Controller('probe')
class ProbeController {
  @Get()
  get(): { ok: boolean } {
    return { ok: true };
  }

  // Mirrors `quota.controller.ts` — the one route that is deliberately
  // cacheable, being @Public() with no personal data in the response.
  @Get('cacheable')
  @Header('Cache-Control', 'public, max-age=3600')
  cacheable(): { ok: boolean } {
    return { ok: true };
  }
}

// `Cache-Control: no-store` on API responses is a compliance control, not a
// performance default. Cloudflare fronts api.logdit.app as a reverse proxy and
// terminates TLS, so un-redacted `rawContent` and drafted entries cross it in
// plaintext. Exactly two things keep it a *transit* processor rather than a
// store of clinical content: this header, and Cloudflare not caching dynamic
// responses by default. If this header goes, only a vendor default remains.
//
// The realistic way it breaks is a performance change, not a malicious one —
// someone swaps the helmet config or adds caching to speed up a list endpoint,
// and half the control disappears with no failing request and no runtime signal.
//
// SCOPE LIMIT, stated so nobody over-trusts this test: it guards the ORIGIN side
// only. A Cloudflare-side Cache Rule would override the origin and no test here
// can see it — that half is verified at
// docs/compliance/vendors/cloudflare/account-settings_2026-08-05.md §2.
//
// See DPIA Annex J.
describe('applySecurityHeaders', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
    }).compile();

    app = moduleRef.createNestApplication({ logger: false });
    applySecurityHeaders(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('sets Cache-Control: no-store, so proxied responses are not cacheable', async () => {
    const res = await request(app.getHttpServer()).get('/probe').expect(200);

    expect(res.headers['cache-control']).toMatch(/no-store/);
  });

  it('does not mark responses publicly cacheable', async () => {
    const res = await request(app.getHttpServer()).get('/probe').expect(200);

    // `public` would invite any shared cache — Cloudflare's included — to store
    // the response. Asserted separately from the no-store check because a config
    // could plausibly emit both, and the combination is what causes real harm.
    expect(res.headers['cache-control']).not.toMatch(/\bpublic\b/);
  });

  // The default must be overridable, or the one legitimately cacheable route
  // breaks. This asserts the ORDERING that makes default-deny workable:
  // middleware sets the default, the route handler's @Header wins because it
  // runs later. If this ever inverts, `quota/info` silently stops being cached
  // and the failure is a performance regression nobody traces back to here.
  it('lets a route opt back into caching with an explicit @Header', async () => {
    const res = await request(app.getHttpServer()).get('/probe/cacheable').expect(200);

    expect(res.headers['cache-control']).toBe('public, max-age=3600');
  });
});
