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

/** @type {import('@pnpm/types').ReadPackageHook} */
const readPackage = (pkg) => {
  /* pnpm ignores the `os` field for workspace packages, so the Termux
     shim's `bin/pnpm` would otherwise shadow the real pnpm on non-Android
     hosts and break any script that spawns pnpm (e.g. lifecycle hooks).
     Drop the optional dep from root on platforms where it can't apply. */
  if (process.platform !== 'android' && pkg.name === 'tooling-root') {
    /* eslint-disable-next-line no-param-reassign --
       pnpm's readPackage hook is invoked with the live manifest and
       expects in-place mutation; cloning the full object defeats the
       purpose. */
    delete pkg.optionalDependencies?.['@gtbuchanan/pnpm-termux-shim'];
  }

  return pkg;
};

module.exports = {
  hooks: {
    afterAllResolved,
    readPackage,
  },
};
