import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../store';

/**
 * Typed useDispatch hook for the app.
 * Use this instead of plain useDispatch for proper typing of async thunks.
 */
export const useAppDispatch = () => useDispatch<AppDispatch>();
