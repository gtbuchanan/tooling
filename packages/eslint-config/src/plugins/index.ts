import type { PluginFactory } from '../index.ts';
import agentSkills from './agent-skills.ts';
import core from './core.ts';
import eslintComments from './eslint-comments.ts';
import format from './format.ts';
import importX from './import-x.ts';
import jsdoc from './jsdoc.ts';
import json from './json.ts';
import markdownlint from './markdownlint.ts';
import node from './node.ts';
import pnpm from './pnpm.ts';
import promise from './promise.ts';
import regexp from './regexp.ts';
import stylistic from './stylistic.ts';
import typescript from './typescript.ts';
import unicorn from './unicorn.ts';
import vitest from './vitest.ts';
import yaml from './yaml.ts';
import yamllint from './yamllint.ts';

/** Ordered plugin factories. Later entries override earlier ones for the same file. */
export const plugins: readonly PluginFactory[] = [
  typescript, unicorn, promise, regexp, jsdoc, json, yaml, yamllint, pnpm, node,
  format, markdownlint, agentSkills, stylistic, eslintComments, importX,
  core, vitest,
];
