import type { CommandHandler, Scripts } from '../lib/hook.ts';

/** Invokes a registered command. Accepts a def for compile-time safety. */
export type Invoke = (command: { readonly name: string }) => Promise<void>;

/** Descriptor for a command with no dependencies on other commands. */
export interface LeafCommandDef<Name extends string = string> {
  /** CLI command name (e.g., `'compile:ts'`, `'lint:eslint'`). */
  readonly name: Name;
  /** The default command handler (hook resolution applied by the registry). */
  readonly handler: CommandHandler;
}

/** Descriptor for a command that depends on other resolved commands. */
export interface ComposedCommandDef<Name extends string = string> {
  /** CLI command name. */
  readonly name: Name;
  /** Creates the default handler (hook resolution applied by the registry). */
  readonly resolve: (invoke: Invoke, scripts: Scripts) => CommandHandler;
}
