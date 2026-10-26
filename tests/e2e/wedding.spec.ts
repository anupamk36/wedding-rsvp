import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createEvent, invitationUrls, isoDate, pathOf, signUpHost, summary } from "./helpers";

test.describe.configure({ mode: "serial" });

const ACTIVITIES = ["Welcome dinner", "Haldi", "Mehendi", "Sangeet", "Wedding ceremony", "Reception"];

test("host plans a wedding, a family RSVPs, plans change, and a revoked link stops working", async ({ page, browser }) => {
  test.setTimeout(180_000);
  await signUpHost(page, "Purva");
  const start = isoDate(40);
  const eventId = await createEvent(page, { name: "E2E Wedding", type: "Multi-day wedding", start });

  // Template schedule: three dates, six activities.
  await page.getByRole("link", { name: "Schedule", exact: true }).click();
  for (const a of ACTIVITIES) await expect(page.getByRole("heading", { name: a, exact: true })).toBeVisible();

  // A household of four.
  await page.getByRole("link", { name: "Guests", exact: true }).click();
  await page.getByText("Add a household or family").click();
  await page.getByLabel("Household name").fill("The Sharma family");
  await page.getByRole("button", { name: "+ Add another person" }).click();
  await page.getByRole("button", { name: "+ Add another person" }).click();
  const names = ["Anupam", "Purva S", "Parent 1", "Parent 2"];
  for (const [i, n] of names.entries()) await page.getByLabel(`Member ${i + 1} name`).fill(n);
  await page.getByRole("button", { name: "Create household" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Household created." })).toBeVisible();

  // Invitations.
  await page.getByRole("link", { name: "Invitations", exact: true }).click();
  await page.getByRole("button", { name: "Create invitations" }).click();
  await expect(page.getByRole("link", { name: "The Sharma family" })).toBeVisible();
  const url = (await invitationUrls(page.request, eventId))["The Sharma family"];
  expect(url).toBeTruthy();

  // Guest responds in a separate, signed-out browser.
  const guestCtx = await browser.newContext();
  const guest = await guestCtx.newPage();
  await guest.goto(pathOf(url));
  await expect(guest.getByText("For the Sharma family")).toBeVisible();
  await expect(guest.getByRole("heading", { name: "E2E Wedding" })).toBeVisible();

  const a11y = await new AxeBuilder({ page: guest }).analyze();
  expect(a11y.violations.filter((v) => v.impact === "critical" || v.impact === "serious")).toEqual([]);

  await guest.getByRole("button", { name: "Continue" }).click(); // party
  for (const a of ACTIVITIES) {
    for (const n of names) {
      const status = n === "Parent 2" ? "Not attending" : n === "Parent 1" && a !== "Wedding ceremony" ? "Not attending" : "Attending";
      await guest.getByRole("radiogroup", { name: `${a} – ${n}` }).getByText(status, { exact: true }).click();
    }
  }
  await guest.getByRole("button", { name: "Continue" }).click(); // activities -> details
  await expect(guest.getByRole("heading", { name: "A few details" })).toBeVisible();
  await guest.getByRole("button", { name: "Continue" }).click(); // details -> travel
  const stay = guest.getByRole("group", { name: "Will anyone need a place to stay?" });
  await stay.getByText("Yes", { exact: true }).click();
  await expect(stay.getByRole("radio", { name: "Yes" })).toBeChecked();
  // Only the couple needs a room; one room for the whole stay.
  await guest.getByRole("checkbox", { name: "Parent 1" }).uncheck();
  await guest.getByLabel("Check-in").fill(start);
  await guest.getByLabel("Check-out").fill(isoDate(43));
  await guest.getByLabel("Rooms needed").selectOption("1");
  await guest.getByRole("button", { name: "Continue" }).click(); // travel -> review
  await expect(guest.getByRole("heading", { name: "Check your answers" })).toBeVisible();
  await guest.getByRole("button", { name: "Send response" }).click();
  await expect(guest.getByText("Thank you — your response has been saved.")).toBeVisible();

  // Host sees the right headcounts.
  let s = await summary(page.request, eventId);
  const by = (name: string) => s.activities.find((a) => a.name === name)!;
  expect(by("Wedding ceremony")).toMatchObject({ confirmed: 3, declined: 1, unanswered: 0 });
  expect(by("Haldi")).toMatchObject({ confirmed: 2, declined: 2 });
  const acc = await (await page.request.get(`/api/events/${eventId}/logistics/accommodation`)).json();
  expect(acc.totals).toMatchObject({ guestNights: 6, roomNights: 3 });
  const meals = await (await page.request.get(`/api/events/${eventId}/logistics/meals`)).json();
  expect(meals.meals.find((m: { name: string; serviceDate: string }) => m.name === "Lunch" && m.serviceDate === isoDate(42)).confirmed).toBe(3);

  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(page.getByRole("row", { name: /Wedding ceremony/ })).toContainText("3");

  // Guest changes plans: Parent 2 now joins the reception.
  await guest.getByRole("button", { name: "Change my response" }).click();
  await guest.getByRole("button", { name: "Continue" }).click();
  await guest.getByRole("radiogroup", { name: "Reception – Parent 2" }).getByText("Attending", { exact: true }).click();
  await guest.getByRole("button", { name: "Continue" }).click();
  await guest.getByRole("button", { name: "Continue" }).click();
  await guest.getByRole("button", { name: "Continue" }).click();
  await guest.getByRole("button", { name: "Save changes" }).click();
  await expect(guest.getByText("Thank you — your response has been saved.")).toBeVisible();
  s = await summary(page.request, eventId);
  expect(by("Reception").confirmed).toBe(3);

  // The change appears in the host's feed and history.
  await page.reload();
  await expect(page.getByText("Parent 2: Reception → attending")).toBeVisible();

  // Revoking the invitation disables the link.
  await page.getByRole("link", { name: "Invitations", exact: true }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByText("Link disabled")).toBeVisible();
  await guest.reload();
  await expect(guest.getByRole("heading", { name: "This link isn't working" })).toBeVisible();
  const put = await guestCtx.request.put(`${pathOf(url).replace("/i/", "/api/public/invitations/")}/response`, {
    data: { expectedVersion: 2, people: [], attendance: [] },
  });
  expect(put.status()).toBe(404);
  await guestCtx.close();

  // Dashboard accessibility.
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  const hostA11y = await new AxeBuilder({ page }).analyze();
  expect(hostA11y.violations.filter((v) => v.impact === "critical" || v.impact === "serious")).toEqual([]);
});

test("guests cannot reach host pages or other events' data", async ({ page, browser }) => {
  await signUpHost(page, "Owner");
  const eventId = await createEvent(page, { name: "Private party", type: "Dinner or house party", start: isoDate(20) });

  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await signUpHost(otherPage, "Someone else");
  expect((await otherPage.request.get(`/api/events/${eventId}/summary`)).status()).toBe(404);
  expect((await otherPage.request.get(`/api/events/${eventId}/export?kind=guests`)).status()).toBe(404);
  await otherPage.goto(`/events/${eventId}`);
  await expect(otherPage.getByRole("heading", { name: "This page could not be found" })).toBeVisible();
  await other.close();

  const anon = await browser.newContext();
  const anonPage = await anon.newPage();
  await anonPage.goto(`/events/${eventId}`);
  await expect(anonPage).toHaveURL(/\/login/);
  expect((await anon.request.get(`/api/events/${eventId}/summary`)).status()).toBe(401);
  await anon.close();
});
