import { writeFileSync } from 'node:fs';
import type { Generator } from '#src/codegen/generator.js';
import { checkManifests, generateManifests } from '#src/codegen/manifest-sync.js';

/**
 * The convention fields of each non-npm manifest, such as a `PklProject`.
 */
export const manifestGenerator: Generator = {
  sync: ({ discovery, logger }) => {
    for (const { content, filePath } of generateManifests(discovery)) {
      writeFileSync(filePath, content);
      logger.info(`wrote ${filePath}`);
    }
  },
  verify: ({ discovery }) => checkManifests(discovery),
};
