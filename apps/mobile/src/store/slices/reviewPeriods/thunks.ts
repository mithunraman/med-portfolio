import type { CreateReviewPeriodRequest, UpdateReviewPeriodRequest } from '@acme/shared';
import { createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../../../api/client';
import { logger } from '../../../utils/logger';

const reviewPeriodsLogger = logger.createScope('ReviewPeriodsThunks');

export const fetchReviewPeriods = createAsyncThunk(
  'reviewPeriods/fetchReviewPeriods',
  async (_: void, { rejectWithValue }) => {
    reviewPeriodsLogger.info('Fetching review periods');
    try {
      const response = await api.reviewPeriods.listReviewPeriods();
      reviewPeriodsLogger.info('Fetched review periods', {
        count: response.reviewPeriods.length,
      });
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch review periods';
      reviewPeriodsLogger.error('Failed to fetch review periods', { error: message });
      return rejectWithValue(message);
    }
  }
);

export const createReviewPeriod = createAsyncThunk(
  'reviewPeriods/createReviewPeriod',
  async (data: CreateReviewPeriodRequest, { rejectWithValue }) => {
    reviewPeriodsLogger.info('Creating review period');
    try {
      const response = await api.reviewPeriods.createReviewPeriod(data);
      reviewPeriodsLogger.info('Created review period', { xid: response.id });
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create review period';
      reviewPeriodsLogger.error('Failed to create review period', { error: message });
      return rejectWithValue(message);
    }
  }
);

export const updateReviewPeriod = createAsyncThunk(
  'reviewPeriods/updateReviewPeriod',
  async (
    params: { xid: string; data: UpdateReviewPeriodRequest },
    { rejectWithValue }
  ) => {
    reviewPeriodsLogger.info('Updating review period', { xid: params.xid });
    try {
      const response = await api.reviewPeriods.updateReviewPeriod(params.xid, params.data);
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update review period';
      reviewPeriodsLogger.error('Failed to update review period', { error: message });
      return rejectWithValue(message);
    }
  }
);

export const archiveReviewPeriod = createAsyncThunk(
  'reviewPeriods/archiveReviewPeriod',
  async (xid: string, { rejectWithValue }) => {
    reviewPeriodsLogger.info('Archiving review period', { xid });
    try {
      const response = await api.reviewPeriods.archiveReviewPeriod(xid);
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to archive review period';
      reviewPeriodsLogger.error('Failed to archive review period', { error: message });
      return rejectWithValue(message);
    }
  }
);

export const fetchCoverage = createAsyncThunk(
  'reviewPeriods/fetchCoverage',
  async (xid: string, { rejectWithValue }) => {
    reviewPeriodsLogger.info('Fetching coverage', { xid });
    try {
      const response = await api.reviewPeriods.getCoverage(xid);
      reviewPeriodsLogger.info('Fetched coverage', {
        xid,
        coveragePercent: response.summary.coveragePercent,
      });
      return { xid, coverage: response };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch coverage';
      reviewPeriodsLogger.error('Failed to fetch coverage', { error: message });
      return rejectWithValue(message);
    }
  }
);
