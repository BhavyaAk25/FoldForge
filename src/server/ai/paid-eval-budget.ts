import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  rename,
  unlink,
  writeFile,
  type FileHandle,
} from "node:fs/promises";
import path from "node:path";

import type { ResponseUsage } from "openai/resources/responses/responses";
import { z } from "zod";

export const MAXIMUM_PAID_EVAL_BUDGET_USD = 3.7;
export const DEFAULT_PAID_EVAL_LEDGER_PATH =
  "artifacts/evals/live-cost-ledger.json";

const LEDGER_VERSION = "1";
const NANODOLLARS_PER_USD = 1_000_000_000;
const MAXIMUM_PAID_EVAL_BUDGET_NANODOLLARS = 3_700_000_000;
const ORDINARY_INPUT_NANODOLLARS_PER_TOKEN = 5_000;
const CACHED_INPUT_NANODOLLARS_PER_TOKEN = 500;
const CACHE_WRITE_NANODOLLARS_PER_TOKEN = 6_250;
const OUTPUT_NANODOLLARS_PER_TOKEN = 30_000;
const LONG_CONTEXT_INPUT_TOKEN_THRESHOLD = 272_000;
const REQUEST_OVERHEAD_TOKEN_CEILING = 8_192;

export type PaidEvalOperation =
  | "compile_intent"
  | "generate_program"
  | "diagnose_repair"
  | "generate_narrative";

export type PaidEvalHaltReason =
  | "budget_exhausted"
  | "missing_usage"
  | "provider_failure"
  | "recovered_pending_reservation"
  | "unsettled_request_failure"
  | "usage_invalid";

export type PaidEvalBudgetErrorCode =
  | "budget_exhausted"
  | "budget_required"
  | "concurrent_request"
  | "invalid_budget"
  | "invalid_request"
  | "ledger_invalid"
  | "missing_usage"
  | "provider_failure"
  | "run_locked"
  | "unsettled_request_failure"
  | "usage_invalid";

export class PaidEvalBudgetError extends Error {
  constructor(
    readonly code: PaidEvalBudgetErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PaidEvalBudgetError";
  }
}

const PaidEvalOperationSchema = z.enum([
  "compile_intent",
  "generate_program",
  "diagnose_repair",
  "generate_narrative",
]);

const PaidEvalHaltReasonSchema = z.enum([
  "budget_exhausted",
  "missing_usage",
  "provider_failure",
  "recovered_pending_reservation",
  "unsettled_request_failure",
  "usage_invalid",
]);

const PaidEvalLockSchema = z
  .object({
    pid: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    acquiredAtIso: z.string().datetime(),
  })
  .strict();

const PaidEvalContinuationClaimSchema = z
  .object({
    sourceLedgerSha256: z.string().regex(/^[a-f0-9]{64}$/),
    targetLedgerPathHash: z.string().regex(/^[a-f0-9]{64}$/),
    claimedAtIso: z.string().datetime(),
  })
  .strict();

const NonNegativeSafeIntegerSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);

const PositiveSafeIntegerSchema = NonNegativeSafeIntegerSchema.min(1);

const PaidEvalReservationSchema = z
  .object({
    reservationId: z.string().uuid(),
    sequence: PositiveSafeIntegerSchema,
    operation: PaidEvalOperationSchema,
    inputTokenCeiling: PositiveSafeIntegerSchema,
    outputTokenCeiling: PositiveSafeIntegerSchema,
    reservedNanodollars: PositiveSafeIntegerSchema,
    createdAtIso: z.string().datetime(),
  })
  .strict();

const PaidEvalLedgerEntrySchema = z
  .object({
    sequence: PositiveSafeIntegerSchema,
    operation: PaidEvalOperationSchema,
    responseId: z.string().min(1).nullable(),
    outcome: z.enum([
      "succeeded",
      "provider_failure",
      "missing_usage",
      "recovered_pending_reservation",
      "unsettled_request_failure",
      "usage_invalid",
    ]),
    inputTokens: NonNegativeSafeIntegerSchema.nullable(),
    cachedInputTokens: NonNegativeSafeIntegerSchema.nullable(),
    cacheWriteTokens: NonNegativeSafeIntegerSchema.nullable(),
    outputTokens: NonNegativeSafeIntegerSchema.nullable(),
    reasoningTokens: NonNegativeSafeIntegerSchema.nullable(),
    providerFailureCategory: z.string().min(1).max(120).nullable().optional(),
    chargedNanodollars: PositiveSafeIntegerSchema,
    reservedNanodollars: PositiveSafeIntegerSchema,
  })
  .strict();

