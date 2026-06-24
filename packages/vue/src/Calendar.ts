/**
 * Root calendar component (Vue port). Accepts either calendar `options` or an
 * existing `store`, wires the host callbacks into the provided context, renders
 * the toolbar and the active view, and provides minimal keyboard navigation.
 */
import {
  computed,
  defineComponent,
  h,
  onMounted,
  onUnmounted,
  provide,
  ref,
  type PropType,
} from "vue";
import type {
  CalendarOptions,
  CalendarStore,
  ResourceViewModel,
  TimelineViewModel,
  ViewModel,
} from "@calidar/core";
import {
  computeView,
  computeResourceView,
  computeTimelineView,
  addDays,
  addMonths,
  epochToPlainDate,
  startOfDayEpoch,
} from "@calidar/core";
import { useCalendar } from "./useCalendar.js";
import {
  CalendarContextKey,
  type CalendarContextValue,
  type CompactNav,
  type EventDraft,
  type RecurringEditRequest,
  type TimelineUnit,
} from "./context.js";
import type { CalendarEvent, EventInstance } from "@calidar/core";
import { CalendarToolbar } from "./CalendarToolbar.js";
import { TimeGridView } from "./TimeGridView.js";
import { MonthView } from "./MonthView.js";
import { InfiniteAgendaView } from "./InfiniteAgendaView.js";
import { ResourcesView } from "./ResourcesView.js";
import { TimelineView } from "./TimelineView.js";
import { createFormatters } from "./format.js";

/** Width below which the time views collapse to a compact day window. */
const COMPACT_BREAKPOINT = 640;
/** Width below which the compact window narrows to a single day. */
const SINGLE_DAY_BREAKPOINT = 480;

