import type { ApiClientConfig } from './adapters/types';
import { BaseApiClient } from './core/api-client';
import { ArtefactsClient } from './clients/artefacts.client';
import { AuthClient } from './clients/auth.client';
import { ConversationsClient } from './clients/conversations.client';
import { ItemsClient } from './clients/items.client';
import { MediaClient } from './clients/media.client';
import { InitClient } from './clients/init.client';
import { PdpGoalsClient } from './clients/pdp-goals.client';
import { ReviewPeriodsClient } from './clients/review-periods.client';
import { QuotaClient } from './clients/quota.client';
import { SpecialtiesClient } from './clients/specialties.client';
import { NoticesClient } from './clients/notices.client';

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
    artefacts: new ArtefactsClient(baseClient),
    auth: new AuthClient(baseClient),
    conversations: new ConversationsClient(baseClient),
    items: new ItemsClient(baseClient),
    media: new MediaClient(baseClient),
    init: new InitClient(baseClient),
    pdpGoals: new PdpGoalsClient(baseClient),
    reviewPeriods: new ReviewPeriodsClient(baseClient),
    quota: new QuotaClient(baseClient),
    specialties: new SpecialtiesClient(baseClient),
    notices: new NoticesClient(baseClient),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
