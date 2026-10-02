import { api } from '@/api/client';
import { logger } from '@/utils/logger';
import type { SampleCaseResponse, Specialty } from '@acme/shared';
import { useCallback, useEffect, useState } from 'react';
import { useAppSelector } from './useAppSelector';

const sampleLogger = logger.createScope('SampleCase');

/**
 * Session cache of in-flight/settled requests, keyed by specialty. Caching the
 * promise (not just the value) dedupes the Home prefetch and the screen's own
 * request into one network call. A failed request is evicted so the next caller
 * retries. Deliberately outside Redux: the sample is not user data and must never
 * reach the selectors that count entries.
 */
const cache = new Map<Specialty, Promise<SampleCaseResponse>>();

function loadSampleCase(specialty: Specialty): Promise<SampleCaseResponse> {
  let request = cache.get(specialty);
  if (!request) {
    request = api.specialties.getSampleCase(specialty);
    cache.set(specialty, request);
    request.catch((error: unknown) => {
      cache.delete(specialty);
      sampleLogger.warn('Failed to load sample case', {
        specialty,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }
  return request;
}

/** Warm the cache ahead of navigation. Failures are left for the screen to surface. */
export function prefetchSampleCase(specialty: Specialty): void {
  loadSampleCase(specialty).catch(() => {});
}

export type SampleCaseState =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'ready'; sample: SampleCaseResponse };

export function useSampleCase(): SampleCaseState {
  const specialty = useAppSelector((s) => s.auth.user?.specialty?.code ?? null);
  const [sample, setSample] = useState<SampleCaseResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (specialty === null) return;
    let active = true;
    loadSampleCase(specialty).then(
      (result) => active && setSample(result),
      () => active && setFailed(true)
    );
    return () => {
      active = false;
    };
  }, [specialty, attempt]);

  const retry = useCallback(() => {
    setFailed(false);
    setAttempt((n) => n + 1);
  }, []);

  if (sample) return { status: 'ready', sample };
  if (failed) return { status: 'error', retry };
  return { status: 'loading' };
}
