/** Handler function for a CLI command. */
export type CommandHandler = (args: readonly string[]) => Promise<void> | void;

/** Leaf command defined by a binary + args (handler derived by the registry). */
export interface RunCommandDef {
  /** CLI args passed before user args. */
  readonly args: readonly string[];
  /** Executable to spawn. */
  readonly bin: string;
  /** CLI command name (e.g., `'compile:ts'`, `'lint:eslint'`). */
  readonly name: string;
}

/** Leaf command with a custom handler (e.g., sync pack logic). */
export interface CustomCommandDef {
  /** The default command handler. */
  readonly handler: CommandHandler;
  /** CLI command name. */
  readonly name: string;
}

/** Descriptor for a command with no dependencies on other commands. */
export type LeafCommandDef = CustomCommandDef | RunCommandDef;
