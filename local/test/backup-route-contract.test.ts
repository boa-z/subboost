import { beforeEach, describe, expect, it, vi } from "vitest";

import { getCurrentAdmin } from "@local/lib/auth";
import { exportLocalBackup, importLocalBackup } from "@local/lib/backup-service";
import * as backupRoute from "../app/api/backup/route";

vi.mock("@local/lib/auth", () => ({
  getCurrentAdmin: vi.fn(),
}));

vi.mock("@local/lib/backup-service", () => ({
  exportLocalBackup: vi.fn(),
  importLocalBackup: vi.fn(),
}));

const admin = { id: "admin-1", username: "root" };

function jsonRequest(body: unknown): Request {
  return new Request("http://local.test/api/backup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("backup route contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentAdmin).mockResolvedValue(admin);
    vi.mocked(exportLocalBackup).mockResolvedValue({
      schema: "subboost-local-backup/v1",
      exportedAt: "2026-06-01T00:00:00.000Z",
      app: { name: "subboost", mode: "local" },
      data: { subscriptions: [], templates: [] },
    });
    vi.mocked(importLocalBackup).mockResolvedValue({
      subscriptions: { imported: 1, skipped: 0 },
      templates: { imported: 2, skipped: 0 },
    });
  });

  it("exports and imports local backups for authenticated admins", async () => {
    const exportResponse = await backupRoute.GET();
    expect(exportResponse.status).toBe(200);
    expect(exportResponse.headers.get("content-type")).toContain("application/json");
    expect(exportResponse.headers.get("content-disposition")).toContain("subboost-backup-");
    expect(exportLocalBackup).toHaveBeenCalledWith("admin-1");
    await expect(exportResponse.json()).resolves.toMatchObject({
      schema: "subboost-local-backup/v1",
      data: { subscriptions: [], templates: [] },
    });

    const payload = { mode: "append", backup: { schema: "subboost-local-backup/v1", data: {} } };
    const importResponse = await backupRoute.POST(jsonRequest(payload));
    expect(importResponse.status).toBe(200);
    expect(importLocalBackup).toHaveBeenCalledWith("admin-1", payload);
    await expect(importResponse.json()).resolves.toEqual({
      result: {
        subscriptions: { imported: 1, skipped: 0 },
        templates: { imported: 2, skipped: 0 },
      },
    });
  });

  it("rejects unauthenticated backup requests before service calls", async () => {
    vi.mocked(getCurrentAdmin).mockResolvedValue(null);

    const exportResponse = await backupRoute.GET();
    const importResponse = await backupRoute.POST(jsonRequest({}));

    for (const response of [exportResponse, importResponse]) {
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        error: "Authentication required.",
        code: "UNAUTHORIZED",
      });
    }
    expect(exportLocalBackup).not.toHaveBeenCalled();
    expect(importLocalBackup).not.toHaveBeenCalled();
  });

  it("reports invalid import payloads", async () => {
    let response = await backupRoute.POST(
      new Request("http://local.test/api/backup", {
        method: "POST",
        body: "{",
      }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid JSON body.",
      code: "BAD_REQUEST",
    });

    vi.mocked(importLocalBackup).mockRejectedValueOnce(new Error("Invalid backup file."));
    response = await backupRoute.POST(jsonRequest({ backup: {} }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid backup file.",
      code: "BAD_REQUEST",
    });
  });
});
