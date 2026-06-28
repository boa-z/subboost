"use client";

import * as Popover from "@radix-ui/react-popover";
import { HelpCircle } from "lucide-react";
import { Button } from "@subboost/ui/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@subboost/ui/components/ui/dialog";
import { Input } from "@subboost/ui/components/ui/input";
import { Switch } from "@subboost/ui/components/ui/switch";
import { Textarea } from "@subboost/ui/components/ui/textarea";
import { DEFAULT_NODE_NAME_TEMPLATE } from "@subboost/core/node-name-template";
import type { SubscriptionSource } from "@subboost/ui/store/config-store";
import { sourceTypeInfo } from "../constants";

type InputSourceEditorDialogProps = {
  source: SubscriptionSource | null;
  previewName: string;
  onClose: () => void;
  onUpdateContent: (id: string, content: string) => void;
  onUpdateMeta: (id: string, patch: Partial<SubscriptionSource>) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function boolValue(value: unknown, fallback = true): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function updateRecordValue(record: Record<string, unknown>, key: string, value: unknown): Record<string, unknown> {
  const next = { ...record };
  if (typeof value === "string" && value.trim() === "") {
    delete next[key];
  } else if (value === undefined || value === null) {
    delete next[key];
  } else {
    next[key] = value;
  }
  return next;
}

function formatJson(value: unknown, fallback: unknown): string {
  const target = value === undefined ? fallback : value;
  return JSON.stringify(target, null, 2);
}

function parseJsonInput(value: string): unknown | undefined {
  const raw = value.trim();
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function InputSourceEditorDialog({
  source,
  previewName,
  onClose,
  onUpdateContent,
  onUpdateMeta,
}: InputSourceEditorDialogProps) {
  const provider = asRecord(source?.proxyProvider);
  const healthCheck = asRecord(provider["health-check"]);
  const header = asRecord(provider.header);

  const updateProvider = (patch: Record<string, unknown>) => {
    if (!source) return;
    onUpdateMeta(source.id, { proxyProvider: { ...provider, ...patch } });
  };

  const updateProviderField = (key: string, value: unknown) => {
    if (!source) return;
    onUpdateMeta(source.id, { proxyProvider: updateRecordValue(provider, key, value) });
  };

  const updateHealthCheckField = (key: string, value: unknown) => {
    updateProviderField("health-check", updateRecordValue(healthCheck, key, value));
  };

  const updateHeaderField = (key: string, value: string) => {
    updateProviderField("header", updateRecordValue(header, key, value));
  };

  return (
    <Dialog
      open={Boolean(source)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {source ? `高级编辑：${sourceTypeInfo[source.type].label}` : "高级编辑"}
          </DialogTitle>
        </DialogHeader>

        {source && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-1">
                <div className="text-xs text-white/60">标签（tag）</div>
                <Input
                  value={source.tag ?? ""}
                  onChange={(e) => onUpdateMeta(source.id, { tag: e.target.value })}
                  placeholder="例如：A / 订阅1 / 自建1"
                  className="text-xs"
                />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-white/60">来源标识</div>
                <Input
                  value={source.sourceKey ?? ""}
                  onChange={(e) => onUpdateMeta(source.id, { sourceKey: e.target.value })}
                  placeholder="例如：airport-a"
                  className="text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-white/60">节点命名模板</div>
                  <Input
                    value={source.nameTemplate ?? DEFAULT_NODE_NAME_TEMPLATE}
                    onChange={(e) => onUpdateMeta(source.id, { nameTemplate: e.target.value })}
                    className="text-xs font-mono"
                  />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-white/60">预览</div>
                <Input value={previewName} readOnly className="text-xs font-mono" />
              </div>
            </div>

            <div className="text-[11px] text-white/40">
              来源标识用于节点池/分流组筛选，建议长期保持不变。可用占位符：{"{tag}"}、{"{name}"}；留空则默认：{DEFAULT_NODE_NAME_TEMPLATE}
            </div>

            <div className="space-y-1">
              <div className="text-xs text-white/60">{sourceTypeInfo[source.type].label}</div>
              {source.type === "url" ? (
                <div className="space-y-3">
                  <Input
                    value={source.content}
                    onChange={(e) => onUpdateContent(source.id, e.target.value)}
                    placeholder={sourceTypeInfo[source.type].placeholder}
                    className="text-xs"
                  />

                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-xs font-medium text-white/80">节点拉取方式</div>
                        <div className="text-[11px] text-white/40">
                          普通模式由 SubBoost 拉取并管理节点；provider 模式由 Mihomo 客户端拉取节点。
                        </div>
                      </div>
                      <Popover.Root>
                        <Popover.Trigger asChild>
                          <button
                            type="button"
                            className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/40 transition-colors hover:bg-white/10 hover:text-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                            aria-label="proxy-providers 模式说明"
                            title="proxy-providers 模式说明"
                          >
                            <HelpCircle className="h-3.5 w-3.5" />
                          </button>
                        </Popover.Trigger>
                        <Popover.Portal>
                          <Popover.Content
                            side="bottom"
                            align="end"
                            sideOffset={8}
                            className="z-50 w-[360px] rounded-xl border border-white/10 bg-black/90 backdrop-blur-md shadow-2xl p-3"
                          >
                            <div className="space-y-2 text-xs">
                              <div className="flex items-center gap-2">
                                <HelpCircle className="h-4 w-4 text-amber-300" />
                                <div className="text-white font-medium">proxy-providers 模式</div>
                              </div>
                              <div className="text-white/60 leading-relaxed">
                                开启后 SubBoost 不再拉取/解析该 url，而是在最终配置中写入{" "}
                                <span className="font-mono">proxy-providers</span>，交由客户端自行拉取节点。
                              </div>
                              <div className="pt-2 border-t border-white/10 text-white/60 space-y-1">
                                <div className="font-medium text-white/80">注意开启后：</div>
                                <ul className="ml-4 list-disc space-y-1">
                                  <li>无法在预览中查看/管理该 url 的节点</li>
                                  <li>无法将这些节点用于中转代理组、分流组精细配置等高级功能</li>
                                  <li>节点命名模板与 tag 在该模式下不生效</li>
                                </ul>
                              </div>
                            </div>
                            <Popover.Arrow className="fill-white/10" />
                          </Popover.Content>
                        </Popover.Portal>
                      </Popover.Root>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button
                        type="button"
                        variant="ghost"
                        title="SubBoost 管理节点"
                        onClick={() => onUpdateMeta(source.id, { useProxyProviders: false })}
                        className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                          !source.useProxyProviders
                            ? "border-indigo-400/60 bg-indigo-500/15 text-indigo-100"
                            : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
                        }`}
                      >
                        <div className="text-xs font-medium">SubBoost 管理节点</div>
                        <div className="mt-1 text-[11px] opacity-75">可预览、改名、参与节点池与中转组</div>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        title="客户端 proxy-provider"
                        onClick={() => onUpdateMeta(source.id, { useProxyProviders: true })}
                        className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                          source.useProxyProviders
                            ? "border-amber-400/60 bg-amber-500/15 text-amber-100"
                            : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
                        }`}
                      >
                        <div className="text-xs font-medium">客户端 proxy-provider</div>
                        <div className="mt-1 text-[11px] opacity-75">生成 provider，客户端自行拉取节点</div>
                      </Button>
                    </div>
                  </div>

                  {source.useProxyProviders && (
                    <div className="space-y-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] p-3">
                      <div className="flex flex-col gap-1">
                        <div className="text-xs font-medium text-amber-100">Proxy Provider 配置</div>
                        <div className="text-[11px] text-amber-100/60">
                          留空时会使用安全默认值；生成配置时会自动合并到 proxy-providers，并加入代理组 use。
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="space-y-1">
                          <div className="text-xs text-white/60">Provider 名称</div>
                          <Input
                            value={stringValue(provider.name)}
                            onChange={(e) => updateProviderField("name", e.target.value)}
                            placeholder={source.sourceKey || "airport-a"}
                            className="text-xs font-mono"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-white/60">类型</div>
                          <div className="grid grid-cols-3 gap-1">
                            {(["http", "file", "inline"] as const).map((type) => (
                              <button
                                key={type}
                                type="button"
                                onClick={() => updateProvider({ type })}
                                className={`h-9 rounded-md border text-xs transition-colors ${
                                  (provider.type ?? "http") === type
                                    ? "border-indigo-400/60 bg-indigo-500/20 text-indigo-100"
                                    : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
                                }`}
                              >
                                {type}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-white/60">更新间隔</div>
                          <Input
                            value={stringValue(provider.interval)}
                            onChange={(e) => updateProviderField("interval", e.target.value)}
                            placeholder="3600"
                            className="text-xs font-mono"
                          />
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <div className="text-xs text-white/60">Provider URL（默认使用上方订阅 URL）</div>
                          <Input
                            value={stringValue(provider.url)}
                            onChange={(e) => updateProviderField("url", e.target.value)}
                            placeholder={source.content || "https://example.com/sub"}
                            className="text-xs font-mono"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-white/60">保存路径</div>
                          <Input
                            value={stringValue(provider.path)}
                            onChange={(e) => updateProviderField("path", e.target.value)}
                            placeholder="./proxy_providers/airport-a.yaml"
                            className="text-xs font-mono"
                          />
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-4">
                        <div className="space-y-1">
                          <div className="text-xs text-white/60">下载代理</div>
                          <Input
                            value={stringValue(provider.proxy)}
                            onChange={(e) => updateProviderField("proxy", e.target.value)}
                            placeholder="DIRECT"
                            className="text-xs font-mono"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-white/60">filter</div>
                          <Input
                            value={stringValue(provider.filter)}
                            onChange={(e) => updateProviderField("filter", e.target.value)}
                            placeholder="(?i)港|hk"
                            className="text-xs font-mono"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-white/60">exclude-filter</div>
                          <Input
                            value={stringValue(provider["exclude-filter"])}
                            onChange={(e) => updateProviderField("exclude-filter", e.target.value)}
                            placeholder="过期|官网"
                            className="text-xs font-mono"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-white/60">exclude-type</div>
                          <Input
                            value={stringValue(provider["exclude-type"])}
                            onChange={(e) => updateProviderField("exclude-type", e.target.value)}
                            placeholder="ss|http"
                            className="text-xs font-mono"
                          />
                        </div>
                      </div>

                      <div className="rounded-md border border-white/10 bg-black/10 p-3">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <div>
                            <div className="text-xs font-medium text-white/80">健康检查</div>
                            <div className="text-[11px] text-white/40">默认会使用全局测试地址和测试间隔。</div>
                          </div>
                          <Switch
                            checked={healthCheck.enable !== false}
                            onCheckedChange={(checked) => updateHealthCheckField("enable", Boolean(checked))}
                          />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-5">
                          <Input
                            value={stringValue(healthCheck.url)}
                            onChange={(e) => updateHealthCheckField("url", e.target.value)}
                            placeholder="https://www.gstatic.com/generate_204"
                            className="text-xs font-mono sm:col-span-2"
                          />
                          <Input
                            value={stringValue(healthCheck.interval)}
                            onChange={(e) => updateHealthCheckField("interval", e.target.value)}
                            placeholder="300"
                            className="text-xs font-mono"
                          />
                          <Input
                            value={stringValue(healthCheck.timeout)}
                            onChange={(e) => updateHealthCheckField("timeout", e.target.value)}
                            placeholder="5000"
                            className="text-xs font-mono"
                          />
                          <Input
                            value={stringValue(healthCheck["expected-status"])}
                            onChange={(e) => updateHealthCheckField("expected-status", e.target.value)}
                            placeholder="204"
                            className="text-xs font-mono"
                          />
                        </div>
                        <label className="mt-2 flex items-center justify-end gap-2 text-xs text-white/60">
                          lazy
                          <Switch
                            checked={boolValue(healthCheck.lazy, true)}
                            onCheckedChange={(checked) => updateHealthCheckField("lazy", Boolean(checked))}
                          />
                        </label>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <div className="text-xs text-white/60">User-Agent</div>
                          <Input
                            value={stringValue(header["User-Agent"])}
                            onChange={(e) => updateHeaderField("User-Agent", e.target.value)}
                            placeholder="mihomo/1.18.3"
                            className="text-xs font-mono"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-white/60">Authorization</div>
                          <Input
                            value={stringValue(header.Authorization)}
                            onChange={(e) => updateHeaderField("Authorization", e.target.value)}
                            placeholder="token xxx"
                            className="text-xs font-mono"
                          />
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <div className="text-xs text-white/60">override JSON</div>
                          <Textarea
                            value={formatJson(provider.override, {})}
                            onChange={(e) => {
                              const parsed = parseJsonInput(e.target.value);
                              if (parsed !== null) updateProviderField("override", parsed);
                            }}
                            className="min-h-28 text-xs font-mono"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-white/60">payload JSON</div>
                          <Textarea
                            value={formatJson(provider.payload, [])}
                            onChange={(e) => {
                              const parsed = parseJsonInput(e.target.value);
                              if (parsed !== null) updateProviderField("payload", parsed);
                            }}
                            className="min-h-28 text-xs font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {!source.useProxyProviders && (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <div className="text-xs text-white/60">流量/到期信息 URL（可选）</div>
                          <Input
                            value={source.userinfoUrl ?? ""}
                            onChange={(e) => onUpdateMeta(source.id, { userinfoUrl: e.target.value })}
                            placeholder="留空则默认使用当前订阅源 URL"
                            className="text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-white/60">流量信息 User-Agent（可选）</div>
                          <Input
                            value={source.userinfoUserAgent ?? ""}
                            onChange={(e) => onUpdateMeta(source.id, { userinfoUserAgent: e.target.value })}
                            placeholder="例如 clash.meta/v1.19.16"
                            className="text-xs"
                          />
                        </div>
                      </div>

                      <div className="text-[11px] text-white/40">
                        有些订阅源不会直接返回 <span className="font-mono">subscription-userinfo</span>，但会提供独立的流量接口。
                        设置后，SubBoost 会在导入/刷新时额外抓取该接口，用来更新这个源自己的流量与到期快照。
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <Textarea
                  value={source.content}
                  onChange={(e) => onUpdateContent(source.id, e.target.value)}
                  placeholder={sourceTypeInfo[source.type].placeholder}
                  className="min-h-[60vh] text-xs font-mono"
                />
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            完成
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
