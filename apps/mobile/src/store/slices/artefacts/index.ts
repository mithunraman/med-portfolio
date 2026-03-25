// Reducer
export { default as artefactsReducer } from './slice';

// Selectors
export { selectAllArtefacts, selectArtefactById } from './slice';

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
