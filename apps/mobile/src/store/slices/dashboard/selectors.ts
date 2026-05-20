import type { RootState } from '../../index';

export const selectInitStatus = (state: RootState) => state.dashboard.status;

export const selectInitLoaded = (state: RootState) => state.dashboard.status === 'ready';

export const selectInitLoading = (state: RootState) => state.dashboard.status === 'loading';

export const selectInitError = (state: RootState) => state.dashboard.error;
