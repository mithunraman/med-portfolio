export type StatusVariant = 'default' | 'processing' | 'warning' | 'success' | 'info';

export interface StatusColorPair {
  /** Chip background. */
  surface: string;
  /** Label colour — AA-legible on `surface`. */
  text: string;
}

/**
 * Semantic status-chip colours (MOB-071).
 *
 * Mode-aware but theme-family-independent: a "success" chip is green regardless
 * of whether the app theme is gmail/spotify/forest, so these live in one place
 * rather than being duplicated across every theme. Each mode is hand-picked for
 * AA contrast — the dark values are chosen deliberately, NOT inverted from light
 * (naive inversion is what produced the muddy "Batman-villain" green).
 *
 * `success`/`info` text is aligned to `colors.success`/`colors.info` so a
 * "Completed" pill matches the "Completed" accent used elsewhere on the detail
 * screen.
 */
export const STATUS_COLORS: Record<'light' | 'dark', Record<StatusVariant, StatusColorPair>> = {
  light: {
    default: { surface: '#ECECEC', text: '#5F6368' },
    processing: { surface: '#FFF3CD', text: '#856404' },
    warning: { surface: '#FCE4B8', text: '#8A6D3B' },
    success: { surface: '#DCF1E3', text: '#1B7A3D' },
    info: { surface: '#D6E9FF', text: '#1565C0' },
  },
  dark: {
    default: { surface: '#3A3A3A', text: '#AAAAAA' },
    processing: { surface: '#3A3212', text: '#FFD966' },
    warning: { surface: '#3E3115', text: '#F0C060' },
    success: { surface: '#16351F', text: '#5CD48A' },
    info: { surface: '#12263F', text: '#64B5F6' },
  },
};
