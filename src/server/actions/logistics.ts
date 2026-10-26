"use server";

import { refresh } from "next/cache";
import { getDb } from "../db/client";
import { requireUser } from "../auth/session";
import * as l from "../modules/logistics";
import { bool, optStr, runAction, str, strs, type ActionState } from "./run";

export async function saveMealAction(eventId: string, mealId: string | null, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const db = await getDb();
    const input = {
      name: str(fd, "name"),
      serviceDate: str(fd, "serviceDate"),
      serviceTime: optStr(fd, "serviceTime"),
      basis: str(fd, "basis") || "activity",
      activityIds: strs(fd, "activityIds"),
      guestCanOptOut: bool(fd, "guestCanOptOut"),
    };
    if (mealId) await l.updateMeal(db, user.id, mealId, input);
    else await l.createMeal(db, user.id, eventId, input);
    refresh();
    return { ok: true, message: mealId ? "Meal updated." : "Meal added." };
  });
}

export async function deleteMealAction(mealId: string) {
  const user = await requireUser();
  await l.deleteMeal(await getDb(), user.id, mealId);
  refresh();
}

export async function createAssignmentAction(eventId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    await l.createAssignment(await getDb(), user.id, eventId, {
      requestId: str(fd, "requestId"),
      propertyName: str(fd, "propertyName"),
      roomReference: optStr(fd, "roomReference"),
      checkInDate: str(fd, "checkInDate"),
      checkOutDate: str(fd, "checkOutDate"),
      status: str(fd, "status") || "held",
    });
    refresh();
    return { ok: true, message: "Room assigned." };
  });
}

export async function setAssignmentStatusAction(assignmentId: string, status: "held" | "confirmed" | "cancelled") {
  const user = await requireUser();
  await l.setAssignmentStatus(await getDb(), user.id, assignmentId, status);
  refresh();
}

export async function setTransportStatusAction(requestId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    await l.setTransportStatus(await getDb(), user.id, requestId, {
      status: (str(fd, "status") || "assigned") as "requested" | "assigned",
      assignmentNote: optStr(fd, "assignmentNote"),
    });
    refresh();
    return { ok: true };
  });
}

export async function createQuestionAction(eventId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    await l.createQuestion(await getDb(), user.id, eventId, {
      questionText: str(fd, "questionText"),
      questionType: str(fd, "questionType") || "short_text",
      options: str(fd, "options")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      isRequired: bool(fd, "isRequired"),
      activityId: optStr(fd, "activityId"),
    });
    refresh();
    return { ok: true, message: "Question added." };
  });
}

export async function deleteQuestionAction(questionId: string) {
  const user = await requireUser();
  await l.deleteQuestion(await getDb(), user.id, questionId);
  refresh();
}
