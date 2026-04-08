import { configure } from '@gtbuchanan/eslint-config';

export default configure({
  entryPoints: ['**/bin/**/*.ts', '**/bin.ts', '**/main.ts'],
  tsconfigRootDir: import.meta.dirname,
});
