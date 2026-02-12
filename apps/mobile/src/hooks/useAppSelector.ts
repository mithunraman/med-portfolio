import { useSelector, type TypedUseSelectorHook } from 'react-redux';
import type { RootState } from '../store';

/**
 * Typed useSelector hook for the app.
 * Provides proper typing for state access.
 */
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
