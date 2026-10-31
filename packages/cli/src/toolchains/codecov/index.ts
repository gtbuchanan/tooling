import type { Toolchain } from '#src/tasks/toolchain.js';
import { coverageCodecovUpload } from '#src/toolchains/codecov/commands/coverage-codecov-upload.js';
import { coverageCodecovUploadLeaf } from '#src/toolchains/codecov/leaves.js';

/**
 * The codecov toolchain's `gtb task` subcommands.
 */
export const codecovToolchain: Toolchain = {
  registrations: [
    { command: coverageCodecovUpload, leaf: coverageCodecovUploadLeaf },
  ],
};
