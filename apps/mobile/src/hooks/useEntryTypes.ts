import type { EntryTypeOption } from '@acme/shared';
import { useMemo } from 'react';
import { useAppSelector } from './useAppSelector';

/**
 * The entry types offered by the signed-in user's specialty, from the cached
 * `/specialties` response in the auth slice.
 *
 * Shared by the entry-type picker and the chat screen, which needs to turn the
 * `entryType` route param (a code) back into a label for the header. Keeping the
 * lookup in one place stops the two from drifting - the picker showing one name
 * and the screen it navigates to showing another.
 *
 * Returns an empty list until `/specialties` has loaded, or if the user's
 * specialty is absent from the response (not yet active, or no specialty set).
 */
export function useEntryTypes(): EntryTypeOption[] {
  const specialties = useAppSelector((s) => s.auth.specialties);
  const userSpecialty = useAppSelector((s) => s.auth.user?.specialty?.code);

  return useMemo(
    () => specialties.find((s) => s.specialty === userSpecialty)?.entryTypes ?? [],
    [specialties, userSpecialty]
  );
}

/**
 * Display label for an entry-type code, or `undefined` if it can't be resolved -
 * config still loading, or a code that is no longer offered.
 */
export function useEntryTypeLabel(code: string | undefined): string | undefined {
  const entryTypes = useEntryTypes();
  if (!code) return undefined;
  return entryTypes.find((e) => e.code === code)?.label;
}
