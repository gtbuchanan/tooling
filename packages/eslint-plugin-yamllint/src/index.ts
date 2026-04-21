import type { ESLint } from 'eslint';
import { anchors } from './rules/anchors.ts';
import { documentEnd } from './rules/document-end.ts';
import { documentStart } from './rules/document-start.ts';
import { octalValues } from './rules/octal-values.ts';
import { truthy } from './rules/truthy.ts';

/**
 * ESLint plugin implementing yamllint-equivalent rules for YAML files.
 * Each rule is a native ESLint rule using the `yaml` npm package for
 * parsing — no Python dependency required.
 */
const plugin: ESLint.Plugin = {
  rules: {
    'anchors': anchors,
    'document-end': documentEnd,
    'document-start': documentStart,
    'octal-values': octalValues,
    'truthy': truthy,
  },
};

export default plugin;
