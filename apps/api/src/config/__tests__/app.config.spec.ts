import { parseFoundryEndpoints } from '../app.config';

const URL_A = 'https://res-a.services.ai.azure.com/openai/v1/';
const URL_B = 'https://res-b.services.ai.azure.com/openai/v1/';

describe('parseFoundryEndpoints', () => {
  it('returns an empty list when no endpoints are configured', () => {
    expect(parseFoundryEndpoints({})).toEqual([]);
  });

  it('parses distinct indexed pairs into an ordered list', () => {
    const endpoints = parseFoundryEndpoints({
      AZURE_FOUNDRY_API_KEY_1: 'key-1',
      AZURE_FOUNDRY_BASE_URL_1: URL_A,
      AZURE_FOUNDRY_API_KEY_2: 'key-2',
      AZURE_FOUNDRY_BASE_URL_2: URL_B,
    });

    expect(endpoints).toEqual([
      { apiKey: 'key-1', baseURL: URL_A },
      { apiKey: 'key-2', baseURL: URL_B },
    ]);
  });

  it('throws on a half-configured pair (key without URL, or vice versa)', () => {
    expect(() => parseFoundryEndpoints({ AZURE_FOUNDRY_API_KEY_1: 'key-1' })).toThrow(
      /endpoint 1 is half-configured/
    );
    expect(() => parseFoundryEndpoints({ AZURE_FOUNDRY_BASE_URL_2: URL_A })).toThrow(
      /endpoint 2 is half-configured/
    );
  });

  it('throws on an invalid base URL', () => {
    expect(() =>
      parseFoundryEndpoints({
        AZURE_FOUNDRY_API_KEY_1: 'key-1',
        AZURE_FOUNDRY_BASE_URL_1: 'not-a-url',
      })
    ).toThrow(/AZURE_FOUNDRY_BASE_URL_1 must be a valid URL/);
  });

  it('rejects two keys pointing at the SAME resource (duplicate base URL → shared quota)', () => {
    // The "Key 1"/"Key 2" footgun: one resource's two access keys, same base URL.
    expect(() =>
      parseFoundryEndpoints({
        AZURE_FOUNDRY_API_KEY_1: 'resource-a-key-1',
        AZURE_FOUNDRY_BASE_URL_1: URL_A,
        AZURE_FOUNDRY_API_KEY_2: 'resource-a-key-2',
        AZURE_FOUNDRY_BASE_URL_2: URL_A,
      })
    ).toThrow(/endpoints 1 and 2 share the same base URL/);
  });

  it('detects duplicate base URLs that differ only by trailing slash or host case', () => {
    expect(() =>
      parseFoundryEndpoints({
        AZURE_FOUNDRY_API_KEY_1: 'key-1',
        AZURE_FOUNDRY_BASE_URL_1: 'https://res-a.services.ai.azure.com/openai/v1/',
        AZURE_FOUNDRY_API_KEY_2: 'key-2',
        AZURE_FOUNDRY_BASE_URL_2: 'https://RES-A.services.ai.azure.com/openai/v1',
      })
    ).toThrow(/share the same base URL/);
  });
});
