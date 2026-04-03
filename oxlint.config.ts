import { configure } from '@gtbuchanan/oxlint-config';

export default configure({
  overrides: [{
    files: ['**/*.ts'],
    rules: {
      'import/no-nodejs-modules': 'off',
    },
  }],
});
