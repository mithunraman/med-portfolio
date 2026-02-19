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
