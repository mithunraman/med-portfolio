import type { ApiClientConfig } from './adapters/types';
import { BaseApiClient } from './core/api-client';
import { AuthClient } from './clients/auth.client';
import { ConversationsClient } from './clients/conversations.client';
import { ItemsClient } from './clients/items.client';

// Re-export types and adapters
export * from './adapters/types';
export * from './adapters/fetch.adapter';
export * from './core/api-error';
export * from './clients';

/**
 * Create a fully configured API client instance.
 * Consumers provide platform-specific adapters.
 */
export function createApiClient(config: ApiClientConfig) {
  const baseClient = new BaseApiClient(config);

  return {
    auth: new AuthClient(baseClient),
    conversations: new ConversationsClient(baseClient),
    items: new ItemsClient(baseClient),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
