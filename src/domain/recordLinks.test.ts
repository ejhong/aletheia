import { describe, expect, it } from "vitest";
import { buildRecordLinkRegistry, splitRecordRefs } from "./recordLinks";
import { getCaseBySlug } from "./load";

describe("splitRecordRefs", () => {
  it("splits mixed claim, source, evidence, and research ids", () => {
    expect(
      splitRecordRefs(
        "Load-bearing ZW-C001; see SRC-MULLER-2020 and ZW-E010 via ZW-R003.",
      ),
    ).toEqual([
      { kind: "text", value: "Load-bearing " },
      { kind: "record", id: "ZW-C001" },
      { kind: "text", value: "; see " },
      { kind: "record", id: "SRC-MULLER-2020" },
      { kind: "text", value: " and " },
      { kind: "record", id: "ZW-E010" },
      { kind: "text", value: " via " },
      { kind: "record", id: "ZW-R003" },
      { kind: "text", value: "." },
    ]);
  });

  it("returns a single text segment when no ids are present", () => {
    expect(splitRecordRefs("No ids here.")).toEqual([
      { kind: "text", value: "No ids here." },
    ]);
  });
});

describe("buildRecordLinkRegistry", () => {
  it("maps ids to the routes the site exposes", () => {
    const loaded = getCaseBySlug("zero-worlds");
    const registry = buildRecordLinkRegistry([loaded]);

    expect(registry.get("ZW-001")).toEqual({
      kind: "case",
      href: "/cases/zero-worlds/",
    });
    expect(registry.get("ZW-C001")).toEqual({
      kind: "claim",
      href: "/claims/ZW-C001/",
    });
    expect(registry.get("SRC-MULLER-2020")).toEqual({
      kind: "source",
      href: "/sources/SRC-MULLER-2020/",
    });
    expect(registry.get("ZW-E001")?.href).toBe(
      "/cases/zero-worlds/#evidence-ZW-E001",
    );
    expect(registry.get("ZW-R001")?.href).toBe(
      "/cases/zero-worlds/#research-ZW-R001",
    );
  });
});
