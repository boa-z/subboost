"use client";

import * as React from "react";
import { Check, Trash2 } from "lucide-react";
import { Button } from "@subboost/ui/components/ui/button";
import { Input } from "@subboost/ui/components/ui/input";
import { toast } from "@subboost/ui/components/ui/toaster";
import { PROXY_GROUP_MODULES, type ProxyGroupModule } from "@subboost/core/generator/proxy-groups";
import { resolveProxyGroupModuleName } from "@subboost/core/proxy-group-name";
import { resolveProxyGroupTargetName } from "@subboost/core/proxy-group-targets";
import { normalizeSourceKey } from "@subboost/core/subscription/node-source-state";
import {
  DEFAULT_LOAD_BALANCE_STRATEGY,
  type CustomProxyGroup,
  type LoadBalanceStrategy,
  type ProxyGroupGroupType,
} from "@subboost/core/types/config";
import { useConfigStore, type SubscriptionSource } from "@subboost/ui/store/config-store";
import { useProductInteractionAdapter } from "@subboost/ui/product/interactions";
import {
  buildManualRuleTargets,
  listCustomRulesForTarget,
  type ProxyGroupRuleTarget,
} from "./proxy-group-rule-targets";
import {
  ProxyGroupManualRuleRow,
  ProxyGroupRuleMoveMenu,
  ProxyGroupRuleSetRow,
  isRuleSetMoveTarget,
  type RuleSetMoveTarget,
} from "./proxy-group-rule-row";
import {
  ProxyGroupTypeMenu,
  type ProxyGroupTypeMenuValue,
} from "./proxy-group-type-menu";
import { ProxyGroupAdvancedPanel } from "./proxy-group-advanced-panel";
import {
  buildProxyGroupName,
  parseProxyGroupNameDraft,
  pickRandomEmoji,
  ProxyGroupNameEditor,
  toProxyGroupNameDraft,
  type ProxyGroupNameDraft,
} from "./proxy-group-name-editor";
import { ProxyGroupsModuleCard } from "./proxy-groups-module-card";

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const normalized = item.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function toggleValue(list: string[], value: string): string[] {
  if (!value) return list;
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function buildSourceOptions(sources: SubscriptionSource[]): Array<{ key: string; label: string }> {
  const out: Array<{ key: string; label: string }> = [];
  const seen = new Set<string>();
  sources.forEach((source, index) => {
    const key = normalizeSourceKey(source.sourceKey) || normalizeSourceKey(source.tag) || normalizeSourceKey(source.id);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({
      key,
      label:
        source.tag?.trim() ||
        source.lastParsedTag?.trim() ||
        `#${index + 1} ${source.type === "url" ? "订阅链接" : source.type === "yaml" ? "YAML 配置" : "节点链接"}`,
    });
  });
  return out;
}

export function ProxyGroupsCustomGroupsPanel({
  advancedMode = false,
  nodeCounts,
}: {
  advancedMode?: boolean;
  nodeCounts?: Map<string, number>;
}) {
  const {
    enabledProxyGroups,
    hiddenProxyGroups,
    sources = [],
    proxyGroupNameOverrides = {},
    customRules = [],
    customRuleSets = [],
    customProxyGroups = [],
    addCustomProxyGroup,
    removeCustomProxyGroup,
    updateCustomProxyGroup,
    updateCustomRule,
    removeCustomRule,
    moveModuleRule,
    removeModuleRule,
    dialerProxyGroups = [],
  } = useConfigStore();

  const [expandedCustomGroups, setExpandedCustomGroups] = React.useState<Set<string>>(new Set());
  const [newCustomGroupDraft, setNewCustomGroupDraft] = React.useState<ProxyGroupNameDraft>(() => ({
    emoji: pickRandomEmoji(),
    name: "",
  }));
  const [newCustomGroupDescription, setNewCustomGroupDescription] = React.useState("");
  const [editingCustomGroupId, setEditingCustomGroupId] = React.useState<string | null>(null);
  const [editingCustomGroupName, setEditingCustomGroupName] = React.useState("");
  const [editingCustomGroupDescription, setEditingCustomGroupDescription] = React.useState("");
  const interactions = useProductInteractionAdapter();

  const sourceOptions = React.useMemo(() => buildSourceOptions(sources), [sources]);
  const nodePoolGroups = React.useMemo(
    () => customProxyGroups.filter((group) => group.memberSource === "filtered-nodes"),
    [customProxyGroups],
  );

  const patchCustomGroupAdvanced = React.useCallback(
    (groupId: string, patch: NonNullable<CustomProxyGroup["advanced"]>) => {
      const group = customProxyGroups.find((item) => item.id === groupId);
      if (!group) return;
      const nextAdvanced = { ...(group.advanced || {}), ...patch };
      if (
        Object.prototype.hasOwnProperty.call(patch, "memberMode") &&
        patch.memberMode === undefined
      ) {
        delete nextAdvanced.memberMode;
      }
      updateCustomProxyGroup(groupId, { advanced: nextAdvanced });
    },
    [customProxyGroups, updateCustomProxyGroup],
  );

  const getAllGroupNamesForUniqCheck = React.useCallback(() => {
    const names: string[] = [];
    for (const m of PROXY_GROUP_MODULES) {
      names.push(resolveProxyGroupModuleName(m, proxyGroupNameOverrides?.[m.id]));
    }
    for (const g of customProxyGroups) {
      names.push(g.name);
    }
    for (const g of dialerProxyGroups) {
      const name = g && typeof g.name === "string" ? g.name.trim() : "";
      if (name) names.push(name);
    }
    return names;
  }, [customProxyGroups, dialerProxyGroups, proxyGroupNameOverrides]);

  const moduleNames = React.useMemo(
    () =>
      Object.fromEntries(
        PROXY_GROUP_MODULES.map((module) => [
          module.id,
          resolveProxyGroupModuleName(module, proxyGroupNameOverrides?.[module.id]),
        ]),
      ),
    [proxyGroupNameOverrides],
  );

  const manualRuleTargets = React.useMemo(
    () =>
      buildManualRuleTargets({
        enabledProxyGroups,
        hiddenProxyGroups,
        customProxyGroups,
        proxyGroupNameOverrides,
      }),
    [customProxyGroups, enabledProxyGroups, hiddenProxyGroups, proxyGroupNameOverrides],
  );

  const ruleSetMoveTargets = React.useMemo<RuleSetMoveTarget[]>(() => {
    const hidden = new Set(hiddenProxyGroups);
    return [
      ...PROXY_GROUP_MODULES.filter((module) => !hidden.has(module.id)).map((module) => ({
        kind: "module" as const,
        id: module.id,
        name: resolveProxyGroupModuleName(module, proxyGroupNameOverrides?.[module.id]),
      })),
      ...customProxyGroups.filter((group) => group.enabled !== false).map((group) => ({
        kind: "custom" as const,
        id: group.id,
        name: group.name,
      })),
    ];
  }, [customProxyGroups, hiddenProxyGroups, proxyGroupNameOverrides]);

  const moveManualRule = React.useCallback(
    (item: { rule: { id: string }; index: number }, target: ProxyGroupRuleTarget) => {
      updateCustomRule(item.rule.id, { target: target.name });
    },
    [updateCustomRule],
  );

  const moveCustomGroupRuleSet = React.useCallback(
    (sourceGroupId: string, ruleId: string, target: RuleSetMoveTarget) => {
      if (target.kind === "custom" && target.id === sourceGroupId) return;

      const state = useConfigStore.getState();
      const sourceGroup = state.customProxyGroups.find((group) => group.id === sourceGroupId);
      const sourceRule = sourceGroup
        ? state.customRuleSets.find(
            (rule) =>
              rule.id === ruleId &&
              resolveProxyGroupTargetName(rule.target, {
                moduleNames,
                customProxyGroups: state.customProxyGroups,
              }) === sourceGroup.name,
          )
        : null;
      if (!sourceGroup || !sourceRule) return;

      if (target.kind === "custom") {
        const targetGroup = state.customProxyGroups.find((group) => group && group.id === target.id);
        if (!targetGroup) return;
        const targetName = targetGroup.name.trim();
        if (!targetName) return;
        if (
          state.customRuleSets.some(
            (rule) =>
              rule.id === sourceRule.id &&
              resolveProxyGroupTargetName(rule.target, {
                moduleNames,
                customProxyGroups: state.customProxyGroups,
              }) === targetName,
          )
        ) {
          toast({
            title: "规则集已存在",
            description: "目标分流组里已经有同名规则集，请先移除重复项。",
            variant: "warning",
          });
          return;
        }
      }

      moveModuleRule(sourceGroup.id, ruleId, target);
    },
    [moduleNames, moveModuleRule],
  );

  return (
    <div className="space-y-2">
      <div className="rounded border border-white/10 bg-white/[0.035] px-3 py-2 text-[11px] leading-5 text-white/45">
        新增代理组：填写名称和描述后点击右侧勾号创建；创建后展开该组，可在成员设置中加入其它代理组，或开启“仅显示代理组”让它只由代理组组成。
      </div>

      {/* 新建自定义分组 */}
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5">
        <div className="grid min-w-0 grid-cols-[minmax(5.75rem,1fr)_minmax(0,1.47fr)] gap-1.5">
          <ProxyGroupNameEditor
            value={newCustomGroupDraft}
            onChange={setNewCustomGroupDraft}
            namePlaceholder="自定义分组名称"
          />
          <Input
            value={newCustomGroupDescription}
            onChange={(event) => setNewCustomGroupDescription(event.target.value)}
            placeholder="描述文本（默认: 节点池）"
            className="h-7 min-w-0 border-white/10 bg-white/5 text-xs"
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          onClick={() => {
            const draft = toProxyGroupNameDraft(newCustomGroupDraft);
            const full = buildProxyGroupName(draft);
            if (!full) return;
            const emoji = draft.emoji.trim();

            const all = new Set(getAllGroupNamesForUniqCheck());
            if (all.has(full)) {
              toast({
                title: "代理组名称已存在，请换一个名称。",
                variant: "warning",
              });
              return;
            }

            addCustomProxyGroup({
              name: full,
              emoji,
              description: newCustomGroupDescription.trim(),
              memberSource: "filtered-nodes",
              includeInGroupMembers: true,
              groupType: "select",
            });
            interactions.proxyGroupAdded?.({ groupType: "select" });
            setNewCustomGroupDraft({ emoji: pickRandomEmoji(emoji), name: "" });
            setNewCustomGroupDescription("");
          }}
          title="新增代理组"
          aria-label="新增代理组"
        >
          <Check className="h-3.5 w-3.5" />
        </Button>
      </div>

      {nodePoolGroups.length > 0 && sourceOptions.length > 0 && (
        <div className="rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
            <div className="text-[11px] font-medium text-white/60">节点池来源</div>
            <div className="text-[10px] text-white/35">{nodePoolGroups.length} 个节点池</div>
          </div>
          <div className="space-y-1.5">
            {nodePoolGroups.map((group) => {
              const selectedKeys = normalizeStringList(group.advanced?.sourceKeys);
              return (
                <div key={group.id} className="grid min-w-0 gap-1.5 md:grid-cols-[minmax(7rem,0.9fr)_minmax(0,2fr)] md:items-center">
                  <div className="min-w-0 truncate text-[11px] text-white/70" title={group.name}>
                    {group.name}
                  </div>
                  <div className="flex min-w-0 flex-wrap gap-1">
                    {sourceOptions.map((source) => {
                      const checked = selectedKeys.includes(source.key);
                      return (
                        <button
                          key={`${group.id}:${source.key}`}
                          type="button"
                          className={`h-6 max-w-full rounded border px-2 text-[10px] transition-colors ${
                            checked
                              ? "border-sky-400/50 bg-sky-500/15 text-sky-100"
                              : "border-white/10 bg-white/5 text-white/45 hover:bg-white/10 hover:text-white/75"
                          }`}
                          onClick={() =>
                            patchCustomGroupAdvanced(group.id, {
                              sourceKeys: toggleValue(selectedKeys, source.key),
                            })
                          }
                          title={source.label}
                        >
                          <span className="block max-w-[8rem] truncate">{source.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 自定义分组列表 */}
      {customProxyGroups.length === 0 ? (
        <div className="text-xs text-white/40 py-3 text-center">暂无自定义分组</div>
      ) : (
        <div className="space-y-1">
          {customProxyGroups.map((group) => {
            const isExpanded = expandedCustomGroups.has(group.id);
            const isEditing = editingCustomGroupId === group.id;
            const manualRules = listCustomRulesForTarget(customRules, group.name, {
              moduleNames,
              customProxyGroups,
            });
            const groupRuleSets = customRuleSets.filter(
              (ruleSet) =>
                resolveProxyGroupTargetName(ruleSet.target, {
                  moduleNames,
                  customProxyGroups,
                }) === group.name,
            );
            const totalRules = groupRuleSets.length + manualRules.length;
            const isNodePool = group.memberSource === "filtered-nodes";
            const description = group.description?.trim() || (isNodePool ? "节点池" : "自定义代理组");
            const nodeCount = nodeCounts?.get(group.name) ?? 0;

            const toggleExpand = () => {
              setExpandedCustomGroups((prev) => {
                const next = new Set(prev);
                if (next.has(group.id)) next.delete(group.id);
                else next.add(group.id);
                return next;
              });
            };

            const commitCustomRename = () => {
              const draft = parseProxyGroupNameDraft(editingCustomGroupName, group.emoji || "🧩");
              const nextFull = buildProxyGroupName(draft);
              if (!nextFull) return;
              const emoji = draft.emoji.trim();
              const all = new Set(getAllGroupNamesForUniqCheck());
              all.delete(group.name);
              if (all.has(nextFull)) {
                toast({
                  title: "代理组名称已存在，请换一个名称。",
                  variant: "warning",
                });
                return;
              }

              updateCustomProxyGroup(group.id, {
                name: nextFull,
                emoji,
                description: editingCustomGroupDescription,
              });
              setEditingCustomGroupId(null);
              setEditingCustomGroupName("");
              setEditingCustomGroupDescription("");
            };

            const rulesContent =
              totalRules === 0 ? null : (
                <>
                  {groupRuleSets.map((r) => (
                    <ProxyGroupRuleSetRow
                      key={`ruleset:${r.id}`}
                      name={r.name}
                      path={r.path}
                      source="custom"
                      behavior={r.behavior}
                      noResolve={r.noResolve}
                      actions={
                        <>
                          <ProxyGroupRuleMoveMenu
                            title="移动规则集"
                            ariaLabel={`移动 ${r.name} 规则集`}
                            targets={ruleSetMoveTargets}
                            kinds={["module", "custom"]}
                            currentTarget={{ kind: "custom", id: group.id, name: group.name }}
                            onMove={(target) => {
                              if (isRuleSetMoveTarget(target)) {
                                moveCustomGroupRuleSet(group.id, r.id, target);
                              }
                            }}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-white/35 hover:text-red-300"
                            onClick={() => removeModuleRule(group.id, r.id)}
                            title="删除规则集"
                            aria-label={`删除 ${r.name} 规则集`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      }
                    />
                  ))}
                  {manualRules.map((item) => (
                    <ProxyGroupManualRuleRow
                      key={`manual:${item.rule.id}`}
                      item={item}
                      targets={manualRuleTargets}
                      currentTargetName={group.name}
                      onMove={moveManualRule}
                      onRemove={({ index }) => removeCustomRule(index)}
                    />
                  ))}
                </>
              );
            const cardModule: ProxyGroupModule = {
              id: group.id,
              name: group.name,
              emoji: group.emoji || "🧩",
              category: "other",
              description,
              groupType: group.groupType,
              rules: [],
            };

            return (
              <ProxyGroupsModuleCard
                key={group.id}
                module={cardModule}
                display={{ full: group.name }}
                isCore={false}
                isEnabled={group.enabled !== false}
                onToggleEnabled={() => updateCustomProxyGroup(group.id, { enabled: group.enabled === false })}
                isEditing={isEditing}
                editingName={editingCustomGroupName}
                editingDescription={editingCustomGroupDescription}
                onChangeEditingName={setEditingCustomGroupName}
                onChangeEditingDescription={setEditingCustomGroupDescription}
                onStartEditing={() => {
                  setEditingCustomGroupId(group.id);
                  setEditingCustomGroupName(group.name);
                  setEditingCustomGroupDescription(group.description ?? "");
                }}
                onCancelEditing={() => {
                  setEditingCustomGroupId(null);
                  setEditingCustomGroupName("");
                  setEditingCustomGroupDescription("");
                }}
                onCommitEditing={commitCustomRename}
                onHide={() => removeCustomProxyGroup(group.id)}
                extraRules={[]}
                ruleSetsByTarget={{}}
                hiddenPresetRuleIds={{}}
                customProxyGroups={customProxyGroups}
                manualRules={manualRules}
                manualRuleTargets={manualRuleTargets}
                enabledProxyGroups={enabledProxyGroups}
                hiddenProxyGroups={hiddenProxyGroups}
                proxyGroupNameOverrides={proxyGroupNameOverrides}
                moduleRuleEditWarningAccepted
                acceptModuleRuleEditWarning={() => undefined}
                isRulesExpanded={isExpanded}
                onToggleRulesExpanded={toggleExpand}
                onAddRules={() => undefined}
                onAddRulesToModule={() => undefined}
                onAddRuleToCustomGroup={() => undefined}
                onRemoveExtraRule={() => undefined}
                onMoveRule={() => undefined}
                onMoveManualRule={(ruleId, targetName) => updateCustomRule(ruleId, { target: targetName })}
                onRemoveManualRule={removeCustomRule}
                onRestoreRule={() => undefined}
                onResetRuleTarget={() => undefined}
                cnIpNoResolve={false}
                onChangeCnIpNoResolve={() => undefined}
                experimentalCnUseCnRuleSet={false}
                onChangeExperimentalCnUseCnRuleSet={() => undefined}
                description={description}
                groupType={group.groupType as ProxyGroupTypeMenuValue}
                strategy={group.strategy}
                onChangeGroupType={({ groupType, strategy }) =>
                  updateCustomProxyGroup(group.id, {
                    groupType: groupType as ProxyGroupGroupType,
                    ...(groupType === "load-balance"
                      ? { strategy: strategy ?? group.strategy ?? DEFAULT_LOAD_BALANCE_STRATEGY }
                      : { strategy: undefined }),
                  })
                }
                rulesContentOverride={
                  totalRules === 0 ? (
                    <p className="px-2 py-3 text-center text-[11px] text-white/40">
                      还没有规则集。可在“搜索规则库”中选择规则后添加到该分组。
                    </p>
                  ) : (
                    <div className="space-y-1 p-2">{rulesContent}</div>
                  )
                }
                rulesCountOverride={totalRules}
                advancedMode={advancedMode}
                nodeCount={nodeCount}
                membersOnly={group.advanced?.memberMode === "groups-only"}
                onChangeMembersOnly={(next) =>
                  patchCustomGroupAdvanced(group.id, {
                    memberMode: next ? "groups-only" : undefined,
                  })
                }
                renderAdvancedContent={(content, count) => (
                  <ProxyGroupAdvancedPanel
                    target={{ kind: "custom", id: group.id, name: group.name }}
                    advanced={group.advanced || {}}
                    onChange={(patch) => patchCustomGroupAdvanced(group.id, patch)}
                    rulesCount={count}
                    rulesContent={count > 0 ? content : null}
                  />
                )}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
