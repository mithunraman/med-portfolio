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

// Thunks
export {
  createArtefact,
  fetchArtefact,
  fetchArtefacts,
  updateArtefactStatus,
  duplicateToReview,
  editArtefact,
  fetchVersionHistory,
  restoreVersion,
  finaliseArtefact,
} from './thunks';