const PaidEvalContinuationSchema = z
  .object({
    sourceLedgerSha256: z.string().regex(/^[a-f0-9]{64}$/),
    sourceEntryCount: NonNegativeSafeIntegerSchema,
    sourceChargedNanodollars: NonNegativeSafeIntegerSchema,
    continuedAtIso: z.string().datetime(),
  })
  .strict();

const PaidEvalLedgerSchema = z
  .object({
    version: z.literal(LEDGER_VERSION),
    budgetNanodollars: PositiveSafeIntegerSchema.max(
      MAXIMUM_PAID_EVAL_BUDGET_NANODOLLARS,
    ),
    chargedNanodollars: NonNegativeSafeIntegerSchema,
    haltedReason: PaidEvalHaltReasonSchema.nullable(),
    pendingReservation: PaidEvalReservationSchema.nullable(),
    entries: z.array(PaidEvalLedgerEntrySchema),
    continuation: PaidEvalContinuationSchema.optional(),
  })
  .strict();

type PaidEvalReservation = z.infer<typeof PaidEvalReservationSchema>;
type PaidEvalLedgerEntry = z.infer<typeof PaidEvalLedgerEntrySchema>;
type PaidEvalLedger = z.infer<typeof PaidEvalLedgerSchema>;

export interface PaidEvalBudgetSnapshot {
  readonly budgetUsd: number;
  readonly chargedCostUsd: number;
  readonly remainingBudgetUsd: number;
  readonly requestCount: number;
  readonly haltedReason: PaidEvalHaltReason | null;
  readonly pendingReservation: {
    readonly operation: PaidEvalOperation;
    readonly maximumCostUsd: number;
  } | null;
  readonly entries: readonly {
    readonly sequence: number;
    readonly operation: PaidEvalOperation;
    readonly responseId: string | null;
    readonly outcome: PaidEvalLedgerEntry["outcome"];
    readonly inputTokens: number | null;
    readonly cachedInputTokens: number | null;
    readonly cacheWriteTokens: number | null;
    readonly outputTokens: number | null;
    readonly reasoningTokens: number | null;
    readonly providerFailureCategory: string | null;
    readonly chargedCostUsd: number;
    readonly maximumCostUsd: number;
  }[];
}

interface MeterableResponse {
  readonly id: string;
  readonly usage?: ResponseUsage | null;
}

interface MeterableRequest {
  readonly max_output_tokens: number;
}

export interface PaidEvalCallInput<
  Request extends MeterableRequest,
  Response extends MeterableResponse,
> {
  readonly operation: PaidEvalOperation;
  readonly request: Request;
  readonly execute: (request: Request) => Promise<Response>;
}

export interface OpenPaidEvalBudgetOptions {
  readonly ledgerPath?: string;
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly beforeReservation?: () => void | Promise<void>;
}

export interface ContinuePaidEvalLedgerOptions {
  readonly sourceLedgerPath: string;
  readonly targetLedgerPath: string;
  readonly acknowledgeSealedLedgerContinuation: true;
  readonly environment?: Readonly<Record<string, string | undefined>>;
}

const nanodollarsToUsd = (nanodollars: number): number =>
  Number((nanodollars / NANODOLLARS_PER_USD).toFixed(9));

const environmentBudgetNanodollars = (
  environment: Readonly<Record<string, string | undefined>>,
): number => {
  const raw = environment.LIVE_EVAL_BUDGET_USD;
  if (!raw) {
    throw new PaidEvalBudgetError(
      "budget_required",
      "LIVE_EVAL_BUDGET_USD is required before a paid evaluation can run.",
    );
  }
  const match = /^(\d+)(?:\.(\d{1,9}))?$/.exec(raw);
  if (!match) {
    throw new PaidEvalBudgetError(
      "invalid_budget",
      "LIVE_EVAL_BUDGET_USD must be a plain positive decimal amount.",
    );
  }
  const dollarsText = match[1];
  if (!dollarsText) {
    throw new PaidEvalBudgetError(
      "invalid_budget",
      "LIVE_EVAL_BUDGET_USD does not contain a dollar amount.",
    );
  }
  const dollars = Number(dollarsText);
  const fractionalNanodollars = Number((match[2] ?? "").padEnd(9, "0"));
  const nanodollars = dollars * NANODOLLARS_PER_USD + fractionalNanodollars;
  if (
    !Number.isSafeInteger(nanodollars) ||
    nanodollars <= 0 ||
    nanodollars > MAXIMUM_PAID_EVAL_BUDGET_NANODOLLARS
  ) {
    throw new PaidEvalBudgetError(
      "invalid_budget",
      `LIVE_EVAL_BUDGET_USD must not exceed $${MAXIMUM_PAID_EVAL_BUDGET_USD.toFixed(2)}.`,
    );
  }
  return nanodollars;
};

