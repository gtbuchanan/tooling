import { configure } from '../eslint-config/src/index.ts';

export default configure({
  tsconfigRootDir: import.meta.dirname,
});
