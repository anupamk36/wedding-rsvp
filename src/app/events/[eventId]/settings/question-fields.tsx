"use client";

import { useState } from "react";
import { Checkbox, Field, Select, Textarea } from "@/components/ui";

export function QuestionTypeFields({ activities }: { activities: { id: string; name: string }[] }) {
  const [type, setType] = useState("short_text");
  const needsOptions = type === "single_choice" || type === "multi_choice";
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Answer type" htmlFor="questionType">
          <Select id="questionType" name="questionType" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="short_text">Short answer</option>
            <option value="long_text">Paragraph</option>
            <option value="single_choice">One choice</option>
            <option value="multi_choice">Several choices</option>
            <option value="boolean">Yes / no</option>
            <option value="number">Number</option>
          </Select>
        </Field>
        <Field label="Show for" htmlFor="activityId">
          <Select id="activityId" name="activityId" defaultValue="">
            <option value="">Everyone</option>
            {activities.map((a) => (
              <option key={a.id} value={a.id}>
                People attending {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-end pb-2">
          <Checkbox name="isRequired" label="Required" />
        </div>
      </div>
      {needsOptions && (
        <Field label="Options" htmlFor="options" hint="One per line.">
          <Textarea id="options" name="options" rows={3} required />
        </Field>
      )}
    </>
  );
}
