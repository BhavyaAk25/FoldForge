import { liveModelState, type LiveModelState } from "@/server/live-model";

export type PublicLiveBlockReason =
  "configuration" | "disabled" | "kill_switch";

export type PublicLiveState =
  | { readonly enabled: true; readonly blockReason: null }
  | {
      readonly enabled: false;
      readonly blockReason: PublicLiveBlockReason;
    };

const publicBlockReason = (
  state: Extract<LiveModelState, { readonly enabled: false }>,
): PublicLiveBlockReason => {
  switch (state.reason) {
    case "disabled":
      return "disabled";
    case "kill_switch":
      return "kill_switch";
    case "access_configuration":
    case "missing_api_key":
      return "configuration";
  }
};

export const publicLiveState = (): PublicLiveState => {
  const state = liveModelState();
  return state.enabled
    ? { enabled: true, blockReason: null }
    : { enabled: false, blockReason: publicBlockReason(state) };
};
