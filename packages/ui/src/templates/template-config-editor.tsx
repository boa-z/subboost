"use client";

import * as React from "react";
import { FileCode, Globe2, ListChecks, Network, Plus, Route, Search, Settings2, Trash2 } from "lucide-react";
import { Button } from "@subboost/ui/components/ui/button";
import { Badge } from "@subboost/ui/components/ui/badge";
import { Input } from "@subboost/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@subboost/ui/components/ui/select";
import { Switch } from "@subboost/ui/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@subboost/ui/components/ui/tabs";
import { Textarea } from "@subboost/ui/components/ui/textarea";
import { stringifySubBoostTemplateConfig } from "@subboost/core/templates/config-yaml";
import { CUSTOM_RULE_TYPES, createCustomRuleId } from "@subboost/core/rules/custom-rule-utils";
import { PROXY_GROUP_MODULES } from "@subboost/core/generator/proxy-groups";
import { getModuleRuleOrderKey } from "@subboost/core/generator/module-rules";
import {
  DEFAULT_LOAD_BALANCE_STRATEGY,
  PROXY_GROUP_GROUP_TYPES,
  type BuiltinRuleEdit,
  type CustomProxyGroup,
  type CustomRule,
  type CustomRuleSet,
  type LoadBalanceStrategy,
  type ProxyGroupGroupType,
} from "@subboost/core/types/config";
import type { SubBoostTemplateConfig } from "@subboost/core/types/template-config";

type TemplateEditorSectionKey = "base" | "targetGroups" | "modules" | "rules" | "dns";

type Props = {
  config: SubBoostTemplateConfig;
  yaml: string;
  onConfigChange: (config: SubBoostTemplateConfig) => void;
  onYamlChange: (yaml: string) => void;
};

type RuleSetBehavior = CustomRuleSet["behavior"];

const GROUP_TYPE_LABELS: Record<ProxyGroupGroupType, string> = {
  select: "手动选择",
  "url-test": "自动测速",
  fallback: "故障转移",
  "load-balance": "负载均衡",
  "direct-first": "DIRECT 优先",
  "reject-first": "REJECT 优先",
};

const LOAD_BALANCE_STRATEGIES: LoadBalanceStrategy[] = ["consistent-hashing", "round-robin", "sticky-sessions"];

const LOAD_BALANCE_STRATEGY_LABELS: Record<LoadBalanceStrategy, string> = {
  "consistent-hashing": "一致性哈希",
  "round-robin": "轮询",
  "sticky-sessions": "会话保持",
};

function nextTemplateConfig(config: SubBoostTemplateConfig, patch: Partial<SubBoostTemplateConfig>): SubBoostTemplateConfig {
  return { ...config, ...patch };
}

function createCustomGroup(): CustomProxyGroup {
  const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    name: "新分流组",
    emoji: "",
    groupType: "select",
    memberSource: "filtered-nodes",
    includeInGroupMembers: true,
    advanced: {},
  };
}

