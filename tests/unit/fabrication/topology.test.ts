import { describe, expect, it } from "vitest";

import { buildDirectedBodyTopology } from "@/core/fabrication/topology";

describe("fabrication body topology", () => {
  it("orders a deterministic connected tree", () => {
    const result = buildDirectedBodyTopology(
      ["root", "wing-b", "wing-a", "tail"],
      [
        { jointId: "joint-b", parentBodyId: "root", childBodyId: "wing-b" },
        { jointId: "joint-a", parentBodyId: "root", childBodyId: "wing-a" },
        { jointId: "joint-tail", parentBodyId: "wing-a", childBodyId: "tail" },
      ],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rootBodyId).toBe("root");
    expect(result.value.orderedBodyIds).toEqual([
      "root",
      "wing-a",
      "wing-b",
      "tail",
    ]);
    expect(result.value.orderedJointIds).toEqual([
      "joint-a",
      "joint-b",
      "joint-tail",
    ]);
  });

  it.each([
    {
      bodies: ["a", "a"],
      joints: [],
      id: "topology.body_duplicate",
    },
    {
      bodies: ["a", "b"],
      joints: [
        { jointId: "j", parentBodyId: "a", childBodyId: "b" },
        { jointId: "j", parentBodyId: "a", childBodyId: "b" },
      ],
      id: "topology.joint_duplicate",
    },
    {
      bodies: ["a"],
      joints: [{ jointId: "j", parentBodyId: "a", childBodyId: "missing" }],
      id: "topology.reference",
    },
    {
      bodies: ["a"],
      joints: [{ jointId: "j", parentBodyId: "a", childBodyId: "a" }],
      id: "topology.self_edge",
    },
    {
      bodies: ["a", "b", "c"],
      joints: [
        { jointId: "j1", parentBodyId: "a", childBodyId: "c" },
        { jointId: "j2", parentBodyId: "b", childBodyId: "c" },
      ],
      id: "topology.multiple_parents",
    },
    {
      bodies: ["a", "b"],
      joints: [],
      id: "topology.root_count",
    },
    {
      bodies: ["a", "b", "c"],
      joints: [
        { jointId: "j1", parentBodyId: "a", childBodyId: "b" },
        { jointId: "j2", parentBodyId: "c", childBodyId: "c" },
      ],
      id: "topology.self_edge",
    },
  ])("rejects $id", ({ bodies, joints, id }) => {
    const result = buildDirectedBodyTopology(bodies, joints);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.id).toBe(id);
  });

  it("rejects a disconnected cycle", () => {
    const result = buildDirectedBodyTopology(
      ["root", "a", "b"],
      [
        { jointId: "j1", parentBodyId: "a", childBodyId: "b" },
        { jointId: "j2", parentBodyId: "b", childBodyId: "a" },
      ],
    );
    expect(result).toEqual({
      ok: false,
      error: {
        id: "topology.disconnected_or_cyclic",
        bodyIds: ["a", "b"],
      },
    });
  });
});
