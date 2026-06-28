import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TemplateConfigEditor } from "./template-config-editor";
import type { SubBoostTemplateConfig } from "@subboost/core/types/template-config";

const mocks = vi.hoisted(() => ({
  buttons: [] as any[],
  inputs: [] as any[],
  selects: [] as any[],
  switches: [] as any[],
  textareas: [] as any[],
}));

vi.mock("lucide-react", () => ({
  FileCode: () => null,
  Globe2: () => null,
  ListChecks: () => null,
  Network: () => null,
  Plus: () => null,
  Route: () => null,
  Search: () => null,
  Settings2: () => null,
  Trash2: () => null,
}));
vi.mock("@subboost/ui/components/ui/badge", () => ({
  Badge: (props: any) => React.createElement("span", props, props.children),
}));
vi.mock("@subboost/ui/components/ui/button", () => ({
  Button: (props: any) => {
    mocks.buttons.push(props);
    return React.createElement("button", props, props.children);
  },
}));
vi.mock("@subboost/ui/components/ui/input", () => ({
  Input: (props: any) => {
    mocks.inputs.push(props);
    return React.createElement("input", props);
  },
}));
vi.mock("@subboost/ui/components/ui/select", () => ({
  Select: (props: any) => {
    mocks.selects.push(props);
    return React.createElement("div", props, props.children);
  },
  SelectContent: (props: any) => React.createElement("div", props, props.children),
  SelectItem: (props: any) => React.createElement("div", props, props.children),
  SelectTrigger: (props: any) => React.createElement("button", props, props.children),
  SelectValue: () => null,
}));
vi.mock("@subboost/ui/components/ui/switch", () => ({
  Switch: (props: any) => {
    mocks.switches.push(props);
    return React.createElement("button", props);
  },
}));
vi.mock("@subboost/ui/components/ui/tabs", () => ({
  Tabs: (props: any) => React.createElement("div", props, props.children),
  TabsContent: (props: any) => React.createElement("section", props, props.children),
  TabsList: (props: any) => React.createElement("div", props, props.children),
  TabsTrigger: (props: any) => React.createElement("button", props, props.children),
}));
vi.mock("@subboost/ui/components/ui/textarea", () => ({
  Textarea: (props: any) => {
    mocks.textareas.push(props);
    return React.createElement("textarea", props);
  },
}));
vi.mock("@subboost/core/templates/config-yaml", () => ({
  stringifySubBoostTemplateConfig: (config: any) => `template: ${config.template}\nmodules: ${config.enabledProxyGroups.length}\n`,
}));

function config(): SubBoostTemplateConfig {
  return {
    schema: "subboost-template-config/v1",
    template: "minimal",
    enabledProxyGroups: ["select", "auto", "ad", "final"],
    hiddenProxyGroups: [],
    customProxyGroups: [
      {
        id: "custom-a",
        name: "机场 A",
        emoji: "A",
        groupType: "select",
        memberSource: "filtered-nodes",
        includeInGroupMembers: true,
        description: "provider a",
        advanced: { sourceKeys: ["airport-a"] },
      },
    ],
    proxyGroupAdvanced: {},
    proxyGroupAdvancedModeEnabled: false,
    customRuleSets: [],
    builtinRuleEdits: {},
    customRules: [],
    ruleOrder: [],
    cnIpNoResolve: true,
    experimentalCnUseCnRuleSet: true,
    dialerProxyGroups: [],
    proxyGroupNameOverrides: {},
    dnsYaml: "",
    mixedPort: 7897,
    allowLan: true,
    testUrl: "https://www.gstatic.com/generate_204",
    testInterval: 300,
    ruleProviderBaseUrl: "https://rules.example.com",
  };
}

describe("TemplateConfigEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buttons = [];
    mocks.inputs = [];
    mocks.selects = [];
    mocks.switches = [];
    mocks.textareas = [];
  });

  it("renders visual sections and emits yaml-backed config changes", () => {
    const onConfigChange = vi.fn();
    const onYamlChange = vi.fn();
    const html = renderToStaticMarkup(
      React.createElement(TemplateConfigEditor, {
        config: config(),
        yaml: "template: minimal\n",
        onConfigChange,
        onYamlChange,
      }),
    );

    expect(html).toContain("基础设置");
    expect(html).toContain("分流目标组");
    expect(html).toContain("新增目标组");
    expect(html).toContain("点击“添加”创建机场 A、自建 A 这类目标组");
    expect(html).toContain("预设规则模块");
    expect(html).toContain("机场 A");
    expect(html).toContain("分流规则");
    expect(html).toContain("DNS");

    mocks.inputs[0].onChange({ target: { value: "7899" } });
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ mixedPort: 7899 }));
    expect(onYamlChange).toHaveBeenCalledWith(expect.stringContaining("template: minimal"));

    const addGroupButton = mocks.buttons.find((props) => props.title === "添加目标组");
    addGroupButton.onClick();
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({
      customProxyGroups: [expect.objectContaining({ name: "机场 A" }), expect.objectContaining({ name: "新分流组" })],
    }));

    const searchInput = mocks.inputs.find((props) => props.placeholder === "搜索目标组");
    searchInput.onChange({ target: { value: "机场" } });

    const nameInput = mocks.inputs.find((props) => props.value === "机场 A");
    nameInput.onChange({ target: { value: "机场 A 改" } });
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({
      customProxyGroups: [expect.objectContaining({ name: "机场 A 改" })],
    }));

    const moduleTargetSelect = mocks.selects.find((props) => props.value === "🛑 广告拦截");
    moduleTargetSelect.onValueChange("机场 A");
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({
      builtinRuleEdits: expect.objectContaining({
        "module:ad:category-ads-all": expect.objectContaining({ target: "机场 A" }),
      }),
    }));

    mocks.textareas.at(-1).onChange({ target: { value: "template: full\n" } });
    expect(onYamlChange).toHaveBeenCalledWith("template: full\n");
  });
});

function textOf(children: unknown): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(textOf).join("");
  if (React.isValidElement(children)) return textOf((children.props as { children?: unknown }).children);
  return "";
}
