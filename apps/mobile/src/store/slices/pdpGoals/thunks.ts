import type {
  AddPdpGoalActionRequest,
  PdpGoalStatus,
  UpdatePdpGoalActionRequest,
  UpdatePdpGoalRequest,
} from '@acme/shared';
import { createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../../../api/client';
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
      const message = error instanceof Error ? error.message : 'Failed to delete goal';
      pdpGoalsLogger.error('Failed to delete PDP goal', { error: message });
      return rejectWithValue(message);
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
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch PDP goals';
      pdpGoalsLogger.error('Failed to fetch PDP goals', { error: message });
      return rejectWithValue(message);
    }
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
      const message = error instanceof Error ? error.message : 'Failed to fetch PDP goal';
      pdpGoalsLogger.error('Failed to fetch PDP goal', { error: message });
      return rejectWithValue(message);
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
      const message = error instanceof Error ? error.message : 'Failed to update PDP goal';
      pdpGoalsLogger.error('Failed to update PDP goal', { error: message });
      return rejectWithValue(message);
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
      const message = error instanceof Error ? error.message : 'Failed to add action';
      pdpGoalsLogger.error('Failed to add action', { error: message });
      return rejectWithValue(message);
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
      const message = error instanceof Error ? error.message : 'Failed to update action';
      pdpGoalsLogger.error('Failed to update action', { error: message });
      return rejectWithValue(message);
    }
  }
);
