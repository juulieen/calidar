/**
 * Agenda view (Vue port): a flat, scrollable list grouped into day sections.
 * Good for dense schedules and small screens where a grid would be cramped.
 */
import { defineComponent, h, type PropType } from "vue";
import type { AgendaViewModel, EventInstance } from "@calidar/core";
import { useCalendarContext } from "./context.js";

export const AgendaView = defineComponent({
  name: "AgendaView",
  props: {
    model: { type: Object as PropType<AgendaViewModel>, required: true },
  },
  setup(props) {
    const { onEventClick, formatters } = useCalendarContext();

    return () => {
      const { formatAgendaDay, formatTime } = formatters.value;
      const model = props.model;
      const timeZone = model.timeZone;

      if (model.sections.length === 0) {
        return h(
          "div",
          { class: "cal-agenda cal-agenda--empty" },
          "No events in this range.",
        );
      }

      return h(
        "div",
        { class: "cal-agenda" },
        model.sections.map((section) =>
          h(
            "section",
            {
              key: section.dayStart,
              class: "cal-agenda__section",
              "aria-label": formatAgendaDay(section.date),
            },
            [
              h(
                "h3",
                { class: "cal-agenda__date" },
                formatAgendaDay(section.date),
              ),
              h(
                "ul",
                { class: "cal-agenda__list" },
                section.instances.map((inst: EventInstance) =>
                  h("li", { key: inst.key }, [
                    h(
                      "button",
                      {
                        type: "button",
                        class: "cal-agenda__row",
                        onClick: () => onEventClick?.(inst),
                      },
                      [
                        h("span", {
                          class: "cal-agenda__chip",
                          style: { "--cal-event-color": inst.color || undefined },
                          "aria-hidden": "true",
                        }),
                        h(
                          "span",
                          { class: "cal-agenda__time" },
                          inst.allDay
                            ? "All day"
                            : `${formatTime(inst.start, timeZone)} – ${formatTime(inst.end, timeZone)}`,
                        ),
                        h(
                          "span",
                          { class: "cal-agenda__title" },
                          inst.title,
                        ),
                      ],
                    ),
                  ]),
                ),
              ),
            ],
          ),
        ),
      );
    };
  },
});
