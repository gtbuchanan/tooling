import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import * as v from 'valibot';

const { resolve } = createRequire(import.meta.url);

const jsonIndent = 2;

const pkgDir = path.join(import.meta.dirname, '..');
const outDir = path.join(pkgDir, 'dist', 'source');

const TsconfigSchema = v.looseObject({
  compilerOptions: v.optional(v.record(v.string(), v.unknown()), {}),
  extends: v.optional(v.union([v.string(), v.array(v.string())])),
});

const readTsconfig = (path: string): v.InferOutput<typeof TsconfigSchema> =>
  v.parse(TsconfigSchema, JSON.parse(readFileSync(path, 'utf8')));

const source = readTsconfig(path.join(pkgDir, 'node.json'));

const extendsList = v.parse(
  v.array(v.string()),
  [source.extends].flat().filter(Boolean),
);

const mergedCompilerOptions = extendsList.reduce<Record<string, unknown>>(
  (acc, ext) => {
    const extConfig = readTsconfig(resolve(ext));
    if (extConfig.extends !== undefined) {
      throw new Error(
        `Nested extends not supported: ${ext} itself uses extends`,
      );
    }
    return { ...acc, ...extConfig.compilerOptions };
  },
  {},
);

const { extends: _extends, compilerOptions, ...rest } = source;
const flattened = {
  ...rest,
  compilerOptions: {
    ...mergedCompilerOptions,
    ...compilerOptions,
  },
};

mkdirSync(outDir, { recursive: true });
writeFileSync(
  path.join(outDir, 'node.json'),
  `${JSON.stringify(flattened, undefined, jsonIndent)}\n`,
);
