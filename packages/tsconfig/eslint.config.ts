import { configure } from '@gtbuchanan/eslint-config';

export default [
  ...await configure({
    tsconfigRootDir: import.meta.dirname,
  }),
  {
    files: ['**/*.ts'],
    rules: { 'max-lines': ['warn', { max: 20 }] },
  },
];
