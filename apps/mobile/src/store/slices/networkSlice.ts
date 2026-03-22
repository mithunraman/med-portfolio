import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../index';

interface NetworkState {
  isConnected: boolean;
  isInternetReachable: boolean;
  bannerVisible: boolean;
}

const initialState: NetworkState = {
  isConnected: true,
  isInternetReachable: true,
  bannerVisible: false,
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
    setBannerVisible(state, action: PayloadAction<boolean>) {
      state.bannerVisible = action.payload;
    },
  },
});

export const { setNetworkStatus, setBannerVisible } = networkSlice.actions;

export const selectIsOffline = (state: RootState) =>
  !state.network.isConnected || !state.network.isInternetReachable;

export const selectBannerVisible = (state: RootState) => state.network.bannerVisible;

export default networkSlice.reducer;
