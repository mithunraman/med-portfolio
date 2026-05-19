import type { NoticeDocument } from '@acme/shared';
import { NOTICE_V1_0 } from './notices/v1.0';

// `all` is chronological — earliest first. The chain walk in InitService
// depends on this ordering to detect material changes between a user's
// last-acked version and the active version.
export const NOTICE_REGISTRY: {
  readonly active: NoticeDocument;
  readonly all: readonly NoticeDocument[];
} = {
  active: NOTICE_V1_0,
  all: [NOTICE_V1_0],
} as const;
