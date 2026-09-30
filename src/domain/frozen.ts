/**
 * Read once, for a process that will not see the content change.
 *
 * Every page of the static site asked the loader for the whole content —
 * every case, claim, evidence record and assessment, parsed and validated
 * again — and there are about a thousand pages: on the CI runner the build
 * had come to twenty minutes, nearly all of it the same parse repeated
 * (2026-09-30). During a build the content cannot change, so there it is
 * read once per process.
 *
 * Only there. The pipeline's verbs write content and read it back in the
 * same process (a sitting verifies, then composes the edition from what it
 * just admitted), and the tests load fixtures that differ: both must get a
 * fresh read every time. So this is off unless the process says the content
 * is frozen — `ALETHEIA_CONTENT_FROZEN=1`, which only the site's build
 * script sets (package.json).
 *
 * What is held is deep-frozen. A page that altered a loaded record would
 * change it for every page rendered after it in the same process; frozen,
 * that page fails the build instead.
 */
const FROZEN = process.env.ALETHEIA_CONTENT_FROZEN === "1";
const held = new Map<string, unknown>();

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

/** `load()`, or what it returned the first time for this key when the content is frozen. */
export function readOnce<T>(key: string, load: () => T): T {
  if (!FROZEN) return load();
  if (!held.has(key)) held.set(key, deepFreeze(load()));
  return held.get(key) as T;
}

/** Whether this process holds the content frozen (for a test that asserts the default is a fresh read). */
export const contentFrozen = (): boolean => FROZEN;
