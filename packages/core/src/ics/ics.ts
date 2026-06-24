/**
 * Minimal iCalendar (RFC 5545) interop: parse a VCALENDAR into
 * `CalendarEvent`s and serialise events back to an `.ics` string, so calendars
 * round-trip with Google / Outlook / Apple. Reuses the engine's existing
 * RRULE / EXDATE / RDATE handling — the RRULE string is carried verbatim.
 *
 * Scope: VEVENT with UID, SUMMARY, DTSTART, DTEND, RRULE, EXDATE, RDATE,
 * DESCRIPTION, LOCATION. VTIMEZONE definitions are not interpreted (the TZID
 * parameter is trusted as an IANA name, which is what modern producers emit).
 */
import type { CalendarEvent } from "../types.js";
import { epochToWall, epochToPlainDate } from "../datetime/zoned.js";
import { parseDateValue } from "../engine/instances.js";

// ---- shared helpers --------------------------------------------------------

const p2 = (n: number) => String(n).padStart(2, "0");

function unescapeText(v: string): string {
  return v
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function escapeText(v: string): string {
  return v
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

// ---- parsing ---------------------------------------------------------------

interface IcsProp {
  name: string;
  params: Record<string, string>;
  value: string;
}

/** Unfold RFC 5545 line folding (continuation lines start with space/tab). */
function unfold(text: string): string[] {
  const raw = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function parseLine(line: string): IcsProp | null {
  const colon = line.indexOf(":");
  if (colon === -1) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const segments = head.split(";");
  const name = segments[0]!.toUpperCase();
  const params: Record<string, string> = {};
  for (let i = 1; i < segments.length; i++) {
    const eq = segments[i]!.indexOf("=");
    if (eq === -1) continue;
    params[segments[i]!.slice(0, eq).toUpperCase()] = segments[i]!.slice(eq + 1);
  }
  return { name, params, value };
}

/** Convert an ICS date/date-time token into a host date value + flags. */
function icsToHostValue(
  value: string,
  params: Record<string, string>,
): { value: string; allDay: boolean; tzid?: string } {
  const v = value.trim();
  if (params.VALUE === "DATE" || /^\d{8}$/.test(v)) {
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
    if (m) return { value: `${m[1]}-${m[2]}-${m[3]}`, allDay: true };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(v);
  if (m) {
    const [, y, mo, d, h, mi, s, z] = m;
    const local = `${y}-${mo}-${d}T${h}:${mi}:${s}`;
    if (z) return { value: `${local}Z`, allDay: false };
    if (params.TZID) return { value: local, allDay: false, tzid: params.TZID };
    return { value: local, allDay: false }; // floating
  }
  return { value: v, allDay: false };
}

/** Parse a VCALENDAR string into host `CalendarEvent`s. */
export function parseICS(ics: string): CalendarEvent[] {
  const lines = unfold(ics);
  const events: CalendarEvent[] = [];
  let cur: Partial<CalendarEvent> & {
    exdates?: (string | number)[];
    rdates?: (string | number)[];
  } | null = null;
  let allDay = false;
  let index = 0;

  for (const line of lines) {
    const prop = parseLine(line);
    if (!prop) continue;
    if (prop.name === "BEGIN" && prop.value.toUpperCase() === "VEVENT") {
      cur = {};
      allDay = false;
      continue;
    }
    if (prop.name === "END" && prop.value.toUpperCase() === "VEVENT") {
      if (cur) {
        const ev: CalendarEvent = {
          id: cur.id ?? `ics-${index++}`,
          title: cur.title ?? "(untitled)",
          start: cur.start ?? 0,
          end: cur.end ?? cur.start ?? 0,
          ...(allDay ? { allDay: true } : {}),
          ...(cur.timeZone ? { timeZone: cur.timeZone } : {}),
          ...(cur.rrule ? { rrule: cur.rrule } : {}),
          ...(cur.exdates && cur.exdates.length ? { exdates: cur.exdates } : {}),
          ...(cur.rdates && cur.rdates.length ? { rdates: cur.rdates } : {}),
          ...(cur.meta ? { meta: cur.meta } : {}),
        };
        events.push(ev);
      }
      cur = null;
      continue;
    }
    if (!cur) continue;

    switch (prop.name) {
      case "UID":
        cur.id = prop.value.trim();
        break;
      case "SUMMARY":
        cur.title = unescapeText(prop.value);
        break;
      case "DTSTART": {
        const r = icsToHostValue(prop.value, prop.params);
        cur.start = r.value;
        if (r.allDay) allDay = true;
        if (r.tzid) cur.timeZone = r.tzid;
        break;
      }
      case "DTEND": {
        const r = icsToHostValue(prop.value, prop.params);
        cur.end = r.value;
        if (r.allDay) allDay = true;
        if (r.tzid && !cur.timeZone) cur.timeZone = r.tzid;
        break;
      }
      case "RRULE":
        cur.rrule = prop.value.trim();
        break;
      case "EXDATE": {
        cur.exdates ??= [];
        for (const part of prop.value.split(",")) {
          cur.exdates.push(icsToHostValue(part, prop.params).value);
        }
        break;
      }
      case "RDATE": {
        cur.rdates ??= [];
        for (const part of prop.value.split(",")) {
          cur.rdates.push(icsToHostValue(part, prop.params).value);
        }
        break;
      }
      case "DESCRIPTION":
      case "LOCATION": {
        cur.meta ??= {};
        (cur.meta as Record<string, unknown>)[prop.name.toLowerCase()] =
          unescapeText(prop.value);
        break;
      }
    }
  }
  return events;
}

// ---- serialising -----------------------------------------------------------

const encoder = new TextEncoder();

/**
 * Fold a content line to physical lines of ≤75 OCTETS (RFC 5545 §3.1).
 * Continuation lines are prefixed by a single space, so they may hold ≤74
 * octets of payload. We advance by whole code points, never splitting a
 * multi-byte UTF-8 character or a surrogate pair.
 */
function foldLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const chars = Array.from(line); // iterate by code points
  const pieces: string[] = [];
  let cur = "";
  let curBytes = 0;
  let first = true;
  for (const ch of chars) {
    const limit = first ? 75 : 74;
    const chBytes = encoder.encode(ch).length;
    if (curBytes + chBytes > limit) {
      pieces.push(cur);
      cur = "";
      curBytes = 0;
      first = false;
    }
    cur += ch;
    curBytes += chBytes;
  }
  pieces.push(cur);
  return pieces.join("\r\n ");
}

function fmtUTC(epoch: number): string {
  const d = new Date(epoch);
  return (
    `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}` +
    `T${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}Z`
  );
}

function fmtLocal(epoch: number, tz: string): string {
  const w = epochToWall(epoch, tz);
  return (
    `${w.year}${p2(w.month)}${p2(w.day)}T${p2(w.hour)}${p2(w.minute)}${p2(w.second)}`
  );
}

function fmtDate(epoch: number, tz: string): string {
  const d = epochToPlainDate(epoch, tz);
  return `${d.year}${p2(d.month)}${p2(d.day)}`;
}

const LOCAL_DT_RE =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?$/;

/**
 * True when a host value carries floating wall-clock semantics: a bare local
 * date-time string (no `Z`, no offset) on an event with no `timeZone`. Such
 * values must round-trip without acquiring a UTC `Z` or a `TZID` parameter.
 */
function isFloating(value: string | number, hasTimeZone: boolean): boolean {
  return !hasTimeZone && typeof value === "string" && LOCAL_DT_RE.test(value.trim());
}

/** Render a DTSTART/DTEND/EXDATE/RDATE property for one instant. */
function dateProp(
  name: string,
  epoch: number,
  tz: string,
  allDay: boolean,
  floating: boolean,
): string {
  if (allDay) return `${name};VALUE=DATE:${fmtDate(epoch, tz)}`;
  // Floating wall-clock: emit a local DATE-TIME with no Z and no TZID.
  if (floating) return `${name}:${fmtLocal(epoch, tz)}`;
  if (tz === "UTC") return `${name}:${fmtUTC(epoch)}`;
  return `${name};TZID=${tz}:${fmtLocal(epoch, tz)}`;
}

export interface ToIcsOptions {
  /** Reference zone for events without their own `timeZone` (default UTC). */
  timeZone?: string;
  /** PRODID value. */
  prodId?: string;
}

/** Serialise events to a VCALENDAR (`.ics`) string. */
export function toICS(events: CalendarEvent[], options: ToIcsOptions = {}): string {
  const defaultTz = options.timeZone ?? "UTC";
  const prodId = options.prodId ?? "-//calidar//EN";
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${prodId}`,
    "CALSCALE:GREGORIAN",
  ];

  for (const ev of events) {
    const tz = ev.timeZone ?? defaultTz;
    const allDay = ev.allDay ?? false;
    const floating = !allDay && isFloating(ev.start, ev.timeZone != null);
    const start = parseDateValue(ev.start, tz);
    const end = parseDateValue(ev.end, tz);

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${ev.id}`);
    lines.push(`SUMMARY:${escapeText(ev.title)}`);
    lines.push(dateProp("DTSTART", start, tz, allDay, floating));
    lines.push(dateProp("DTEND", end, tz, allDay, floating));
    if (ev.rrule) lines.push(`RRULE:${ev.rrule.replace(/^RRULE:/i, "")}`);
    if (ev.exdates && ev.exdates.length) {
      const vals = ev.exdates
        .map((x) => {
          const e = parseDateValue(x, tz);
          return allDay ? fmtDate(e, tz) : tz === "UTC" ? fmtUTC(e) : fmtLocal(e, tz);
        })
        .join(",");
      const prefix = allDay ? "EXDATE;VALUE=DATE" : tz === "UTC" ? "EXDATE" : `EXDATE;TZID=${tz}`;
      lines.push(`${prefix}:${vals}`);
    }
    if (ev.rdates && ev.rdates.length) {
      const vals = ev.rdates
        .map((x) => {
          const e = parseDateValue(x, tz);
          return allDay ? fmtDate(e, tz) : tz === "UTC" ? fmtUTC(e) : fmtLocal(e, tz);
        })
        .join(",");
      const prefix = allDay ? "RDATE;VALUE=DATE" : tz === "UTC" ? "RDATE" : `RDATE;TZID=${tz}`;
      lines.push(`${prefix}:${vals}`);
    }
    const meta = ev.meta as Record<string, unknown> | undefined;
    const description = meta?.description;
    const location = meta?.location;
    if (typeof description === "string" && description.length) {
      lines.push(`DESCRIPTION:${escapeText(description)}`);
    }
    if (typeof location === "string" && location.length) {
      lines.push(`LOCATION:${escapeText(location)}`);
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n");
}
