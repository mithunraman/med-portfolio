import { ArtefactStatus } from '@acme/shared';
import { createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../../../api/client';
import { logger } from '../../../utils/logger';

const artefactsLogger = logger.createScope('ArtefactsThunks');

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
      const message = error instanceof Error ? error.message : 'Failed to create artefact';
      artefactsLogger.error('Failed to create artefact', { error: message });
      return rejectWithValue(message);
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
      const response = await api.artefacts.listArtefacts(params);
      artefactsLogger.info('Fetched artefacts', { count: response.artefacts.length });
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch artefacts';
      artefactsLogger.error('Failed to fetch artefacts', { error: message });
      return rejectWithValue(message);
    }
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
      const response = await api.artefacts.getArtefact(params.artefactId);
      artefactsLogger.info('Fetched artefact', { artefactId: response.id });
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch artefact';
      artefactsLogger.error('Failed to fetch artefact', { error: message });
      return rejectWithValue(message);
    }
  }
);

/**
 * Update an artefact's status (e.g. REVIEW → FINAL).
 */
export const updateArtefactStatus = createAsyncThunk(
  'artefacts/updateArtefactStatus',
  async (params: { artefactId: string; status: ArtefactStatus }, { rejectWithValue }) => {
    artefactsLogger.info('Updating artefact status', params);

    try {
      const response = await api.artefacts.updateArtefactStatus(params.artefactId, {
        status: params.status,
      });
      artefactsLogger.info('Updated artefact status', { id: response.id, status: response.status });
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update artefact status';
      artefactsLogger.error('Failed to update artefact status', { error: message });
      return rejectWithValue(message);
    }
  }
);
