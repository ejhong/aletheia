/** Schema defaults may add fields; unknown input fields must never disappear. */
export function unknownFields(raw: unknown, parsed: unknown, at = "record"): string[] {
  if (Array.isArray(raw) && Array.isArray(parsed))
    return raw.flatMap((value, i) => unknownFields(value, parsed[i], `${at}[${i}]`));
  if (raw && typeof raw === "object" && parsed && typeof parsed === "object")
    return Object.entries(raw).flatMap(([key, value]) => Object.hasOwn(parsed, key)
      ? unknownFields(value, (parsed as Record<string, unknown>)[key], `${at}.${key}`)
      : [`${at}.${key}`]);
  return [];
}
