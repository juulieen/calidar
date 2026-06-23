/**
 * Agenda view: a flat, scrollable list grouped into day sections. Good for
 * dense schedules and small screens where a grid would be cramped.
 */
import type { AgendaViewModel, EventInstance } from "@calidar/core";
import { useCalendarContext } from "./context.js";
import { formatAgendaDay, formatTime } from "./format.js";

interface Props {
  model: AgendaViewModel;
}

export function AgendaView({ model }: Props): JSX.Element {
  const { onEventClick } = useCalendarContext();
  const { timeZone } = model;

  if (model.sections.length === 0) {
    return <div className="cal-agenda cal-agenda--empty">No events in this range.</div>;
  }

  return (
    <div className="cal-agenda">
      {model.sections.map((section) => (
        <section key={section.dayStart} className="cal-agenda__section" aria-label={formatAgendaDay(section.date)}>
          <h3 className="cal-agenda__date">{formatAgendaDay(section.date)}</h3>
          <ul className="cal-agenda__list">
            {section.instances.map((inst) => (
              <AgendaRow key={inst.key} instance={inst} timeZone={timeZone} onClick={onEventClick} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function AgendaRow({
  instance,
  timeZone,
  onClick,
}: {
  instance: EventInstance;
  timeZone: string;
  onClick?: (instance: EventInstance) => void;
}): JSX.Element {
  return (
    <li>
      <button type="button" className="cal-agenda__row" onClick={() => onClick?.(instance)}>
        <span
          className="cal-agenda__chip"
          style={{ ["--cal-event-color" as string]: instance.color || undefined }}
          aria-hidden="true"
        />
        <span className="cal-agenda__time">
          {instance.allDay
            ? "All day"
            : `${formatTime(instance.start, timeZone)} – ${formatTime(instance.end, timeZone)}`}
        </span>
        <span className="cal-agenda__title">{instance.title}</span>
      </button>
    </li>
  );
}
