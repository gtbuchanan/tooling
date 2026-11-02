import type { Generator } from '#src/codegen/generator.js';
import { manifestGenerator } from '#src/codegen/generators/manifest.js';
import { miseGenerator } from '#src/codegen/generators/mise.js';
import { scriptsGenerator } from '#src/codegen/generators/scripts.js';
import { tsconfigGenerator } from '#src/codegen/generators/tsconfig.js';
import { turboGenerator } from '#src/codegen/generators/turbo.js';
import type { SyncScope } from '#src/codegen/sync-scopes.js';

/**
 * Every generated artifact, keyed by the scope that selects it.
 */
export const generators: Readonly<Record<SyncScope, Generator>> = {
  manifest: manifestGenerator,
  mise: miseGenerator,
  scripts: scriptsGenerator,
  tsconfig: tsconfigGenerator,
  turbo: turboGenerator,
};
