/**
 * Calendar toolbar (Vue port): range title, today/prev/next navigation and a
 * view picker.
 *
 * The view picker maps friendly labels onto `setView` (+ `setVisibleDays` for
 * the "3 days" preset). In compact mode the title reflects the actually
 * rendered day window (driven by `effectiveView`).
 */
import { computed, defineComponent, h } from "vue";
import { epochToPlainDate, type CalendarViewKind } from "@calidar/core";
import { useCalendarContext } from "./context.js";

interface ViewOption {
  label: string;
  /** Compact label used when the toolbar is space-constrained (phones). */
  shortLabel: string;
  view: CalendarViewKind;
  visibleDays?: number;
}

const VIEW_OPTIONS: ViewOption[] = [
  { label: "Day", shortLabel: "1d", view: "day" },
  { label: "3 days", shortLabel: "3d", view: "days", visibleDays: 3 },
  { label: "Week", shortLabel: "Wk", view: "week" },
  { label: "Month", shortLabel: "Mo", view: "month" },
  { label: "Agenda", shortLabel: "List", view: "agenda" },
];

export const CalendarToolbar = defineComponent({
  name: "CalendarToolbar",
  setup() {
    const ctx = useCalendarContext();
    const { store, snapshot, effectiveView, stepPeriod, formatters } = ctx;

    const title = computed<string>(() => {
      const { formatRangeTitle } = formatters.value;
      const { state } = snapshot.value;
      const { view, cursor, timeZone } = state;
      const ev = effectiveView.value;

      // Derive the title from what's *actually* rendered. For time grids the
      // effective view model carries each visible day, so a collapsed 3-day
      // window reads "23 – 25 June" rather than the full week.
      if (ev.kind === "day" || ev.kind === "days" || ev.kind === "week") {
        const days = ev.days;
        const first = days[0]?.date ?? epochToPlainDate(cursor, timeZone);
        // Treat a single rendered day as "day" so the title shows the full date.
        const titleKind = days.length <= 1 ? "day" : ev.kind;
        return formatRangeTitle(titleKind, first, days.length);
      }
      // Month / agenda: derive from state as before.
      const count = ev.kind === "agenda" ? 30 : 0;
      return formatRangeTitle(view, epochToPlainDate(cursor, timeZone), count);
    });

    const isActive = (opt: ViewOption): boolean => {
      const { view, visibleDays } = snapshot.value.state;
      return (
        opt.view === view &&
        (opt.view !== "days" || opt.visibleDays === visibleDays)
      );
    };

    return () =>
      h(
        "div",
        {
          class: "cal-toolbar",
          role: "toolbar",
          "aria-label": "Calendar controls",
        },
        [
          h("div", { class: "cal-toolbar__nav" }, [
            h(
              "button",
              {
                type: "button",
                class: "cal-btn",
                onClick: () => store.today(),
              },
              "Today",
            ),
            h(
              "button",
              {
                type: "button",
                class: "cal-btn cal-btn--icon",
                "aria-label": "Previous period",
                onClick: () => stepPeriod(-1),
              },
              "‹",
            ),
            h(
              "button",
              {
                type: "button",
                class: "cal-btn cal-btn--icon",
                "aria-label": "Next period",
                onClick: () => stepPeriod(1),
              },
              "›",
            ),
          ]),

          h(
            "h2",
            { class: "cal-toolbar__title", "aria-live": "polite" },
            title.value,
          ),

          h(
            "div",
            { class: "cal-toolbar__views", role: "group", "aria-label": "View" },
            VIEW_OPTIONS.map((opt) => {
              const activeFlag = isActive(opt);
              return h(
                "button",
                {
                  type: "button",
                  key: opt.label,
                  class: `cal-btn cal-btn--view${activeFlag ? " cal-btn--active" : ""}`,
                  "aria-pressed": activeFlag ? "true" : "false",
                  "aria-label": opt.label,
                  onClick: () => {
                    if (opt.visibleDays != null)
                      store.setVisibleDays(opt.visibleDays);
                    store.setView(opt.view);
                  },
                },
                [
                  h(
                    "span",
                    { class: "cal-btn__label cal-btn__label--full" },
                    opt.label,
                  ),
                  h(
                    "span",
                    {
                      class: "cal-btn__label cal-btn__label--short",
                      "aria-hidden": "true",
                    },
                    opt.shortLabel,
                  ),
                ],
              );
            }),
          ),
        ],
      );
  },
});
