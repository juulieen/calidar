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
declare const RecurringScopeDialog: import("svelte").Component<Props, {}, "">;
type RecurringScopeDialog = ReturnType<typeof RecurringScopeDialog>;
export default RecurringScopeDialog;
//# sourceMappingURL=RecurringScopeDialog.svelte.d.ts.map