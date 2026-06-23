<script lang="ts">
  import type { AgendaViewModel } from "@calidar/core";
  import type { CalendarCallbacks } from "./types.js";
  import { formatAgendaDay, formatTime } from "./format.js";

  interface Props {
    view: AgendaViewModel;
    now: number;
    callbacks: CalendarCallbacks;
  }
  const { view, now, callbacks }: Props = $props();

  function timeLabel(start: number, end: number, allDay: boolean): string {
    if (allDay) return "All day";
    return `${formatTime(start, view.timeZone)} – ${formatTime(end, view.timeZone)}`;
  }
</script>

<div class="cal-agenda">
  {#if view.sections.length === 0}
    <p class="cal-agenda__empty">No events in this range.</p>
  {/if}
  {#each view.sections as section (section.dayStart)}
    {@const isToday = now >= section.dayStart && now < section.dayStart + 86_400_000}
    <section class="cal-agenda__section">
      <h3 class="cal-agenda__date" class:cal-agenda__date--today={isToday}>
        {formatAgendaDay(section.date)}
      </h3>
      <ul class="cal-agenda__list">
        {#each section.instances as inst (inst.key)}
          <li>
            <button
              type="button"
              class="cal-agenda__item"
              onclick={() => callbacks.onEventClick?.(inst)}
            >
              <span
                class="cal-agenda__dot"
                style={inst.color ? `--cal-event-color:${inst.color}` : ""}
              ></span>
              <span class="cal-agenda__time">
                {timeLabel(inst.start, inst.end, inst.allDay)}
              </span>
              <span class="cal-agenda__title">{inst.title}</span>
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {/each}
</div>
