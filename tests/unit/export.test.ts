import { describe, expect, it } from "vitest";

import { generateCandidates } from "@/core/candidates";
import { canonicalSerialize } from "@/core/canonical";
import { DEMO_CONSTRAINT } from "@/core/constraints";
import {
  createFoldDocument,
  exportFold,
  verifyFoldReference,
} from "@/core/export/fold";
import { exportSvg, verifySvgScale } from "@/core/export/svg";

describe("source-owned exports", () => {
  const candidate = generateCandidates(DEMO_CONSTRAINT, 20260714)[0];

  it("writes a physically declared SVG with an exact calibration line", () => {
    expect(candidate).toBeDefined();
    if (!candidate) return;
    const svg = exportSvg(candidate, DEMO_CONSTRAINT);
    expect(svg).toContain('width="215.9mm"');
    expect(svg).toContain('height="279.4mm"');
    expect(svg).toContain('id="calibration-50mm"');
    expect(verifySvgScale(svg, DEMO_CONSTRAINT)).toEqual({
      valid: true,
      errorMm: 0,
    });
  });

  it("rejects incomplete SVG scale declarations", () => {
    expect(verifySvgScale("<svg />", DEMO_CONSTRAINT)).toEqual({
      valid: false,
      errorMm: Number.POSITIVE_INFINITY,
    });
  });

  it("writes the FoldForge FOLD 1.2 cuts profile", () => {
    expect(candidate).toBeDefined();
    if (!candidate) return;
    const document = createFoldDocument(candidate);
    expect(document.file_spec).toBe(1.2);
    expect(document.frame_unit).toBe("mm");
    expect(
      document.edges_assignment.filter((assignment) => assignment === "C"),
    ).toHaveLength(2);
    expect(verifyFoldReference(candidate, exportFold(candidate)).valid).toBe(
      true,
    );
    expect(canonicalSerialize(document)).toBe(
      canonicalSerialize(createFoldDocument(candidate)),
    );
  });

  it("rejects malformed and non-equivalent FOLD documents", () => {
    expect(candidate).toBeDefined();
    if (!candidate) return;
    expect(verifyFoldReference(candidate, "not json")).toEqual({
      valid: false,
      message: "FOLD JSON could not be parsed.",
    });
    expect(verifyFoldReference(candidate, "[]").valid).toBe(false);
    expect(
      verifyFoldReference(candidate, JSON.stringify({ file_spec: 1.1 })).valid,
    ).toBe(false);
  });
});
