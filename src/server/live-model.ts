import {
  liveAccessConfigurationValid,
  type ServerEnvironment,
} from "@/server/access";

export type LiveModelBlockReason =
  "access_configuration" | "disabled" | "kill_switch" | "missing_api_key";

export type LiveModelState =
  | { readonly enabled: true }
  | { readonly enabled: false; readonly reason: LiveModelBlockReason };

const killSwitchEngaged = (environment: ServerEnvironment): boolean => {
  const configured = environment.LIVE_MODEL_KILL_SWITCH;
  return configured !== undefined && configured !== "false";
};

export const liveModelState = (
  environment: ServerEnvironment = process.env,
): LiveModelState => {
  if (killSwitchEngaged(environment)) {
    return { enabled: false, reason: "kill_switch" };
  }
  if (environment.ENABLE_LIVE_OPENAI !== "true") {
    return { enabled: false, reason: "disabled" };
  }
  if (!environment.OPENAI_API_KEY) {
    return { enabled: false, reason: "missing_api_key" };
  }
  if (!liveAccessConfigurationValid(environment)) {
    return { enabled: false, reason: "access_configuration" };
  }
  return { enabled: true };
};

export const isLiveModelEnabled = (
  environment: ServerEnvironment = process.env,
): boolean => liveModelState(environment).enabled;

export const assertLiveModelEnabled = (
  environment: ServerEnvironment = process.env,
): void => {
  const state = liveModelState(environment);
  if (!state.enabled) {
    throw new Error(`Live model access is unavailable (${state.reason}).`);
  }
};
