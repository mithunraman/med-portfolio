import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../index';

interface NetworkState {
  isConnected: boolean;
  isInternetReachable: boolean;
}

const initialState: NetworkState = {
  isConnected: true,
  isInternetReachable: true,
};

const networkSlice = createSlice({
  name: 'network',
  initialState,
  reducers: {
    setNetworkStatus(
      state,
      action: PayloadAction<{ isConnected: boolean; isInternetReachable: boolean }>
    ) {
      state.isConnected = action.payload.isConnected;
      state.isInternetReachable = action.payload.isInternetReachable;
    },
  },
});

export const { setNetworkStatus } = networkSlice.actions;

export const selectIsOffline = (state: RootState) =>
  !state.network.isConnected || !state.network.isInternetReachable;

export default networkSlice.reducer;
