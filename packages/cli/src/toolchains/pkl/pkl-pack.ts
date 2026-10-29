import path from 'node:path';

/**
 * Output directory for the packaged Pkl artifacts (mirrors pack:npm).
 */
export const pklPackDestination = path.join('dist', 'packages', 'pkl');
