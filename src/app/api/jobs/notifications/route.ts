import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http/api";
import { processDueNotifications } from "@/server/modules/notifications";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Processes due notification jobs. Call from a scheduler with `Authorization: Bearer $CRON_SECRET`. */
async function handler(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: { code: "unauthenticated", message: "Unauthorized." } }, { status: 401 });
  try {
    return NextResponse.json(await processDueNotifications(await getDb(), 100));
  } catch (e) {
    return errorResponse(e);
  }
}

export const GET = handler;
export const POST = handler;