function createRuleSet(target: string): CustomRuleSet {
  const id = `custom-ruleset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    name: "新规则集",
    behavior: "domain",
    path: "geosite/example.mrs",
    target,
  };
}

function getRoutingTargetOptions(config: SubBoostTemplateConfig): string[] {
  const customNames = config.customProxyGroups
    .filter((group) => group.enabled !== false)
    .map((group) => group.name.trim())
    .filter(Boolean);
  return Array.from(new Set(["DIRECT", "REJECT", ...customNames]));
}

function getModuleDisplayName(moduleId: string, config: SubBoostTemplateConfig): string {
  const proxyModule = PROXY_GROUP_MODULES.find((item) => item.id === moduleId);
  return config.proxyGroupNameOverrides?.[moduleId]?.trim() || proxyModule?.name || moduleId;
}

function getModuleRoutingTarget(moduleId: string, config: SubBoostTemplateConfig): string {
  const proxyModule = PROXY_GROUP_MODULES.find((item) => item.id === moduleId);
  if (!proxyModule) return getModuleDisplayName(moduleId, config);

  const targets = new Set<string>();
  for (const rule of proxyModule.rules) {
    const target = config.builtinRuleEdits?.[getModuleRuleOrderKey(proxyModule.id, rule.id)]?.target;
    if (typeof target === "string" && target.trim()) targets.add(target.trim());
  }
  if (targets.size === 1) return Array.from(targets)[0];
  return getModuleDisplayName(moduleId, config);
}

function setModuleRoutingTarget(
  config: SubBoostTemplateConfig,
  moduleId: string,
  target: string,
): NonNullable<SubBoostTemplateConfig["builtinRuleEdits"]> {
  const proxyModule = PROXY_GROUP_MODULES.find((item) => item.id === moduleId);
  if (!proxyModule) return config.builtinRuleEdits ?? {};

  const defaultTarget = getModuleDisplayName(moduleId, config);
  const next = { ...(config.builtinRuleEdits ?? {}) };
  const normalizedTarget = target.trim();

  for (const rule of proxyModule.rules) {
    const key = getModuleRuleOrderKey(proxyModule.id, rule.id);
    const prev = next[key] as BuiltinRuleEdit | undefined;
    if (!normalizedTarget || normalizedTarget === defaultTarget) {
      if (prev?.enabled === false) next[key] = { enabled: false };
      else delete next[key];
    } else {
      next[key] = { ...(prev ?? {}), target: normalizedTarget };
    }
  }

  return next;
}

function updateArrayItem<T>(items: T[], index: number, patch: Partial<T>): T[] {
  return items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item));
}

function removeArrayItem<T>(items: T[], index: number): T[] {
  return items.filter((_, itemIndex) => itemIndex !== index);
}

export function TemplateConfigEditor({ config, yaml, onConfigChange, onYamlChange }: Props) {
  const [expandedSections, setExpandedSections] = React.useState<Set<TemplateEditorSectionKey>>(
    new Set(["base", "targetGroups", "modules", "rules", "dns"]),
  );
  const [newRuleType, setNewRuleType] = React.useState<CustomRule["type"]>("DOMAIN");
  const [newRuleValue, setNewRuleValue] = React.useState("");
  const [newRuleTarget, setNewRuleTarget] = React.useState("DIRECT");
  const [customGroupSearch, setCustomGroupSearch] = React.useState("");
  const [selectedCustomGroupId, setSelectedCustomGroupId] = React.useState<string | null>(null);
  const [moduleSearch, setModuleSearch] = React.useState("");

  const targetOptions = React.useMemo(() => {
    const options = getRoutingTargetOptions(config);
    if (!options.includes(newRuleTarget)) options.push(newRuleTarget);
    return options;
  }, [config, newRuleTarget]);
  const moduleTargetOptions = React.useMemo(() => getRoutingTargetOptions(config), [config]);
  const visibleModules = React.useMemo(() => {
    const keyword = moduleSearch.trim().toLowerCase();
    if (!keyword) return PROXY_GROUP_MODULES;
    return PROXY_GROUP_MODULES.filter((module) =>
      [module.id, module.name, module.description]
        .filter((value): value is string => typeof value === "string")
        .some((value) => value.toLowerCase().includes(keyword)),
    );
  }, [moduleSearch]);
  const visibleCustomGroups = React.useMemo(() => {
    const keyword = customGroupSearch.trim().toLowerCase();
    if (!keyword) return config.customProxyGroups;
    return config.customProxyGroups.filter((group) =>
      [group.name, group.id, group.description, group.emoji]
        .filter((value): value is string => typeof value === "string")
        .some((value) => value.toLowerCase().includes(keyword)),
    );
  }, [config.customProxyGroups, customGroupSearch]);
  const selectedCustomGroupIndex = React.useMemo(() => {
    if (selectedCustomGroupId) {
      const index = config.customProxyGroups.findIndex((group) => group.id === selectedCustomGroupId);
      if (index >= 0) return index;
    }
    if (visibleCustomGroups.length === 0) return -1;
    return config.customProxyGroups.findIndex((group) => group.id === visibleCustomGroups[0]?.id);
  }, [config.customProxyGroups, selectedCustomGroupId, visibleCustomGroups]);
  const selectedCustomGroup = selectedCustomGroupIndex >= 0 ? config.customProxyGroups[selectedCustomGroupIndex] : null;

  const emitConfig = React.useCallback(
    (next: SubBoostTemplateConfig) => {
      onConfigChange(next);
      onYamlChange(stringifySubBoostTemplateConfig(next));
    },
    [onConfigChange, onYamlChange],
  );

  const patchConfig = React.useCallback(
    (patch: Partial<SubBoostTemplateConfig>) => emitConfig(nextTemplateConfig(config, patch)),
    [config, emitConfig],
  );

  const toggleSection = (key: TemplateEditorSectionKey) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleModule = (moduleId: string, enabled: boolean) => {
    const enabledSet = new Set(config.enabledProxyGroups);
    if (enabled) enabledSet.add(moduleId);
    else enabledSet.delete(moduleId);
    const enabledProxyGroups = PROXY_GROUP_MODULES.map((module) => module.id).filter((id) => enabledSet.has(id));
    patchConfig({
      enabledProxyGroups,
      hiddenProxyGroups: config.hiddenProxyGroups?.filter((id) => enabledSet.has(id)) ?? [],
    });
  };

  const updateCustomGroup = (index: number, patch: Partial<CustomProxyGroup>) => {
    patchConfig({ customProxyGroups: updateArrayItem(config.customProxyGroups, index, patch) });
  };

  const addCustomGroup = () => {
    const group = createCustomGroup();
    patchConfig({ customProxyGroups: [...config.customProxyGroups, group] });
    setSelectedCustomGroupId(group.id);
  };

  const removeCustomGroup = (groupId: string) => {
    const index = config.customProxyGroups.findIndex((group) => group.id === groupId);
    if (index < 0) return;
    patchConfig({ customProxyGroups: removeArrayItem(config.customProxyGroups, index) });
    setSelectedCustomGroupId((current) => (current === groupId ? null : current));
  };

  const patchSelectedCustomGroup = (patch: Partial<CustomProxyGroup>) => {
    if (selectedCustomGroupIndex < 0) return;
    updateCustomGroup(selectedCustomGroupIndex, patch);
  };

  const updateRuleSet = (index: number, patch: Partial<CustomRuleSet>) => {
    patchConfig({ customRuleSets: updateArrayItem(config.customRuleSets, index, patch) });
  };

  const addManualRule = () => {
    const value = newRuleValue.trim();
    if (!value) return;
    patchConfig({
      customRules: [
        ...config.customRules,
        {
          id: createCustomRuleId(),
          type: newRuleType,
          value,
          target: newRuleTarget,
          ...(newRuleType === "IP-CIDR" || newRuleType === "IP-CIDR6" ? { noResolve: true } : {}),
        },
      ],
    });
    setNewRuleValue("");
  };

  return (
    <Tabs defaultValue="visual" className="space-y-3">
      <TabsList className="h-auto w-full flex-wrap justify-start border border-white/10 bg-white/5 p-1">
        <TabsTrigger value="visual" className="h-7 rounded-md px-3 text-xs">图形化</TabsTrigger>
        <TabsTrigger value="yaml" className="h-7 rounded-md px-3 text-xs">YAML</TabsTrigger>
      </TabsList>

      <TabsContent value="visual" className="mt-0 max-h-[68vh] overflow-y-auto pr-1 custom-scrollbar">
        <div className="flex flex-col gap-2">
          <EditorSection
            icon={Settings2}
            title="基础设置"
            badge={`${config.mixedPort} / ${config.testInterval}s`}
            expanded={expandedSections.has("base")}
            onToggle={() => toggleSection("base")}
          >
            <div className="grid gap-2 md:grid-cols-2">
              <Field label="混合端口">
                <Input
                  value={String(config.mixedPort)}
                  inputMode="numeric"
                  onChange={(event) => patchConfig({ mixedPort: Number.parseInt(event.target.value, 10) || config.mixedPort })}
                  className="h-8 text-xs"
                />
              </Field>
              <Field label="测速间隔（秒）">
                <Input
                  value={String(config.testInterval)}
                  inputMode="numeric"
                  onChange={(event) => patchConfig({ testInterval: Number.parseInt(event.target.value, 10) || config.testInterval })}
                  className="h-8 text-xs"
                />
              </Field>
              <Field label="测速 URL">
                <Input value={config.testUrl} onChange={(event) => patchConfig({ testUrl: event.target.value })} className="h-8 text-xs" />
              </Field>
              <Field label="规则集基础 URL">
                <Input value={config.ruleProviderBaseUrl} onChange={(event) => patchConfig({ ruleProviderBaseUrl: event.target.value })} className="h-8 text-xs" />
              </Field>
              <ToggleRow label="允许局域网连接" checked={config.allowLan} onChange={(checked) => patchConfig({ allowLan: checked })} />
              <ToggleRow label="CN IP no-resolve" checked={Boolean(config.cnIpNoResolve)} onChange={(checked) => patchConfig({ cnIpNoResolve: checked })} />
              <ToggleRow label="使用 CN 完整规则集" checked={Boolean(config.experimentalCnUseCnRuleSet)} onChange={(checked) => patchConfig({ experimentalCnUseCnRuleSet: checked })} />
            </div>
          </EditorSection>

          <EditorSection
            icon={Globe2}
            title="分流目标组"
            badge={`${config.customProxyGroups.length} 个`}
            expanded={expandedSections.has("targetGroups")}
            onToggle={() => toggleSection("targetGroups")}
          >
            <div className="mb-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-[11px] leading-5 text-white/45">
              新增目标组：点击“添加”创建机场 A、自建 A 这类目标组，配置来源标识、地区或正则筛选后，再到“预设规则模块”或“分流规则”中选择它。
            </div>
            <div className="grid gap-2 lg:grid-cols-[minmax(16rem,0.9fr)_minmax(0,1.4fr)]">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[12rem] flex-1">
                    <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
                    <Input
                      value={customGroupSearch}
                      onChange={(event) => setCustomGroupSearch(event.target.value)}
                      placeholder="搜索目标组"
                      className="h-8 pl-7 text-xs"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={addCustomGroup}
                    title="添加目标组"
                    className="h-8 gap-1 text-xs"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    添加
                  </Button>
                </div>

                <div className="max-h-[23rem] space-y-1 overflow-y-auto pr-1 custom-scrollbar">
                  {visibleCustomGroups.length === 0 ? (
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-8 text-center text-xs text-white/45">
                      {config.customProxyGroups.length === 0
                        ? "还没有目标组。点击“添加”创建一个目标组，然后配置来源标识、地区或正则筛选。"
                        : "没有匹配的目标组"}
                    </div>
                  ) : (
                    visibleCustomGroups.map((group) => {
                      const active = group.id === selectedCustomGroupId;
                      return (
                        <button
                          key={group.id}
                          type="button"
                          onClick={() => setSelectedCustomGroupId(group.id)}
                          className={`w-full rounded-lg border p-2 text-left transition-colors ${
                            active
                              ? "border-emerald-500/40 bg-emerald-500/10"
                              : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]"
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <Switch
                              checked={group.enabled !== false}
                              onCheckedChange={(checked) => {
                                const index = config.customProxyGroups.findIndex((item) => item.id === group.id);
                                if (index >= 0) updateCustomGroup(index, { enabled: checked ? undefined : false });
                              }}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-xs font-medium text-white/85">{group.name}</div>
                              <div className="truncate text-[10px] text-white/40">{group.id}</div>
                            </div>
                            <Badge variant="outline" className="border-white/10 bg-white/5 text-white/55">
                              {GROUP_TYPE_LABELS[group.groupType]}
                            </Badge>
                          </div>
                          {group.description && (
                            <div className="mt-1 truncate text-[10px] text-white/45">{group.description}</div>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <CustomGroupDetail
                group={selectedCustomGroup}
                onPatch={patchSelectedCustomGroup}
                onDelete={() => selectedCustomGroup && removeCustomGroup(selectedCustomGroup.id)}
              />
            </div>
          </EditorSection>

          <EditorSection
            icon={Network}
            title="预设规则模块"
            badge={`${config.enabledProxyGroups.length} 已启用`}
            expanded={expandedSections.has("modules")}
            onToggle={() => toggleSection("modules")}
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <div className="relative min-w-[14rem] flex-1">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
                <Input
                  value={moduleSearch}
                  onChange={(event) => setModuleSearch(event.target.value)}
                  placeholder="搜索规则模块"
                  className="h-8 pl-7 text-xs"
                />
              </div>
              <Badge variant="outline" className="border-white/10 bg-white/5 text-white/55">
                先建目标组，再把规则模块指向目标组
              </Badge>
            </div>
            <div className="grid gap-1.5 md:grid-cols-2">
              {visibleModules.map((module) => {
                const enabled = config.enabledProxyGroups.includes(module.id);
                const moduleTarget = getModuleRoutingTarget(module.id, config);
                const targetOptionsForModule = moduleTargetOptions.includes(moduleTarget)
                  ? moduleTargetOptions
                  : [...moduleTargetOptions, moduleTarget];
                return (
                  <div key={module.id} className="rounded-lg border border-white/10 bg-white/[0.04] p-2">
                    <div className="flex items-center gap-2">
                      <Switch checked={enabled} onCheckedChange={(checked) => toggleModule(module.id, checked)} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium text-white/85">{module.name}</div>
                        <div className="text-[10px] text-white/40">{module.rules.length} 条规则</div>
                      </div>
                    </div>
                    {enabled && (
                      <div className="mt-2 grid gap-1.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                        <Field label="规则指向">
                          <TargetSelect
                            value={moduleTarget}
                            options={targetOptionsForModule}
                            onChange={(target) => patchConfig({
                              builtinRuleEdits: setModuleRoutingTarget(config, module.id, target),
                            })}
                          />
                        </Field>
                        <Field label="模块名称覆盖">
                          <Input
                            value={config.proxyGroupNameOverrides?.[module.id] ?? ""}
                            onChange={(event) => {
                              const value = event.target.value;
                              const next = { ...(config.proxyGroupNameOverrides ?? {}) };
                              if (value.trim()) next[module.id] = value;
                              else delete next[module.id];
                              patchConfig({ proxyGroupNameOverrides: next });
                            }}
                            placeholder={module.name}
                            className="h-8 text-xs"
                          />
                        </Field>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </EditorSection>

          <EditorSection
            icon={Route}
            title="分流规则"
            badge={`${config.customRules.length + config.customRuleSets.length} 条`}
            expanded={expandedSections.has("rules")}
            onToggle={() => toggleSection("rules")}
          >
            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-2">
              <div className="grid gap-1.5 md:grid-cols-[9rem_minmax(0,1fr)_10rem_auto]">
                <Select value={newRuleType} onValueChange={(value) => setNewRuleType(value as CustomRule["type"])}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CUSTOM_RULE_TYPES.map((type) => (
                      <SelectItem key={type} value={type} className="text-xs">{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input value={newRuleValue} onChange={(event) => setNewRuleValue(event.target.value)} placeholder="example.com" className="h-8 text-xs" />
                <TargetSelect value={newRuleTarget} options={targetOptions} onChange={setNewRuleTarget} />
                <Button type="button" variant="secondary" size="sm" onClick={addManualRule} disabled={!newRuleValue.trim()} className="h-8 text-xs">
                  添加
                </Button>
              </div>
            </div>

            <RuleList
              config={config}
              targetOptions={targetOptions}
              onUpdateRule={(index, patch) => patchConfig({ customRules: updateArrayItem(config.customRules, index, patch) })}
              onRemoveRule={(index) => patchConfig({ customRules: removeArrayItem(config.customRules, index) })}
              onUpdateRuleSet={updateRuleSet}
              onRemoveRuleSet={(index) => patchConfig({ customRuleSets: removeArrayItem(config.customRuleSets, index) })}
            />

            <div className="mt-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => patchConfig({ customRuleSets: [...config.customRuleSets, createRuleSet(targetOptions[0] ?? "DIRECT")] })}
                className="h-8 gap-1 text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                添加规则集
              </Button>
            </div>
          </EditorSection>

          <EditorSection
            icon={ListChecks}
            title="DNS"
            badge={config.dnsYaml.trim() ? "自定义" : "默认"}
            expanded={expandedSections.has("dns")}
            onToggle={() => toggleSection("dns")}
          >
            <Textarea
              value={config.dnsYaml}
              onChange={(event) => patchConfig({ dnsYaml: event.target.value })}
              placeholder="dns:"
              className="min-h-[180px] font-mono text-xs"
            />
          </EditorSection>
        </div>
      </TabsContent>

      <TabsContent value="yaml" className="mt-0">
        <Textarea
          value={yaml}
          onChange={(event) => onYamlChange(event.target.value)}
          className="min-h-[62vh] font-mono text-xs"
        />
      </TabsContent>
    </Tabs>
  );
}

function EditorSection({
  icon: Icon,
  title,
  badge,
  expanded,
  onToggle,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  badge: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/5"
      >
        <Icon className="h-4 w-4 text-indigo-400" />
        <span className="text-sm font-medium text-white">{title}</span>
        <Badge variant="outline" className="ml-auto border-white/10 bg-white/5 text-white/55">{badge}</Badge>
      </button>
      {expanded && <div className="mt-2 pl-6">{children}</div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="min-w-0 space-y-1">
      <div className="text-[11px] text-white/50">{label}</div>
      {children}
    </label>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="flex h-8 items-center justify-between rounded-lg border border-white/10 bg-white/[0.04] px-2">
      <span className="text-xs text-white/70">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function CustomGroupDetail({
  group,
  onPatch,
  onDelete,
}: {
  group: CustomProxyGroup | null;
  onPatch: (patch: Partial<CustomProxyGroup>) => void;
  onDelete: () => void;
}) {
  if (!group) {
    return (
      <div className="flex min-h-[18rem] items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] px-4 text-center text-xs text-white/45">
        选择左侧目标组后编辑详情；如果列表为空，先点击“添加”创建。
      </div>
    );
  }

  const advanced = group.advanced ?? {};
  const groupType = group.groupType;
  const strategy = group.strategy ?? DEFAULT_LOAD_BALANCE_STRATEGY;

  const patchAdvanced = (patch: NonNullable<CustomProxyGroup["advanced"]>) => {
    onPatch({ advanced: { ...advanced, ...patch } });
  };

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
      <div className="mb-3 flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-white">{group.name}</div>
          <div className="truncate text-[10px] text-white/40">{group.id}</div>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onDelete} className="h-8 w-8 text-white/40 hover:text-red-300">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <Field label="组名">
          <Input value={group.name} onChange={(event) => onPatch({ name: event.target.value })} className="h-8 text-xs" />
        </Field>
        <Field label="图标/前缀">
          <Input value={group.emoji} onChange={(event) => onPatch({ emoji: event.target.value })} className="h-8 text-xs" />
        </Field>
        <Field label="分组类型">
          <Select value={groupType} onValueChange={(value) => onPatch({ groupType: value as ProxyGroupGroupType })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PROXY_GROUP_GROUP_TYPES.map((type) => (
                <SelectItem key={type} value={type} className="text-xs">{GROUP_TYPE_LABELS[type]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="负载均衡策略">
          <Select
            value={strategy}
            onValueChange={(value) => onPatch({ strategy: value as LoadBalanceStrategy })}
            disabled={groupType !== "load-balance"}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LOAD_BALANCE_STRATEGIES.map((item) => (
                <SelectItem key={item} value={item} className="text-xs">{LOAD_BALANCE_STRATEGY_LABELS[item]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="md:col-span-2">
          <Field label="描述">
            <Input value={group.description ?? ""} onChange={(event) => onPatch({ description: event.target.value })} className="h-8 text-xs" />
          </Field>
        </div>

        <ToggleRow label="启用该分流组" checked={group.enabled !== false} onChange={(checked) => onPatch({ enabled: checked ? undefined : false })} />
        <ToggleRow
          label="加入其他分流组成员"
          checked={group.includeInGroupMembers !== false}
          onChange={(checked) => onPatch({ includeInGroupMembers: checked })}
        />
        <ToggleRow
          label="使用筛选节点作为成员"
          checked={group.memberSource === "filtered-nodes"}
          onChange={(checked) => onPatch({ memberSource: checked ? "filtered-nodes" : undefined })}
        />
        <ToggleRow
          label="仅引用分流组成员"
          checked={advanced.memberMode === "groups-only"}
          onChange={(checked) => patchAdvanced({ memberMode: checked ? "groups-only" : "default" })}
        />

        <Field label="来源标识（逗号分隔）">
          <Input
            value={(advanced.sourceKeys ?? []).join(", ")}
            onChange={(event) => patchAdvanced({ sourceKeys: splitCommaList(event.target.value) })}
            placeholder="airport-a, self-hosted"
            className="h-8 text-xs"
          />
        </Field>
        <Field label="地区（逗号分隔）">
          <Input
            value={(advanced.regions ?? []).join(", ")}
            onChange={(event) => patchAdvanced({ regions: splitCommaList(event.target.value) as NonNullable<typeof advanced.regions> })}
            placeholder="hk, jp, us"
            className="h-8 text-xs"
          />
        </Field>
        <Field label="包含正则">
          <Input value={advanced.includeRegex ?? ""} onChange={(event) => patchAdvanced({ includeRegex: event.target.value })} className="h-8 text-xs" />
        </Field>
        <Field label="排除正则">
          <Input value={advanced.excludeRegex ?? ""} onChange={(event) => patchAdvanced({ excludeRegex: event.target.value })} className="h-8 text-xs" />
        </Field>
      </div>
    </div>
  );
}

function splitCommaList(value: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of value.split(",")) {
    const item = part.trim();
    if (!item || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

function TargetSelect({ value, options, onChange }: { value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option} className="text-xs">{option}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function RuleList({
  config,
  targetOptions,
  onUpdateRule,
  onRemoveRule,
  onUpdateRuleSet,
  onRemoveRuleSet,
}: {
  config: SubBoostTemplateConfig;
  targetOptions: string[];
  onUpdateRule: (index: number, patch: Partial<CustomRule>) => void;
  onRemoveRule: (index: number) => void;
  onUpdateRuleSet: (index: number, patch: Partial<CustomRuleSet>) => void;
  onRemoveRuleSet: (index: number) => void;
}) {
  return (
    <div className="mt-2 space-y-1.5">
      {config.customRules.map((rule, index) => (
        <div key={rule.id} className="grid gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] p-2 md:grid-cols-[8rem_minmax(0,1fr)_10rem_auto]">
          <Badge variant="outline" className="h-8 justify-center border-indigo-500/30 bg-indigo-500/10 text-indigo-200">{rule.type}</Badge>
          <Input value={rule.value} onChange={(event) => onUpdateRule(index, { value: event.target.value })} className="h-8 text-xs" />
          <TargetSelect value={String(rule.target)} options={targetOptions.includes(String(rule.target)) ? targetOptions : [...targetOptions, String(rule.target)]} onChange={(target) => onUpdateRule(index, { target })} />
          <Button type="button" variant="ghost" size="icon" onClick={() => onRemoveRule(index)} className="h-8 w-8 text-white/40 hover:text-red-300">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}

      {config.customRuleSets.map((ruleSet, index) => (
        <div key={ruleSet.id} className="grid gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] p-2 md:grid-cols-[minmax(0,1fr)_8rem_10rem_auto]">
          <Input value={ruleSet.path} onChange={(event) => onUpdateRuleSet(index, { path: event.target.value })} className="h-8 font-mono text-xs" />
          <Select value={ruleSet.behavior} onValueChange={(behavior) => onUpdateRuleSet(index, { behavior: behavior as RuleSetBehavior })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="domain" className="text-xs">domain</SelectItem>
              <SelectItem value="ipcidr" className="text-xs">ipcidr</SelectItem>
            </SelectContent>
          </Select>
          <TargetSelect value={String(ruleSet.target)} options={targetOptions.includes(String(ruleSet.target)) ? targetOptions : [...targetOptions, String(ruleSet.target)]} onChange={(target) => onUpdateRuleSet(index, { target })} />
          <Button type="button" variant="ghost" size="icon" onClick={() => onRemoveRuleSet(index)} className="h-8 w-8 text-white/40 hover:text-red-300">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}
