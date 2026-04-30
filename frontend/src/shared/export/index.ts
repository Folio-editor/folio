// ============================================================
// shared/export 진입점 — 어댑터(Electron Main, Web)가 import
// ============================================================

export { renderToFormat, buildBlocks } from './pipeline';
export type { RenderInput, RenderOutput } from './pipeline';
export { sanitizeFileName } from './fileName';
export { formatDate } from './templates/coverPage';
