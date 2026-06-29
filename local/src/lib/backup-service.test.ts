import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  decryptJson: vi.fn(),
  decryptText: vi.fn(),
  encryptJson: vi.fn(),
  encryptText: vi.fn(),
  parseSubBoostTemplateYaml: vi.fn(),
  prisma: {
    subscription: {
      findMany: vi.fn(),
    },
    localTemplate: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("./crypto", () => ({
  decryptJson: mocks.decryptJson,
  decryptText: mocks.decryptText,
  encryptJson: mocks.encryptJson,
  encryptText: mocks.encryptText,
}));

vi.mock("@subboost/core/templates/config-yaml", () => ({
  parseSubBoostTemplateYaml: mocks.parseSubBoostTemplateYaml,
}));

vi.mock("./prisma", () => ({ prisma: mocks.prisma }));

import { exportLocalBackup, importLocalBackup } from "./backup-service";

function subscriptionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub-1",
    ownerId: "owner-1",
    name: "Main",
    token: "token-1",
    isPrimary: true,
    encryptedUrls: "encrypted-urls",
    encryptedNodes: "encrypted-nodes",
    encryptedConfig: "encrypted-config",
    encryptedSubscriptionInfo: "encrypted-info",
    autoUpdateInterval: 3600,
    cacheExpiresAt: null,
    lastAccessedAt: null,
    lastUpdatedAt: null,
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    updatedAt: new Date("2026-06-01T01:00:00.000Z"),
    ...overrides,
  };
}

function templateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "tpl-1",
    ownerId: "owner-1",
    name: "Template",
    description: "desc",
    encryptedConfig: "encrypted-yaml",
    createdAt: new Date("2026-06-02T00:00:00.000Z"),
    updatedAt: new Date("2026-06-02T01:00:00.000Z"),
    ...overrides,
  };
}

describe("backup service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.subscription.findMany.mockResolvedValue([subscriptionRow()]);
    mocks.prisma.localTemplate.findMany.mockResolvedValue([templateRow()]);
    mocks.decryptJson.mockImplementation((value: string | null | undefined, fallback: unknown) => {
      if (value === "encrypted-urls") return ["https://example.com/sub"];
      if (value === "encrypted-nodes") return [{ name: "Node" }];
      if (value === "encrypted-config") return { template: "full" };
      if (value === "encrypted-info") return { total: 1024 };
      return fallback;
    });
    mocks.decryptText.mockReturnValue("template: full\n");
    mocks.encryptJson.mockImplementation((value: unknown) => `json:${JSON.stringify(value)}`);
    mocks.encryptText.mockImplementation((value: string) => `text:${value}`);
    mocks.parseSubBoostTemplateYaml.mockImplementation((yaml: string) =>
      yaml === "bad"
        ? { ok: false, error: "bad yaml" }
        : {
            ok: true,
            yaml,
            config: {},
          },
    );
    mocks.prisma.$transaction.mockImplementation(async (callback) =>
      callback({
        subscription: {
          create: vi.fn(),
          deleteMany: vi.fn(),
        },
        localTemplate: {
          create: vi.fn(),
          deleteMany: vi.fn(),
        },
      }),
    );
  });

  it("exports subscriptions and templates as a portable local backup", async () => {
    const backup = await exportLocalBackup("owner-1");

    expect(mocks.prisma.subscription.findMany).toHaveBeenCalledWith({
      where: { ownerId: "owner-1" },
      orderBy: { updatedAt: "desc" },
    });
    expect(mocks.prisma.localTemplate.findMany).toHaveBeenCalledWith({
      where: { ownerId: "owner-1" },
      orderBy: { updatedAt: "desc" },
    });
    expect(backup).toMatchObject({
      schema: "subboost-local-backup/v1",
      app: { name: "subboost", mode: "local" },
      data: {
        subscriptions: [
          {
            name: "Main",
            urls: ["https://example.com/sub"],
            nodes: [{ name: "Node" }],
            config: { template: "full" },
            subscriptionInfo: { total: 1024 },
            autoUpdateInterval: 3600,
            isPrimary: true,
            createdAt: "2026-06-01T00:00:00.000Z",
            updatedAt: "2026-06-01T01:00:00.000Z",
          },
        ],
        templates: [
          {
            name: "Template",
            description: "desc",
            yaml: "template: full\n",
            createdAt: "2026-06-02T00:00:00.000Z",
            updatedAt: "2026-06-02T01:00:00.000Z",
          },
        ],
      },
    });
  });

  it("imports backups in append mode and skips empty subscriptions", async () => {
    const tx = {
      subscription: {
        create: vi.fn(),
        deleteMany: vi.fn(),
      },
      localTemplate: {
        create: vi.fn(),
        deleteMany: vi.fn(),
      },
    };
    mocks.prisma.$transaction.mockImplementationOnce(async (callback) => callback(tx));

    await expect(
      importLocalBackup("owner-1", {
        mode: "append",
        backup: {
          schema: "subboost-local-backup/v1",
          data: {
            subscriptions: [
              { name: "Empty", urls: [], nodes: [], config: {} },
              { name: "Imported", urls: ["https://example.com/sub"], nodes: [], config: { template: "full" } },
            ],
            templates: [
              { name: "Tpl", description: "desc", yaml: "template: full\n" },
              { name: "Bad", description: "", yaml: "bad" },
            ],
          },
        },
      }),
    ).resolves.toEqual({
      subscriptions: { imported: 1, skipped: 1 },
      templates: { imported: 1, skipped: 1 },
    });

    expect(tx.subscription.deleteMany).not.toHaveBeenCalled();
    expect(tx.localTemplate.deleteMany).not.toHaveBeenCalled();
    expect(tx.subscription.create).toHaveBeenCalledWith({
      data: {
        ownerId: "owner-1",
        name: "Imported",
        isPrimary: false,
        encryptedUrls: 'json:["https://example.com/sub"]',
        encryptedNodes: "json:[]",
        encryptedConfig: 'json:{"template":"full"}',
        encryptedSubscriptionInfo: "json:{}",
        autoUpdateInterval: null,
      },
    });
    expect(tx.localTemplate.create).toHaveBeenCalledWith({
      data: {
        ownerId: "owner-1",
        name: "Tpl",
        description: "desc",
        encryptedConfig: "text:template: full\n",
      },
    });
  });

  it("supports replace mode and rejects invalid backup files", async () => {
    const tx = {
      subscription: {
        create: vi.fn(),
        deleteMany: vi.fn(),
      },
      localTemplate: {
        create: vi.fn(),
        deleteMany: vi.fn(),
      },
    };
    mocks.prisma.$transaction.mockImplementationOnce(async (callback) => callback(tx));

    await expect(
      importLocalBackup("owner-1", {
        mode: "replace",
        backup: {
          schema: "subboost-local-backup/v1",
          data: {
            subscriptions: [{ name: "Primary", urls: ["https://example.com/sub"], isPrimary: true }],
            templates: [],
          },
        },
      }),
    ).resolves.toEqual({
      subscriptions: { imported: 1, skipped: 0 },
      templates: { imported: 0, skipped: 0 },
    });

    expect(tx.subscription.deleteMany).toHaveBeenCalledWith({ where: { ownerId: "owner-1" } });
    expect(tx.localTemplate.deleteMany).toHaveBeenCalledWith({ where: { ownerId: "owner-1" } });
    expect(tx.subscription.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isPrimary: true }),
      }),
    );

    await expect(importLocalBackup("owner-1", { backup: { schema: "wrong", data: {} } })).rejects.toThrow(
      "Invalid backup file.",
    );
  });
});
