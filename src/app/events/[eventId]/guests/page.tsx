import Link from "next/link";
import { Suspense } from "react";
import { ActionButton, ActionForm, Disclosure, SubmitButton } from "@/components/forms";
import { ResponseBadge } from "@/components/status";
import { Badge, Button, ButtonLink, Card, CardHeader, cx, EmptyState, Field, Input, PageHeader, PageSkeleton, Select, tableClass, TableWrap, tdClass, thClass } from "@/components/ui";
import {
  bulkGroupAction,
  createGroupAction,
  createHouseholdAction,
  deleteGroupAction,
  importGuestsAction,
  saveGuestAction,
} from "@/server/actions/guests";
import { guestCounts, listGroups, listGuests, listHouseholds } from "@/server/modules/guests";
import { getEventContext } from "../context";
import { GuestForm, HouseholdForm, ImportForm } from "./guest-forms";

export default function GuestsPage({ params, searchParams }: PageProps<"/events/[eventId]/guests">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Guests params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

async function Guests({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { eventId } = await params;
  const sp = await searchParams;
  const { db, user, canManage } = await getEventContext(eventId);
  const filters = {
    q: one(sp.q),
    groupId: one(sp.groupId),
    householdId: one(sp.householdId),
    invited: one(sp.invited) as "yes" | "no" | undefined,
    cursor: one(sp.cursor),
  };
  const [page, groups, households, counts] = await Promise.all([
    listGuests(db, user.id, eventId, filters).catch(() => listGuests(db, user.id, eventId, {})),
    listGroups(db, eventId),
    listHouseholds(db, eventId),
    guestCounts(db, eventId),
  ]);
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const base = `/events/${eventId}/guests`;
  const filtered = !!(filters.q || filters.groupId || filters.householdId || filters.invited);
  const nextHref = page.nextCursor
    ? `${base}?${new URLSearchParams({ ...Object.fromEntries(Object.entries(filters).filter(([k, v]) => v && k !== "cursor")), cursor: page.nextCursor } as Record<string, string>)}`
    : null;

  return (
    <>
      <PageHeader
        title="Guests"
        description={`${counts.total} people${counts.plusOnes ? `, including ${counts.plusOnes} plus-ones added by guests` : ""}. Each person is one record, however many groups they belong to.`}
        actions={
          canManage ? (
            <ButtonLink href={`/events/${eventId}/invitations`} variant="secondary">
              Invitations →
            </ButtonLink>
          ) : undefined
        }
      />

      {canManage && (
        <div className="mb-6 grid gap-3">
          <Disclosure summary="Add a guest" defaultOpen={counts.total === 0}>
            <GuestForm action={saveGuestAction.bind(null, eventId, null)} groups={groups} households={households} submitLabel="Add guest" />
          </Disclosure>
          <Disclosure summary="Add a household or family">
            <HouseholdForm action={createHouseholdAction.bind(null, eventId)} />
          </Disclosure>
          <Disclosure summary="Import or paste a list">
            <ImportForm action={importGuestsAction.bind(null, eventId)} />
          </Disclosure>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_18rem]">
        <Card className="min-w-0">
          <form className="flex flex-wrap items-end gap-2 border-b border-border p-4" action={base}>
            <Field label="Search" htmlFor="q" className="min-w-40 flex-1">
              <Input id="q" name="q" type="search" defaultValue={filters.q} placeholder="Name, email or phone" />
            </Field>
            <Field label="Group" htmlFor="groupId">
              <Select id="groupId" name="groupId" defaultValue={filters.groupId ?? ""}>
                <option value="">All groups</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Invitation" htmlFor="invited">
              <Select id="invited" name="invited" defaultValue={filters.invited ?? ""}>
                <option value="">Everyone</option>
                <option value="yes">Has an invitation</option>
                <option value="no">Not yet invited</option>
              </Select>
            </Field>
            <Button type="submit" variant="secondary">
              Filter
            </Button>
            {filtered && (
              <ButtonLink href={base} variant="ghost">
                Clear
              </ButtonLink>
            )}
          </form>

          {page.items.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title={filtered ? "No guests match these filters" : "No guests yet"}
                description={filtered ? undefined : "Add people one by one, as households, or paste a list from your spreadsheet."}
              />
            </div>
          ) : (
            <>
              <TableWrap>
                <table className={tableClass}>
                  <thead className="border-b border-border">
                    <tr>
                      {canManage && <th className={cx(thClass, "w-8")}><span className="sr-only">Select</span></th>}
                      <th className={thClass}>Name</th>
                      <th className={thClass}>Contact</th>
                      <th className={thClass}>Household</th>
                      <th className={thClass}>Groups</th>
                      <th className={thClass}>Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {page.items.map(({ guest, householdName, groupIds, responseStatus, invitationId }) => (
                      <tr key={guest.id}>
                        {canManage && (
                          <td className={tdClass}>
                            <input type="checkbox" form="bulk" name="guestIds" value={guest.id} aria-label={`Select ${guest.name}`} className="size-4 accent-[var(--brand)]" />
                          </td>
                        )}
                        <td className={tdClass}>
                          <Link href={`${base}/${guest.id}`} className="font-medium hover:underline">
                            {guest.name}
                          </Link>
                          {guest.plusOneOfInvitationId && <Badge className="ml-2">Plus-one</Badge>}
                          {guest.relationship && <div className="text-xs text-muted">{guest.relationship}</div>}
                        </td>
                        <td className={cx(tdClass, "text-muted")}>
                          <div className="max-w-48 truncate">{guest.email}</div>
                          <div>{guest.phone}</div>
                        </td>
                        <td className={tdClass}>
                          {householdName ? (
                            <Link href={`${base}?householdId=${guest.householdId}`} className="hover:underline">
                              {householdName}
                            </Link>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className={tdClass}>
                          <div className="flex flex-wrap gap-1">
                            {groupIds.map((id) => (
                              <Badge key={id} tone="brand">
                                {groupName.get(id)}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className={tdClass}>
                          {invitationId ? (
                            <Link href={`/events/${eventId}/responses/${invitationId}`}>
                              <ResponseBadge status={responseStatus} />
                            </Link>
                          ) : (
                            <ResponseBadge status={null} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4">
                {canManage && groups.length > 0 ? (
                  <ActionForm id="bulk" action={bulkGroupAction.bind(null, eventId)} className="flex flex-wrap items-center gap-2 space-y-0">
                    <span className="text-sm text-muted">With selected:</span>
                    <BulkFields groups={groups} />
                  </ActionForm>
                ) : (
                  <span />
                )}
                {nextHref && (
                  <ButtonLink href={nextHref} variant="secondary" size="sm">
                    Next page →
                  </ButtonLink>
                )}
              </div>
            </>
          )}
        </Card>

        <aside className="space-y-6">
          <Card>
            <CardHeader title="Groups" description="Organise guests and limit who sees an activity." />
            <ul className="divide-y divide-border">
              {groups.map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm">
                  <Link href={`${base}?groupId=${g.id}`} className="min-w-0 truncate hover:underline">
                    {g.name}
                  </Link>
                  <span className="flex items-center gap-2">
                    <span className="tabular text-muted">{g.memberCount}</span>
                    {canManage && (
                      <ActionButton action={deleteGroupAction.bind(null, g.id)} variant="ghost" confirm={`Delete the group “${g.name}”? Guests stay on the list.`}>
                        <span aria-label={`Delete ${g.name}`}>×</span>
                      </ActionButton>
                    )}
                  </span>
                </li>
              ))}
              {groups.length === 0 && <li className="px-5 py-3 text-sm text-muted">No groups yet.</li>}
            </ul>
            {canManage && (
              <div className="border-t border-border p-4">
                <ActionForm action={createGroupAction.bind(null, eventId)} resetOnSuccess className="space-y-2">
                  <div className="flex gap-2">
                    <Input name="name" aria-label="New group name" placeholder="New group" required maxLength={80} />
                    <SubmitButton variant="secondary">Add</SubmitButton>
                  </div>
                </ActionForm>
              </div>
            )}
          </Card>
          <Card>
            <CardHeader title="Households" />
            <ul className="max-h-80 divide-y divide-border overflow-auto">
              {households.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm">
                  <Link href={`${base}?householdId=${h.id}`} className="min-w-0 truncate hover:underline">
                    {h.name}
                  </Link>
                  <span className="tabular text-muted">{h.memberCount}</span>
                </li>
              ))}
              {households.length === 0 && <li className="px-5 py-3 text-sm text-muted">No households yet.</li>}
            </ul>
          </Card>
        </aside>
      </div>
    </>
  );
}

function BulkFields({ groups }: { groups: { id: string; name: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select name="op" aria-label="Bulk action" className="w-auto">
        <option value="add">Add to group</option>
        <option value="remove">Remove from group</option>
      </Select>
      <Select name="groupId" aria-label="Group" className="w-auto" required>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </Select>
      <SubmitButton variant="secondary" size="sm">
        Apply
      </SubmitButton>
    </div>
  );
}
