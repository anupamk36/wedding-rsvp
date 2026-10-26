"use client";

import { useState } from "react";
import { ActionForm, SubmitButton, type ActionState } from "@/components/forms";
import { Badge, Button, Checkbox, Field, Input, Select, tableClass, tdClass, thClass } from "@/components/ui";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

export interface GuestDefaults {
  name?: string;
  email?: string | null;
  phone?: string | null;
  householdId?: string | null;
  relationship?: string | null;
  notes?: string | null;
  groupIds?: string[];
}

export function GuestForm({
  action,
  defaults = {},
  groups,
  households,
  submitLabel,
  isPlusOne,
}: {
  action: Action;
  defaults?: GuestDefaults;
  groups: { id: string; name: string }[];
  households: { id: string; name: string }[];
  submitLabel: string;
  isPlusOne?: boolean;
}) {
  return (
    <ActionForm action={action} resetOnSuccess={!defaults.name}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Name" htmlFor="g-name">
          <Input id="g-name" name="name" required maxLength={160} defaultValue={defaults.name} />
        </Field>
        <Field label="Email" htmlFor="g-email" hint="Optional; used for email invitations.">
          <Input id="g-email" name="email" type="email" maxLength={254} defaultValue={defaults.email ?? ""} />
        </Field>
        <Field label="Phone / WhatsApp" htmlFor="g-phone" hint="Optional; include the country code.">
          <Input id="g-phone" name="phone" type="tel" maxLength={40} defaultValue={defaults.phone ?? ""} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {!isPlusOne && (
          <Field label="Household" htmlFor="g-household" hint="People in a household share one invitation.">
            <Select id="g-household" name="householdId" defaultValue={defaults.householdId ?? ""}>
              <option value="">None (invite individually)</option>
              {households.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Relationship" htmlFor="g-rel" hint="e.g. spouse, child, parent">
          <Input id="g-rel" name="relationship" maxLength={80} defaultValue={defaults.relationship ?? ""} />
        </Field>
        <Field label="Private note" htmlFor="g-notes" hint="Only hosts see this.">
          <Input id="g-notes" name="notes" maxLength={2000} defaultValue={defaults.notes ?? ""} />
        </Field>
      </div>
      {groups.length > 0 && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Groups</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {groups.map((g) => (
              <Checkbox key={g.id} name="groupIds" value={g.id} label={g.name} defaultChecked={defaults.groupIds?.includes(g.id)} />
            ))}
          </div>
        </fieldset>
      )}
      <div className="flex justify-end">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function HouseholdForm({ action }: { action: Action }) {
  const [rows, setRows] = useState(2);
  return (
    <ActionForm action={action} resetOnSuccess onSuccess={() => setRows(2)}>
      <Field label="Household name" htmlFor="h-name" hint="Shown to the guest, e.g. “The Sharma family”.">
        <Input id="h-name" name="name" required maxLength={160} />
      </Field>
      <div className="space-y-2">
        <div className="hidden grid-cols-4 gap-2 text-xs font-medium text-muted sm:grid">
          <span>Name</span>
          <span>Email</span>
          <span>Phone</span>
          <span>Relationship</span>
        </div>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="grid gap-2 rounded-lg border border-border p-2 sm:grid-cols-4 sm:border-0 sm:p-0">
            <Input name="memberName" aria-label={`Member ${i + 1} name`} placeholder="Name" maxLength={160} required={i === 0} />
            <Input name="memberEmail" aria-label={`Member ${i + 1} email`} placeholder="Email (optional)" type="email" />
            <Input name="memberPhone" aria-label={`Member ${i + 1} phone`} placeholder="Phone (optional)" type="tel" />
            <Input name="memberRelationship" aria-label={`Member ${i + 1} relationship`} placeholder="Relationship" />
          </div>
        ))}
        <Button type="button" variant="ghost" size="sm" onClick={() => setRows((n) => Math.min(n + 1, 20))}>
          + Add another person
        </Button>
      </div>
      <div className="flex justify-end">
        <SubmitButton>Create household</SubmitButton>
      </div>
    </ActionForm>
  );
}

interface ImportResult {
  row: number;
  name: string;
  status: "created" | "merged" | "error";
  message?: string;
}

export function ImportForm({ action }: { action: Action }) {
  return (
    <ActionForm
      action={action}
      resetOnSuccess
      render={(state) => {
        const results = (state.data as ImportResult[] | undefined) ?? [];
        const notable = results.filter((r) => r.status !== "created");
        if (!notable.length) return null;
        return (
          <div className="max-h-72 overflow-auto rounded-lg border border-border">
            <table className={tableClass}>
              <thead className="sticky top-0 bg-surface">
                <tr>
                  <th className={thClass}>Row</th>
                  <th className={thClass}>Name</th>
                  <th className={thClass}>Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {notable.map((r) => (
                  <tr key={r.row}>
                    <td className={tdClass}>{r.row}</td>
                    <td className={tdClass}>{r.name || <span className="text-muted">(blank)</span>}</td>
                    <td className={tdClass}>
                      <Badge tone={r.status === "error" ? "danger" : "neutral"}>{r.status === "error" ? "Not imported" : "Duplicate"}</Badge>
                      <span className="ml-2 text-muted">{r.message}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }}
    >
      <p className="text-sm text-muted">
        Paste one guest per line (<code>Name, email, phone</code>), or upload a CSV with a header row. Recognised columns:{" "}
        <code>name, email, phone, household, groups, relationship, notes</code>. Separate several groups with <code>;</code>. People with the same
        household value share one invitation. Existing guests (same email or phone) are not duplicated.
      </p>
      <Field label="Paste a list" htmlFor="imp-text">
        <textarea
          id="imp-text"
          name="text"
          rows={5}
          className="block w-full rounded-lg border border-border-strong bg-surface px-3 py-2 font-mono text-sm"
          placeholder={"Asha Rao, asha@example.com, +91 98765 43210\nVikram Iyer, vikram@example.com"}
        />
      </Field>
      <Field label="…or upload a CSV file" htmlFor="imp-file">
        <Input id="imp-file" name="file" type="file" accept=".csv,text/csv,text/plain" />
      </Field>
      <div className="flex justify-end">
        <SubmitButton pendingText="Importing…">Import guests</SubmitButton>
      </div>
    </ActionForm>
  );
}
