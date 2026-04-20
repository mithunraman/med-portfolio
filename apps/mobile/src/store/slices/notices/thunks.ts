import { createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../../../api/client';
import { logger } from '../../../utils/logger';
import { removeNotice } from './slice';

const noticesLogger = logger.createScope('NoticesThunks');

export const dismissNotice = createAsyncThunk(
  'notices/dismiss',
  async (noticeId: string, { dispatch }) => {
    // Optimistic removal
    dispatch(removeNotice(noticeId));

    try {
      await api.notices.dismiss(noticeId);
    } catch (error) {
      noticesLogger.warn('Failed to dismiss notice server-side', { noticeId, error: String(error) });
      // Don't re-add — self-heals on next init
    }
  }
);
