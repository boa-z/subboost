import { generateClashYaml } from "@subboost/core/generator";
import { stripImportedNodeControlFieldsFromList } from "@subboost/core/subscription/imported-node-controls";
import { buildProxyProvidersFromConfig } from "@subboost/core/subscription/proxy-providers";
import type { ConfigState } from "./definitions";

export type GeneratedYamlResult = {
  yaml: string;
  error: string | null;
};

type GenerateClashYamlOptions = Parameters<typeof generateClashYaml>[0];

function formatGeneratedYamlError(error: unknown): string {
  return error instanceof Error ? error.message : "生成配置失败";
}

function buildGenerateClashYamlOptions(
  state: ConfigState,
  proxyProviders: Record<string, unknown> | undefined
): GenerateClashYamlOptions {
  return {
    nodes: stripImportedNodeControlFieldsFromList(state.nodes),
    proxyProviders,
    template: state.template,
    userConfig: {
      enabledGroups: state.enabledProxyGroups,
      enabledRules: state.enabledProxyGroups, // 规则和组现在使用同一列表
      customRules: state.customRules,
      ruleOrder: state.ruleOrder,
      cnIpNoResolve: state.cnIpNoResolve,
      experimentalCnUseCnRuleSet: state.experimentalCnUseCnRuleSet,
      dnsYaml: state.dnsYaml,
      mixedPort: state.mixedPort,
      allowLan: state.allowLan,
      listenerPorts: state.listenerPorts,
      testUrl: state.testUrl,
      testInterval: state.testInterval,
      ruleProviderBaseUrl: state.ruleProviderBaseUrl,
      autoSelectStrategy: "url-test",
    },
    dialerProxyGroups: state.dialerProxyGroups,
    customProxyGroups: state.customProxyGroups,
    customRuleSets: state.customRuleSets,
    builtinRuleEdits: state.builtinRuleEdits,
    proxyGroupAdvanced: state.proxyGroupAdvanced,
    proxyGroupNameOverrides: state.proxyGroupNameOverrides,
    proxyGroupOrder: state.proxyGroupOrder,
  };
}

export function computeGeneratedYamlResult(state: ConfigState): GeneratedYamlResult {
  const proxyProviders = buildProxyProvidersFromConfig(state as unknown as Record<string, unknown>, {
    testUrl: state.testUrl,
    testInterval: state.testInterval,
  });
  const hasPreviewContent = state.nodes.length > 0 || Boolean(proxyProviders);

  try {
    const yaml = generateClashYaml(buildGenerateClashYamlOptions(state, proxyProviders));
    return { yaml: hasPreviewContent ? yaml : "", error: null };
  } catch (error) {
    return { yaml: "", error: formatGeneratedYamlError(error) };
  }
}

export function computeGeneratedYaml(state: ConfigState): string {
  return computeGeneratedYamlResult(state).yaml;
}
