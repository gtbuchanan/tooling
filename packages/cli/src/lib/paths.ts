import path from 'node:path';

/** Returns a posix-style relative path from `from` to `to`. */
export const toPosixRelative = (from: string, to: string): string =>
  path.relative(from, to).replaceAll('\\', '/');
