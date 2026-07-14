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
    expect(verifySvgScale(svg, DEMO_CONSTRAINT, candidate)).toEqual({
      valid: true,
      errorMm: 0,
    });
  });

  it("rejects incomplete SVG scale declarations", () => {
    expect(candidate).toBeDefined();
    if (!candidate) return;
    expect(verifySvgScale("<svg />", DEMO_CONSTRAINT, candidate)).toEqual({
      valid: false,
      errorMm: Number.POSITIVE_INFINITY,
    });
  });

  it("rejects SVG geometry or viewBox corruption even when physical units remain", () => {
    expect(candidate).toBeDefined();
    if (!candidate) return;
    const svg = exportSvg(candidate, DEMO_CONSTRAINT);
    expect(
      verifySvgScale(
        svg.replace('viewBox="0 0 215.9 279.4"', 'viewBox="0 0 1 1"'),
        DEMO_CONSTRAINT,
        candidate,
      ).valid,
    ).toBe(false);
    expect(
      verifySvgScale(
        svg.replace('id="perimeter"', 'id="perimeter-corrupt"'),
        DEMO_CONSTRAINT,
        candidate,
      ).valid,
    ).toBe(false);
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
    const boundaryCount = candidate.geometry.flat.outline.points.length;
    const betaDeg =
      (Math.atan2(
        candidate.parameters.backrestRiseMm,
        candidate.geometry.derived.rearRunMm,
      ) *
        180) /
      Math.PI;
    expect(
      document.edges_foldAngle.slice(boundaryCount, boundaryCount + 5),
    ).toEqual([
      expect.closeTo(-(candidate.parameters.backrestAngleDeg + betaDeg), 5),
      expect.closeTo(betaDeg - 180, 5),
      -90,
      -candidate.parameters.backrestAngleDeg,
      -candidate.parameters.backrestAngleDeg,
    ]);
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

    const corrupt = createFoldDocument(candidate);
    expect(
      verifyFoldReference(
        candidate,
        JSON.stringify({
          ...corrupt,
          vertices_coords: corrupt.vertices_coords.map(() => [0, 0]),
          edges_foldAngle: corrupt.edges_foldAngle.map(() => 123),
        }),
      ).valid,
    ).toBe(false);
  });
});