const errorCode = (error: unknown): string | null => {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }
  return typeof error.code === "string" ? error.code : null;
};

const emptyLedger = (budgetNanodollars: number): PaidEvalLedger => ({
  version: LEDGER_VERSION,
  budgetNanodollars,
  chargedNanodollars: 0,
  haltedReason: null,
  pendingReservation: null,
  entries: [],
});

const readLedger = async (
  ledgerPath: string,
  budgetNanodollars: number,
): Promise<PaidEvalLedger> => {
  let contents: string;
  try {
    contents = await readFile(ledgerPath, "utf8");
  } catch (error) {
    if (errorCode(error) === "ENOENT") return emptyLedger(budgetNanodollars);
    throw error;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(contents);
  } catch {
    throw new PaidEvalBudgetError(
      "ledger_invalid",
      "The paid-evaluation ledger is not valid JSON.",
    );
  }
  const parsed = PaidEvalLedgerSchema.safeParse(raw);
  if (!parsed.success) {
    throw new PaidEvalBudgetError(
      "ledger_invalid",
      "The paid-evaluation ledger failed its versioned schema.",
    );
  }
  if (parsed.data.budgetNanodollars !== budgetNanodollars) {
    throw new PaidEvalBudgetError(
      "invalid_budget",
      "LIVE_EVAL_BUDGET_USD must match the existing cumulative ledger limit.",
    );
  }
  const providerOverageIsSealed =
    parsed.data.chargedNanodollars > parsed.data.budgetNanodollars &&
    parsed.data.haltedReason === "usage_invalid" &&
    parsed.data.pendingReservation === null &&
    parsed.data.entries.at(-1)?.outcome === "usage_invalid";
  if (
    parsed.data.chargedNanodollars > parsed.data.budgetNanodollars &&
    !providerOverageIsSealed
  ) {
    throw new PaidEvalBudgetError(
      "ledger_invalid",
      "The paid-evaluation ledger exceeds its authorized limit without a sealed provider-usage overage.",
    );
  }
  const entryTotal = parsed.data.entries.reduce(
    (total, entry) => total + entry.chargedNanodollars,
    0,
  );
  const sequencesValid = parsed.data.entries.every(
    (entry, index) => entry.sequence === index + 1,
  );
  const pendingFits = parsed.data.pendingReservation
    ? parsed.data.chargedNanodollars +
        parsed.data.pendingReservation.reservedNanodollars <=
        parsed.data.budgetNanodollars &&
      parsed.data.pendingReservation.sequence === parsed.data.entries.length + 1
    : true;
  const continuationFits = parsed.data.continuation
    ? parsed.data.continuation.sourceEntryCount <= parsed.data.entries.length &&
      parsed.data.entries
        .slice(0, parsed.data.continuation.sourceEntryCount)
        .reduce((total, entry) => total + entry.chargedNanodollars, 0) ===
        parsed.data.continuation.sourceChargedNanodollars
    : true;
  if (
    !Number.isSafeInteger(entryTotal) ||
    entryTotal !== parsed.data.chargedNanodollars ||
    !sequencesValid ||
    !pendingFits ||
    !continuationFits
  ) {
    throw new PaidEvalBudgetError(
      "ledger_invalid",
      "The paid-evaluation ledger accounting does not reconcile.",
    );
  }
  return parsed.data;
};

const lockPathFor = (ledgerPath: string): string =>
  ledgerPath.endsWith(".json")
    ? `${ledgerPath.slice(0, -".json".length)}.lock`
    : `${ledgerPath}.lock`;

const continuationClaimPathFor = (ledgerPath: string): string =>
  ledgerPath.endsWith(".json")
    ? `${ledgerPath.slice(0, -".json".length)}.continuation-claim.json`
    : `${ledgerPath}.continuation-claim.json`;

const processIsAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM still proves that a process owns the PID. Only ESRCH establishes
    // that a crashed evaluator cannot still hold this local run lock.
    return errorCode(error) !== "ESRCH";
  }
};

