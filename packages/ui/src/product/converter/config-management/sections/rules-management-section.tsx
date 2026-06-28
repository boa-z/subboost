"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ListOrdered, Search } from "lucide-react";
import { Badge } from "@subboost/ui/components/ui/badge";
import { confirmDialog } from "@subboost/ui/components/ui/confirm-dialog";
import { Input } from "@subboost/ui/components/ui/input";
import { Switch } from "@subboost/ui/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@subboost/ui/components/ui/tabs";
import {
  buildGeneratedRuleEntries,
  hasFullRuleOrderKeys,
  type GeneratedRuleEntry,
} from "@subboost/core/generator/rules";
import { useConfigStore } from "@subboost/ui/store/config-store";
import { SectionHeader } from "../section-header";
import { ProxyGroupsAddedRuleSets } from "./proxy-groups-added-rule-sets";
import { ProxyGroupsCustomRules } from "./proxy-groups-custom-rules";

type RuleKindFilter = "all" | "custom-rule" | "custom-rule-set" | "module" | "special";

const RULE_KIND_FILTERS: Array<{ value: RuleKindFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "custom-rule", label: "手动" },
  { value: "custom-rule-set", label: "规则集" },
  { value: "module", label: "内置" },
  { value: "special", label: "系统" },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function stripTrailingSegment(value: string, segment: string): string {
  return segment && value.endsWith(segment)
    ? value.slice(0, -segment.length)
    : value;
}

function getRuleDisplayDetail(entry: GeneratedRuleEntry): string {
  let detail = entry.text;
  if (entry.noResolve) {
    detail = stripTrailingSegment(detail, ",no-resolve");
  }
  detail = stripTrailingSegment(detail, `,${entry.target.trim()}`);
  return detail || entry.text;
}

function getRuleKind(entry: GeneratedRuleEntry): RuleKindFilter {
  if (entry.kind === "custom-rule") return "custom-rule";
  if (entry.kind === "custom-rule-set") return "custom-rule-set";
  if (entry.kind === "module") return "module";
  if (entry.kind === "special") return "special";
  if (entry.key.startsWith("custom-rule-set:")) return "custom-rule-set";
  if (entry.key.startsWith("custom-rule:") || entry.key.startsWith("custom:")) return "custom-rule";
  if (entry.key.startsWith("module:")) return "module";
  if (entry.key.startsWith("special:")) return "special";
  return "module";
}

function matchesRuleFilter(entry: GeneratedRuleEntry, keyword: string, kind: RuleKindFilter): boolean {
  if (kind !== "all" && getRuleKind(entry) !== kind) return false;
  if (!keyword) return true;

  const haystack = [
    entry.key,
    entry.summary,
    entry.sourceLabel,
    entry.target,
    entry.text,
  ]
    .join("\n")
    .toLowerCase();
  return haystack.includes(keyword);
}

