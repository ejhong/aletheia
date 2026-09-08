import { describe, expect, it } from "vitest";
import { DRAFT_SCHEMA } from "../pipeline/draft.ts";
import { EDITION_SCHEMA } from "../pipeline/edition.ts";
import { VERIFY_SCHEMA } from "../pipeline/verify.ts";

/**
 * The structured-output schemas are sent to the vendor with every drafter,
 * verifier, and editor call; a shape the vendor rejects fails a paid run
 * with a 400 after the packet was built. The rules pinned here are the ones
 * that have bitten: no `enum` on a union type (write a nullable enum as
 * anyOf), `additionalProperties: false` on every object, no length or
 * numeric constraints, and every property required.
 */

function walk(node: unknown, path: string, visit: (n: Record<string, unknown>, p: string) => void): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${path}[${i}]`, visit));
  const n = node as Record<string, unknown>;
  visit(n, path);
  for (const [k, v] of Object.entries(n)) if (k !== "enum" && k !== "required") walk(v, `${path}.${k}`, visit);
}

const SCHEMAS = { draft: DRAFT_SCHEMA, verify: VERIFY_SCHEMA, edition: EDITION_SCHEMA };

describe("structured-output schemas", () => {
  for (const [name, schema] of Object.entries(SCHEMAS)) {
    it(`${name}: only shapes the vendor accepts`, () => {
      walk(schema, name, (n, p) => {
        if ("enum" in n) expect(Array.isArray(n.type), `${p}: enum on a union type`).toBe(false);
        if (n.type === "object" || (Array.isArray(n.type) && n.type.includes("object"))) {
          if ("properties" in n) {
            expect(n.additionalProperties, `${p}: additionalProperties must be false`).toBe(false);
            const props = Object.keys(n.properties as object);
            expect([...(n.required as string[])].sort(), `${p}: every property must be required`).toEqual(props.sort());
          }
        }
        for (const banned of ["minLength", "maxLength", "minimum", "maximum", "pattern", "minItems", "maxItems"]) {
          expect(banned in n, `${p}: ${banned} is not accepted`).toBe(false);
        }
      });
    });
  }
});
