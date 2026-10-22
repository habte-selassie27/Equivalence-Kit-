/**
 * Limits mirrored from `equivalencekit/bounds.py`.
 *
 * The playground caps its editors with the same numbers the package uses, so an input the
 * site accepts is an input the package accepts. Keep the two in step.
 */

export const MAX_INPUT_BYTES = 16 * 1024;
export const MAX_TEXT = 512;
export const MAX_TITLE = 160;
export const MAX_DIGEST = 280;
export const MAX_REASON = 280;
export const MAX_IDS = 64;
export const MAX_ID_LEN = 64;
export const MAX_FACTS = 32;
export const MAX_RUBRIC_ITEMS = 32;
export const MAX_EVIDENCE = 64;
export const MAX_ROUNDS = 8;
export const MAX_BUCKETS = 16;

/** Editor input cap, in characters. Matches the package's input byte limit. */
export const MAX_EDITOR_CHARS = MAX_INPUT_BYTES;

/** Seeds are explicit integers so a perturbation is reproducible and shareable. */
export const MAX_SEED = 9999;
