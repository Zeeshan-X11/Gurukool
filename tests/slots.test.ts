import { describe, expect, it } from "vitest";
import { upcomingSlots, validateAvailability, BOOKING_LEAD_MS } from "@/lib/slots";

const NOW = new Date("2026-11-11T04:30:00Z"); // Wed 10:00 IST

describe("availability validation", () => {
  it("accepts valid weekend slots", () => expect(validateAvailability([{ day: "Saturday", start: "10:00", end: "11:00" }])).toBeNull());
  it.each([
    [[{ day: "Monday", start: "10:00", end: "11:00" }], /Saturday or Sunday/],
    [[{ day: "Sunday", start: "10:00", end: "10:15" }], /at least 30/],
    [[{ day: "Sunday", start: "09:00", end: "13:00" }], /at most 3 hours/],
    [[{ day: "Sunday", start: "25:00", end: "26:00" }], /HH:MM/],
    [[{ day: "Sunday", start: "10:00", end: "11:00" }, { day: "Sunday", start: "10:30", end: "11:30" }], /overlap/],
  ])("rejects %j", (input, msg) => expect(validateAvailability(input)).toMatch(msg));
});

describe("slot expansion (Asia/Kolkata)", () => {
  const slots = upcomingSlots([{ day: "Saturday", start: "10:00", end: "11:00" }], NOW);
  it("converts IST wall-clock to UTC instants", () => expect(slots[0].startAt).toBe("2026-11-14T04:30:00.000Z"));
  it("produces one slot per Saturday in the 28-day window, chronologically", () => {
    expect(slots).toHaveLength(4);
    const t = slots.map((s) => Date.parse(s.startAt));
    expect([...t].sort((a, b) => a - b)).toEqual(t);
  });
  it("respects the booking lead time", () => {
    const sat0930 = new Date("2026-11-14T04:00:00Z");
    const s = upcomingSlots([{ day: "Saturday", start: "10:00", end: "11:00" }], sat0930);
    expect(Date.parse(s[0].startAt) - sat0930.getTime()).toBeGreaterThanOrEqual(BOOKING_LEAD_MS);
  });
});
