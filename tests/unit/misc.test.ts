import { describe, expect, it } from "vitest";
import { parseSettings } from "@/domain/settings";
import { resolveTemplateDate } from "@/domain/templates";
import { addDays, daysBetween, eachDate, isIsoDate, utcToZoned, zonedToUtc } from "@/lib/dates";
import { decrypt, encrypt, generateToken, sha256 } from "@/server/lib/crypto";
import { csvCell } from "@/server/modules/exports";
import { normalizePhone, parseGuestList } from "@/server/modules/guests";
import { editLock } from "@/server/modules/rsvp";

describe("dates", () => {
  it("validates calendar dates", () => {
    expect(isIsoDate("2026-11-21")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("21-11-2026")).toBe(false);
  });

  it("does date arithmetic without timezone drift", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysBetween("2026-11-21", "2026-11-24")).toBe(3);
    expect(eachDate("2026-11-21", "2026-11-23")).toEqual(["2026-11-21", "2026-11-22"]);
  });

  it("converts event-local times to UTC (Asia/Kolkata, +05:30)", () => {
    expect(zonedToUtc("2026-11-22", "10:00", "Asia/Kolkata").toISOString()).toBe("2026-11-22T04:30:00.000Z");
    expect(utcToZoned("2026-11-22T04:30:00.000Z", "Asia/Kolkata")).toEqual({ date: "2026-11-22", time: "10:00" });
  });

  it("handles daylight saving transitions", () => {
    // New York: EDT (-4) before 1 Nov 2026, EST (-5) after.
    expect(zonedToUtc("2026-10-31", "12:00", "America/New_York").toISOString()).toBe("2026-10-31T16:00:00.000Z");
    expect(zonedToUtc("2026-11-02", "12:00", "America/New_York").toISOString()).toBe("2026-11-02T17:00:00.000Z");
  });

  it("clamps template days to the event range", () => {
    expect(resolveTemplateDate("2026-11-21", "2026-11-22", 5)).toBe("2026-11-22");
  });
});

describe("crypto", () => {
  it("generates high-entropy URL-safe tokens", () => {
    const t = generateToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateToken()).not.toBe(t);
  });
  it("round-trips encryption and detects tampering", () => {
    const c = encrypt("secret-token");
    expect(decrypt(c)).toBe("secret-token");
    const tampered = c.slice(0, -2) + (c.endsWith("A") ? "BB" : "AA");
    expect(() => decrypt(tampered)).toThrow();
    expect(sha256("x")).toHaveLength(64);
  });
});

describe("csv", () => {
  it("quotes and neutralises formulas", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('a "b", c')).toBe('"a ""b"", c"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell(["x", "y"])).toBe("x; y");
    expect(csvCell(null)).toBe("");
  });
});

describe("guest list parsing", () => {
  it("parses CSV with header aliases", () => {
    const rows = parseGuestList("Full Name,E-mail,Mobile,Family,Groups\nAsha Rao,asha@example.com,+91 98765 43210,Rao family,Friends; VIP");
    expect(rows[0]).toMatchObject({ name: "Asha Rao", email: "asha@example.com", phone: "+91 98765 43210", household: "Rao family", groups: "Friends; VIP" });
  });
  it("parses pasted lines", () => {
    const rows = parseGuestList("Asha Rao, asha@example.com\nVikram 9876543210\nMeera");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ name: "Asha Rao", email: "asha@example.com" });
    expect(rows[2]).toMatchObject({ name: "Meera" });
  });
  it("normalises phone numbers", () => {
    expect(normalizePhone("+91 (987) 654-3210")).toBe("+919876543210");
    expect(normalizePhone("")).toBeNull();
    expect(() => normalizePhone("12")).toThrow();
  });
});

describe("settings and edit policy", () => {
  it("falls back to defaults for malformed settings", () => {
    const s = parseSettings({ tentativeWeight: 7 });
    expect(s.tentativeWeight).toBe(0.5);
    expect(s.features.dietary).toBe(true);
  });

  it("applies deadline and edit rules", () => {
    const s = parseSettings({});
    const past = { rsvpDeadline: new Date(Date.now() - 1000) };
    const future = { rsvpDeadline: new Date(Date.now() + 1e7) };
    expect(editLock(future, s, { responseStatus: "submitted" })).toEqual({ lockedReason: null, isLate: false });
    expect(editLock(past, s, { responseStatus: "pending" })).toEqual({ lockedReason: null, isLate: true });
    expect(editLock(past, { ...s, latePolicy: "reject" }, { responseStatus: "pending" }).lockedReason).toBe("deadline");
    expect(editLock(future, { ...s, allowGuestEdits: false }, { responseStatus: "submitted" }).lockedReason).toBe("edits_disabled");
    expect(editLock(future, { ...s, allowGuestEdits: false }, { responseStatus: "pending" }).lockedReason).toBeNull();
  });
});

describe("app URL resolution", () => {
  it("prefers an explicit APP_URL", async () => {
    const { getAppUrl } = await import("@/server/lib/app-url");
    expect(getAppUrl({ APP_URL: "https://rsvp.example.com/", VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "x.vercel.app" })).toBe("https://rsvp.example.com");
  });
  it("uses the production domain on Vercel production and the deployment URL on previews", async () => {
    const { getAppUrl } = await import("@/server/lib/app-url");
    expect(getAppUrl({ VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "wedding.example.com", VERCEL_URL: "abc.vercel.app" })).toBe("https://wedding.example.com");
    expect(getAppUrl({ VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "app-git-feat.vercel.app", VERCEL_URL: "abc.vercel.app" })).toBe("https://app-git-feat.vercel.app");
    expect(getAppUrl({})).toBeNull();
  });
});

describe("database URL helpers", () => {
  it("pins sslmode to verify-full and recognises local databases", async () => {
    const { normalizeSslMode, isLocalDatabaseUrl } = await import("@/server/db/connect");
    expect(normalizeSslMode("postgres://u:p@h.neon.tech/db?sslmode=require&channel_binding=require")).toBe("postgres://u:p@h.neon.tech/db?sslmode=verify-full&channel_binding=require");
    expect(normalizeSslMode("postgres://u:p@localhost/db")).toBe("postgres://u:p@localhost/db");
    expect(isLocalDatabaseUrl("postgres://gatherly@db:5432/gatherly")).toBe(true);
    expect(isLocalDatabaseUrl("postgres://u:p@ep-x.ap-southeast-1.aws.neon.tech/neondb")).toBe(false);
  });
});