const acquireRunLock = async (lockPath: string): Promise<FileHandle> => {
  try {
    return await open(lockPath, "wx");
  } catch (error) {
    if (errorCode(error) !== "EEXIST") throw error;
  }

  let persistedLock: unknown;
  try {
    persistedLock = JSON.parse(await readFile(lockPath, "utf8"));
  } catch {
    throw new PaidEvalBudgetError(
      "run_locked",
      "The paid-evaluation lock cannot be safely attributed to a dead process.",
    );
  }
  const parsedLock = PaidEvalLockSchema.safeParse(persistedLock);
  if (!parsedLock.success || processIsAlive(parsedLock.data.pid)) {
    throw new PaidEvalBudgetError(
      "run_locked",
      "Another paid evaluation holds the cumulative budget lock.",
    );
  }

  // Rename, rather than delete, the dead process's lock. This makes stale-lock
  // takeover atomic: if another evaluator wins the race, our next `wx` open
  // fails without deleting the new owner's lock.
  const staleLockPath = `${lockPath}.stale.${randomUUID()}`;
  try {
    await rename(lockPath, staleLockPath);
  } catch {
    throw new PaidEvalBudgetError(
      "run_locked",
      "Another evaluator changed the stale run lock during recovery.",
    );
  }
  await unlink(staleLockPath).catch(() => undefined);
  try {
    return await open(lockPath, "wx");
  } catch {
    throw new PaidEvalBudgetError(
      "run_locked",
      "Another paid evaluation acquired the cumulative budget lock.",
    );
  }
};

const usageInteger = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || typeof value !== "number" || value < 0) {
    throw new PaidEvalBudgetError(
      "usage_invalid",
      `${label} must be a non-negative safe integer.`,
    );
  }
  return value;
};

interface ValidatedUsage {
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly cacheWriteTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens: number;
  readonly totalTokens: number;
}

const validateUsage = (usage: ResponseUsage): ValidatedUsage => {
  const inputTokens = usageInteger(usage.input_tokens, "input_tokens");
  const cachedInputTokens = usageInteger(
    usage.input_tokens_details?.cached_tokens,
    "cached_tokens",
  );
  const cacheWriteTokens = usageInteger(
    usage.input_tokens_details?.cache_write_tokens,
    "cache_write_tokens",
  );
  const outputTokens = usageInteger(usage.output_tokens, "output_tokens");
  const reasoningTokens = usageInteger(
    usage.output_tokens_details?.reasoning_tokens,
    "reasoning_tokens",
  );
  const totalTokens = usageInteger(usage.total_tokens, "total_tokens");
  if (cachedInputTokens + cacheWriteTokens > inputTokens) {
    throw new PaidEvalBudgetError(
      "usage_invalid",
      "Cached and cache-write tokens exceed total input tokens.",
    );
  }
  if (reasoningTokens > outputTokens) {
    throw new PaidEvalBudgetError(
      "usage_invalid",
      "Reasoning tokens exceed total output tokens.",
    );
  }
  if (totalTokens !== inputTokens + outputTokens) {
    throw new PaidEvalBudgetError(
      "usage_invalid",
      "Total tokens do not equal input plus output tokens.",
    );
  }
  return {
    inputTokens,
    cachedInputTokens,
    cacheWriteTokens,
    outputTokens,
    reasoningTokens,
    totalTokens,
  };
};

const usageCostNanodollars = (usage: ValidatedUsage): number => {
  const ordinaryInputTokens =
    usage.inputTokens - usage.cachedInputTokens - usage.cacheWriteTokens;
  const longContext = usage.inputTokens > LONG_CONTEXT_INPUT_TOKEN_THRESHOLD;
  const inputMultiplier = longContext ? 2 : 1;
  const outputMultiplierNumerator = longContext ? 3 : 2;
  const outputMultiplierDenominator = 2;
  const inputCost =
    (ordinaryInputTokens * ORDINARY_INPUT_NANODOLLARS_PER_TOKEN +
      usage.cachedInputTokens * CACHED_INPUT_NANODOLLARS_PER_TOKEN +
      usage.cacheWriteTokens * CACHE_WRITE_NANODOLLARS_PER_TOKEN) *
    inputMultiplier;
  const outputCost =
    (usage.outputTokens *
      OUTPUT_NANODOLLARS_PER_TOKEN *
      outputMultiplierNumerator) /
    outputMultiplierDenominator;
  const total = inputCost + outputCost;
  if (!Number.isSafeInteger(total) || total <= 0) {
    throw new PaidEvalBudgetError(
      "usage_invalid",
      "Calculated token cost is not a positive safe integer.",
    );
  }
  return total;
};

