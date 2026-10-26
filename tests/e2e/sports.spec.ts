import { expect, test } from "@playwright/test";
import { createEvent, invitationUrls, isoDate, pathOf, signUpHost } from "./helpers";

test("sports organizer collects availability across three candidate slots", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await signUpHost(page, "Captain");
  const eventId = await createEvent(page, { name: "Sunday cricket", type: "Sports meetup", start: isoDate(10) });

  await page.getByRole("link", { name: "Time slots", exact: true }).click();
  for (const slot of ["Morning slot", "Evening slot", "Next morning slot"]) {
    await expect(page.getByRole("heading", { name: slot, exact: true })).toBeVisible();
  }

  await page.getByRole("link", { name: "Guests", exact: true }).click();
  await page.getByText("Import or paste a list").click();
  await page.getByLabel("Paste a list").fill("Player One\nPlayer Two\nPlayer Three");
  await page.getByRole("button", { name: "Import guests" }).click();
  await expect(page.getByText("3 guest(s) added.")).toBeVisible();

  await page.getByRole("link", { name: "Invitations", exact: true }).click();
  await page.getByRole("button", { name: "Create invitations" }).click();
  await expect(page.getByRole("link", { name: "Player Three" })).toBeVisible();
  const urls = await invitationUrls(page.request, eventId);

  const plan: Record<string, string[]> = {
    "Player One": ["Available", "Unavailable", "Available"],
    "Player Two": ["Available", "If needed", "Available"],
    "Player Three": ["Unavailable", "Available", "Available"],
  };
  const ctx = await browser.newContext();
  const guest = await ctx.newPage();
  for (const [name, answers] of Object.entries(plan)) {
    await guest.goto(pathOf(urls[name]));
    await expect(guest.getByRole("heading", { name: "When can you make it?" })).toBeVisible();
    for (const [i, slot] of ["Morning slot", "Evening slot", "Next morning slot"].entries()) {
      await guest.getByRole("radiogroup", { name: slot, exact: true }).getByText(answers[i], { exact: true }).click();
    }
    await guest.getByRole("button", { name: "Continue" }).click();
    await guest.getByRole("button", { name: "Send response" }).click();
    await expect(guest.getByText("Thank you — your response has been saved.")).toBeVisible();
  }
  await ctx.close();

  await page.getByRole("link", { name: "Overview", exact: true }).click();
  const panel = page.getByRole("region", { name: "Availability by slot" });
  const items = panel.getByRole("listitem");
  await expect(items.first()).toContainText("Next morning slot");
  await expect(items.first()).toContainText("3 available");
  await expect(panel.getByRole("listitem").filter({ hasText: "Evening slot" })).toContainText("1 if needed");
});
