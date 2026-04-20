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
  deleteArtefact,
  fetchArtefact,
  fetchArtefacts,
  updateArtefactStatus,
  duplicateToReview,
  editArtefact,
  fetchVersionHistory,
  restoreVersion,
  finaliseArtefact,
  markArtefactsStale,
  resetView,
  resetAllViews,
  selectAllArtefacts,
  selectArtefactById,
  selectArtefactsByView,
  selectFilterView,
  selectRecentEntries,
  selectRecentEntriesTotal,
  viewKey,
} from './artefacts';
export type { FilterView, TypedError, ErrorKind } from './artefacts';

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
  updateQuota,
} from './authSlice';
export type { AuthStatus, AuthState } from './authSlice';

// ── Conversations ──
export { deleteConversation, fetchConversations, conversationSelectors } from './conversations';

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
  removeMessageById,
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
export { fetchInit, clearDashboard, markDashboardStale } from './dashboard';

// ── PDP Goals ──
export {
  deletePdpGoal,
  fetchPdpGoals,
  fetchPdpGoal,
  updatePdpGoal,
  addPdpGoalAction,
  updatePdpGoalAction,
  markPdpGoalsStale,
  resetPdpGoalView,
  resetAllPdpGoalViews,
  selectAllPdpGoals,
  selectPdpGoalById,
  selectPdpGoalsByView,
  selectPdpGoalFilterView,
  selectPdpGoalsDueSoon,
  selectPdpGoalsDueTotal,
  pdpGoalViewKey,
} from './pdpGoals';
export type { PdpGoalEntity, PdpGoalFilterView } from './pdpGoals';

// ── Review Periods ──
export {
  fetchReviewPeriods,
  createReviewPeriod,
  updateReviewPeriod,
  archiveReviewPeriod,
  fetchCoverage,
  selectActiveReviewPeriod,
  selectAllReviewPeriods,
  selectReviewPeriodById,
  markReviewPeriodsStale,
} from './reviewPeriods';

// ── Network ──
export { setNetworkStatus, setBannerVisible, selectIsOffline, selectBannerVisible } from './networkSlice';
