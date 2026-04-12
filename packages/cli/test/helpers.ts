import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Creates an isolated temp directory for test fixtures. */
export const createTempDir = (): string =>
  mkdtempSync(join(tmpdir(), 'gtb-test-'));

/** Writes a JSON file to a directory. */
export const writeJson = (dir: string, name: string, data: unknown): void => {
  writeFileSync(join(dir, name), JSON.stringify(data));
};
