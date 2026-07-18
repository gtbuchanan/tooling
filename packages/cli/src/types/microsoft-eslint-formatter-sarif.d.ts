/** Untyped CJS formatter; minimal structural signature for the wrapper. */
declare module '@microsoft/eslint-formatter-sarif' {
  const format: (results: readonly unknown[], data?: unknown) => string;
  export = format;
}
