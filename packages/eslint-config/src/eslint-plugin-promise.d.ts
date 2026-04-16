declare module 'eslint-plugin-promise' {
  import type { Linter } from 'eslint';

  interface PromisePlugin {
    readonly configs: {
      readonly 'flat/recommended': Linter.Config;
    };
  }

  const plugin: PromisePlugin;
  export default plugin;
}
