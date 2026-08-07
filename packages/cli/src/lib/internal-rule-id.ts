/**
 * Rule label substituted when a lint message carries no rule at all.
 * ESLint reports `ruleId: null` for messages that don't originate from
 * a rule — fatal parse or config errors — and SARIF results inherit
 * that absence. Labeling them `internal` marks the finding as
 * tool-internal breakage rather than leaving a hole in the output
 * line.
 *
 * Kept dependency-free: the ESLint formatter imports this from inside
 * the ESLint process.
 */
export const internalRuleId = 'internal';