export function RulesManagementSection({
  isExpanded,
  onToggle,
}: {
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const {
    enabledProxyGroups,
    customRules,
    customRuleSets,
    builtinRuleEdits,
    proxyGroupNameOverrides,
    cnIpNoResolve,
    experimentalCnUseCnRuleSet,
    ruleOrder,
    setRuleOrder,
  } = useConfigStore();
  const [orderDrafts, setOrderDrafts] = React.useState<Record<string, string>>({});
  const [ruleSearchKeyword, setRuleSearchKeyword] = React.useState("");
  const [ruleKindFilter, setRuleKindFilter] = React.useState<RuleKindFilter>("all");
  const allRulesMode = hasFullRuleOrderKeys(ruleOrder);

  const entries = React.useMemo(
    () =>
      buildGeneratedRuleEntries({
        enabledModules: enabledProxyGroups,
        customRules,
        customRuleSets,
        builtinRuleEdits,
        proxyGroupNameOverrides,
        cnIpNoResolve,
        experimentalCnUseCnRuleSet,
        ruleOrder,
      }),
    [
      cnIpNoResolve,
      customRuleSets,
      customRules,
      enabledProxyGroups,
      experimentalCnUseCnRuleSet,
      builtinRuleEdits,
      proxyGroupNameOverrides,
      ruleOrder,
    ]
  );

  const preMatchEntries = React.useMemo(
    () => entries.filter((entry) => entry.key !== "special:match"),
    [entries]
  );
  const preMatchKeys = React.useMemo(() => preMatchEntries.map((entry) => entry.key), [preMatchEntries]);
  const editableEntries = React.useMemo(() => entries.filter((entry) => entry.editable), [entries]);
  const editableKeys = React.useMemo(() => editableEntries.map((entry) => entry.key), [editableEntries]);
  const normalizedRuleSearchKeyword = ruleSearchKeyword.trim().toLowerCase();
  const visibleEntries = React.useMemo(
    () =>
      entries.filter((entry) =>
        matchesRuleFilter(entry, normalizedRuleSearchKeyword, ruleKindFilter),
      ),
    [entries, normalizedRuleSearchKeyword, ruleKindFilter],
  );
  const entryNumberByKey = React.useMemo(
    () => new Map(entries.map((entry, index) => [entry.key, index + 1])),
    [entries],
  );

  const applyRuleOrder = React.useCallback(
    (nextRuleOrder: string[]) => {
      setRuleOrder(nextRuleOrder);
      setOrderDrafts((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          if (!editableKeys.includes(key)) delete next[key];
        }
        return next;
      });
    },
    [editableKeys, setRuleOrder]
  );

  const moveRule = React.useCallback(
    (key: string, direction: "up" | "down") => {
      const from = preMatchKeys.indexOf(key);
      if (from < 0) return;
      const to = clamp(direction === "up" ? from - 1 : from + 1, 0, preMatchKeys.length - 1);
      if (to === from) return;
      const next = preMatchKeys.slice();
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      applyRuleOrder(next);
    },
    [applyRuleOrder, preMatchKeys]
  );

  const setRuleAbsoluteOrder = React.useCallback(
    (key: string, absoluteOrder: number) => {
      const from = preMatchKeys.indexOf(key);
      if (from < 0 || !Number.isFinite(absoluteOrder)) return;
      const to = clamp(Math.floor(absoluteOrder) - 1, 0, preMatchEntries.length - 1);
      if (to === from) return;
      const next = preMatchKeys.slice();
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      applyRuleOrder(next);
    },
    [applyRuleOrder, preMatchEntries.length, preMatchKeys]
  );

  const handleToggleAllRulesMode = React.useCallback(
    async (checked: boolean) => {
      if (!checked) {
        applyRuleOrder(editableKeys);
        return;
      }

      const ok = await confirmDialog({
        title: "开启“调整所有规则顺序”？",
        description: (
          <span className="block pt-2">
            <span className="block rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 leading-6 text-amber-100/90">
              <span className="font-medium text-amber-200">警告：</span>
              开启后，你可以移动任意规则到任意位置，这会改变分流优先级与命中结果。
            </span>
            <span className="mt-3 block leading-6 text-white/65">
              如果你不知道调整规则顺序的影响，请不要动它。
            </span>
          </span>
        ),
        cancelText: "保持默认",
        confirmText: "继续开启",
        variant: "warning",
      });
      if (!ok) return;
      applyRuleOrder(preMatchKeys);
    },
    [applyRuleOrder, editableKeys, preMatchKeys]
  );

  return (
    <div>
      <SectionHeader
        icon={ListOrdered}
        title="规则管理"
        isExpanded={isExpanded}
        onToggle={onToggle}
        badge={
          <Badge variant="outline" className="ml-auto shrink-0 border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
            可调 {allRulesMode ? preMatchEntries.length : editableEntries.length} / 全部 {entries.length}
          </Badge>
        }
      />

      {isExpanded && (
        <div className="mt-2 pl-6 space-y-2">
          <Tabs defaultValue="order" className="space-y-2">
            <TabsList className="h-auto w-full flex-wrap justify-start border border-white/10 bg-white/5 p-1">
              <TabsTrigger value="order" className="h-7 rounded-md px-3 text-xs">
                生效顺序
              </TabsTrigger>
              <TabsTrigger value="manual" className="h-7 rounded-md px-3 text-xs">
                手动规则
              </TabsTrigger>
              <TabsTrigger value="sets" className="h-7 rounded-md px-3 text-xs">
                规则集
              </TabsTrigger>
            </TabsList>

            <TabsContent value="order" className="mt-0 space-y-2">
              <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex-[1_1_13rem] text-[11px] leading-5 text-white/60">
                    {allRulesMode
                      ? "已开启全规则排序：可移动任意规则，但 MATCH 固定最后。"
                      : "默认只能调整自定义规则顺序。"}
                  </div>
                  <div className="ml-auto flex shrink-0 items-center gap-2">
                    <span className="text-[11px] whitespace-nowrap text-white/55">调整所有规则顺序</span>
                    <Switch
                      checked={allRulesMode}
                      onCheckedChange={handleToggleAllRulesMode}
                      disabled={preMatchEntries.length <= 1}
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-2">
                <div className="relative min-w-[12rem] flex-[1_1_14rem]">
                  <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
                  <Input
                    value={ruleSearchKeyword}
                    onChange={(e) => setRuleSearchKeyword(e.target.value)}
                    placeholder="搜索规则、目标组或规则内容"
                    className="h-8 w-full rounded-lg border-white/10 bg-white/5 pl-7 text-xs"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {RULE_KIND_FILTERS.map((filter) => (
                    <button
                      key={filter.value}
                      type="button"
                      onClick={() => setRuleKindFilter(filter.value)}
                      className={`h-7 rounded-md border px-2 text-[11px] transition-colors ${
                        ruleKindFilter === filter.value
                          ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
                          : "border-white/10 bg-white/5 text-white/55 hover:bg-white/10 hover:text-white/80"
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
                <span className="ml-auto text-[11px] text-white/45">
                  显示 {visibleEntries.length} / {entries.length}
                </span>
              </div>

              <div className="max-h-[460px] overflow-y-auto overflow-x-hidden rounded-lg border border-white/10 bg-black/10 pr-1 custom-scrollbar">
                {visibleEntries.length === 0 ? (
                  <div className="px-3 py-8 text-center text-xs text-white/45">
                    没有匹配的规则
                  </div>
                ) : (
                  visibleEntries.map((entry) => {
                    const fullIndex = preMatchKeys.indexOf(entry.key);
                    const canEditOrder = entry.key !== "special:match" && (allRulesMode || entry.editable);
                    const canMoveUp = canEditOrder && fullIndex > 0;
                    const canMoveDown = canEditOrder && fullIndex >= 0 && fullIndex < preMatchKeys.length - 1;
                    const absoluteOrder = entryNumberByKey.get(entry.key) ?? 0;
                    const displayDetail = getRuleDisplayDetail(entry);
                    const shouldShowSourceLabel =
                      entry.sourceLabel.trim() !== entry.target.trim() &&
                      entry.sourceLabel.trim() !== "系统规则";

                    return (
                      <div
                        key={entry.key}
                        className="border-b border-white/10 bg-white/5 px-3 py-1.5 last:border-b-0"
                      >
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                          <div className="flex min-w-0 items-start gap-1.5">
                            <div className="w-4 shrink-0 pt-1 text-right text-[10px] tabular-nums text-white/35">
                              {absoluteOrder}
                            </div>

                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="min-w-0 max-w-full break-words text-xs font-medium leading-5 text-white">{entry.summary}</span>
                                {shouldShowSourceLabel && (
                                  <Badge variant="outline" className="max-w-full border-white/10 bg-white/5 text-white/60">
                                    {entry.sourceLabel}
                                  </Badge>
                                )}
                                <Badge variant="outline" className="max-w-full border-indigo-500/30 bg-indigo-500/10 text-indigo-200">
                                  {entry.target}
                                </Badge>
                                {entry.noResolve && (
                                  <Badge variant="outline" className="shrink-0 border-amber-500/30 bg-amber-500/10 text-amber-200">
                                    no-resolve
                                  </Badge>
                                )}
                              </div>

                              <div className="rule-management-entry-detail font-mono text-[11px] break-all text-white/45" title={entry.text}>
                                {displayDetail}
                              </div>
                            </div>
                          </div>

                          <div className="flex min-h-10 min-w-[8.75rem] shrink-0 items-center justify-end gap-1.5">
                            <span className="text-[11px] whitespace-nowrap text-white/45">顺序:</span>
                            <Input
                              value={
                                Object.prototype.hasOwnProperty.call(orderDrafts, entry.key)
                                  ? orderDrafts[entry.key]
                                  : String(absoluteOrder)
                              }
                              onChange={(e) => {
                                if (!canEditOrder) return;
                                setOrderDrafts((prev) => ({ ...prev, [entry.key]: e.target.value }));
                              }}
                              onBlur={() => {
                                if (!canEditOrder) return;
                                const value = Number.parseInt(orderDrafts[entry.key] ?? "", 10);
                                if (Number.isFinite(value)) {
                                  setRuleAbsoluteOrder(entry.key, value);
                                }
                                setOrderDrafts((prev) => {
                                  const { [entry.key]: _removed, ...rest } = prev;
                                  return rest;
                                });
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Escape") {
                                  setOrderDrafts((prev) => {
                                    const { [entry.key]: _removed, ...rest } = prev;
                                    return rest;
                                  });
                                  return;
                                }
                                if (!canEditOrder) return;
                                if (e.key === "Enter") {
                                  const value = Number.parseInt(orderDrafts[entry.key] ?? "", 10);
                                  if (Number.isFinite(value)) {
                                    setRuleAbsoluteOrder(entry.key, value);
                                  }
                                  setOrderDrafts((prev) => {
                                    const { [entry.key]: _removed, ...rest } = prev;
                                    return rest;
                                  });
                                }
                              }}
                              inputMode="numeric"
                              title="最终规则行号（1=最前）"
                              disabled={!canEditOrder}
                              className="h-8 w-16 shrink-0 rounded-lg border-white/10 bg-white/10 px-1 text-center text-xs disabled:cursor-not-allowed disabled:opacity-50"
                            />
                            <div className="flex flex-col">
                              <button
                                onClick={() => moveRule(entry.key, "up")}
                                disabled={!canMoveUp}
                                className="flex h-4 w-5 items-center justify-center text-white/30 transition-colors hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-30"
                                title="上移"
                              >
                                <ArrowUp className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => moveRule(entry.key, "down")}
                                disabled={!canMoveDown}
                                className="flex h-4 w-5 items-center justify-center text-white/30 transition-colors hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-30"
                                title="下移"
                              >
                                <ArrowDown className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </TabsContent>

            <TabsContent value="manual" className="mt-0 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
              <ProxyGroupsCustomRules />
            </TabsContent>

            <TabsContent value="sets" className="mt-0 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
              <ProxyGroupsAddedRuleSets showSearchHint totalRules={null} />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
