"use client";

import * as React from "react";
import { FileCode, Globe2, ListChecks, Network, Plus, Route, Settings2, Trash2 } from "lucide-react";
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
import { PROXY_GROUP_GROUP_TYPES, type CustomProxyGroup, type CustomRule, type CustomRuleSet, type ProxyGroupGroupType } from "@subboost/core/types/config";
import type { SubBoostTemplateConfig } from "@subboost/core/types/template-config";

type TemplateEditorSectionKey = "base" | "modules" | "customGroups" | "rules" | "dns";

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

function getTargetOptions(config: SubBoostTemplateConfig): string[] {
  const moduleNames = PROXY_GROUP_MODULES
    .filter((module) => config.enabledProxyGroups.includes(module.id))
    .map((module) => config.proxyGroupNameOverrides?.[module.id]?.trim() || module.name);
  const customNames = config.customProxyGroups.map((group) => group.name).filter(Boolean);
  return Array.from(new Set(["DIRECT", "REJECT", ...moduleNames, ...customNames]));
}

function updateArrayItem<T>(items: T[], index: number, patch: Partial<T>): T[] {
  return items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item));
}

function removeArrayItem<T>(items: T[], index: number): T[] {
  return items.filter((_, itemIndex) => itemIndex !== index);
}

export function TemplateConfigEditor({ config, yaml, onConfigChange, onYamlChange }: Props) {
  const [expandedSections, setExpandedSections] = React.useState<Set<TemplateEditorSectionKey>>(
    new Set(["base", "modules", "customGroups", "rules", "dns"]),
  );
  const [newRuleType, setNewRuleType] = React.useState<CustomRule["type"]>("DOMAIN");
  const [newRuleValue, setNewRuleValue] = React.useState("");
  const [newRuleTarget, setNewRuleTarget] = React.useState("DIRECT");

  const targetOptions = React.useMemo(() => {
    const options = getTargetOptions(config);
    if (!options.includes(newRuleTarget)) options.push(newRuleTarget);
    return options;
  }, [config, newRuleTarget]);

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

  const toggleModuleVisible = (moduleId: string, visible: boolean) => {
    const hidden = new Set(config.hiddenProxyGroups ?? []);
    if (visible) hidden.delete(moduleId);
    else hidden.add(moduleId);
    patchConfig({ hiddenProxyGroups: Array.from(hidden).filter((id) => config.enabledProxyGroups.includes(id)) });
  };

  const updateCustomGroup = (index: number, patch: Partial<CustomProxyGroup>) => {
    patchConfig({ customProxyGroups: updateArrayItem(config.customProxyGroups, index, patch) });
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
            icon={Network}
            title="内置分流组"
            badge={`${config.enabledProxyGroups.length} 已启用`}
            expanded={expandedSections.has("modules")}
            onToggle={() => toggleSection("modules")}
          >
            <div className="grid gap-1.5 md:grid-cols-2">
              {PROXY_GROUP_MODULES.map((module) => {
                const enabled = config.enabledProxyGroups.includes(module.id);
                const hidden = config.hiddenProxyGroups?.includes(module.id) ?? false;
                return (
                  <div key={module.id} className="rounded-lg border border-white/10 bg-white/[0.04] p-2">
                    <div className="flex items-center gap-2">
                      <Switch checked={enabled} onCheckedChange={(checked) => toggleModule(module.id, checked)} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium text-white/85">{module.name}</div>
                        <div className="text-[10px] text-white/40">{module.rules.length} 条规则</div>
                      </div>
                      {enabled && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => toggleModuleVisible(module.id, hidden)}
                          className="h-7 px-2 text-[10px]"
                        >
                          {hidden ? "显示" : "隐藏"}
                        </Button>
                      )}
                    </div>
                    {enabled && (
                      <Input
                        value={config.proxyGroupNameOverrides?.[module.id] ?? ""}
                        onChange={(event) => {
                          const value = event.target.value;
                          const next = { ...(config.proxyGroupNameOverrides ?? {}) };
                          if (value.trim()) next[module.id] = value;
                          else delete next[module.id];
                          patchConfig({ proxyGroupNameOverrides: next });
                        }}
                        placeholder="自定义组名"
                        className="mt-2 h-7 text-xs"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </EditorSection>

          <EditorSection
            icon={Globe2}
            title="自定义分流组"
            badge={`${config.customProxyGroups.length} 个`}
            expanded={expandedSections.has("customGroups")}
            onToggle={() => toggleSection("customGroups")}
          >
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => patchConfig({ customProxyGroups: [...config.customProxyGroups, createCustomGroup()] })}
              className="h-8 gap-1 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              添加分流组
            </Button>
            <div className="mt-2 space-y-1.5">
              {config.customProxyGroups.map((group, index) => (
                <div key={group.id} className="rounded-lg border border-white/10 bg-white/[0.04] p-2">
                  <div className="grid gap-1.5 md:grid-cols-[minmax(0,1fr)_8rem_auto]">
                    <Input value={group.name} onChange={(event) => updateCustomGroup(index, { name: event.target.value })} className="h-8 text-xs" />
                    <Select value={group.groupType} onValueChange={(value) => updateCustomGroup(index, { groupType: value as ProxyGroupGroupType })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PROXY_GROUP_GROUP_TYPES.map((type) => (
                          <SelectItem key={type} value={type} className="text-xs">{GROUP_TYPE_LABELS[type]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => patchConfig({ customProxyGroups: removeArrayItem(config.customProxyGroups, index) })}
                      className="h-8 w-8 text-white/40 hover:text-red-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="mt-1.5 grid gap-1.5 md:grid-cols-2">
                    <Input value={group.emoji} onChange={(event) => updateCustomGroup(index, { emoji: event.target.value })} placeholder="图标/前缀" className="h-7 text-xs" />
                    <Input value={group.description ?? ""} onChange={(event) => updateCustomGroup(index, { description: event.target.value })} placeholder="描述" className="h-7 text-xs" />
                  </div>
                </div>
              ))}
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
