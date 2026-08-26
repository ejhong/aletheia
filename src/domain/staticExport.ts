/**
 * Zero-content support for the static export.
 *
 * `output: export` refuses to build a dynamic route whose
 * `generateStaticParams()` returns zero params. A bootstrapped site with
 * no published cases hits exactly that. Rather than shipping fake
 * content, each dynamic route emits ONE reserved placeholder param when
 * it has no records, and the page renders `notFound()` for it — so the
 * exported document at the placeholder path is the 404 page, which is
 * the honest answer for a record that does not exist.
 *
 * Pure and framework-free; the `notFound()` call lives in the pages.
 */
export const PLACEHOLDER_PARAM = "not-yet-published";

export function paramsOrPlaceholder<K extends string>(
  key: K,
  values: string[],
): Record<K, string>[] {
  const list = values.length > 0 ? values : [PLACEHOLDER_PARAM];
  return list.map((v) => ({ [key]: v }) as Record<K, string>);
}
