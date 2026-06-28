import { describe, expect, it } from "vitest";
import { getModulesForTemplate } from "@subboost/core/generator/proxy-groups";
import { getBuiltinTemplateConfig, getBuiltinTemplateYaml } from "./builtin";
import { parseSubBoostTemplateYaml, stringifySubBoostTemplateConfig } from "./config-yaml";

describe("SubBoost template YAML", () => {
  it("parses, normalizes, and exports built-in yaml templates", () => {
    for (const type of ["minimal", "standard", "full"] as const) {
      const yaml = getBuiltinTemplateYaml(type);
      const parsed = parseSubBoostTemplateYaml(yaml);

      expect(parsed).toEqual(expect.objectContaining({ ok: true }));
      if (!parsed.ok) continue;
      expect(parsed.config.template).toBe(type);
      expect(parsed.config.enabledProxyGroups).toEqual(getModulesForTemplate(type));
      expect(getBuiltinTemplateConfig(type)).toEqual(parsed.config);
    }
  });

  it("rejects invalid yaml and keeps stable field order", () => {
    expect(parseSubBoostTemplateYaml("")).toEqual({ ok: false, error: "YAML 模板不能为空" });
    expect(parseSubBoostTemplateYaml("schema: nope")).toEqual({ ok: false, error: "模板配置 schema 无效" });

    const yaml = stringifySubBoostTemplateConfig(getBuiltinTemplateConfig("minimal"));
    expect(yaml.indexOf("schema:")).toBeLessThan(yaml.indexOf("template:"));
    expect(yaml.indexOf("template:")).toBeLessThan(yaml.indexOf("enabledProxyGroups:"));
  });
});
