/**
 * Calendar toolbar (Vue port): range title, today/prev/next navigation and a
 * view picker.
 *
 * The view picker maps friendly labels onto `setView` (+ `setVisibleDays` for
 * the "3 days" preset). It also exposes the adapter-local "Resources" and
 * "Timeline" modes (which never mutate `store.view`), with a Day/Week/Month
 * sub-selector while Timeline is active. In compact mode the title reflects the
 * actually rendered day window (driven by `effectiveView`).
 */
import { computed, defineComponent, h, type VNode } from "vue";
import {
  epochToPlainDate,
  startOfWeek,
  type CalendarViewKind,
} from "@calidar/core";
import { useCalendarContext, type TimelineUnit } from "./context.js";

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

const TIMELINE_UNITS: { label: string; shortLabel: string; unit: TimelineUnit }[] =
  [
    { label: "Day", shortLabel: "D", unit: "day" },
    { label: "Week", shortLabel: "W", unit: "week" },
    { label: "Month", shortLabel: "M", unit: "month" },
  ];

export const CalendarToolbar = defineComponent({
  name: "CalendarToolbar",
  setup() {
    const ctx = useCalendarContext();
    const {
      store,
      snapshot,
      effectiveView,
      stepPeriod,
      formatters,
      resourcesActive,
      setResourceMode,
      resourceView,
      timeline,
    } = ctx;

    const title = computed<string>(() => {
      const { formatRangeTitle } = formatters.value;
      const { state } = snapshot.value;
      const { view, cursor, timeZone } = state;
      const ev = effectiveView.value;
      const rView = resourceView.value;

      // Derive the title from what's *actually* rendered.
      if (rView) {
        // Resources mode navigates one day at a time; show that day's full date.
        return formatRangeTitle("day", rView.date, 1);
      }
      if (timeline.active) {
        // Timeline title mirrors its unit (day → full date, week/month → range).
        const cursorDate = epochToPlainDate(cursor, timeZone);
        if (timeline.unit === "day") {
          return formatRangeTitle("day", cursorDate, 1);
        }
        if (timeline.unit === "month") {
          return formatRangeTitle("month", cursorDate, 0);
        }
        const first = startOfWeek(cursorDate, state.weekStartsOn);
        return formatRangeTitle("week", first, 7);
      }
      if (ev.kind === "day" || ev.kind === "days" || ev.kind === "week") {
        const days = ev.days;
        const first = days[0]?.date ?? epochToPlainDate(cursor, timeZone);
        // Treat a single rendered day as "day" so the title shows the full date.
        const titleKind = days.length <= 1 ? "day" : ev.kind;
        return formatRangeTitle(titleKind, first, days.length);
      }
      if (ev.kind === "agenda") {
        // The infinite agenda is centred on the cursor; label it by the
        // cursor's month so ‹ › / Today read sensibly as the view recentres.
        return formatRangeTitle("month", epochToPlainDate(cursor, timeZone), 0);
      }
      // Month: derive from state as before.
      return formatRangeTitle(view, epochToPlainDate(cursor, timeZone), 0);
    });

    const isActive = (opt: ViewOption): boolean => {
      const { view, visibleDays } = snapshot.value.state;
      return (
        !resourcesActive.value &&
        !timeline.active &&
        opt.view === view &&
        (opt.view !== "days" || opt.visibleDays === visibleDays)
      );
    };

    const renderViewButton = (opt: ViewOption): VNode => {
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
            // Leaving a local mode hands control back to the store view.
            setResourceMode(false);
            timeline.setActive(false);
            if (opt.visibleDays != null) store.setVisibleDays(opt.visibleDays);
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
    };

    return () => {
      const hasResources = snapshot.value.state.resources.length > 0;

      const viewButtons: VNode[] = VIEW_OPTIONS.map(renderViewButton);

      if (hasResources) {
        viewButtons.push(
          h(
            "button",
            {
              type: "button",
              key: "resources",
              class: `cal-btn cal-btn--view${
                resourcesActive.value ? " cal-btn--active" : ""
              }`,
              "aria-pressed": resourcesActive.value ? "true" : "false",
              "aria-label": "Resources",
              onClick: () => {
                timeline.setActive(false);
                setResourceMode(true);
              },
            },
            [
              h(
                "span",
                { class: "cal-btn__label cal-btn__label--full" },
                "Resources",
              ),
              h(
                "span",
                {
                  class: "cal-btn__label cal-btn__label--short",
                  "aria-hidden": "true",
                },
                "Res",
              ),
            ],
          ),
        );
      }

      viewButtons.push(
        h(
          "button",
          {
            type: "button",
            key: "timeline",
            class: `cal-btn cal-btn--view${
              timeline.active ? " cal-btn--active" : ""
            }`,
            "aria-pressed": timeline.active ? "true" : "false",
            "aria-label": "Timeline",
            onClick: () => {
              setResourceMode(false);
              timeline.setActive(!timeline.active);
            },
          },
          [
            h(
              "span",
              { class: "cal-btn__label cal-btn__label--full" },
              "Timeline",
            ),
            h(
              "span",
              {
                class: "cal-btn__label cal-btn__label--short",
                "aria-hidden": "true",
              },
              "TL",
            ),
          ],
        ),
      );

      const children: VNode[] = [
        h("div", { class: "cal-toolbar__nav" }, [
          h(
            "button",
            { type: "button", class: "cal-btn", onClick: () => store.today() },
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
          viewButtons,
        ),
      ];

      // Timeline axis-granularity sub-selector (only while Timeline is on).
      if (timeline.active) {
        children.push(
          h(
            "div",
            {
              class: "cal-toolbar__units",
              role: "group",
              "aria-label": "Timeline unit",
            },
            TIMELINE_UNITS.map((u) => {
              const on = timeline.unit === u.unit;
              return h(
                "button",
                {
                  type: "button",
                  key: u.unit,
                  class: `cal-btn cal-btn--view${on ? " cal-btn--active" : ""}`,
                  "aria-pressed": on ? "true" : "false",
                  "aria-label": `Timeline ${u.label}`,
                  onClick: () => timeline.setUnit(u.unit),
                },
                [
                  h(
                    "span",
                    { class: "cal-btn__label cal-btn__label--full" },
                    u.label,
                  ),
                  h(
                    "span",
                    {
                      class: "cal-btn__label cal-btn__label--short",
                      "aria-hidden": "true",
                    },
                    u.shortLabel,
                  ),
                ],
              );
            }),
          ),
        );
      }

      return h(
        "div",
        {
          class: "cal-toolbar",
          role: "toolbar",
          "aria-label": "Calendar controls",
        },
        children,
      );
    };
  },
});
