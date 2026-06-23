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
var _DayDragController_instances, _DayDragController_opts, _DayDragController_state, _DayDragController_startXY, _DayDragController_onMove, _DayDragController_onUp, _DayDragController_dayCount, _DayDragController_hoverDay, _DayDragController_handleMove, _DayDragController_finish, _DayDragController_start;
const CLICK_THRESHOLD_PX = 4;
function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
}
export class DayDragController {
    constructor(opts) {
        _DayDragController_instances.add(this);
        /** Reactive: the live gesture in day-index space, or null. */
        this.active = $state(null);
        _DayDragController_opts.set(this, void 0);
        _DayDragController_state.set(this, null);
        _DayDragController_startXY.set(this, { x: 0, y: 0 });
        _DayDragController_onMove.set(this, (e) => __classPrivateFieldGet(this, _DayDragController_instances, "m", _DayDragController_handleMove).call(this, e));
        _DayDragController_onUp.set(this, () => __classPrivateFieldGet(this, _DayDragController_instances, "m", _DayDragController_finish).call(this));
        /** Begin a create gesture from an empty day cell at `anchorDay`. */
        this.startCreate = (e, anchorDay) => {
            if (e.button !== 0)
                return;
            __classPrivateFieldGet(this, _DayDragController_instances, "m", _DayDragController_start).call(this, e, "create", anchorDay, anchorDay, anchorDay, null, null);
        };
        /** Begin a move/resize gesture on an existing band. */
        this.startBand = (e, instance, mode, startCol, endCol, grabDay) => {
            if (instance.editable === false) {
                __classPrivateFieldGet(this, _DayDragController_opts, "f").onClick?.({
                    startDay: startCol,
                    endDay: endCol,
                    mode,
                    eventId: instance.eventId,
                    instance,
                });
                return;
            }
            e.stopPropagation();
            __classPrivateFieldGet(this, _DayDragController_instances, "m", _DayDragController_start).call(this, e, mode, grabDay, startCol, endCol, instance.eventId, instance);
        };
        __classPrivateFieldSet(this, _DayDragController_opts, opts, "f");
    }
}
_DayDragController_opts = new WeakMap(), _DayDragController_state = new WeakMap(), _DayDragController_startXY = new WeakMap(), _DayDragController_onMove = new WeakMap(), _DayDragController_onUp = new WeakMap(), _DayDragController_instances = new WeakSet(), _DayDragController_dayCount = function _DayDragController_dayCount() {
    return __classPrivateFieldGet(this, _DayDragController_opts, "f").metrics().dayStarts.length;
}, _DayDragController_hoverDay = function _DayDragController_hoverDay(e) {
    const n = __classPrivateFieldGet(this, _DayDragController_instances, "m", _DayDragController_dayCount).call(this);
    const raw = __classPrivateFieldGet(this, _DayDragController_opts, "f").dayAt(e.clientX, e.clientY);
    return clamp(raw < 0 ? __classPrivateFieldGet(this, _DayDragController_state, "f")?.anchorDay ?? 0 : raw, 0, n - 1);
}, _DayDragController_handleMove = function _DayDragController_handleMove(e) {
    const s = __classPrivateFieldGet(this, _DayDragController_state, "f");
    if (!s)
        return;
    const dx = e.clientX - __classPrivateFieldGet(this, _DayDragController_startXY, "f").x;
    const dy = e.clientY - __classPrivateFieldGet(this, _DayDragController_startXY, "f").y;
    if (!s.moved && Math.hypot(dx, dy) > CLICK_THRESHOLD_PX)
        s.moved = true;
    const hover = __classPrivateFieldGet(this, _DayDragController_instances, "m", _DayDragController_hoverDay).call(this, e);
    const n = __classPrivateFieldGet(this, _DayDragController_instances, "m", _DayDragController_dayCount).call(this);
    let startDay = s.originStart;
    let endDay = s.originEnd;
    switch (s.mode) {
        case "create": {
            startDay = Math.min(s.anchorDay, hover);
            endDay = Math.max(s.anchorDay, hover);
            break;
        }
        case "move": {
            const span = s.originEnd - s.originStart;
            let shift = hover - s.anchorDay;
            // Keep the whole band inside the visible range.
            shift = clamp(shift, -s.originStart, n - 1 - s.originEnd);
            startDay = s.originStart + shift;
            endDay = startDay + span;
            break;
        }
        case "resize-start": {
            startDay = Math.min(hover, s.originEnd);
            endDay = s.originEnd;
            break;
        }
        case "resize-end": {
            startDay = s.originStart;
            endDay = Math.max(hover, s.originStart);
            break;
        }
    }
    this.active = {
        startDay,
        endDay,
        mode: s.mode,
        eventId: s.eventId,
        instance: s.instance,
    };
}, _DayDragController_finish = function _DayDragController_finish() {
    window.removeEventListener("pointermove", __classPrivateFieldGet(this, _DayDragController_onMove, "f"));
    window.removeEventListener("pointerup", __classPrivateFieldGet(this, _DayDragController_onUp, "f"));
    window.removeEventListener("pointercancel", __classPrivateFieldGet(this, _DayDragController_onUp, "f"));
    const s = __classPrivateFieldGet(this, _DayDragController_state, "f");
    const current = this.active;
    __classPrivateFieldSet(this, _DayDragController_state, null, "f");
    this.active = null;
    if (!s || !current)
        return;
    if (s.moved) {
        const { dayStarts, dayEnds } = __classPrivateFieldGet(this, _DayDragController_opts, "f").metrics();
        const start = dayStarts[current.startDay];
        const end = dayEnds[current.endDay];
        if (start === undefined || end === undefined)
            return;
        __classPrivateFieldGet(this, _DayDragController_opts, "f").onCommit({
            startDay: current.startDay,
            endDay: current.endDay,
            start,
            end,
            mode: s.mode,
            eventId: s.eventId,
            instance: s.instance,
        });
    }
    else {
        __classPrivateFieldGet(this, _DayDragController_opts, "f").onClick?.(current);
    }
}, _DayDragController_start = function _DayDragController_start(e, mode, anchorDay, originStart, originEnd, eventId, instance) {
    e.preventDefault();
    __classPrivateFieldSet(this, _DayDragController_startXY, { x: e.clientX, y: e.clientY }, "f");
    __classPrivateFieldSet(this, _DayDragController_state, {
        mode,
        eventId,
        instance,
        anchorDay,
        originStart,
        originEnd,
        moved: false,
    }, "f");
    this.active = {
        startDay: originStart,
        endDay: originEnd,
        mode,
        eventId,
        instance,
    };
    window.addEventListener("pointermove", __classPrivateFieldGet(this, _DayDragController_onMove, "f"));
    window.addEventListener("pointerup", __classPrivateFieldGet(this, _DayDragController_onUp, "f"));
    window.addEventListener("pointercancel", __classPrivateFieldGet(this, _DayDragController_onUp, "f"));
};
