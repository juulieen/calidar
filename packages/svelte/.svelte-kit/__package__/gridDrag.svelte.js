var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _GridDragController_instances, _GridDragController_opts, _GridDragController_state, _GridDragController_startXY, _GridDragController_onMove, _GridDragController_onUp, _GridDragController_instantAt, _GridDragController_handleMove, _GridDragController_finish, _GridDragController_startGesture;
/**
 * Pointer-driven drag / create / resize controller for the time grid.
 *
 * Knows no layout beyond a pixel↔time mapping supplied by the caller. It runs
 * the maths in `@calidar/core`'s `DragSession` and exposes a reactive `active`
 * preview so the view can render a ghost while a gesture is live.
 *
 * Uses Pointer Events (mouse + touch + pen) and window-level listeners, so a
 * drag that leaves the grid keeps tracking until release.
 */
import { DragSession, } from "@calidar/core";
const CLICK_THRESHOLD_PX = 4;
function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
}
export class GridDragController {
    constructor(opts) {
        _GridDragController_instances.add(this);
        /** Reactive: the live gesture, or null. */
        this.active = $state(null);
        _GridDragController_opts.set(this, void 0);
        _GridDragController_state.set(this, null);
        _GridDragController_startXY.set(this, { x: 0, y: 0 });
        // Bound once so add/removeEventListener pair up.
        _GridDragController_onMove.set(this, (e) => __classPrivateFieldGet(this, _GridDragController_instances, "m", _GridDragController_handleMove).call(this, e));
        _GridDragController_onUp.set(this, () => __classPrivateFieldGet(this, _GridDragController_instances, "m", _GridDragController_finish).call(this));
        /** Begin a create gesture from an empty slot in column `dayIndex`. */
        this.startCreate = (e, dayIndex) => {
            __classPrivateFieldGet(this, _GridDragController_instances, "m", _GridDragController_startGesture).call(this, e, "create", dayIndex, { start: 0, end: 0 }, null, null);
        };
        /** Begin a move/resize gesture on an existing instance. */
        this.startEvent = (e, instance, mode, dayIndex) => {
            if (instance.editable === false) {
                __classPrivateFieldGet(this, _GridDragController_opts, "f").onClick?.(instance.eventId, dayIndex, instance.start);
                return;
            }
            e.stopPropagation();
            __classPrivateFieldGet(this, _GridDragController_instances, "m", _GridDragController_startGesture).call(this, e, mode, dayIndex, { start: instance.start, end: instance.end }, instance.eventId, instance);
        };
        __classPrivateFieldSet(this, _GridDragController_opts, opts, "f");
    }
}
_GridDragController_opts = new WeakMap(), _GridDragController_state = new WeakMap(), _GridDragController_startXY = new WeakMap(), _GridDragController_onMove = new WeakMap(), _GridDragController_onUp = new WeakMap(), _GridDragController_instances = new WeakSet(), _GridDragController_instantAt = function _GridDragController_instantAt(clientY, dayIndex) {
    const { hourHeight, dayStarts } = __classPrivateFieldGet(this, _GridDragController_opts, "f").metrics();
    const dayStart = dayStarts[dayIndex] ?? dayStarts[0] ?? 0;
    const minutes = ((clientY - __classPrivateFieldGet(this, _GridDragController_opts, "f").gridTop()) / hourHeight) * 60;
    return dayStart + minutes * 60000;
}, _GridDragController_handleMove = function _GridDragController_handleMove(e) {
    const s = __classPrivateFieldGet(this, _GridDragController_state, "f");
    if (!s)
        return;
    const dx = e.clientX - __classPrivateFieldGet(this, _GridDragController_startXY, "f").x;
    const dy = e.clientY - __classPrivateFieldGet(this, _GridDragController_startXY, "f").y;
    if (!s.moved && Math.hypot(dx, dy) > CLICK_THRESHOLD_PX)
        s.moved = true;
    const { dayStarts } = __classPrivateFieldGet(this, _GridDragController_opts, "f").metrics();
    const hoverDay = clamp(__classPrivateFieldGet(this, _GridDragController_opts, "f").columnAt(e.clientX), 0, dayStarts.length - 1);
    const grabStart = dayStarts[s.grabDay] ?? 0;
    const hoverStart = dayStarts[hoverDay] ?? grabStart;
    const dayShiftMs = hoverStart - grabStart;
    // The session anchors on the grab column; express the pointer there and add
    // the horizontal day shift explicitly.
    const onGrabColumn = __classPrivateFieldGet(this, _GridDragController_instances, "m", _GridDragController_instantAt).call(this, e.clientY, s.grabDay);
    const preview = s.session.update(onGrabColumn, dayShiftMs);
    this.active = {
        preview,
        eventId: s.eventId,
        instance: s.instance,
        dayIndex: hoverDay,
    };
}, _GridDragController_finish = function _GridDragController_finish() {
    window.removeEventListener("pointermove", __classPrivateFieldGet(this, _GridDragController_onMove, "f"));
    window.removeEventListener("pointerup", __classPrivateFieldGet(this, _GridDragController_onUp, "f"));
    window.removeEventListener("pointercancel", __classPrivateFieldGet(this, _GridDragController_onUp, "f"));
    const s = __classPrivateFieldGet(this, _GridDragController_state, "f");
    const current = this.active;
    __classPrivateFieldSet(this, _GridDragController_state, null, "f");
    this.active = null;
    if (!s)
        return;
    if (s.moved && current) {
        __classPrivateFieldGet(this, _GridDragController_opts, "f").onCommit(current);
    }
    else if (__classPrivateFieldGet(this, _GridDragController_opts, "f").onClick) {
        const instant = current ? current.preview.start : 0;
        __classPrivateFieldGet(this, _GridDragController_opts, "f").onClick(s.eventId, current?.dayIndex ?? s.grabDay, instant);
    }
}, _GridDragController_startGesture = function _GridDragController_startGesture(e, mode, dayIndex, origin, eventId, instance) {
    e.preventDefault();
    __classPrivateFieldSet(this, _GridDragController_startXY, { x: e.clientX, y: e.clientY }, "f");
    const pointerStart = __classPrivateFieldGet(this, _GridDragController_instances, "m", _GridDragController_instantAt).call(this, e.clientY, dayIndex);
    const session = new DragSession({
        mode,
        originStart: mode === "create" ? pointerStart : origin.start,
        originEnd: mode === "create" ? pointerStart : origin.end,
        pointerStart,
        snapMinutes: __classPrivateFieldGet(this, _GridDragController_opts, "f").snapMinutes ?? 15,
    });
    __classPrivateFieldSet(this, _GridDragController_state, { session, eventId, instance, grabDay: dayIndex, moved: false }, "f");
    this.active = { preview: session.preview, eventId, instance, dayIndex };
    window.addEventListener("pointermove", __classPrivateFieldGet(this, _GridDragController_onMove, "f"));
    window.addEventListener("pointerup", __classPrivateFieldGet(this, _GridDragController_onUp, "f"));
    window.addEventListener("pointercancel", __classPrivateFieldGet(this, _GridDragController_onUp, "f"));
};
