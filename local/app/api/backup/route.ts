import { withCurrentAdmin } from "@local/lib/api-auth";
import { exportLocalBackup, importLocalBackup } from "@local/lib/backup-service";
import { apiError, json, readJsonBody } from "@local/lib/http";

function backupFilename(): string {
  return `subboost-backup-${new Date().toISOString().slice(0, 10)}.json`;
}

export async function GET() {
  return withCurrentAdmin(async (admin) => {
    const backup = await exportLocalBackup(admin.id);
    return new Response(JSON.stringify(backup, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${backupFilename()}"`,
        "Cache-Control": "no-store",
      },
    });
  });
}

export async function POST(request: Request) {
  return withCurrentAdmin(async (admin) => {
    const body = await readJsonBody(request);
    if (!body) return apiError("Invalid JSON body.", "BAD_REQUEST", 400);

    try {
      const result = await importLocalBackup(admin.id, body);
      return json({ result });
    } catch (error) {
      return apiError(error instanceof Error ? error.message : "Unable to import backup.", "BAD_REQUEST", 400);
    }
  });
}
