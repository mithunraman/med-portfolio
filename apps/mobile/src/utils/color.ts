/**
 * Converts a hex color string to rgba with the given alpha.
 * Handles #RGB, #RRGGBB, and #RRGGBBAA formats.
 */
export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  let r: number, g: number, b: number;

  if (h.length === 3) {
    r = parseInt(h[0] + h[0], 16);
    g = parseInt(h[1] + h[1], 16);
    b = parseInt(h[2] + h[2], 16);
  } else {
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
  }

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
