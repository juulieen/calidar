/**
 * Agenda view (Solid port): a flat, scrollable list grouped into day sections.
 * Good for dense schedules and small screens where a grid would be cramped.
 */
import { For, Show, type JSX } from "solid-js";
import type { AgendaViewModel, EventInstance } from "@calidar/core";
import { useCalendarContext } from "./context.js";
import { formatAgendaDay, formatTime } from "./format.js";

interface Props {
  model: AgendaViewModel;
}

export function AgendaView(props: Props): JSX.Element {
  const { callbacks } = useCalendarContext();

  return (
    <Show
      when={props.model.sections.length > 0}
      fallback={
        <div class="cal-agenda cal-agenda--empty">No events in this range.</div>
      }
    >
      <div class="cal-agenda">
        <For each={props.model.sections}>
          {(section) => (
            <section
              class="cal-agenda__section"
              aria-label={formatAgendaDay(section.date)}
            >
              <h3 class="cal-agenda__date">{formatAgendaDay(section.date)}</h3>
              <ul class="cal-agenda__list">
                <For each={section.instances}>
                  {(inst) => (
                    <AgendaRow
                      instance={inst}
                      timeZone={props.model.timeZone}
                      onClick={callbacks.onEventClick}
                    />
                  )}
                </For>
              </ul>
            </section>
          )}
        </For>
      </div>
    </Show>
  );
}

function AgendaRow(props: {
  instance: EventInstance;
  timeZone: string;
  onClick?: (instance: EventInstance) => void;
}): JSX.Element {
  return (
    <li>
      <button
        type="button"
        class="cal-agenda__row"
        onClick={() => props.onClick?.(props.instance)}
      >
        <span
          class="cal-agenda__chip"
          style={{ "--cal-event-color": props.instance.color || undefined }}
          aria-hidden="true"
        />
        <span class="cal-agenda__time">
          {props.instance.allDay
            ? "All day"
            : `${formatTime(props.instance.start, props.timeZone)} – ${formatTime(props.instance.end, props.timeZone)}`}
        </span>
        <span class="cal-agenda__title">{props.instance.title}</span>
      </button>
    </li>
  );
}
