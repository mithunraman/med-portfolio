import type { EditArtefactRequest, PdpGoalSelection } from '@acme/shared';
import { ArtefactStatus } from '@acme/shared';
import { createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../../../api/client';
import { classifyError } from '../../../utils/classifyError';
import { logger } from '../../../utils/logger';
import { retryRead } from '../../../utils/retry';

export type { TypedError, ErrorKind } from '../../../utils/classifyError';

const artefactsLogger = logger.createScope('ArtefactsThunks');

// ---------------------------------------------------------------------------
// Thunks
// ---------------------------------------------------------------------------

/**
 * Create a new artefact with its associated conversation.
 */
export const createArtefact = createAsyncThunk(
  'artefacts/createArtefact',
  async (params: { artefactId: string }, { rejectWithValue }) => {
    artefactsLogger.info('Creating artefact', { artefactId: params.artefactId });

    try {
      const response = await api.artefacts.createArtefact({
        artefactId: params.artefactId,
      });
      artefactsLogger.info('Artefact created', {
        artefactId: response.artefactId,
        conversationId: response.conversation.id,
      });
      return response;
    } catch (error) {
      artefactsLogger.error('Failed to create artefact', { error });
      return rejectWithValue(classifyError(error));
    }
  }
);

/**
 * Fetch artefacts list with optional status filter and cursor-based pagination.
 */
export const fetchArtefacts = createAsyncThunk(
  'artefacts/fetchArtefacts',
  async (
    params: { cursor?: string; limit?: number; status?: ArtefactStatus } | undefined,
    { rejectWithValue }
  ) => {
    artefactsLogger.info('Fetching artefacts', params);

    try {
      const response = await retryRead(() => api.artefacts.listArtefacts(params));
      artefactsLogger.info('Fetched artefacts', { count: response.artefacts.length });
      return { ...response, fetchedAt: Date.now() };
    } catch (error) {
      artefactsLogger.error('Failed to fetch artefacts', { error });
      return rejectWithValue(classifyError(error));
    }
  },
  {
    condition: (params, { getState }) => {
      const { artefacts } = getState() as {
        artefacts: { views: Record<string, { status: string }> };
      };
      const key = params?.status == null ? 'all' : String(params.status);
      const view = artefacts.views[key];
      if (!view) return true;
      return view.status === 'idle';
    },
  }
);

/**
 * Fetch a single artefact by its ID (xid).
 */
export const fetchArtefact = createAsyncThunk(
  'artefacts/fetchArtefact',
  async (params: { artefactId: string }, { rejectWithValue }) => {
    artefactsLogger.info('Fetching artefact', { artefactId: params.artefactId });

    try {
      const response = await retryRead(() => api.artefacts.getArtefact(params.artefactId));
      artefactsLogger.info('Fetched artefact', { artefactId: response.id });
      return response;
    } catch (error) {
      artefactsLogger.error('Failed to fetch artefact', { error });
      return rejectWithValue(classifyError(error));
    }
  }
);

/**
 * Update an artefact's status (e.g. REVIEW → ARCHIVED).
 */
export const updateArtefactStatus = createAsyncThunk(
  'artefacts/updateArtefactStatus',
  async (
    params: { artefactId: string; status: ArtefactStatus; archivePdpGoals?: boolean },
    { rejectWithValue }
  ) => {
    artefactsLogger.info('Updating artefact status', params);

    try {
      const response = await api.artefacts.updateArtefactStatus(params.artefactId, {
        status: params.status,
        archivePdpGoals: params.archivePdpGoals,
      });
      artefactsLogger.info('Updated artefact status', { id: response.id, status: response.status });
      return response;
    } catch (error) {
      artefactsLogger.error('Failed to update artefact status', { error });
      return rejectWithValue(classifyError(error));
    }
  }
);

/**
 * Duplicate a COMPLETED artefact into a new IN_REVIEW artefact.
 */
export const duplicateToReview = createAsyncThunk(
  'artefacts/duplicateToReview',
  async (params: { artefactId: string }, { rejectWithValue }) => {
    artefactsLogger.info('Duplicating artefact to review', { artefactId: params.artefactId });

    try {
      const response = await api.artefacts.duplicateToReview(params.artefactId);
      artefactsLogger.info('Duplicated artefact to review', { id: response.id });
      return response;
    } catch (error) {
      artefactsLogger.error('Failed to duplicate artefact to review', { error });
      return rejectWithValue(classifyError(error));
    }
  }
);

/**
 * Edit an artefact's editable fields (title, reflection).
 */
export const editArtefact = createAsyncThunk(
  'artefacts/editArtefact',
  async (
    params: { artefactId: string } & EditArtefactRequest,
    { rejectWithValue }
  ) => {
    artefactsLogger.info('Editing artefact', { artefactId: params.artefactId });

    try {
      const { artefactId, ...editData } = params;
      const response = await api.artefacts.editArtefact(artefactId, editData);
      artefactsLogger.info('Edited artefact', { id: response.id });
      return response;
    } catch (error) {
      artefactsLogger.error('Failed to edit artefact', { error });
      return rejectWithValue(classifyError(error));
    }
  }
);

/**
 * Fetch version history for an artefact.
 */
export const fetchVersionHistory = createAsyncThunk(
  'artefacts/fetchVersionHistory',
  async (params: { artefactId: string }, { rejectWithValue }) => {
    artefactsLogger.info('Fetching version history', { artefactId: params.artefactId });

    try {
      const response = await api.artefacts.getVersionHistory(params.artefactId);
      artefactsLogger.info('Fetched version history', { count: response.versions.length });
      return response;
    } catch (error) {
      artefactsLogger.error('Failed to fetch version history', { error });
      return rejectWithValue(classifyError(error));
    }
  }
);

/**
 * Restore an artefact to a previous version.
 */
export const restoreVersion = createAsyncThunk(
  'artefacts/restoreVersion',
  async (params: { artefactId: string; version: number }, { rejectWithValue }) => {
    artefactsLogger.info('Restoring version', params);

    try {
      const response = await api.artefacts.restoreVersion(params.artefactId, {
        version: params.version,
      });
      artefactsLogger.info('Restored version', { id: response.id });
      return response;
    } catch (error) {
      artefactsLogger.error('Failed to restore version', { error });
      return rejectWithValue(classifyError(error));
    }
  }
);

/**
 * Delete an artefact and all its associated data (conversation, messages, PDP goals).
 */
export const deleteArtefact = createAsyncThunk(
  'artefacts/deleteArtefact',
  async (params: { artefactId: string }, { rejectWithValue }) => {
    artefactsLogger.info('Deleting artefact', { artefactId: params.artefactId });

    try {
      await api.artefacts.deleteArtefact(params.artefactId);
      artefactsLogger.info('Deleted artefact', { artefactId: params.artefactId });
      return params.artefactId;
    } catch (error) {
      artefactsLogger.error('Failed to delete artefact', { error });
      return rejectWithValue(classifyError(error));
    }
  }
);

/**
 * Finalise an artefact — marks it FINAL and activates/archives PDP goals.
 */
export const finaliseArtefact = createAsyncThunk(
  'artefacts/finaliseArtefact',
  async (
    params: { artefactId: string; pdpGoalSelections: PdpGoalSelection[] },
    { rejectWithValue }
  ) => {
    artefactsLogger.info('Finalising artefact', { artefactId: params.artefactId });

    try {
      const response = await api.artefacts.finaliseArtefact(params.artefactId, {
        pdpGoalSelections: params.pdpGoalSelections,
      });
      artefactsLogger.info('Finalised artefact', { id: response.id, status: response.status });
      return response;
    } catch (error) {
      artefactsLogger.error('Failed to finalise artefact', { error });
      return rejectWithValue(classifyError(error));
    }
  }
);
