import { describe, expect, it } from "vitest";
import { parseICS, toICS } from "../src/ics/ics.js";
import { instancesInWindow } from "../src/engine/instances.js";
import type { CalendarEvent } from "../src/types.js";

describe("parseICS", () => {
  it("parses a zoned recurring VEVENT with EXDATE", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:abc-123",
      "SUMMARY:Weekly standup",
      "DTSTART;TZID=Europe/Paris:20260601T090000",
      "DTEND;TZID=Europe/Paris:20260601T093000",
      "RRULE:FREQ=WEEKLY;BYDAY=MO,WE",
      "EXDATE;TZID=Europe/Paris:20260603T090000",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const [ev] = parseICS(ics);
    expect(ev).toBeDefined();
    expect(ev!.id).toBe("abc-123");
    expect(ev!.title).toBe("Weekly standup");
    expect(ev!.timeZone).toBe("Europe/Paris");
    expect(ev!.start).toBe("2026-06-01T09:00:00");
    expect(ev!.rrule).toBe("FREQ=WEEKLY;BYDAY=MO,WE");
    expect(ev!.exdates).toEqual(["2026-06-03T09:00:00"]);

    // The parsed event expands correctly (Mon 1, Wed 3 exdated, Mon 8, ...).
    const win = { start: Date.UTC(2026, 5, 1), end: Date.UTC(2026, 5, 10) };
    const days = instancesInWindow([ev!], win, "Europe/Paris").map((i) => {
      const d = new Date(i.start);
      return d;
    });
    expect(days.length).toBe(2); // Mon 1, Mon 8 (Wed 3 excluded)
  });

  it("parses an all-day VEVENT (VALUE=DATE)", () => {
    const ics = [
      "BEGIN:VEVENT",
      "UID:holiday",
      "SUMMARY:Conference",
      "DTSTART;VALUE=DATE:20260624",
      "DTEND;VALUE=DATE:20260626",
      "END:VEVENT",
    ].join("\r\n");
    const [ev] = parseICS(ics);
    expect(ev!.allDay).toBe(true);
    expect(ev!.start).toBe("2026-06-24");
    expect(ev!.end).toBe("2026-06-26");
  });

  it("unescapes TEXT and unfolds long lines", () => {
    const ics = [
      "BEGIN:VEVENT",
      "UID:x",
      "SUMMARY:Lunch\\, then a very long title that should be folded across li",
      " nes per RFC 5545 rules",
      "DTSTART:20260623T120000Z",
      "DTEND:20260623T130000Z",
      "END:VEVENT",
    ].join("\r\n");
    const [ev] = parseICS(ics);
    expect(ev!.title).toContain("Lunch, then a very long title");
    expect(ev!.title).toContain("folded across lines");
    expect(ev!.start).toBe("2026-06-23T12:00:00Z");
  });
});

describe("toICS", () => {
  it("serialises a zoned event with RRULE", () => {
    const ev: CalendarEvent = {
      id: "e1",
      title: "Standup; daily",
      start: "2026-06-01T09:00:00",
      end: "2026-06-01T09:30:00",
      timeZone: "Europe/Paris",
      rrule: "FREQ=WEEKLY;BYDAY=MO",
    };
    const out = toICS([ev]);
    expect(out).toContain("BEGIN:VCALENDAR");
    expect(out).toContain("UID:e1");
    expect(out).toContain("SUMMARY:Standup\\; daily"); // escaped
    expect(out).toContain("DTSTART;TZID=Europe/Paris:20260601T090000");
    expect(out).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO");
    expect(out).toMatch(/\r\n/); // CRLF line endings
  });

  it("serialises all-day with VALUE=DATE", () => {
    const ev: CalendarEvent = {
      id: "a",
      title: "Trip",
      start: "2026-06-24",
      end: "2026-06-26",
      allDay: true,
    };
    expect(toICS([ev])).toContain("DTSTART;VALUE=DATE:20260624");
  });

  it("folds long lines on UTF-8 octet boundaries (RFC 5545 §3.1)", () => {
    // 40 accented characters: 40 code points but 80 UTF-8 bytes once "SUMMARY:"
    // (8 octets) is prepended -> must be folded into ≥2 physical lines, none
    // of which exceeds 75 octets, and never splitting a 2-byte char.
    const title = "é".repeat(40);
    const ev: CalendarEvent = {
      id: "fold",
      title,
      start: "2026-06-01T09:00:00Z",
      end: "2026-06-01T10:00:00Z",
      timeZone: "UTC",
    };
    const out = toICS([ev]);
    const physical = out.split("\r\n");
    const enc = new TextEncoder();
    for (const pl of physical) {
      expect(enc.encode(pl).length).toBeLessThanOrEqual(75);
    }
    // Every continuation line begins with a single space; no broken char (a
    // broken 2-byte "é" would surface as U+FFFD on decode, which never happens
    // here because we split on code-point boundaries).
    expect(out).not.toContain("�");
    // It actually folded.
    expect(physical.some((l) => l.startsWith(" "))).toBe(true);
    // Round-trips back to the exact title.
    const [back] = parseICS(out);
    expect(back!.title).toBe(title);
  });

  it("preserves floating wall-clock time (no Z, no TZID)", () => {
    const ev: CalendarEvent = {
      id: "float",
      title: "Floating meeting",
      start: "2026-06-24T09:00:00",
      end: "2026-06-24T10:00:00",
      // no timeZone -> floating
    };
    const out = toICS([ev]);
    expect(out).toContain("DTSTART:20260624T090000");
    expect(out).not.toContain("DTSTART:20260624T090000Z");
    expect(out).not.toContain("DTSTART;TZID");
    const [back] = parseICS(out);
    expect(back!.start).toBe("2026-06-24T09:00:00");
    expect(back!.timeZone).toBeUndefined();
    expect(String(back!.start)).not.toContain("Z");
  });

  it("emits DESCRIPTION and LOCATION from meta with TEXT escaping", () => {
    const ev: CalendarEvent = {
      id: "d",
      title: "Lunch",
      start: "2026-06-24T12:00:00Z",
      end: "2026-06-24T13:00:00Z",
      timeZone: "UTC",
      meta: {
        description: "Bring slides; talk about Q3, then lunch",
        location: "Room 5, Floor 2",
      },
    };
    const out = toICS([ev]);
    expect(out).toContain("DESCRIPTION:Bring slides\\; talk about Q3\\, then lunch");
    expect(out).toContain("LOCATION:Room 5\\, Floor 2");
  });
});

