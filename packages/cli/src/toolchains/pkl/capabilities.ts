import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Capability, CapabilitySource } from '#src/core/capability.js';
import { hasPackageBlock } from '#src/core/pkl-project.js';

const isPklSource = ({ entries }: CapabilitySource): boolean =>
  entries.some(entry => entry.endsWith('.pkl') && entry !== 'hk.pkl');

/**
 * Holds hand-authored Pkl source — a `*.pkl` file other than the hk config
 * `hk.pkl`. Excluding `hk.pkl` keeps a single-package repo that merely *uses*
 * hk (its root is the lone package) from being mistaken for a Pkl package.
 * Drives `typecheck:pkl` (all Pkl source is validated), not publishing — see
 * {@link pklPackage}.
 */
export const pklSource: Capability = {
  detect: isPklSource,
  name: 'pklSource',
};

/**
 * Reads a package's `PklProject` source, or `''` when absent.
 */
const readPklProject = (dir: string): string => {
  try {
    return readFileSync(path.join(dir, 'PklProject'), 'utf8');
  } catch {
    return '';
  }
};

/**
 * Holds a *publishable* Pkl package: {@link pklSource} and a `PklProject`
 * declaring a `package {}` block. The block is Pkl's own definition of a
 * distributable package (`pkl project package` needs it), so its presence is
 * the publish signal — a deps-only or block-less Pkl project stays internal.
 * Drives `PklProject` version-stamping, `pack:pkl`, and `gtb publish`.
 */
export const pklPackage: Capability = {
  detect: source => isPklSource(source) && hasPackageBlock(readPklProject(source.dir)),
  name: 'pklPackage',
};
