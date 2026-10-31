import { Aggregate } from '#src/tasks/aggregates.js';
import type { Leaf } from '#src/tasks/leaf.js';

/*
 * Pkl package tasks. `typecheck:pkl` evaluates the modules to validate them
 * (`pkl eval` renders to stdout, which the handler discards — pure
 * validation, hence no outputs, mirroring `typecheck:ts`). `pack:pkl` is the
 * sole artifact-producing step (`pkl project package` → the release zip),
 * mirroring `pack:npm`. There is no `compile:pkl`: nothing consumes a rendered
 * intermediate — consumers import the source `.pkl` shipped inside the zip.
 */
const pklInputs = ['*.pkl', 'PklProject'];

/**
 * `pkl eval` over the package's modules, to validate them.
 */
export const typecheckPklLeaf: Leaf = {
  aggregate: Aggregate.typecheck,
  appliesTo: pkg => pkg.hasPkl,
  name: 'typecheck:pkl',
  task: () => ({ inputs: pklInputs, outputs: [] }),
};

/**
 * `pkl project package` into the release zip.
 */
export const packPklLeaf: Leaf = {
  aggregate: Aggregate.pack,
  appliesTo: pkg => pkg.hasPklPackage,
  name: 'pack:pkl',
  task: () => ({
    dependsOn: [typecheckPklLeaf.name],
    inputs: [...pklInputs, 'package.json'],
    outputs: ['dist/packages/pkl/**'],
  }),
};
