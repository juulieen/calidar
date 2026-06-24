/**
 * "Edit recurring event" scope selector (Solid port).
 *
 * A small themed dialog shown after a drag/resize lands on a recurring
 * instance. The user picks how widely the change should apply — this event,
 * this and following, or all — or cancels (which reverts the gesture).
 *
 * Behaviour: `role="dialog"`, initial focus on the first action, Escape and
 * outside-click both cancel. Styled entirely with `--cal-*` tokens.
 */
import { For, onCleanup, onMount, type JSX } from "solid-js";
import type { RecurrenceEditScope } from "./context.js";

interface Props {
  /** Title of the series being edited, shown for context. */
  title: string;
  onChoose: (scope: RecurrenceEditScope) => void;
  onCancel: () => void;
}

const ACTIONS: { scope: RecurrenceEditScope; label: string }[] = [
  { scope: "this", label: "This event" },
  { scope: "thisAndFollowing", label: "This and following events" },
  { scope: "all", label: "All events" },
];

export function RecurrenceScopePopover(props: Props): JSX.Element {
  let cardRef: HTMLDivElement | undefined;
  let firstRef: HTMLButtonElement | undefined;

  onMount(() => {
    firstRef?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.stopPropagation();
        props.onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    onCleanup(() => window.removeEventListener("keydown", onKey, true));
  });

  return (
    <div
      class="cal-recur__backdrop"
      onPointerDown={(e) => {
        // Outside-click (on the backdrop) cancels.
        if (!cardRef?.contains(e.target as Node)) props.onCancel();
      }}
    >
      <div
        ref={cardRef}
        class="cal-recur"
        role="dialog"
        aria-modal="true"
        aria-label="Edit recurring event"
      >
        <h2 class="cal-recur__title">Edit recurring event</h2>
        <p class="cal-recur__subtitle">{props.title}</p>
        <div class="cal-recur__actions">
          <For each={ACTIONS}>
            {(a, i) => (
              <button
                ref={(el) => {
                  if (i() === 0) firstRef = el;
                }}
                type="button"
                class="cal-recur__action"
                onClick={() => props.onChoose(a.scope)}
              >
                {a.label}
              </button>
            )}
          </For>
          <button
            type="button"
            class="cal-recur__action cal-recur__action--cancel"
            onClick={() => props.onCancel()}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