const reservationNanodollars = (
  inputTokenCeiling: number,
  outputTokenCeiling: number,
): number => {
  const total =
    inputTokenCeiling * CACHE_WRITE_NANODOLLARS_PER_TOKEN +
    outputTokenCeiling * OUTPUT_NANODOLLARS_PER_TOKEN;
  if (!Number.isSafeInteger(total) || total <= 0) {
    throw new PaidEvalBudgetError(
      "invalid_request",
      "The paid-evaluation reservation exceeds safe accounting bounds.",
    );
  }
  return total;
};

export class PaidEvalBudget {
  private closed = false;

  private constructor(
    private ledger: PaidEvalLedger,
    private readonly ledgerPath: string,
    private readonly lockPath: string,
    private readonly lockHandle: FileHandle,
    private readonly beforeReservation: () => void | Promise<void>,
  ) {}

  static async open(
    options: OpenPaidEvalBudgetOptions = {},
  ): Promise<PaidEvalBudget> {
    const environment = options.environment ?? process.env;
    const budgetNanodollars = environmentBudgetNanodollars(environment);
    const configuredLedgerPath = environment.LIVE_EVAL_LEDGER_PATH?.trim();
    const ledgerPath = path.resolve(
      options.ledgerPath ??
        (configuredLedgerPath ? configuredLedgerPath : undefined) ??
        DEFAULT_PAID_EVAL_LEDGER_PATH,
    );
    const lockPath = lockPathFor(ledgerPath);
    await mkdir(path.dirname(ledgerPath), { recursive: true });

    const lockHandle = await acquireRunLock(lockPath);

    try {
      await lockHandle.writeFile(
        `${JSON.stringify({ pid: process.pid, acquiredAtIso: new Date().toISOString() })}\n`,
        "utf8",
      );
      const ledger = await readLedger(ledgerPath, budgetNanodollars);
      const budget = new PaidEvalBudget(
        ledger,
        ledgerPath,
        lockPath,
        lockHandle,
        options.beforeReservation ?? (() => undefined),
      );
      if (ledger.pendingReservation) {
        await budget.recoverPendingReservation(ledger.pendingReservation);
      } else {
        // Persist the approved cap before any provider call so a later process
        // cannot silently replace the cumulative authorization.
        await budget.persist();
      }
      return budget;
    } catch (error) {
      await lockHandle.close();
      await unlink(lockPath).catch(() => undefined);
      throw error;
    }
  }

