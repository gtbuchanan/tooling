/*
 * Oxlint jsPlugins crash on certain platforms. Stylistic rules require
 * the jsPlugin so they must be omitted together.
 * - Android/Termux: oxc_allocator thread-local pool panic (oxc#21045)
 * - Windows: intermittent failures (oxc#19395)
 */
/** Whether the current platform supports oxlint jsPlugins. */
export const jsPluginsSupported =
  process.platform !== 'android' && process.platform !== 'win32';
