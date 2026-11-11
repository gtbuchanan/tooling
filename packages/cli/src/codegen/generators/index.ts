import type { Generator } from '#src/codegen/generator.js';
import { toolchainsGenerator } from '#src/codegen/generators/toolchains.js';
import { turboGenerator } from '#src/codegen/generators/turbo.js';
import type { SyncScope } from '#src/codegen/sync-scopes.js';

/**
 * Every generated artifact, keyed by the scope that selects it.
 */
export const generators: Readonly<Record<SyncScope, Generator>> = {
  toolchains: toolchainsGenerator,
  turbo: turboGenerator,
};
