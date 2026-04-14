import type {
  AddPdpGoalActionRequest,
  PdpGoalStatus,
  UpdatePdpGoalActionRequest,
  UpdatePdpGoalRequest,
} from '@acme/shared';
import { createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../../../api/client';
import { classifyError } from '../../../utils/classifyError';
import { logger } from '../../../utils/logger';
import { retryRead } from '../../../utils/retry';

const pdpGoalsLogger = logger.createScope('PdpGoalsThunks');

export const deletePdpGoal = createAsyncThunk(
  'pdpGoals/deletePdpGoal',
  async (params: { goalId: string }, { rejectWithValue }) => {
    pdpGoalsLogger.info('Deleting PDP goal', { goalId: params.goalId });

    try {
      await api.pdpGoals.deleteGoal(params.goalId);
      pdpGoalsLogger.info('Deleted PDP goal', { goalId: params.goalId });
      return params.goalId;
    } catch (error) {
      pdpGoalsLogger.error('Failed to delete PDP goal', { error });
      return rejectWithValue(classifyError(error));
    }
  }
);

export const fetchPdpGoals = createAsyncThunk(
  'pdpGoals/fetchPdpGoals',
  async (params: { statuses?: PdpGoalStatus[] } | undefined, { rejectWithValue }) => {
    pdpGoalsLogger.info('Fetching PDP goals');
    try {
      const response = await retryRead(() => api.pdpGoals.listGoals(params?.statuses));
      pdpGoalsLogger.info('Fetched PDP goals', { count: response.goals.length });
      return { ...response, fetchedAt: Date.now() };
    } catch (error) {
      pdpGoalsLogger.error('Failed to fetch PDP goals', { error });
      return rejectWithValue(classifyError(error));
    }
  },
  {
    condition: (_, { getState }) => {
      const { pdpGoals } = getState() as { pdpGoals: { loading: boolean } };
      return !pdpGoals.loading;
    },
  }
);

export const fetchPdpGoal = createAsyncThunk(
  'pdpGoals/fetchPdpGoal',
  async (params: { goalId: string }, { rejectWithValue }) => {
    pdpGoalsLogger.info('Fetching PDP goal', { goalId: params.goalId });
    try {
      const response = await retryRead(() => api.pdpGoals.getGoal(params.goalId));
      return response;
    } catch (error) {
      pdpGoalsLogger.error('Failed to fetch PDP goal', { error });
      return rejectWithValue(classifyError(error));
    }
  }
);

export const updatePdpGoal = createAsyncThunk(
  'pdpGoals/updatePdpGoal',
  async (
    params: { goalId: string; data: UpdatePdpGoalRequest },
    { rejectWithValue }
  ) => {
    pdpGoalsLogger.info('Updating PDP goal', { goalId: params.goalId });
    try {
      const response = await api.pdpGoals.updateGoal(params.goalId, params.data);
      return response;
    } catch (error) {
      pdpGoalsLogger.error('Failed to update PDP goal', { error });
      return rejectWithValue(classifyError(error));
    }
  }
);

export const addPdpGoalAction = createAsyncThunk(
  'pdpGoals/addPdpGoalAction',
  async (
    params: { goalId: string; data: AddPdpGoalActionRequest },
    { rejectWithValue }
  ) => {
    pdpGoalsLogger.info('Adding action to PDP goal', { goalId: params.goalId });
    try {
      const response = await api.pdpGoals.addAction(params.goalId, params.data);
      return response;
    } catch (error) {
      pdpGoalsLogger.error('Failed to add action', { error });
      return rejectWithValue(classifyError(error));
    }
  }
);

export const updatePdpGoalAction = createAsyncThunk(
  'pdpGoals/updatePdpGoalAction',
  async (
    params: { goalId: string; actionId: string; data: UpdatePdpGoalActionRequest },
    { rejectWithValue }
  ) => {
    pdpGoalsLogger.info('Updating PDP goal action', {
      goalId: params.goalId,
      actionId: params.actionId,
    });
    try {
      const response = await api.pdpGoals.updateAction(
        params.goalId,
        params.actionId,
        params.data
      );
      return response;
    } catch (error) {
      pdpGoalsLogger.error('Failed to update action', { error });
      return rejectWithValue(classifyError(error));
    }
  }
);
