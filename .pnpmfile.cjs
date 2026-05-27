/** @param {import('@pnpm/lockfile.types').LockfileObject} lockFile */
const afterAllResolved = (lockFile) => {
  /** @type {import('@pnpm/lockfile.types').PackageSnapshot[]} */
  const pkgs = Object.values(lockFile.packages ?? {});
  for (const pkg of pkgs) {
    /* HACK: Remove tarball URLs from the lockfile
       https://github.com/pnpm/pnpm/issues/6667 */
    if ('tarball' in pkg.resolution) {
      delete pkg.resolution.tarball;
    }
  }

  return lockFile;
};

module.exports = {
  hooks: {
    afterAllResolved,
  },
};
