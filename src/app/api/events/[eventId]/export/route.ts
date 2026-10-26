import { hostRoute } from "@/server/http/api";
import { invalid } from "@/server/lib/errors";
import { EXPORT_KINDS, exportCsv, type ExportKind } from "@/server/modules/exports";

/** ?kind=guests|accommodation|meals|transport — streamed CSV, organizers and owners only. */
export const GET = hostRoute<{ eventId: string }>(async ({ req, db, user, params }) => {
  const kind = (req.nextUrl.searchParams.get("kind") ?? "guests") as ExportKind;
  if (!EXPORT_KINDS.includes(kind)) throw invalid("Unknown export kind.");
  const { filename, stream } = await exportCsv(db, user.id, params.eventId, kind);
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});
