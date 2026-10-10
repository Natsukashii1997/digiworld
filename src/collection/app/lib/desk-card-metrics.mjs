export const CARD_W = 156;
export const CARD_H = 212;
export const CARD_IMAGE_H = 118;
export const CARD_TITLE_LINES = 2;
export const EXPANDED_GRID_GAP_X = 170;
export const EXPANDED_GRID_GAP_Y = 226;
export const FOLDED_STACK_SPREAD_X = 0;
export const FOLDED_STACK_SPREAD_Y = 0;

export function getDeskGroupColumnCount(width) {
  const safeWidth = Number(width) || 0;
  if (safeWidth >= 1720) return 5;
  if (safeWidth >= 1280) return 4;
  if (safeWidth > 900) return 3;
  if (safeWidth < 600) return 1;
  return 2;
}

export function getExpandedGridCenterX(baseCenter, viewportWidth, itemCount, columns) {
  const safeWidth = Math.max(CARD_W, Number(viewportWidth) || CARD_W);
  const visibleColumns = Math.max(1, Math.min(Number(itemCount) || 1, Number(columns) || 1));
  const gridWidth = CARD_W + (visibleColumns - 1) * EXPANDED_GRID_GAP_X;
  const edgePadding = 24;
  const minCenter = gridWidth / 2 + edgePadding;
  const maxCenter = safeWidth - minCenter;

  if (minCenter >= maxCenter) return safeWidth / 2;
  return Math.min(Math.max(Number(baseCenter) || safeWidth / 2, minCenter), maxCenter);
}

export function getDragAutoScrollVelocity(clientY, viewportHeight) {
  const safeHeight = Math.max(1, Number(viewportHeight) || 1);
  const pointerY = Number(clientY) || 0;
  const edgeSize = Math.min(110, Math.max(72, safeHeight * 0.13));
  if (pointerY < edgeSize) {
    return -Math.max(4, Math.round((1 - pointerY / edgeSize) * 20));
  }
  if (pointerY > safeHeight - edgeSize) {
    return Math.max(4, Math.round((1 - (safeHeight - pointerY) / edgeSize) * 20));
  }
  return 0;
}
