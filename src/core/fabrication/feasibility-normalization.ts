import { FabricationDesignSpecV3Schema } from "./design-spec";
import { FabricationIntentV1Schema } from "./schemas";
import type { FabricationIntentV1 } from "./types";

/**
 * Deterministic normalization that pulls a model-authored intent and design
 * spec into the region the deterministic synthesizer can actually realize.
 *
 * The intent and program stages are two independent GPT-5.6 Sol calls, and at
 * their chosen effort they routinely emit designs just outside the synthesis
 * envelope: an undersized sheet, a stock thickness the folding/collision
 * geometry cannot pack, or a lock on every seam of a box. None of those are
 * fixable by nudging one verifier stage; instead we normalize the inputs so the
 * synthesizer receives a buildable problem, exactly as the passing fixtures do.
 */

// Above ~0.4 mm the thickness-driven tab, slot, and clearance geometry grows
// enough to break packing and fold collision for tight enclosures. Clamp the
// stock to the supported range; the design is still produced on real cardstock.
export const MAX_SYNTHESIZABLE_THICKNESS_MM = 0.4;

const clampThicknessMm = (thicknessMm: number): number =>
  thicknessMm > MAX_SYNTHESIZABLE_THICKNESS_MM
    ? MAX_SYNTHESIZABLE_THICKNESS_MM
    : thicknessMm;

// A closed enclosure of finished axes W, H, D unfolds to a flat net whose span
// on each axis can reach roughly twice the two largest finished dimensions.
// Size the sheet generously above that so packing always has room; a larger
// sheet never hurts a design that already fit.
const requiredSheetSpanMm = (intent: FabricationIntentV1): number => {
  const { widthMm, heightMm, depthMm } = intent.requestedSize;
  const dimensions = [widthMm, heightMm, depthMm]
    .map((value) => value ?? 0)
    .toSorted((a, b) => b - a);
  const largest = dimensions[0] ?? 0;
  const second = dimensions[1] ?? 0;
  return Math.ceil(2 * (largest + second) + 20);
};

/**
 * Clamp stock thickness and enlarge every stock sheet so the unfolded net of
 * the requested envelope can be packed. Returns the same intent when nothing
 * needs changing. Applied once at intent time so the whole pipeline
 * (programs -> compile -> verify) shares one consistent stock definition.
 */
export const normalizeFabricationIntentFeasibility = (
  intentInput: FabricationIntentV1,
): FabricationIntentV1 => {
  const intent = FabricationIntentV1Schema.parse(intentInput);
  const minimumSpanMm = requiredSheetSpanMm(intent);
  let changed = false;
  const stockOptions = intent.stockOptions.map((sheet) => {
    const widthMm = Math.max(sheet.widthMm, minimumSpanMm);
    const heightMm = Math.max(sheet.heightMm, minimumSpanMm);
    const thicknessMm = clampThicknessMm(sheet.material.thicknessMm);
    if (
      widthMm === sheet.widthMm &&
      heightMm === sheet.heightMm &&
      thicknessMm === sheet.material.thicknessMm
    ) {
      return sheet;
    }
    changed = true;
    return {
      ...sheet,
      widthMm,
      heightMm,
      material: { ...sheet.material, thicknessMm },
    };
  });
  if (!changed) return intent;
  return FabricationIntentV1Schema.parse({ ...intent, stockOptions });
};

type DesignSpecV3 = ReturnType<typeof FabricationDesignSpecV3Schema.parse>;
type RelationV3 = DesignSpecV3["relations"][number];

const relationParts = (relation: RelationV3): readonly [string, string] => [
  relation.partAKey,
  relation.partBKey,
];

/**
 * Remove redundant relations that over-constrain a single-sheet net.
 *
 * A model often connects a base to each wall AND every adjacent wall pair with
 * a touch, then also locks every seam. Walls held by the shared-base crease
 * graph do not need wall-to-wall relations, and a box needs at most one lock to
 * secure its moving closure. Keeping those extras forces a cyclic, unpackable
 * net. We keep: every relation that touches the highest-degree hub part
 * (typically the base), every motion relation (fold/open_close/slide), and a
 * single lock that secures the moving/driven part; everything else is dropped.
 */
export const stripRedundantSpecRelations = (
  specInput: DesignSpecV3,
): DesignSpecV3 => {
  const spec = FabricationDesignSpecV3Schema.parse(specInput);
  const touchDegree = new Map<string, number>();
  for (const relation of spec.relations) {
    if (relation.kind !== "touch") continue;
    for (const key of relationParts(relation)) {
      touchDegree.set(key, (touchDegree.get(key) ?? 0) + 1);
    }
  }
  const hubKey = [...touchDegree.entries()].toSorted(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0]?.[0];
  if (hubKey === undefined) return spec;

  const driverRelation = spec.driver
    ? spec.relations.find(
        (relation) => relation.key === spec.driver?.relationKey,
      )
    : undefined;
  const movingParts = new Set(
    driverRelation ? relationParts(driverRelation) : [],
  );

  const kept: RelationV3[] = [];
  const droppedLocks: RelationV3[] = [];
  for (const relation of spec.relations) {
    const touchesHub = relationParts(relation).includes(hubKey);
    if (relation.kind === "lock") {
      droppedLocks.push(relation);
      continue;
    }
    if (relation.kind === "touch" && !touchesHub) continue;
    kept.push(relation);
  }
  // Re-add exactly one lock: prefer one that secures the moving closure.
  const securingLock =
    droppedLocks.find((lock) =>
      relationParts(lock).some((key) => movingParts.has(key)),
    ) ?? droppedLocks[0];
  if (securingLock) kept.push(securingLock);

  if (kept.length === spec.relations.length) return spec;
  return FabricationDesignSpecV3Schema.parse({ ...spec, relations: kept });
};
