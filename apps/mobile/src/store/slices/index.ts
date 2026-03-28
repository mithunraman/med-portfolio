// ── Reducers (consumed by store/index.ts) ──
export { artefactsReducer } from './artefacts';
export { default as authReducer } from './authSlice';
export { conversationsReducer } from './conversations';
export { messagesReducer } from './messages';
export { default as onboardingReducer } from './onboardingSlice';
export { dashboardReducer } from './dashboard';
export { pdpGoalsReducer } from './pdpGoals';
export { reviewPeriodsReducer } from './reviewPeriods';
export { default as networkReducer } from './networkSlice';

// ── Artefacts ──
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
  selectAllArtefacts,
  selectArtefactById,
} from './artefacts';

// ── Auth ──
export {
  initializeAuth,
  otpSend,
  otpVerify,
  registerGuest,
  claimGuest,
  requestDeletion,
  cancelDeletion,
  logout,
  clearError,
  setUnauthenticated,
  clearNewRegistration,
} from './authSlice';
export type { AuthStatus, AuthState } from './authSlice';

// ── Conversations ──
export { fetchConversations, conversationSelectors } from './conversations';

// ── Messages ──
export {
  fetchMessages,
  sendMessage,
  sendMessageWithRetry,
  retryFailedMessage,
  sendVoiceNoteWithRetry,
  resumeAnalysisWithOptimistic,
  pollConversation,
  startAnalysis,
  resumeAnalysis,
  clearMessagesError,
  clearAnalysisError,
  clearMessages,
  upsertMessage,
  addOptimisticMessage,
  updateOptimisticStatus,
  removeOptimisticMessage,
  rekeyOptimisticMessages,
  messageSelectors,
  toRenderableMessage,
} from './messages';
export type { DeliveryStatus, OptimisticMessage, RenderableMessage } from './messages';

// ── Onboarding ──
export { loadOnboardingState } from './onboardingSlice';

// ── Dashboard ──
export { fetchInit, clearDashboard } from './dashboard';

// ── PDP Goals ──
export {
  fetchPdpGoals,
  fetchPdpGoal,
  updatePdpGoal,
  addPdpGoalAction,
  updatePdpGoalAction,
  selectAllPdpGoals,
  selectPdpGoalById,
} from './pdpGoals';

// ── Review Periods ──
export {
  fetchReviewPeriods,
  createReviewPeriod,
  updateReviewPeriod,
  archiveReviewPeriod,
  fetchCoverage,
  selectAllReviewPeriods,
  selectReviewPeriodById,
} from './reviewPeriods';

// ── Network ──
export { setNetworkStatus, setBannerVisible, selectIsOffline, selectBannerVisible } from './networkSlice';
