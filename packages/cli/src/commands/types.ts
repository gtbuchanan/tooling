import type { CommandHandler, Scripts } from '../lib/hook.ts';

/** Invokes a registered command. Accepts a def for compile-time safety. */
export type Invoke = (command: { readonly name: string }) => Promise<void>;

/** Leaf command defined by a binary + args (handler derived by the registry). */
export interface RunCommandDef<Name extends string = string> {
  /** CLI args passed before user args. */
  readonly args: readonly string[];
  /** Executable to spawn. */
  readonly bin: string;
  /** CLI command name (e.g., `'compile:ts'`, `'lint:eslint'`). */
  readonly name: Name;
}

/** Leaf command with a custom handler (e.g., sync pack logic). */
export interface CustomCommandDef<Name extends string = string> {
  /** The default command handler (hook resolution applied by the registry). */
  readonly handler: CommandHandler;
  /** CLI command name. */
  readonly name: Name;
}

/** Descriptor for a command with no dependencies on other commands. */
export type LeafCommandDef<Name extends string = string> =
  | CustomCommandDef<Name>
  | RunCommandDef<Name>;

/** Descriptor for a command that depends on other resolved commands. */
export interface ComposedCommandDef<Name extends string = string> {
  /** CLI command name. */
  readonly name: Name;
  /** Creates the default handler (hook resolution applied by the registry). */
  readonly resolve: (invoke: Invoke, scripts: Scripts) => CommandHandler;
}
