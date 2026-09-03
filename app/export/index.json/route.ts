import { exportIndex } from "@/src/domain/exportCase";
import { loadAllCases } from "@/src/domain/load";

/**
 * The export index: every case with its export.json path, rendered to a
 * static file at build time — the one URL a researcher's tooling needs.
 */
export async function GET() {
  return Response.json(exportIndex(loadAllCases()));
}
