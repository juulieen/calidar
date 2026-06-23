<script lang="ts">
  /**
   * "Edit recurring event" scope picker — a small themed popover/dialog.
   * Offers This / This and following / All / Cancel. Esc and outside-click
   * cancel (revert). Focus lands on the first action on open.
   */
  import type { RecurringEditScope } from "./types.js";

  interface Props {
    title?: string;
    onChoose: (scope: RecurringEditScope) => void;
    onCancel: () => void;
  }
  const {
    title = "Edit recurring event",
    onChoose,
    onCancel,
  }: Props = $props();

  let firstBtn: HTMLButtonElement | undefined = $state();
  let dialogEl: HTMLDivElement | undefined = $state();

  // Focus the first action on open.
  $effect(() => {
    firstBtn?.focus();
  });

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      e.stopPropagation();
      e.preventDefault();
      onCancel();
    }
  }

  function onBackdropPointerDown(e: PointerEvent): void {
    // Click outside the dialog cancels.
    if (dialogEl && !dialogEl.contains(e.target as Node)) onCancel();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="cal-rscope__backdrop" onpointerdown={onBackdropPointerDown}>
  <div
    class="cal-rscope"
    role="dialog"
    aria-modal="true"
    aria-label={title}
    bind:this={dialogEl}
  >
    <p class="cal-rscope__title">{title}</p>
    <div class="cal-rscope__actions">
      <button
        type="button"
        class="cal-rscope__btn"
        bind:this={firstBtn}
        onclick={() => onChoose("this")}
      >
        This event
      </button>
      <button
        type="button"
        class="cal-rscope__btn"
        onclick={() => onChoose("thisAndFollowing")}
      >
        This and following events
      </button>
      <button
        type="button"
        class="cal-rscope__btn"
        onclick={() => onChoose("all")}
      >
        All events
      </button>
      <button
        type="button"
        class="cal-rscope__btn cal-rscope__btn--ghost"
        onclick={() => onCancel()}
      >
        Cancel
      </button>
    </div>
  </div>
</div>
