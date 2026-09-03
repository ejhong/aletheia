import { exportCase } from "@/src/domain/exportCase";
import { loadAllCases } from "@/src/domain/load";
import { paramsOrPlaceholder } from "@/src/domain/staticExport";

/**
 * The per-case machine-readable export, rendered to a static file at
 * build time (output: export supports GET route handlers). One JSON
 * document per case: the whole Zod-validated ledger with stable ids.
 */

export function generateStaticParams() {
  return paramsOrPlaceholder(
    "slug",
    loadAllCases().map((c) => c.record.slug),
  );
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const loaded = loadAllCases().find((c) => c.record.slug === slug);
  if (!loaded) {
    // Only reachable via the zero-content placeholder param; the honest
    // answer for a record that does not exist is a 404 document.
    return Response.json({ error: "no such case" }, { status: 404 });
  }
  return Response.json(exportCase(loaded));
}
