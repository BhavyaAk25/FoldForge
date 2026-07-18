import Image from "next/image";
import type { RefObject } from "react";

import styles from "./foldforge-app.module.css";

export type AccessState = "granted" | "needed" | "unknown";
export type SavedExampleId = "duck" | "flower";

export interface ExamplePrompt {
  readonly description: string;
  readonly id: string;
  readonly imageAlt: string;
  readonly imageLabel: string;
  readonly imageSrc: string;
  readonly prompt: string;
  readonly savedActionLabel?: string;
  readonly savedExampleId?: SavedExampleId;
  readonly title: string;
}

export const DUCK_CREASE_PATTERN_PROMPT =
  "Make a static, faceted duck crease pattern from one sheet of cardstock. It should look like a simple duck using a body, head, and beak. Keep it fold-only and avoid glue.";

const EXAMPLE_PROMPTS: readonly ExamplePrompt[] = [
  {
    id: "playing-card-box",
    title: "Playing-card box",
    description: "Holds one standard deck in a simple slide-out tray.",
    imageLabel: "Prompt inspiration",
    imageSrc: "/examples/playing-card-box.jpg",
    imageAlt:
      "Prompt-inspiration concept render of a paper playing-card box with its tray partly open",
    prompt:
      "Make a small box from one sheet of cardstock that holds a standard deck of playing cards. The finished box should be about 70 mm wide, 95 mm tall, and 25 mm deep. Add a lid with a tab so it stays closed. Avoid glue if possible.",
  },
  {
    id: "pop-up-flower-card",
    title: "Flower mechanisms",
    description:
      "Edit a pop-up-card brief or inspect a prepared vertical-lift study.",
    imageLabel: "Prompt inspiration",
    imageSrc: "/examples/pop-up-flower-card.jpg",
    imageAlt:
      "Prompt-inspiration concept render of an open paper card with a pink flower rising from its center",
    prompt:
      "Make a birthday card from one sheet of cardstock. When the card opens, a simple five-petal flower should rise from the center. It should fold flat again when the card closes. The finished card should fit inside an A6 envelope.",
    savedActionLabel: "Open vertical-lift study",
    savedExampleId: "flower",
  },
  {
    id: "duck-shaped-gift-box",
    title: "Static duck crease pattern",
    description: "A fold-only duck study with no open-and-close motion.",
    imageLabel: "Prompt inspiration",
    imageSrc: "/examples/duck-shaped-gift-box.jpg",
    imageAlt:
      "A yellow paper duck gift-box concept used as inspiration for a static crease-pattern prompt",
    prompt: DUCK_CREASE_PATTERN_PROMPT,
    savedActionLabel: "Open prepared crease study",
    savedExampleId: "duck",
  },
] as const;

export const DEFAULT_PROMPT = EXAMPLE_PROMPTS[0]?.prompt ?? "";

interface FoldForgeStartProps {
  readonly accessCode: string;
  readonly accessCodeInputRef: RefObject<HTMLInputElement | null>;
  readonly accessState: AccessState;
  readonly busy: boolean;
  readonly healthKnown: boolean;
  readonly liveGenerationAvailable: boolean;
  readonly onAccessCodeChange: (value: string) => void;
  readonly onCreate: () => void;
  readonly onOpenSavedExample: (exampleId: SavedExampleId) => void;
  readonly onPromptChange: (value: string) => void;
  readonly onSelectExample: (example: ExamplePrompt) => void;
  readonly onSubmitAccess: () => void;
  readonly prompt: string;
  readonly promptRef: RefObject<HTMLTextAreaElement | null>;
}

