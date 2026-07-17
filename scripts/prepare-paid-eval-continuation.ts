import { PaidEvalBudget } from "../src/server/ai/paid-eval-budget";

const argument = (name: string): string | null => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
};

if (process.env.ACKNOWLEDGE_SEALED_LEDGER_CONTINUATION !== "true") {
  throw new Error(
    "Set ACKNOWLEDGE_SEALED_LEDGER_CONTINUATION=true only after the builder explicitly authorizes a new paid run.",
  );
}

const sourceLedgerPath = argument("--source");
if (!sourceLedgerPath) {
  throw new Error("--source must name the sealed ledger explicitly.");
}
const targetLedgerPath = argument("--target");
if (!targetLedgerPath) {
  throw new Error("--target must name a new continuation ledger path.");
}

const continuation = await PaidEvalBudget.continueFromSealedLedger({
  sourceLedgerPath,
  targetLedgerPath,
  acknowledgeSealedLedgerContinuation: true,
});

process.stdout.write(`${JSON.stringify(continuation)}\n`);