  static async continueFromSealedLedger(
    options: ContinuePaidEvalLedgerOptions,
  ): Promise<{
    readonly sourceLedgerSha256: string;
    readonly carriedRequestCount: number;
    readonly carriedCostUsd: number;
    readonly targetLedgerPath: string;
  }> {
    if (!options.acknowledgeSealedLedgerContinuation) {
      throw new PaidEvalBudgetError(
        "invalid_request",
        "Continuing a sealed paid-evaluation ledger requires explicit acknowledgement.",
      );
    }
    const environment = options.environment ?? process.env;
    const budgetNanodollars = environmentBudgetNanodollars(environment);
    const sourceLedgerPath = path.resolve(options.sourceLedgerPath);
    const targetLedgerPath = path.resolve(options.targetLedgerPath);
    if (sourceLedgerPath === targetLedgerPath) {
      throw new PaidEvalBudgetError(
        "invalid_request",
        "The continuation target must be a new ledger path.",
      );
    }
    await mkdir(path.dirname(targetLedgerPath), { recursive: true });
    const sourceLockPath = lockPathFor(sourceLedgerPath);
    const targetLockPath = lockPathFor(targetLedgerPath);
    const sourceLock = await acquireRunLock(sourceLockPath);
    let targetLock: FileHandle | null = null;
    try {
      await sourceLock.writeFile(
        `${JSON.stringify({ pid: process.pid, acquiredAtIso: new Date().toISOString() })}\n`,
        "utf8",
      );
      targetLock = await acquireRunLock(targetLockPath);
      await targetLock.writeFile(
        `${JSON.stringify({ pid: process.pid, acquiredAtIso: new Date().toISOString() })}\n`,
        "utf8",
      );
      let sourceContents: string;
      try {
        sourceContents = await readFile(sourceLedgerPath, "utf8");
      } catch (error) {
        if (errorCode(error) === "ENOENT") {
          throw new PaidEvalBudgetError(
            "ledger_invalid",
            "The sealed source ledger does not exist.",
          );
        }
        throw error;
      }
      const sourceLedger = await readLedger(
        sourceLedgerPath,
        budgetNanodollars,
      );
      if (!sourceLedger.haltedReason || sourceLedger.pendingReservation) {
        throw new PaidEvalBudgetError(
          "invalid_request",
          "Only a settled, sealed ledger can be continued.",
        );
      }
      if (sourceLedger.chargedNanodollars >= sourceLedger.budgetNanodollars) {
        throw new PaidEvalBudgetError(
          "invalid_request",
          "A sealed ledger with no remaining authorized budget cannot be continued.",
        );
      }
      const sourceLedgerSha256 = createHash("sha256")
        .update(sourceContents)
        .digest("hex");
      const continuedAtIso = new Date().toISOString();
      const targetLedger: PaidEvalLedger = {
        version: LEDGER_VERSION,
        budgetNanodollars: sourceLedger.budgetNanodollars,
        chargedNanodollars: sourceLedger.chargedNanodollars,
        haltedReason: null,
        pendingReservation: null,
        entries: sourceLedger.entries,
        continuation: {
          sourceLedgerSha256,
          sourceEntryCount: sourceLedger.entries.length,
          sourceChargedNanodollars: sourceLedger.chargedNanodollars,
          continuedAtIso,
        },
      };
      let targetHandle: FileHandle;
      try {
        targetHandle = await open(targetLedgerPath, "wx");
      } catch (error) {
        if (errorCode(error) === "EEXIST") {
          throw new PaidEvalBudgetError(
            "invalid_request",
            "The continuation target already exists.",
          );
        }
        throw error;
      }
      try {
        const claimPath = continuationClaimPathFor(sourceLedgerPath);
        let claimHandle: FileHandle;
        try {
          claimHandle = await open(claimPath, "wx");
        } catch (error) {
          if (errorCode(error) === "EEXIST") {
            throw new PaidEvalBudgetError(
              "invalid_request",
              "The sealed source ledger already has a continuation.",
            );
          }
          throw error;
        }
        try {
          const claim = PaidEvalContinuationClaimSchema.parse({
            sourceLedgerSha256,
            targetLedgerPathHash: createHash("sha256")
              .update(targetLedgerPath)
              .digest("hex"),
            claimedAtIso: continuedAtIso,
          });
          await claimHandle.writeFile(
            `${JSON.stringify(claim, null, 2)}\n`,
            "utf8",
          );
        } finally {
          await claimHandle.close();
        }
        await targetHandle.writeFile(
          `${JSON.stringify(targetLedger, null, 2)}\n`,
          "utf8",
        );
      } finally {
        await targetHandle.close();
        const targetContents = await readFile(targetLedgerPath, "utf8").catch(
          () => "",
        );
        if (targetContents.length === 0) {
          await unlink(targetLedgerPath).catch(() => undefined);
        }
      }
      return {
        sourceLedgerSha256,
        carriedRequestCount: sourceLedger.entries.length,
        carriedCostUsd: nanodollarsToUsd(sourceLedger.chargedNanodollars),
        targetLedgerPath,
      };
    } finally {
      if (targetLock) {
        await targetLock.close();
        await unlink(targetLockPath).catch(() => undefined);
      }
      await sourceLock.close();
      await unlink(sourceLockPath).catch(() => undefined);
    }
  }

  async run<
    Request extends MeterableRequest,
    Response extends MeterableResponse,
  >(input: PaidEvalCallInput<Request, Response>): Promise<Response> {
    this.assertOpen();
    if (this.ledger.haltedReason) {
      throw new PaidEvalBudgetError(
        "budget_exhausted",
        `The paid-evaluation ledger is halted (${this.ledger.haltedReason}).`,
      );
    }
    if (this.ledger.pendingReservation) {
      throw new PaidEvalBudgetError(
        "concurrent_request",
        "Paid evaluation requests must run sequentially.",
      );
    }
    await this.beforeReservation();
    // The reservation is derived from the same request object supplied to the
    // provider callback. Callers cannot declare a cheaper independent ceiling.
    const maxOutputTokens = input.request.max_output_tokens;
    if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens <= 0) {
      throw new PaidEvalBudgetError(
        "invalid_request",
        "maxOutputTokens must be a positive safe integer.",
      );
    }
    const serializedRequest = JSON.stringify(input.request);
    if (serializedRequest === undefined) {
      throw new PaidEvalBudgetError(
        "invalid_request",
        "The OpenAI request could not be serialized for budget accounting.",
      );
    }
    const requestUtf8Bytes = Buffer.byteLength(serializedRequest, "utf8");
    const inputTokenCeiling =
      requestUtf8Bytes * 2 + REQUEST_OVERHEAD_TOKEN_CEILING;
    if (
      !Number.isSafeInteger(inputTokenCeiling) ||
      inputTokenCeiling <= 0 ||
      inputTokenCeiling > LONG_CONTEXT_INPUT_TOKEN_THRESHOLD
    ) {
      throw new PaidEvalBudgetError(
        "invalid_request",
        "The request is too large for the bounded standard-price evaluation path.",
      );
    }
    const reservedNanodollars = reservationNanodollars(
      inputTokenCeiling,
      maxOutputTokens,
    );
    if (
      this.ledger.chargedNanodollars + reservedNanodollars >
      this.ledger.budgetNanodollars
    ) {
      this.ledger = {
        ...this.ledger,
        haltedReason: "budget_exhausted",
      };
      await this.persist();
      throw new PaidEvalBudgetError(
        "budget_exhausted",
        "The next request could exceed the cumulative paid-evaluation budget.",
      );
    }

