/**
 * "Edit recurring event" scope selector (Vue port).
 *
 * A small themed dialog shown after a drag/resize lands on a recurring
 * instance. The user picks how widely the change should apply — this event,
 * this and following, or all — or cancels (which reverts the gesture).
 *
 * Behaviour: `role="dialog"`, initial focus on the first action, Escape and
 * outside-click both cancel. Styled entirely with `--cal-*` tokens.
 */
import {
  defineComponent,
  h,
  onMounted,
  onUnmounted,
  ref,
  type PropType,
} from "vue";
import type { RecurrenceEditScope } from "./context.js";

const ACTIONS: { scope: RecurrenceEditScope; label: string }[] = [
  { scope: "this", label: "This event" },
  { scope: "thisAndFollowing", label: "This and following events" },
  { scope: "all", label: "All events" },
];

export const RecurrenceScopePopover = defineComponent({
  name: "RecurrenceScopePopover",
  props: {
    /** Title of the series being edited, shown for context. */
    title: { type: String, required: true },
    onChoose: {
      type: Function as PropType<(scope: RecurrenceEditScope) => void>,
      required: true,
    },
    onCancel: {
      type: Function as PropType<() => void>,
      required: true,
    },
  },
  setup(props) {
    const cardRef = ref<HTMLDivElement | null>(null);
    const firstRef = ref<HTMLButtonElement | null>(null);

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.stopPropagation();
        props.onCancel();
      }
    };

    onMounted(() => {
      firstRef.value?.focus();
      window.addEventListener("keydown", onKey, true);
    });
    onUnmounted(() => {
      window.removeEventListener("keydown", onKey, true);
    });

    return () =>
      h(
        "div",
        {
          class: "cal-recur__backdrop",
          onPointerdown: (e: PointerEvent) => {
            // Outside-click (on the backdrop) cancels.
            if (!cardRef.value?.contains(e.target as Node)) props.onCancel();
          },
        },
        [
          h(
            "div",
            {
              ref: cardRef,
              class: "cal-recur",
              role: "dialog",
              "aria-modal": "true",
              "aria-label": "Edit recurring event",
            },
            [
              h("h2", { class: "cal-recur__title" }, "Edit recurring event"),
              h("p", { class: "cal-recur__subtitle" }, props.title),
              h("div", { class: "cal-recur__actions" }, [
                ...ACTIONS.map((a, i) =>
                  h(
                    "button",
                    {
                      key: a.scope,
                      ref: i === 0 ? firstRef : undefined,
                      type: "button",
                      class: "cal-recur__action",
                      onClick: () => props.onChoose(a.scope),
                    },
                    a.label,
                  ),
                ),
                h(
                  "button",
                  {
                    type: "button",
                    class: "cal-recur__action cal-recur__action--cancel",
                    onClick: () => props.onCancel(),
                  },
                  "Cancel",
                ),
              ]),
            ],
          ),
        ],
      );
  },
});
