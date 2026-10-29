import { configure } from '@gtbuchanan/eslint-config';

/*
 * The source layers, lowest first. A layer imports only from the layers
 * before it, which is what lets a layer or a toolchain move into a package of
 * its own without bringing a cycle along.
 */
const layers = ['core', 'tasks', 'toolchains', 'codegen', 'release'];

// The entry points compose every layer, so no layer may import one.
const entryPoints = ['./src/index.ts', './src/main.ts', './src/task.ts'];

const layerZones = layers.map((layer, index) => ({
  from: [...layers.slice(index + 1).map(above => `./src/${above}`), ...entryPoints],
  message: `The ${layer} layer imports only from ${layers.slice(0, index + 1).join(', ')}.`,
  target: `./src/${layer}`,
}));

export default [
  ...await configure({
    tsconfigRootDir: import.meta.dirname,
  }),
  {
    files: ['src/**/*.ts'],
    rules: {
      'import-x/no-restricted-paths': ['warn', {
        basePath: import.meta.dirname,
        zones: layerZones,
      }],
    },
  },
];