describe("round-trip", () => {
  it("toICS -> parseICS preserves the essentials", () => {
    const events: CalendarEvent[] = [
      {
        id: "r1",
        title: "Sync, weekly",
        start: "2026-06-01T09:00:00",
        end: "2026-06-01T10:00:00",
        timeZone: "America/New_York",
        rrule: "FREQ=WEEKLY;BYDAY=TU",
        exdates: ["2026-06-09T09:00:00"],
        rdates: ["2026-06-12T09:00:00"],
      },
      {
        id: "r2",
        title: "All day",
        start: "2026-06-24",
        end: "2026-06-25",
        allDay: true,
      },
    ];
    const round = parseICS(toICS(events));
    expect(round).toHaveLength(2);
    expect(round[0]!.id).toBe("r1");
    expect(round[0]!.title).toBe("Sync, weekly");
    expect(round[0]!.timeZone).toBe("America/New_York");
    expect(round[0]!.start).toBe("2026-06-01T09:00:00");
    expect(round[0]!.rrule).toBe("FREQ=WEEKLY;BYDAY=TU");
    expect(round[0]!.exdates).toEqual(["2026-06-09T09:00:00"]);
    expect(round[0]!.rdates).toEqual(["2026-06-12T09:00:00"]);
    expect(round[1]!.allDay).toBe(true);
    expect(round[1]!.start).toBe("2026-06-24");
  });

  it("round-trips DESCRIPTION and LOCATION through toICS -> parseICS", () => {
    const ev: CalendarEvent = {
      id: "meta1",
      title: "Workshop",
      start: "2026-06-24T09:00:00Z",
      end: "2026-06-24T11:00:00Z",
      timeZone: "UTC",
      meta: {
        description: "Line one; with, punctuation",
        location: "Building A; Room 12",
      },
    };
    const [back] = parseICS(toICS([ev]));
    expect(back!.meta?.description).toBe("Line one; with, punctuation");
    expect(back!.meta?.location).toBe("Building A; Room 12");
  });

  it("round-trips a floating event without gaining a Z", () => {
    const ev: CalendarEvent = {
      id: "float-rt",
      title: "Floating",
      start: "2026-06-24T09:00:00",
      end: "2026-06-24T10:00:00",
    };
    const out = toICS([ev]);
    expect(out).not.toMatch(/DTSTART[^\r\n]*Z/);
    const [back] = parseICS(out);
    expect(back!.start).toBe("2026-06-24T09:00:00");
    expect(back!.end).toBe("2026-06-24T10:00:00");
    expect(back!.timeZone).toBeUndefined();
  });

  it("round-trips a long accented title with folding", () => {
    const ev: CalendarEvent = {
      id: "long",
      title: "Réunion très importante avec accents éàü " + "é".repeat(30),
      start: "2026-06-24T09:00:00Z",
      end: "2026-06-24T10:00:00Z",
      timeZone: "UTC",
    };
    const [back] = parseICS(toICS([ev]));
    expect(back!.title).toBe(ev.title);
  });
});
