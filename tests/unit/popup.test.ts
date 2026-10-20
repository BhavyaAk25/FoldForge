import { describe, expect, it } from "vitest";

import { POST as popupPost } from "@/app/api/popup/route";
import { popupCard } from "@/core/popup/cards";
import { popupPageSvg } from "@/core/popup/export";
import { foldAngle, verifyPopup, type PopupCard } from "@/core/popup/popup";
import { PopupPayloadSchema } from "@/lib/papercraft-contract";
import { routePrompt } from "@/server/fabrication-ai/router";
import { buildFigure } from "@/server/papercraft";
import { FIGURE_PRESETS, figureFromPreset } from "@/core/mesh/presets";

const colors = { card: "#f3ead8", main: "#f08aa8", second: "#5fa05a" };
const flower = popupCard("flower", colors, "Flower card");

const withPiece = (
  change: Partial<PopupCard["pieces"][number]>,
): PopupCard => ({
  ...flower,
  pieces: [{ ...flower.pieces[0]!, ...change }],
});

describe("pop-up cards", () => {
  it.each([["flower"], ["heart"]] as const)(
    "the %s card opens and closes cleanly",
    (design) => {
      const card = popupCard(design, colors, "card");
      expect(verifyPopup(card)).toEqual([]);
      expect(popupPageSvg(card)).toContain("dotted guides");
    },
  );

  it("solves the fold angle exactly: closed it lies at alpha + phi", () => {
    const piece = flower.pieces[0]!;
    expect((foldAngle(piece, 0)! * 180) / Math.PI).toBeCloseTo(
      piece.alphaDeg + piece.phiDeg,
      6,
    );
  });

  it.each([
    [
      "a fold that cannot reach flat (phi < alpha)",
      withPiece({ alphaDeg: 40, phiDeg: 20 }),
      "unreachable",
    ],
    [
      "a piece too big for the closed card",
      withPiece({
        half: flower.pieces[0]!.half.map(([s, t]) => [s * 2, t * 2] as const),
      }),
      "sticks_out_closed",
    ],
    [
      "two pieces in the same place",
      {
        ...flower,
        pieces: [
          flower.pieces[0]!,
          {
            ...flower.pieces[0]!,
            id: "crossing",
            apexMm: 30,
            alphaDeg: 35,
            phiDeg: 40,
            half: flower.pieces[0]!.half.map(
              ([s, t]) => [s / 2, t / 2] as const,
            ),
          },
        ],
      },
      "collision",
    ],
  ] as const)("catches %s", (_, card, check) => {
    expect(verifyPopup(card).map((f) => f.check)).toContain(check);
  });

  it.each([
    ["a birthday card where a flower pops up", "flower"],
    ["a valentine card", "heart"],
    ["a red pop-up card", "flower"],
  ])("routes %j to a %s pop-up", async (prompt, design) => {
    const route = await routePrompt(prompt);
    expect(route.engine === "popup" ? route.card.design : route.engine).toBe(
      design,
    );
  });

  it("serves a checked card over HTTP", async () => {
    const origin = "http://localhost:3000";
    const route = await routePrompt("a red pop-up flower card");
    if (route.engine !== "popup") throw new Error(route.engine);
    expect(route.card.colors.main).toBe("#d6403a");
    const response = await popupPost(
      new Request(`${origin}/api/popup`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify({ card: route.card }),
      }),
    );
    expect(PopupPayloadSchema.parse(await response.json()).page).toContain(
      "<svg",
    );
  });
});

describe("the playing-card box", () => {
  it("routes a deck of cards to a sleeve with a sliding tray, ahead of plain boxes", async () => {
    const route = await routePrompt("a box for a deck of playing cards");
    expect(
      route.engine === "figure" ? route.figure.params.rig : route.engine,
    ).toBe("cardbox");
  });

  it("builds open parts with raw edges and a sliding tray, all checks passing", () => {
    const built = buildFigure(
      figureFromPreset(FIGURE_PRESETS.find((p) => p.id === "cardbox")!),
    );
    if (!built.ok) throw new Error(built.reason);
    const tray = built.payload.parts.find((p) => p.id === "tray")!;
    expect(tray.open).toBe(true);
    expect(tray.slide?.[0]).toBeGreaterThan(0);
    expect(built.payload.decals.length).toBe(5);
  });
});
