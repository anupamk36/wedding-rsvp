import { Suspense } from "react";
import { ActionButton, Disclosure } from "@/components/forms";
import { Badge, buttonClass, Card, cx, EmptyState, PageHeader, PageSkeleton, tableClass, TableWrap, tdClass, thClass } from "@/components/ui";
import { dietaryLabel } from "@/domain/settings";
import { formatDate, utcToZoned } from "@/lib/dates";
import { deleteMealAction, saveMealAction } from "@/server/actions/logistics";
import { getMealReport } from "@/server/modules/reporting";
import { getEventContext } from "../context";
import { MealForm } from "./meal-form";

export default function MealsPage({ params }: PageProps<"/events/[eventId]/meals">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Meals params={params} />
    </Suspense>
  );
}

const BASIS: Record<string, string> = {
  activity: "Attendees of",
  overnight: "Guests staying the night before",
  manual: "Individually added guests",
};

async function Meals({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { db, user, event, canManage } = await getEventContext(eventId);
  const r = await getMealReport(db, user.id, eventId);
  const acts = r.activities.map((a) => ({ id: a.id, name: a.name, date: formatDate(utcToZoned(a.startAt, event.timezone).date, { year: undefined }) }));
  const actName = new Map(r.activities.map((a) => [a.id, a.name]));
  const tags = r.settings.dietaryOptions.filter((t) => r.meals.some((m) => m.dietary[t]));
  const byDate = new Map<string, typeof r.meals>();
  for (const m of r.meals) byDate.set(m.serviceDate, [...(byDate.get(m.serviceDate) ?? []), m]);

  return (
    <>
      <PageHeader
        title="Meals"
        description="Expected servings, derived from attendance and stays. Dietary needs can overlap (someone can be vegetarian and gluten-free), so they may add up to more than the total."
        actions={
          <a href={`/api/events/${eventId}/export?kind=meals`} className={buttonClass("secondary")} download>
            Export CSV
          </a>
        }
      />
      {canManage && (
        <Disclosure summary="Add a meal" defaultOpen={r.meals.length === 0} className="mb-6">
          <MealForm action={saveMealAction.bind(null, eventId, null)} activities={acts} minDate={event.startDate} maxDate={event.endDate} submitLabel="Add meal" />
        </Disclosure>
      )}
      {r.meals.length === 0 ? (
        <EmptyState title="No meals planned" description="Add breakfasts, lunches and dinners and choose how each is counted." />
      ) : (
        <Card>
          <TableWrap>
            <table className={tableClass}>
              <thead className="border-b border-border">
                <tr>
                  <th className={thClass}>Meal</th>
                  <th className={cx(thClass, "text-right")}>Confirmed</th>
                  <th className={cx(thClass, "text-right")}>Tentative</th>
                  <th className={cx(thClass, "text-right")}>No restrictions</th>
                  {tags.map((t) => (
                    <th key={t} className={cx(thClass, "text-right")}>
                      {dietaryLabel(t)}
                    </th>
                  ))}
                  {canManage && <th className={thClass}><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              {[...byDate.entries()].map(([date, meals]) => (
                <tbody key={date} className="divide-y divide-border tabular">
                  <tr className="bg-surface-2">
                    <th colSpan={4 + tags.length + (canManage ? 1 : 0)} className="px-4 py-1.5 text-left text-xs font-semibold text-muted">
                      {formatDate(date)}
                    </th>
                  </tr>
                  {meals.map((m) => (
                    <tr key={m.id}>
                      <td className={tdClass}>
                        <div className="font-medium">
                          {m.name}
                          {m.serviceTime && <span className="ml-1 font-normal text-muted">{m.serviceTime}</span>}
                        </div>
                        <div className="text-xs text-muted">
                          {BASIS[m.basis]}
                          {m.basis === "activity" && ` ${m.activityIds.map((id) => actName.get(id)).join(", ")}`}
                          {m.optedOut > 0 && ` · ${m.optedOut} opted out`}
                          {m.guestCanOptOut && <Badge className="ml-1">Guests can skip</Badge>}
                        </div>
                        {m.specialRequests.length > 0 && (
                          <details className="mt-1 text-xs">
                            <summary className="cursor-pointer text-info">{m.specialRequests.length} special request(s)</summary>
                            <ul className="mt-1 space-y-0.5">
                              {m.specialRequests.map((s, i) => (
                                <li key={i}>
                                  {s.name}: {s.notes}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </td>
                      <td className={cx(tdClass, "text-right text-base font-semibold")}>{m.confirmed}</td>
                      <td className={cx(tdClass, "text-right text-warning")}>{m.tentative}</td>
                      <td className={cx(tdClass, "text-right")}>{m.noRestrictions}</td>
                      {tags.map((t) => (
                        <td key={t} className={cx(tdClass, "text-right")}>
                          {m.dietary[t] ?? 0}
                        </td>
                      ))}
                      {canManage && (
                        <td className={cx(tdClass, "text-right")}>
                          <ActionButton action={deleteMealAction.bind(null, m.id)} variant="ghost" confirm={`Delete ${m.name} on ${m.serviceDate}?`}>
                            Delete
                          </ActionButton>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </TableWrap>
          <p className="border-t border-border px-5 py-2 text-xs text-muted">
            Tentative = people who answered maybe for a linked activity. They are not included in the confirmed count.
          </p>
        </Card>
      )}
    </>
  );
}
