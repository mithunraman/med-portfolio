// Reducer
export { default as artefactsReducer } from './slice';

// Actions
export { markArtefactsStale } from './slice';

// Selectors
export {
  selectAllArtefacts,
  selectArtefactById,
  selectRecentEntries,
  selectRecentEntriesTotal,
} from './slice';

// Types
export type { TypedError, ErrorKind } from './thunks';

// Thunks
export {
  createArtefact,
  deleteArtefact,
  fetchArtefact,
  fetchArtefacts,
  updateArtefactStatus,
  duplicateToReview,
  editArtefact,
  fetchVersionHistory,
  restoreVersion,
  finaliseArtefact,
} from './thunks';
