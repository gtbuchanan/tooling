/**
 * Prefix marking author-owned codegen scripts (`generate:prisma`). Unlike
 * every task name, these have no CLI handler — gtb only discovers them and
 * wires them into the `generate` aggregate.
 */
export const generateTaskPrefix = 'generate:';
