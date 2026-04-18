import type { PluginFactory } from '../index.ts';
import core from './core.ts';
import eslintComments from './eslint-comments.ts';
import importX from './import-x.ts';
import json from './json.ts';
import node from './node.ts';
import pnpm from './pnpm.ts';
import promise from './promise.ts';
import stylistic from './stylistic.ts';
import typescript from './typescript.ts';
import unicorn from './unicorn.ts';
import vitest from './vitest.ts';
import yaml from './yaml.ts';

/** Ordered plugin factories. Later entries override earlier ones for the same file. */
export const plugins: readonly PluginFactory[] = [
  typescript, unicorn, promise, json, yaml, pnpm, node,
  stylistic, eslintComments, importX,
  core, vitest,
];
