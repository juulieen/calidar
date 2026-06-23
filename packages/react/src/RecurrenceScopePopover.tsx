/**
 * "Edit recurring event" scope selector.
 *
 * A small themed dialog shown after a drag/resize lands on a recurring
 * instance. The user picks how widely the change should apply — this event,
 * this and following, or all — or cancels (which reverts the gesture).
 *
 * Behaviour: `role="dialog"`, initial focus on the first action, Escape and
 * outside-click both cancel. Styled entirely with `--cal-*` tokens.
 */
import { useEffect, useRef } from "react";
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

export function RecurrenceScopePopover({ title, onChoose, onCancel }: Props): JSX.Element {
  const cardRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  return (
    <div
      className="cal-recur__backdrop"
      onPointerDown={(e) => {
        // Outside-click (on the backdrop) cancels.
        if (!cardRef.current?.contains(e.target as Node)) onCancel();
      }}
    >
      <div
        ref={cardRef}
        className="cal-recur"
        role="dialog"
        aria-modal="true"
        aria-label="Edit recurring event"
      >
        <h2 className="cal-recur__title">Edit recurring event</h2>
        <p className="cal-recur__subtitle">{title}</p>
        <div className="cal-recur__actions">
          {ACTIONS.map((a, i) => (
            <button
              key={a.scope}
              ref={i === 0 ? firstRef : undefined}
              type="button"
              className="cal-recur__action"
              onClick={() => onChoose(a.scope)}
            >
              {a.label}
            </button>
          ))}
          <button
            type="button"
            className="cal-recur__action cal-recur__action--cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