export const Calendar = defineComponent({
  name: "Calendar",
  props: {
    /** Calendar configuration (used to create a store if `store` is absent). */
    options: { type: Object as PropType<CalendarOptions>, default: undefined },
    /** An existing store to drive this calendar (overrides `options`). */
    store: { type: Object as PropType<CalendarStore>, default: undefined },
    /** Hide the built-in toolbar (host renders its own controls). */
    hideToolbar: { type: Boolean, default: false },
    /**
     * Adapt the time views to narrow (phone) widths: below 640px a Week/N-days
     * view collapses to a compact 1- or 3-day window, without mutating the
     * store. Defaults to `true`.
     */
    responsive: { type: Boolean, default: true },
    className: { type: String, default: undefined },
    /**
     * BCP-47 locale for all labels (weekdays, titles, times). Overrides
     * `navigator.language`. Omit to keep the host's runtime locale (default).
     */
    locale: { type: String, default: undefined },
    /**
     * Force a 12-hour (`true`) or 24-hour (`false`) clock for time labels. Omit
     * to let `Intl` pick the locale's default hour cycle (default). Typed via
     * `PropType` without listing `Boolean` in `type`, so an absent value stays
     * `undefined` (Vue coerces a missing Boolean-typed prop to `false`).
     */
    hour12: {
      type: null as unknown as PropType<boolean | undefined>,
      default: undefined,
    },
    // Host callbacks (function props, mirroring the React adapter).
    onEventCreate: {
      type: Function as PropType<(draft: EventDraft) => void>,
      default: undefined,
    },
    onEventUpdate: {
      type: Function as PropType<(id: string, patch: Partial<CalendarEvent>) => void>,
      default: undefined,
    },
    onEventClick: {
      type: Function as PropType<(instance: EventInstance) => void>,
      default: undefined,
    },
    onSelectSlot: {
      type: Function as PropType<(range: { start: number; end: number }) => void>,
      default: undefined,
    },
    onRecurringEdit: {
      type: Function as PropType<(request: RecurringEditRequest) => boolean | void>,
      default: undefined,
    },
  },
  setup(props) {
    const { store, snapshot } = useCalendar(
      props.store ?? props.options ?? {},
    );

    // Presentation-only formatters, reactive to the locale/hour12 props.
    const formatters = computed(() =>
      createFormatters(props.locale, props.hour12),
    );

    const rootRef = ref<HTMLDivElement | null>(null);

    // Local "resources" mode. This is NOT a store `view` (the resources view is
    // a standalone view model the adapter drives), so we track it in component
    // state and prioritise it over `snapshot.view` while active. It auto-clears
    // if the calendar ever ends up with no resources to show.
    const resourceMode = ref(false);
    const hasResources = computed(
      () => snapshot.value.state.resources.length > 0,
    );
    const resourcesActive = computed(
      () => resourceMode.value && hasResources.value,
    );

    // Adapter-LOCAL "Timeline" mode: a horizontal time axis with resources as
    // rows. It never mutates `store.view` — we just render a separate view model
    // when active, exactly like the Resource view does.
    const timelineActive = ref(false);
    const timelineUnit = ref<TimelineUnit>("day");

    // Measure the root width so the time views can collapse on narrow screens.
    // `null` until the first measurement so we never flash the compact layout.
    const width = ref<number | null>(null);
    let ro: ResizeObserver | null = null;
    let refreshTimer: ReturnType<typeof setInterval> | null = null;

    onMounted(() => {
      if (props.responsive) {
        const el = rootRef.value;
        if (el) {
          const measure = (w: number): void => {
            if (width.value !== w) width.value = w;
          };
          measure(el.getBoundingClientRect().width);
          ro = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry) measure(entry.contentRect.width);
          });
          ro.observe(el);
        }
      }
      // Roll the "now"-dependent state over when the day changes.
      refreshTimer = setInterval(() => store.refresh(), 5 * 60_000);
    });

    onUnmounted(() => {
      ro?.disconnect();
      if (refreshTimer) clearInterval(refreshTimer);
    });

    // Effective view model + compact navigation descriptor. The store/state are
    // never mutated: we recompute the view from an overridden state copy, so the
    // full Week view automatically returns once the screen widens.
    const computed_ = computed<{
      effectiveView: ViewModel;
      compactNav: CompactNav | null;
    }>(() => {
      const snap = snapshot.value;
      const { state, view } = snap;
      const collapsible = view.kind === "week" || view.kind === "days";
      const w = width.value;
      if (
        !props.responsive ||
        w === null ||
        w >= COMPACT_BREAKPOINT ||
        !collapsible
      ) {
        return { effectiveView: view, compactNav: null };
      }
      const nDays = w < SINGLE_DAY_BREAKPOINT ? 1 : 3;
      const compactView = computeView(
        { ...state, view: "days", visibleDays: nDays },
        snap.events,
        snap.now,
      );
      return { effectiveView: compactView, compactNav: { nDays } };
    });

    const effectiveView = computed(() => computed_.value.effectiveView);
    const compactNav = computed(() => computed_.value.compactNav);

    // Resources view model for the focal day, computed only while the mode is
    // active. DST-safe day navigation is handled in `stepPeriod` below.
    const resourceView = computed<ResourceViewModel | null>(() => {
      if (!resourcesActive.value) return null;
      const snap = snapshot.value;
      return computeResourceView(snap.state, snap.events, snap.now);
    });

    // The timeline view model, recomputed from the live snapshot when active.
    const timelineView = computed<TimelineViewModel | null>(() => {
      if (!timelineActive.value) return null;
      const snap = snapshot.value;
      return computeTimelineView(
        snap.state,
        snap.events,
        { unit: timelineUnit.value },
        snap.now,
      );
    });

    // Step the cursor by one period. In resources mode we move one day at a
    // time (single-day view); in timeline mode by the timeline unit; honour the
    // compact day window otherwise; else a whole view step.
    const stepPeriod = (dir: 1 | -1): void => {
      const tz = snapshot.value.state.timeZone;
      const cursorDate = epochToPlainDate(snapshot.value.state.cursor, tz);
      const atMidday = (target: ReturnType<typeof addDays>): void => {
        // Place at local midday to dodge DST edges, mirroring the core store.
        store.setCursor(startOfDayEpoch(target, tz) + 12 * 3_600_000);
      };
      if (resourcesActive.value) {
        atMidday(addDays(cursorDate, dir));
        return;
      }
      if (timelineActive.value) {
        const target =
          timelineUnit.value === "day"
            ? addDays(cursorDate, dir)
            : timelineUnit.value === "week"
              ? addDays(cursorDate, dir * 7)
              : addMonths(cursorDate, dir);
        atMidday(target);
        return;
      }
      const nav = compactNav.value;
      if (nav) {
        atMidday(addDays(cursorDate, dir * nav.nDays));
      } else if (dir < 0) {
        store.prev();
      } else {
        store.next();
      }
    };

    // Adapter-local Timeline mode object. Reads/writes the underlying refs so
    // `active` / `unit` stay live for the toolbar.
    const timeline: CalendarContextValue["timeline"] = {
      get active() {
        return timelineActive.value;
      },
      get unit() {
        return timelineUnit.value;
      },
      setActive: (on: boolean) => {
        timelineActive.value = on;
      },
      setUnit: (unit: TimelineUnit) => {
        // Selecting an explicit unit also activates the timeline.
        timelineUnit.value = unit;
        timelineActive.value = true;
      },
    };

    // Use getters for host callbacks so children always see the current prop
    // value even if the parent swaps the function reference after mount.
    const ctx: CalendarContextValue = {
      store,
      snapshot,
      effectiveView,
      compactNav,
      stepPeriod,
      formatters,
      resourcesActive,
      setResourceMode: (on: boolean) => {
        resourceMode.value = on;
      },
      resourceView,
      timeline,
      timelineView,
      get onEventCreate() { return props.onEventCreate; },
      get onEventUpdate() { return props.onEventUpdate; },
      get onEventClick() { return props.onEventClick; },
      get onSelectSlot() { return props.onSelectSlot; },
      get onRecurringEdit() { return props.onRecurringEdit; },
    };
    provide(CalendarContextKey, ctx);

    // Minimal keyboard navigation: arrows = prev/next period, "t" = today.
    const onKeyDown = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "SELECT" ||
        target.tagName === "TEXTAREA"
      ) {
        return;
      }
      if (e.key === "ArrowLeft") {
        stepPeriod(-1);
      } else if (e.key === "ArrowRight") {
        stepPeriod(1);
      } else if (e.key === "t" || e.key === "T") {
        store.today();
      }
    };

    return () => {
      const view = effectiveView.value;
      const rView = resourceView.value;
      const tView = timelineView.value;
      const viewNode = rView
        ? h(ResourcesView, { model: rView })
        : tView
          ? h(TimelineView, { model: tView, now: snapshot.value.now })
          : view.kind === "month"
            ? h(MonthView, { model: view })
            : view.kind === "agenda"
              ? h(InfiniteAgendaView)
              : h(TimeGridView, { model: view });

      const children = [
        props.hideToolbar ? null : h(CalendarToolbar),
        h("div", { class: "calidar__view" }, [viewNode]),
      ];

      return h(
        "div",
        {
          ref: rootRef,
          class: `calidar${props.className ? ` ${props.className}` : ""}`,
          tabindex: 0,
          onKeydown: onKeyDown,
          role: "application",
          "aria-label": "Calendar",
        },
        children,
      );
    };
  },
});

export type { CalendarOptions, CalendarStore };
