import yaml from "js-yaml";
import { validateSubBoostTemplateConfig } from "./config-template";
import type { SubBoostTemplateConfig } from "@subboost/core/types/template-config";

export type TemplateYamlParseResult =
  | { ok: true; config: SubBoostTemplateConfig; yaml: string }
  | { ok: false; error: string };

const TEMPLATE_YAML_FIELD_ORDER = [
  "schema",
  "template",
  "enabledProxyGroups",
  "hiddenProxyGroups",
  "customProxyGroups",
  "proxyGroupAdvanced",
  "proxyGroupAdvancedModeEnabled",
  "customRuleSets",
  "builtinRuleEdits",
  "customRules",
  "ruleOrder",
  "cnIpNoResolve",
  "experimentalCnUseCnRuleSet",
  "dialerProxyGroups",
  "proxyGroupNameOverrides",
  "dnsYaml",
  "mixedPort",
  "allowLan",
  "testUrl",
  "testInterval",
  "ruleProviderBaseUrl",
] as const;

function orderTemplateConfig(config: SubBoostTemplateConfig): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of TEMPLATE_YAML_FIELD_ORDER) {
    if (config[key] !== undefined) out[key] = config[key];
  }
  for (const [key, value] of Object.entries(config)) {
    if (!(key in out) && value !== undefined) out[key] = value;
  }
  return out;
}

export function stringifySubBoostTemplateConfig(config: SubBoostTemplateConfig): string {
  return yaml.dump(orderTemplateConfig(config), {
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });
}

export function parseSubBoostTemplateYaml(content: string): TemplateYamlParseResult {
  const source = typeof content === "string" ? content.trim() : "";
  if (!source) return { ok: false, error: "YAML 模板不能为空" };

  let parsed: unknown;
  try {
    parsed = yaml.load(source);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? `YAML 解析失败: ${error.message}` : "YAML 解析失败",
    };
  }

  const validated = validateSubBoostTemplateConfig(parsed);
  if (!validated.ok) return validated;
  return {
    ok: true,
    config: validated.config,
    yaml: stringifySubBoostTemplateConfig(validated.config),
  };
}