    const reservation: PaidEvalReservation = {
      reservationId: randomUUID(),
      sequence: this.ledger.entries.length + 1,
      operation: input.operation,
      inputTokenCeiling,
      outputTokenCeiling: maxOutputTokens,
      reservedNanodollars,
      createdAtIso: new Date().toISOString(),
    };
    this.ledger = { ...this.ledger, pendingReservation: reservation };
    await this.persist();

    let response: Response;
    try {
      response = await input.execute(input.request);
    } catch (error) {
      const providerFailureCategory =
        error instanceof Error && error.name.trim().length > 0
          ? error.name.slice(0, 120)
          : "unknown";
      await this.settleUnknown(
        reservation,
        null,
        "unsettled_request_failure",
        providerFailureCategory,
      );
      throw new PaidEvalBudgetError(
        "unsettled_request_failure",
        "The paid request did not settle; its full reservation was charged and the budget was halted.",
      );
    }
    if (!response.usage) {
      await this.settleUnknown(reservation, response.id, "missing_usage", null);
      throw new PaidEvalBudgetError(
        "missing_usage",
        "The provider omitted usage; its full reservation was charged and the budget was halted.",
      );
    }
    if (response.id.trim().length === 0) {
      await this.settleUnknown(reservation, null, "usage_invalid", null);
      throw new PaidEvalBudgetError(
        "usage_invalid",
        "The provider response ID was missing; the full reservation was charged and the budget was halted.",
      );
    }

    let usage: ValidatedUsage;
    let actualCostNanodollars: number;
    try {
      usage = validateUsage(response.usage);
      actualCostNanodollars = usageCostNanodollars(usage);
    } catch {
      await this.settleUnknown(reservation, response.id, "usage_invalid", null);
      throw new PaidEvalBudgetError(
        "usage_invalid",
        "Provider usage was invalid; the full reservation was charged and the budget was halted.",
      );
    }
    if (
      usage.inputTokens > reservation.inputTokenCeiling ||
      usage.outputTokens > reservation.outputTokenCeiling ||
      actualCostNanodollars > reservation.reservedNanodollars
    ) {
      await this.settleUsageExceededReservation(
        reservation,
        response.id,
        usage,
        actualCostNanodollars,
      );
      throw new PaidEvalBudgetError(
        "usage_invalid",
        "Provider usage exceeded the request reservation; safe usage metadata was recorded and the budget was halted.",
      );
    }
    const chargedNanodollars = actualCostNanodollars;

