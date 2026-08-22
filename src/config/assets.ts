/**
 * Prefix a public asset path with the GitHub Pages base path. Resolved at
 * build time (all components are server-rendered in the static export).
 */
export function assetPath(file: string): string {
  return `${process.env.PAGES_BASE_PATH ?? ""}${file}`;
}
