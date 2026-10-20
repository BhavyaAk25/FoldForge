import { popupCard } from "@/core/popup/cards";
import { popupPageSvg } from "@/core/popup/export";
import { verifyPopup } from "@/core/popup/popup";
import type { PopupChoice, PopupPayload } from "@/lib/papercraft-contract";

/**
 * Builds a pop-up card on the server. The design is checked through its
 * whole opening swing; a card that fails is never returned.
 */
export const buildPopup = (
  choice: PopupChoice,
):
  | { readonly ok: true; readonly payload: PopupPayload }
  | { readonly ok: false; readonly reason: string } => {
  const card = popupCard(choice.design, choice.colors, choice.title);
  const failures = verifyPopup(card);
  if (failures.length > 0) return { ok: false, reason: failures[0]!.check };
  return {
    ok: true,
    payload: {
      card: {
        ...card,
        pieces: card.pieces.map((p) => ({
          ...p,
          half: p.half.map(([s, t]) => [s, t] as [number, number]),
          prints: p.prints.map((r) => ({
            ...r,
            points: r.points.map(([s, t]) => [s, t] as [number, number]),
          })),
        })),
      },
      page: popupPageSvg(card),
      instructions: [
        'Print the page at 100% (no "fit to page") on A4 card, about 160 to 220 gsm.',
        "Cut out the card and the pop-up piece along the solid lines.",
        "Score and fold the card in half along its spine, printed side inside.",
        "Fold the pop-up piece down its centre so its face points out, then fold its two grey tabs back.",
        "With the card open at a right angle, glue the tabs onto the dotted guides with the same letter, the centre fold on the spine.",
        "Close the card gently and press for a minute: the piece folds flat inside and rises as the card opens.",
      ],
    },
  };
};