export function FoldForgeStart({
  accessCode,
  accessCodeInputRef,
  accessState,
  busy,
  healthKnown,
  liveGenerationAvailable,
  onAccessCodeChange,
  onCreate,
  onOpenSavedExample,
  onPromptChange,
  onSelectExample,
  onSubmitAccess,
  prompt,
  promptRef,
}: FoldForgeStartProps) {
  return (
    <>
      <section className={styles.compose} aria-labelledby="studio-title">
        <div className={styles.intro}>
          <p className={styles.eyebrow}>
            {liveGenerationAvailable
              ? "AI cut-and-fold designer"
              : "Prepared cut-and-fold studies"}
          </p>
          <h1 id="studio-title">
            {liveGenerationAvailable
              ? "Turn an idea into a buildable paper design."
              : "Explore checked paper-design studies."}
          </h1>
          <p>
            {liveGenerationAvailable
              ? "Describe something made from paper or thin cardboard. FoldForge creates one checked design, shows how it assembles, and gives you the cutting pattern."
              : "Live AI generation is off. Open a prepared study to inspect its motion, cutting pattern, checks, and fabrication files."}
          </p>
          <ol className={styles.processSteps} aria-label="How FoldForge works">
            <li>
              <span>1</span>
              Describe it
            </li>
            <li>
              <span>2</span>
              Inspect the design
            </li>
            <li>
              <span>3</span>
              Download the pattern
            </li>
          </ol>
        </div>

        <div className={styles.promptPanel}>
          <label htmlFor="fabrication-prompt">What do you want to make?</label>
          <textarea
            ref={promptRef}
            id="fabrication-prompt"
            maxLength={4_000}
            rows={5}
            value={prompt}
            onChange={(event) => onPromptChange(event.currentTarget.value)}
          />
          <div className={styles.promptGuide}>
            <p>
              Include the size, material, what it should hold, and anything that
              should open, slide, or fold.
            </p>
            <span>{prompt.length}/4,000</span>
          </div>
          <div className={styles.heroActions}>
            <button
              className={styles.forgeButton}
              type="button"
              disabled={
                !liveGenerationAvailable || busy || prompt.trim().length === 0
              }
              onClick={onCreate}
            >
              {busy ? "Creating design…" : "Create design"}
            </button>
            <button
              className={styles.secondaryAction}
              type="button"
              onClick={() => onOpenSavedExample("flower")}
            >
              Explore a prepared vertical-lift study
            </button>
          </div>
          {!liveGenerationAvailable && healthKnown ? (
            <p className={styles.offlineNote}>
              Live generation is currently unavailable. You can still explore
              saved examples.
            </p>
          ) : null}
          {accessState === "needed" ? (
            <form
              className={styles.accessBar}
              onSubmit={(event) => {
                event.preventDefault();
                onSubmitAccess();
              }}
            >
              <label htmlFor="access-code">Demo access code</label>
              <input
                ref={accessCodeInputRef}
                id="access-code"
                type="password"
                autoComplete="off"
                value={accessCode}
                onChange={(event) =>
                  onAccessCodeChange(event.currentTarget.value)
                }
              />
              <button type="submit" disabled={accessCode.length === 0}>
                Continue
              </button>
            </form>
          ) : null}
        </div>
      </section>

      <section className={styles.examples} aria-labelledby="examples-title">
        <div className={styles.examplesHeading}>
          <h2 id="examples-title">
            {liveGenerationAvailable ? "Try an example" : "Prompt ideas"}
          </h2>
          <p>
            {liveGenerationAvailable
              ? "Each prompt is ready to edit."
              : "Load a prompt for a future live run, or open a prepared study now."}
          </p>
        </div>
        <div className={styles.exampleGrid}>
          {EXAMPLE_PROMPTS.map((example, index) => {
            const savedExampleId = example.savedExampleId;
            return (
              <article className={styles.exampleCard} key={example.id}>
                <Image
                  className={styles.exampleImage}
                  src={example.imageSrc}
                  alt={example.imageAlt}
                  width={768}
                  height={576}
                  loading={index === 0 ? "eager" : "lazy"}
                  sizes="(max-width: 759px) 100vw, (max-width: 1039px) 50vw, 33vw"
                />
                <div>
                  <span className={styles.exampleImageLabel}>
                    {example.imageLabel}
                  </span>
                  <h3>{example.title}</h3>
                  <p>{example.description}</p>
                  <div className={styles.exampleActions}>
                    <button
                      type="button"
                      onClick={() => onSelectExample(example)}
                    >
                      {liveGenerationAvailable
                        ? "Use this prompt"
                        : "Load future prompt"}
                    </button>
                    {savedExampleId ? (
                      <button
                        type="button"
                        onClick={() => onOpenSavedExample(savedExampleId)}
                      >
                        {example.savedActionLabel ?? "Open prepared design"}
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
