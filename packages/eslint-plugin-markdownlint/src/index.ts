import type { ESLint } from 'eslint';
import { lint } from './lint.ts';

/**
 * ESLint plugin wrapping markdownlint for structural Markdown linting.
 * Uses markdownlint's sync API directly — no worker threads.
 */
const plugin: ESLint.Plugin = {
  rules: { lint },
};

export default plugin;

export * as parser from './parser.ts';
