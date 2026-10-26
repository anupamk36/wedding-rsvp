import { expect, type APIRequestContext, type Page } from "@playwright/test";

export function isoDate(daysFromToday: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

export async function signUpHost(page: Page, name = "E2E Host") {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("e2e-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return { email };
}

export async function createEvent(page: Page, opts: { name: string; type: string; start: string }) {
  await page.goto("/events/new");
  await page.getByText(opts.type, { exact: true }).click();
  await page.getByLabel("Event name").fill(opts.name);
  await page.getByLabel("Starts").fill(opts.start);
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page).toHaveURL(/\/events\/[0-9a-f-]{36}$/);
  return page.url().split("/events/")[1];
}

export async function invitationUrls(request: APIRequestContext, eventId: string): Promise<Record<string, string>> {
  const res = await request.get(`/api/events/${eventId}/invitations`);
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { invitations: { label: string; url: string | null }[] };
  return Object.fromEntries(body.invitations.filter((i) => i.url).map((i) => [i.label, i.url!]));
}

/** Path part of an invitation URL so tests work whatever APP_URL is. */
export const pathOf = (url: string) => new URL(url).pathname;

export async function summary(request: APIRequestContext, eventId: string) {
  const res = await request.get(`/api/events/${eventId}/summary`);
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as {
    totals: Record<string, number>;
    activities: { name: string; confirmed: number; tentative: number; declined: number; unanswered: number }[];
    slots: { activityId: string; available: number; ifNeeded: number; unavailable: number }[];
  };
}
