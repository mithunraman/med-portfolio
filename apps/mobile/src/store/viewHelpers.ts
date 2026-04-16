export interface FilterView {
  ids: string[];
  nextCursor: string | null;
  status: 'idle' | 'loading' | 'loadingMore';
  lastFetchedAt: number | null;
}

interface HasViews {
  views: Record<string, FilterView>;
}

export function viewKeyFromStatus(status?: number | null): string {
  return status == null ? 'all' : String(status);
}

export function invalidateView(state: HasViews, key: string): void {
  delete state.views[key];
}

export function removeIdFromView(state: HasViews, key: string, id: string): void {
  const view = state.views[key];
  if (!view) return;
  const idx = view.ids.indexOf(id);
  if (idx !== -1) view.ids.splice(idx, 1);
}
