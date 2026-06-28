import { tryNormalizeSubscriptionUrlInput } from "@subboost/core/subscription/url-input";

type ProxyProviderType = "http" | "file" | "inline";

const DEFAULT_HEALTH_CHECK = {
  enable: true,
  lazy: true,
};

/**
 * 从订阅的结构化配置里提取 proxy-providers（proxy-providers模式）。
 *
 * 注意：
 * - 仅对 sources 里标记 useProxyProviders=true 的 URL 源生效
 * - 不触发任何出站请求
 * - provider key 需是安全字符串（避免 YAML key 解析问题）
 */

export function buildProxyProvidersFromConfig(
  config: Record<string, unknown>,
  opts: { testUrl: string; testInterval: number }
): Record<string, unknown> | undefined {
  const rawSources = Array.isArray(config.sources) ? config.sources : [];
  if (rawSources.length === 0) return undefined;

  const out: Record<string, unknown> = {};
  let fallbackIndex = 0;

  for (const raw of rawSources) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    if (item.type !== "url" && item.type !== "yaml" && item.type !== "nodes") continue;
    if (item.useProxyProviders !== true) continue;

    const providerConfig = isRecord(item.proxyProvider) ? item.proxyProvider : {};
    const providerType = normalizeProviderType(providerConfig.type) ?? "http";
    const explicitName = normalizeOptionalString(providerConfig.name);
    const rawId = firstString(explicitName, item.sourceKey, item.id);
    const id = rawId || String(++fallbackIndex);
    const safeId = normalizeProviderName(id);
    if (!safeId) continue;
    const name = explicitName ? safeId : safeId.startsWith("url_") ? safeId : `url_${safeId}`;
    if (Object.prototype.hasOwnProperty.call(out, name)) continue;

    const provider = buildProviderEntry(item, providerConfig, providerType, name, opts);
    if (provider) out[name] = provider;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

function buildProviderEntry(
  item: Record<string, unknown>,
  providerConfig: Record<string, unknown>,
  providerType: ProxyProviderType,
  name: string,
  opts: { testUrl: string; testInterval: number }
): Record<string, unknown> | null {
  const out: Record<string, unknown> = { type: providerType };

  const url = normalizeProviderUrl(firstString(providerConfig.url, item.content));
  if (providerType === "http") {
    if (!url) return null;
    out.url = url;
  } else if (url) {
    out.url = url;
  }

  const path = normalizeOptionalString(providerConfig.path) || `./proxy_providers/${name}.yaml`;
  if (providerType !== "inline" || normalizeOptionalString(providerConfig.path)) out.path = path;

  assignInteger(out, "interval", providerConfig.interval, providerType === "http" ? 3600 : undefined);
  assignString(out, "proxy", providerConfig.proxy);
  assignInteger(out, "size-limit", providerConfig["size-limit"]);
  assignString(out, "age-secret-key", providerConfig["age-secret-key"]);
  assignProviderHeaders(out, providerConfig.header);
  assignHealthCheck(out, providerConfig["health-check"], opts);
  assignString(out, "filter", providerConfig.filter);
  assignString(out, "exclude-filter", providerConfig["exclude-filter"]);
  assignString(out, "exclude-type", providerConfig["exclude-type"]);
  assignRecord(out, "override", providerConfig.override);
  assignPayload(out, providerConfig.payload);
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    const normalized = normalizeOptionalString(value);
    if (normalized) return normalized;
  }
  return "";
}

function normalizeOptionalString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeProviderType(value: unknown): ProxyProviderType | null {
  return value === "http" || value === "file" || value === "inline" ? value : null;
}

function normalizeProviderName(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]/g, "_").replace(/^_+|_+$/g, "");
}

function normalizeProviderUrl(value: string): string {
  const url = tryNormalizeSubscriptionUrlInput(value) ?? value.trim();
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) ? url : "";
  } catch {
    return "";
  }
}

function assignString(out: Record<string, unknown>, key: string, value: unknown) {
  const normalized = normalizeOptionalString(value);
  if (normalized) out[key] = normalized;
}

function assignInteger(out: Record<string, unknown>, key: string, value: unknown, fallback?: number) {
  const numeric = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : fallback;
  if (typeof numeric !== "number" || !Number.isFinite(numeric) || numeric < 0) return;
  out[key] = Math.floor(numeric);
}

function assignRecord(out: Record<string, unknown>, key: string, value: unknown) {
  if (!isRecord(value) || Object.keys(value).length === 0) return;
  out[key] = value;
}

function assignProviderHeaders(out: Record<string, unknown>, value: unknown) {
  if (!isRecord(value)) return;
  const header: Record<string, string[]> = {};
  for (const [key, raw] of Object.entries(value)) {
    const name = key.trim();
    if (!name) continue;
    const values = Array.isArray(raw) ? raw : [raw];
    const normalized = values
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
    if (normalized.length > 0) header[name] = normalized;
  }
  if (Object.keys(header).length > 0) out.header = header;
}

function assignHealthCheck(out: Record<string, unknown>, value: unknown, opts: { testUrl: string; testInterval: number }) {
  const raw = isRecord(value) ? value : {};
  if (raw.enable === false) {
    out["health-check"] = { enable: false };
    return;
  }
  const healthCheck: Record<string, unknown> = { ...DEFAULT_HEALTH_CHECK, enable: true };
  healthCheck.url = normalizeOptionalString(raw.url) || opts.testUrl;
  assignInteger(healthCheck, "interval", raw.interval, opts.testInterval);
  assignInteger(healthCheck, "timeout", raw.timeout);
  if (typeof raw.lazy === "boolean") healthCheck.lazy = raw.lazy;
  assignInteger(healthCheck, "expected-status", raw["expected-status"]);
  out["health-check"] = healthCheck;
}

function assignPayload(out: Record<string, unknown>, value: unknown) {
  if (!Array.isArray(value)) return;
  const payload = value.filter(isRecord);
  if (payload.length > 0) out.payload = payload;
}
