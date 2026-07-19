import type { ConfigService } from '@nestjs/config';
import { AzureLanguageService } from '../azure-language.service';

/**
 * Live round-trip against the real Azure Language resource, proving the Entra
 * service-principal auth actually works end-to-end. Runs ONLY when all four
 * AZURE_LANGUAGE_* / AZURE_* env vars are present — otherwise skipped, so CI and
 * local runs without Azure creds stay green.
 *
 * Run this (and confirm it passes) BEFORE enabling `disableLocalAuth` on the
 * resource — it is the check that the service principal, RBAC role assignment,
 * and endpoint are all wired correctly.
 */
const hasCreds =
  !!process.env.AZURE_LANGUAGE_ENDPOINT &&
  !!process.env.AZURE_TENANT_ID &&
  !!process.env.AZURE_CLIENT_ID &&
  !!process.env.AZURE_CLIENT_SECRET;

const configFromEnv = (): ConfigService =>
  ({
    get: (key: string) =>
      ({
        'app.azureLanguage.endpoint': process.env.AZURE_LANGUAGE_ENDPOINT,
        'app.azureLanguage.tenantId': process.env.AZURE_TENANT_ID,
        'app.azureLanguage.clientId': process.env.AZURE_CLIENT_ID,
        'app.azureLanguage.clientSecret': process.env.AZURE_CLIENT_SECRET,
      })[key],
  }) as unknown as ConfigService;

(hasCreds ? describe : describe.skip)('AzureLanguageService (integration)', () => {
  it('authenticates via the service principal and redacts a person name', async () => {
    const service = new AzureLanguageService(configFromEnv());

    const result = await service.redactPhi('Reviewed the case with Dr Sarah Okafor today.');

    // The name is gone and a Person entity was reported — proves both auth and PHI detection.
    expect(result.redactedText).not.toContain('Sarah Okafor');
    expect(result.entities.some((e) => e.category === 'Person')).toBe(true);
  }, 30_000);
});
