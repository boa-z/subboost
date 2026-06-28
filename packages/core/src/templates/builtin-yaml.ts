import yaml from "js-yaml";
import type { TemplateType } from "@subboost/core/types/config";
import { PROXY_GROUP_MODULES } from "@subboost/core/generator/proxy-group-modules";
import { DEFAULT_RULE_PROVIDER_BASE_URL } from "@subboost/core/rules/metadata";

const COMMON_TEMPLATE_FIELDS = `
hiddenProxyGroups: []
customProxyGroups: []
proxyGroupAdvanced: {}
proxyGroupAdvancedModeEnabled: false
customRuleSets: []
builtinRuleEdits: {}
customRules: []
ruleOrder: []
cnIpNoResolve: true
experimentalCnUseCnRuleSet: true
dialerProxyGroups: []
proxyGroupNameOverrides: {}
dnsYaml: ""
mixedPort: 7897
allowLan: true
testUrl: https://www.gstatic.com/generate_204
testInterval: 300
ruleProviderBaseUrl: ${DEFAULT_RULE_PROVIDER_BASE_URL}
`;

const MINIMAL_MODULES = ["select", "auto", "ad", "private", "cn", "global", "final"];
const STANDARD_MODULES = [
  "select",
  "auto",
  "ad",
  "private",
  "cn",
  "global",
  "ai",
  "youtube",
  "google",
  "microsoft",
  "apple",
  "github",
  "telegram",
  "final",
];
const FULL_MODULES = PROXY_GROUP_MODULES.filter(
  (module) => module.id !== "adult" && module.id !== "gemini" && module.id !== "google-scholar",
).map((module) => module.id);

function buildTemplateYaml(type: TemplateType, enabledProxyGroups: string[]): string {
  return `schema: subboost-template-config/v1
template: ${type}
enabledProxyGroups:
${enabledProxyGroups.map((id) => `  - ${id}`).join("\n")}
${COMMON_TEMPLATE_FIELDS}`;
}

export const BUILTIN_TEMPLATE_YAML: Record<TemplateType, string> = {
  minimal: buildTemplateYaml("minimal", MINIMAL_MODULES),
  standard: buildTemplateYaml("standard", STANDARD_MODULES),
  full: buildTemplateYaml("full", FULL_MODULES),
};

export function getBuiltinTemplateYamlSource(type: TemplateType): string {
  return BUILTIN_TEMPLATE_YAML[type] || BUILTIN_TEMPLATE_YAML.standard;
}

export function getBuiltinTemplateEnabledProxyGroups(type: TemplateType): string[] {
  const parsed = yaml.load(getBuiltinTemplateYamlSource(type));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [...STANDARD_MODULES];
  const enabledProxyGroups = (parsed as { enabledProxyGroups?: unknown }).enabledProxyGroups;
  if (!Array.isArray(enabledProxyGroups)) return [...STANDARD_MODULES];
  return enabledProxyGroups.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}
