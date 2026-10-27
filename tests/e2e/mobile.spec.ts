import { expect, test } from "@playwright/test";
import { createEvent, invitationUrls, isoDate, pathOf, signUpHost } from "./helpers";

test("invitation works on a phone without horizontal scrolling", async ({ page, browser }) => {
  await signUpHost(page, "Mobile Host");
  const eventId = await createEvent(page, { name: "Phone-friendly birthday", type: "Birthday party", start: isoDate(14) });
  await page.goto(`/events/${eventId}/guests`);
  // The "Add a guest" form starts open while the list is empty.
  await page.getByLabel("Name", { exact: true }).fill("Asha");
  await page.getByRole("button", { name: "Add guest" }).click();
  await expect(page.getByRole("link", { name: "Asha" })).toBeVisible();
  await page.goto(`/events/${eventId}/invitations`);
  await page.getByRole("button", { name: "Create invitations" }).click();
  await expect(page.getByRole("link", { name: "Asha" })).toBeVisible();
  const url = (await invitationUrls(page.request, eventId))["Asha"];

  const ctx = await browser.newContext({ ...test.info().project.use });
  const guest = await ctx.newPage();
  await guest.goto(pathOf(url));
  await expect(guest.getByText("Dear Asha")).toBeVisible();
  const overflow = await guest.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await guest.getByRole("button", { name: "Reply now" }).click();
  // Plus-one allowed by the birthday template.
  await guest.getByRole("button", { name: "Add a guest" }).click();
  await guest.getByLabel("Guest name").fill("Ravi");
  await guest.getByRole("radiogroup", { name: "Birthday party – everyone" }).getByText("Attending", { exact: true }).click();
  await guest.getByRole("button", { name: "Continue" }).click();
  await guest.getByRole("button", { name: "Review" }).click();
  await guest.getByRole("button", { name: "Send response" }).click();
  await expect(guest.getByRole("status").getByRole("heading", { name: /Thank you/ })).toBeVisible();
  const afterOverflow = await guest.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(afterOverflow).toBeLessThanOrEqual(0);
  const s = await (await page.request.get(`/api/events/${eventId}/summary`)).json();
  expect(s.activities[0]).toMatchObject({ confirmed: 2 });
  expect(s.totals.plusOnes).toBe(1);
  await ctx.close();
});