    const entry: PaidEvalLedgerEntry = {
      sequence: reservation.sequence,
      operation: reservation.operation,
      responseId: response.id,
      outcome: "succeeded",
      inputTokens: usage.inputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      outputTokens: usage.outputTokens,
      reasoningTokens: usage.reasoningTokens,
      chargedNanodollars,
      reservedNanodollars: reservation.reservedNanodollars,
    };
    this.ledger = {
      ...this.ledger,
      chargedNanodollars: this.ledger.chargedNanodollars + chargedNanodollars,
      pendingReservation: null,
      entries: [...this.ledger.entries, entry],
    };
    await this.persist();
    return response;
  }

  snapshot(): PaidEvalBudgetSnapshot {
    const pending = this.ledger.pendingReservation;
    return {
      budgetUsd: nanodollarsToUsd(this.ledger.budgetNanodollars),
      chargedCostUsd: nanodollarsToUsd(this.ledger.chargedNanodollars),
      remainingBudgetUsd: nanodollarsToUsd(
        Math.max(
          0,
          this.ledger.budgetNanodollars - this.ledger.chargedNanodollars,
        ),
      ),
      requestCount: this.ledger.entries.length,
      haltedReason: this.ledger.haltedReason,
      pendingReservation: pending
        ? {
            operation: pending.operation,
            maximumCostUsd: nanodollarsToUsd(pending.reservedNanodollars),
          }
        : null,
      entries: this.ledger.entries.map((entry) => ({
        sequence: entry.sequence,
        operation: entry.operation,
        responseId: entry.responseId,
        outcome: entry.outcome,
        inputTokens: entry.inputTokens,
        cachedInputTokens: entry.cachedInputTokens,
        cacheWriteTokens: entry.cacheWriteTokens,
        outputTokens: entry.outputTokens,
        reasoningTokens: entry.reasoningTokens,
        providerFailureCategory: entry.providerFailureCategory ?? null,
        chargedCostUsd: nanodollarsToUsd(entry.chargedNanodollars),
        maximumCostUsd: nanodollarsToUsd(entry.reservedNanodollars),
      })),
    };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    if (this.ledger.pendingReservation) {
      throw new PaidEvalBudgetError(
        "concurrent_request",
        "The paid-evaluation budget cannot close while a request is active.",
      );
    }
    this.closed = true;
    await this.lockHandle.close();
    await unlink(this.lockPath).catch((error: unknown) => {
      if (errorCode(error) !== "ENOENT") throw error;
    });
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new PaidEvalBudgetError(
        "invalid_request",
        "The paid-evaluation budget is closed.",
      );
    }
  }

  private async persist(): Promise<void> {
    const temporaryPath = `${this.ledgerPath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(
        temporaryPath,
        `${JSON.stringify(this.ledger, null, 2)}\n`,
        "utf8",
      );
      await rename(temporaryPath, this.ledgerPath);
    } finally {
      await unlink(temporaryPath).catch(() => undefined);
    }
  }

  private async settleUnknown(
    reservation: PaidEvalReservation,
    responseId: string | null,
    outcome:
      | "provider_failure"
      | "missing_usage"
      | "unsettled_request_failure"
      | "usage_invalid",
    providerFailureCategory: string | null,
  ): Promise<void> {
    const entry: PaidEvalLedgerEntry = {
      sequence: reservation.sequence,
      operation: reservation.operation,
      responseId,
      outcome,
      inputTokens: null,
      cachedInputTokens: null,
      cacheWriteTokens: null,
      outputTokens: null,
      reasoningTokens: null,
      providerFailureCategory,
      chargedNanodollars: reservation.reservedNanodollars,
      reservedNanodollars: reservation.reservedNanodollars,
    };
    this.ledger = {
      ...this.ledger,
      chargedNanodollars:
        this.ledger.chargedNanodollars + reservation.reservedNanodollars,
      haltedReason: outcome,
      pendingReservation: null,
      entries: [...this.ledger.entries, entry],
    };
    await this.persist();
  }

  private async settleUsageExceededReservation(
    reservation: PaidEvalReservation,
    responseId: string,
    usage: ValidatedUsage,
    chargedNanodollars: number,
  ): Promise<void> {
    const entry: PaidEvalLedgerEntry = {
      sequence: reservation.sequence,
      operation: reservation.operation,
      responseId,
      outcome: "usage_invalid",
      inputTokens: usage.inputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      outputTokens: usage.outputTokens,
      reasoningTokens: usage.reasoningTokens,
      providerFailureCategory: null,
      chargedNanodollars,
      reservedNanodollars: reservation.reservedNanodollars,
    };
    this.ledger = {
      ...this.ledger,
      chargedNanodollars: this.ledger.chargedNanodollars + chargedNanodollars,
      haltedReason: "usage_invalid",
      pendingReservation: null,
      entries: [...this.ledger.entries, entry],
    };
    await this.persist();
  }

  private async recoverPendingReservation(
    reservation: PaidEvalReservation,
  ): Promise<void> {
    const entry: PaidEvalLedgerEntry = {
      sequence: reservation.sequence,
      operation: reservation.operation,
      responseId: null,
      outcome: "recovered_pending_reservation",
      inputTokens: null,
      cachedInputTokens: null,
      cacheWriteTokens: null,
      outputTokens: null,
      reasoningTokens: null,
      chargedNanodollars: reservation.reservedNanodollars,
      reservedNanodollars: reservation.reservedNanodollars,
    };
    this.ledger = {
      ...this.ledger,
      chargedNanodollars:
        this.ledger.chargedNanodollars + reservation.reservedNanodollars,
      haltedReason: "recovered_pending_reservation",
      pendingReservation: null,
      entries: [...this.ledger.entries, entry],
    };
    await this.persist();
  }
}
