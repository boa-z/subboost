import { parseSubBoostTemplateYaml } from "@subboost/core/templates/config-yaml";
import { decryptJson, decryptText, encryptJson, encryptText } from "./crypto";
import { prisma } from "./prisma";

const BACKUP_SCHEMA = "subboost-local-backup/v1";

type BackupSubscription = {
  name: string;
  urls: unknown[];
  nodes: unknown[];
  config: Record<string, unknown>;
  subscriptionInfo: Record<string, unknown>;
  autoUpdateInterval: number | null;
  isPrimary: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

type BackupTemplate = {
  name: string;
  description: string;
  yaml: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type LocalBackupFile = {
  schema: typeof BACKUP_SCHEMA;
  exportedAt: string;
  app: {
    name: "subboost";
    mode: "local";
  };
  data: {
    subscriptions: BackupSubscription[];
    templates: BackupTemplate[];
  };
};

export type ImportBackupResult = {
  subscriptions: {
    imported: number;
    skipped: number;
  };
  templates: {
    imported: number;
    skipped: number;
  };
};

type ImportMode = "append" | "replace";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function asIsoString(value: unknown): string | null {
  if (!(value instanceof Date)) return null;
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

function asRecordValue(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asArrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeBackupSubscription(value: unknown): BackupSubscription | null {
  if (!isRecord(value)) return null;
  const name = asString(value.name);
  if (!name) return null;
  return {
    name: name.slice(0, 100),
    urls: asArrayValue(value.urls),
    nodes: asArrayValue(value.nodes),
    config: asRecordValue(value.config),
    subscriptionInfo: asRecordValue(value.subscriptionInfo),
    autoUpdateInterval: typeof value.autoUpdateInterval === "number" ? value.autoUpdateInterval : null,
    isPrimary: value.isPrimary === true,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : null,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
  };
}

function normalizeBackupTemplate(value: unknown): BackupTemplate | null {
  if (!isRecord(value)) return null;
  const name = asString(value.name);
  const yaml = typeof value.yaml === "string" ? value.yaml : "";
  if (!name || !yaml.trim()) return null;
  return {
    name: name.slice(0, 100),
    description: asString(value.description).slice(0, 500),
    yaml,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : null,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
  };
}

function parseBackupPayload(payload: unknown): {
  subscriptions: BackupSubscription[];
  templates: BackupTemplate[];
} {
  if (!isRecord(payload) || payload.schema !== BACKUP_SCHEMA || !isRecord(payload.data)) {
    throw new Error("Invalid backup file.");
  }

  const subscriptions = asArrayValue(payload.data.subscriptions)
    .map(normalizeBackupSubscription)
    .filter((item): item is BackupSubscription => Boolean(item));
  const templates = asArrayValue(payload.data.templates)
    .map(normalizeBackupTemplate)
    .filter((item): item is BackupTemplate => Boolean(item));

  return { subscriptions, templates };
}

function parseImportMode(value: unknown): ImportMode {
  return value === "replace" ? "replace" : "append";
}

export async function exportLocalBackup(ownerId: string): Promise<LocalBackupFile> {
  const [subscriptions, templates] = await Promise.all([
    prisma.subscription.findMany({
      where: { ownerId },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.localTemplate.findMany({
      where: { ownerId },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return {
    schema: BACKUP_SCHEMA,
    exportedAt: new Date().toISOString(),
    app: {
      name: "subboost",
      mode: "local",
    },
    data: {
      subscriptions: subscriptions.map((subscription) => ({
        name: subscription.name,
        urls: decryptJson<unknown[]>(subscription.encryptedUrls, []),
        nodes: decryptJson<unknown[]>(subscription.encryptedNodes, []),
        config: asRecordValue(decryptJson<unknown>(subscription.encryptedConfig, {})),
        subscriptionInfo: asRecordValue(decryptJson<unknown>(subscription.encryptedSubscriptionInfo, {})),
        autoUpdateInterval: subscription.autoUpdateInterval,
        isPrimary: subscription.isPrimary,
        createdAt: asIsoString(subscription.createdAt),
        updatedAt: asIsoString(subscription.updatedAt),
      })),
      templates: templates.map((template) => ({
        name: template.name,
        description: template.description || "",
        yaml: decryptText(template.encryptedConfig),
        createdAt: asIsoString(template.createdAt),
        updatedAt: asIsoString(template.updatedAt),
      })),
    },
  };
}

export async function importLocalBackup(ownerId: string, body: unknown): Promise<ImportBackupResult> {
  if (!isRecord(body)) throw new Error("Invalid request body.");
  const mode = parseImportMode(body.mode);
  const parsed = parseBackupPayload(body.backup);

  return prisma.$transaction(async (tx) => {
    if (mode === "replace") {
      await tx.subscription.deleteMany({ where: { ownerId } });
      await tx.localTemplate.deleteMany({ where: { ownerId } });
    }

    let importedSubscriptions = 0;
    let skippedSubscriptions = 0;
    for (const subscription of parsed.subscriptions) {
      if (subscription.urls.length === 0 && subscription.nodes.length === 0) {
        skippedSubscriptions += 1;
        continue;
      }
      await tx.subscription.create({
        data: {
          ownerId,
          name: subscription.name,
          isPrimary: mode === "replace" ? subscription.isPrimary : false,
          encryptedUrls: encryptJson(subscription.urls),
          encryptedNodes: encryptJson(subscription.nodes),
          encryptedConfig: encryptJson(subscription.config),
          encryptedSubscriptionInfo: encryptJson(subscription.subscriptionInfo),
          autoUpdateInterval: subscription.autoUpdateInterval,
        },
      });
      importedSubscriptions += 1;
    }

    let importedTemplates = 0;
    let skippedTemplates = 0;
    for (const template of parsed.templates) {
      const parsedTemplate = parseSubBoostTemplateYaml(template.yaml);
      if (!parsedTemplate.ok) {
        skippedTemplates += 1;
        continue;
      }
      await tx.localTemplate.create({
        data: {
          ownerId,
          name: template.name,
          description: template.description,
          encryptedConfig: encryptText(parsedTemplate.yaml),
        },
      });
      importedTemplates += 1;
    }

    return {
      subscriptions: {
        imported: importedSubscriptions,
        skipped: skippedSubscriptions,
      },
      templates: {
        imported: importedTemplates,
        skipped: skippedTemplates,
      },
    };
  });
}
