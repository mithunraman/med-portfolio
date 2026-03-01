import type { ArtefactStatus } from '@acme/shared';
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
