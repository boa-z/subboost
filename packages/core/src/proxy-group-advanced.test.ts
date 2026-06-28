import { describe, expect, it } from "vitest";
import {
  normalizeProxyGroupAdvancedConfig,
  normalizeProxyGroupMemberRef,
  resolveProxyGroupMembers,
} from "./proxy-group-advanced";
import { withNodeSourceId, withNodeSourceMetadata } from "./subscription/node-source-state";
import type { ParsedNode } from "@subboost/core/types/node";

function node(name: string): ParsedNode {
  return {
    name,
    type: "ss",
    server: `${name.toLowerCase().replace(/\s+/g, "-")}.example.com`,
    port: 8388,
    cipher: "aes-128-gcm",
    password: "secret",
  } as ParsedNode;
}

describe("resolveProxyGroupMembers", () => {
  it("normalizes advanced config and member refs conservatively", () => {
    expect(normalizeProxyGroupMemberRef({ kind: "node", name: " Node A " })).toEqual({ kind: "node", name: "Node A" });
    expect(normalizeProxyGroupMemberRef({ kind: "module", id: " auto " })).toEqual({ kind: "module", id: "auto" });
    expect(normalizeProxyGroupMemberRef({ kind: "custom", id: " media " })).toEqual({ kind: "custom", id: "media" });
    expect(normalizeProxyGroupMemberRef({ kind: "direct" })).toEqual({ kind: "direct" });
    expect(normalizeProxyGroupMemberRef({ kind: "reject" })).toEqual({ kind: "reject" });
    expect(normalizeProxyGroupMemberRef(null)).toBeNull();
    expect(normalizeProxyGroupMemberRef("DIRECT")).toBeNull();
    expect(normalizeProxyGroupMemberRef({ kind: "node", name: "" })).toBeNull();
    expect(normalizeProxyGroupMemberRef({ kind: "module", id: " " })).toBeNull();
    expect(normalizeProxyGroupMemberRef({ kind: "custom", id: " " })).toBeNull();
    expect(normalizeProxyGroupMemberRef([])).toBeNull();

    expect(
      normalizeProxyGroupAdvancedConfig({
        memberMode: "groups-only",
        sourceKeys: [" Airport A ", "airport-a", "", 1],
        regions: ["US", "other", "bad", "us"],
        includeRegex: " IEPL ",
        excludeRegex: " 测试 ",
        groupType: "load-balance",
        strategy: "bad",
        extraMembers: [{ kind: "direct" }, { kind: "direct" }, { kind: "node", name: "Node A" }],
        excludedMembers: [{ kind: "reject" }, { kind: "node", name: "" }],
        memberOrder: [{ kind: "node", name: "Node A" }, { kind: "node", name: "Node A" }],
      }),
    ).toEqual({
      memberMode: "groups-only",
      sourceKeys: ["airport-a"],
      regions: ["us", "other"],
      includeRegex: "IEPL",
      excludeRegex: "测试",
      groupType: "load-balance",
      strategy: "consistent-hashing",
      extraMembers: [{ kind: "direct" }, { kind: "node", name: "Node A" }],
      excludedMembers: [{ kind: "reject" }],
      memberOrder: [{ kind: "node", name: "Node A" }],
    });

    expect(normalizeProxyGroupAdvancedConfig(null)).toEqual({});
    expect(normalizeProxyGroupAdvancedConfig({ groupType: "select", strategy: "round-robin" })).toEqual({
      groupType: "select",
    });
    expect(normalizeProxyGroupAdvancedConfig([])).toEqual({});
    expect(normalizeProxyGroupAdvancedConfig({ groupType: "url-test" })).toEqual({ groupType: "url-test" });
    expect(normalizeProxyGroupAdvancedConfig({ groupType: "fallback" })).toEqual({ groupType: "fallback" });
    expect(normalizeProxyGroupAdvancedConfig({ groupType: "direct-first" })).toEqual({ groupType: "direct-first" });
    expect(normalizeProxyGroupAdvancedConfig({ groupType: "reject-first" })).toEqual({ groupType: "reject-first" });
    expect(normalizeProxyGroupAdvancedConfig({ groupType: "unknown" })).toEqual({});
    expect(
      normalizeProxyGroupAdvancedConfig({
        sourceKeys: "source-a",
        memberMode: "bad",
        regions: "us",
        includeRegex: 1,
        excludeRegex: 2,
        groupType: "load-balance",
        strategy: "round-robin",
        extraMembers: "bad",
        excludedMembers: "bad",
        memberOrder: "bad",
      }),
    ).toEqual({
      groupType: "load-balance",
      strategy: "round-robin",
    });
  });

  it("supports groups-only member mode while preserving explicit extra nodes", () => {
    const result = resolveProxyGroupMembers({
      defaultProxyNames: ["Auto", "Custom", "Node A", "Node B", "DIRECT", "REJECT"],
      availableProxyNames: ["Auto", "Custom", "Node A", "Node B", "DIRECT", "REJECT"],
      nodes: [node("Node A"), node("Node B")],
      moduleNames: { auto: "Auto" },
      customProxyGroups: [{ id: "custom", name: "Custom", emoji: "", groupType: "select" }],
      advanced: {
        memberMode: "groups-only",
        extraMembers: [{ kind: "node", name: "Node B" }],
      },
    });

    expect(result.included.map((member) => member.key)).toEqual([
      "module:auto",
      "custom:custom",
      "node:Node B",
      "direct:DIRECT",
      "reject:REJECT",
    ]);
    expect(result.excluded.map((member) => member.key)).toEqual(["node:Node A"]);
  });

  it("filters self custom references without dropping a node with the same name", () => {
    const result = resolveProxyGroupMembers({
      defaultProxyNames: ["Self Group", "Other Node"],
      availableProxyNames: ["Self Group", "Other Node", "Peer Group"],
      nodes: [node("Self Group"), node("Other Node")],
      customProxyGroups: [
        { id: "self", name: "Self Group", emoji: "", groupType: "select" },
        { id: "peer", name: "Peer Group", emoji: "", groupType: "select" },
      ],
      advanced: {
        extraMembers: [
          { kind: "custom", id: "self" },
          { kind: "custom", id: "peer" },
        ],
        memberOrder: [
          { kind: "node", name: "Self Group" },
          { kind: "custom", id: "self" },
          { kind: "custom", id: "peer" },
        ],
      },
      self: { kind: "custom", id: "self", name: "Self Group" },
    });

    expect(result.included.map((member) => member.key)).toEqual([
      "node:Self Group",
      "custom:peer",
      "node:Other Node",
    ]);
    expect(result.proxyNames).toEqual(["Self Group", "Peer Group", "Other Node"]);
    expect(result.included.map((member) => member.key)).not.toContain("custom:self");
  });

  it("applies source, region, regex, exclusion, and extra-member filters together", () => {
    const result = resolveProxyGroupMembers({
      defaultProxyNames: [
        "US Source",
        "US Other",
        "Japan Source",
        "Mars Source",
        "DIRECT",
        "REJECT",
      ],
      nodes: [
        withNodeSourceMetadata(node("US Source"), { sourceId: "source-a", sourceKey: "airport-a" }),
        withNodeSourceMetadata(node("US Other"), { sourceId: "source-b", sourceKey: "airport-b" }),
        withNodeSourceMetadata(node("Japan Source"), { sourceId: "source-a", sourceKey: "airport-a" }),
        withNodeSourceMetadata(node("Mars Source"), { sourceId: "source-a", sourceKey: "airport-a" }),
      ],
      advanced: {
        sourceKeys: ["airport-a"],
        regions: ["us", "other"],
        includeRegex: "Source|DIRECT",
        excludeRegex: "Mars",
        extraMembers: [{ kind: "direct" }],
        excludedMembers: [{ kind: "reject" }],
      },
    });

    expect(result.included.map((member) => member.key)).toEqual([
      "node:US Source",
      "direct:DIRECT",
    ]);
    expect(result.excluded.map((member) => member.key)).toEqual([
      "node:US Other",
      "node:Japan Source",
      "node:Mars Source",
      "reject:REJECT",
    ]);

    const invalidRegexResult = resolveProxyGroupMembers({
      defaultProxyNames: ["US Source"],
      nodes: [withNodeSourceMetadata(node("US Source"), { sourceId: "source-a", sourceKey: "airport-a" })],
      advanced: {
        sourceKeys: ["airport-a"],
        includeRegex: "[",
        excludeRegex: "[",
      },
    });

    expect(invalidRegexResult.proxyNames).toEqual(["US Source"]);
  });

  it("filters nodes by stable source keys", () => {
    const result = resolveProxyGroupMembers({
      defaultProxyNames: ["Airport A HK", "Airport B JP", "DIRECT"],
      nodes: [
        withNodeSourceMetadata(node("Airport A HK"), {
          sourceId: "source-a-runtime",
          sourceKey: "airport-a",
          sourceTag: "机场 A",
        }),
        withNodeSourceMetadata(node("Airport B JP"), {
          sourceId: "source-b-runtime",
          sourceKey: "airport-b",
          sourceTag: "机场 B",
        }),
      ],
      advanced: {
        sourceKeys: ["airport-a"],
      },
    });

    expect(result.proxyNames).toEqual(["Airport A HK", "DIRECT"]);
    expect(result.excluded.map((member) => member.key)).toEqual(["node:Airport B JP"]);
  });

  it("resolves module/custom members, unavailable refs, and explicit ordering", () => {
    const result = resolveProxyGroupMembers({
      defaultProxyNames: ["Auto", "Custom", "Unknown", "DIRECT"],
      availableProxyNames: ["Auto", "Custom", "Other Node", "REJECT"],
      nodes: [node("Other Node")],
      moduleNames: { auto: "Auto" },
      customProxyGroups: [
        { id: "custom", name: "Custom", emoji: "", groupType: "select" },
        { id: "disabled", name: "Disabled", emoji: "", groupType: "select", enabled: false },
      ],
      advanced: {
        extraMembers: [
          { kind: "node", name: "Other Node" },
          { kind: "custom", id: "missing" },
          { kind: "custom", id: "disabled" },
          { kind: "reject" },
        ],
        memberOrder: [
          { kind: "reject" },
          { kind: "node", name: "Other Node" },
          { kind: "module", id: "auto" },
        ],
      },
      self: { kind: "module", id: "self", name: "Self" },
    });

    expect(result.included.map((member) => member.key)).toEqual([
      "reject:REJECT",
      "node:Other Node",
      "module:auto",
      "custom:custom",
      "direct:DIRECT",
    ]);
    expect(result.excluded.map((member) => member.key)).toEqual([]);
  });

  it("covers fallback members, unmatched regions, and unavailable candidate handling", () => {
    const unmatchedRegion = resolveProxyGroupMembers({
      defaultProxyNames: ["France Node"],
      nodes: [node("France Node")],
      advanced: { regions: ["jp"] },
    });
    const otherRegion = resolveProxyGroupMembers({
      defaultProxyNames: ["US Relay", "Relay X"],
      nodes: [node("US Relay"), node("Relay X")],
      advanced: { regions: ["other"] },
    });
    const extraOnly = resolveProxyGroupMembers({
      defaultProxyNames: [],
      nodes: [node("Extra Node")],
      moduleNames: { auto: "Auto" },
      customProxyGroups: [
        { id: "custom", name: "Custom", emoji: "", groupType: "select" },
        { id: "empty-name", name: " ", emoji: "", groupType: "select" },
        { id: "disabled", name: "Disabled", emoji: "", groupType: "select", enabled: false },
      ],
      advanced: {
        extraMembers: [
          { kind: "direct" },
          { kind: "reject" },
          { kind: "node", name: "Extra Node" },
          { kind: "node", name: "Missing Node" },
          { kind: "module", id: "auto" },
          { kind: "module", id: "missing" },
          { kind: "custom", id: "custom" },
          { kind: "custom", id: "empty-name" },
          { kind: "custom", id: "disabled" },
        ],
        excludedMembers: [{ kind: "reject" }],
        memberOrder: [
          { kind: "custom", id: "custom" },
          { kind: "custom", id: "custom" },
          { kind: "module", id: "missing" },
          { kind: "direct" },
        ],
      },
    });

    expect(unmatchedRegion.included).toEqual([]);
    expect(unmatchedRegion.excluded.map((member) => member.key)).toEqual(["node:France Node"]);
    expect(otherRegion.included.map((member) => member.key)).toEqual(["node:Relay X"]);
    expect(otherRegion.excluded.map((member) => member.key)).toEqual(["node:US Relay"]);
    expect(extraOnly.included.map((member) => member.key)).toEqual([
      "custom:custom",
      "direct:DIRECT",
      "node:Extra Node",
      "module:auto",
    ]);
    expect(extraOnly.excluded.map((member) => member.key)).toEqual(["reject:REJECT"]);
  });

  it("handles malformed names, missing refs, and self guards while resolving extras", () => {
    const result = resolveProxyGroupMembers({
      defaultProxyNames: ["", "Auto", "Self Module", "Disabled", "Nameless", "Node A", "Node A", "Ghost"],
      nodes: [node("Node A"), node("Allowed")],
      moduleNames: {
        "": "Bad Module",
        auto: "Auto",
        blank: " ",
        self: "Self Module",
      },
      customProxyGroups: [
        { id: "disabled", name: "Disabled", emoji: "", groupType: "select", enabled: false },
        { id: "", name: "No Id", emoji: "", groupType: "select" },
        { id: "nameless", name: " ", emoji: "", groupType: "select" },
        { id: "custom", name: "Custom", emoji: "", groupType: "select" },
      ],
      advanced: {
        extraMembers: [
          { kind: "module", id: "auto" },
          { kind: "module", id: "blank" },
          { kind: "module", id: "missing" },
          { kind: "custom", id: "custom" },
          { kind: "custom", id: "nameless" },
          { kind: "node", name: "Allowed" },
          { kind: "node", name: "Missing Node" },
          { kind: "direct" },
        ],
        excludedMembers: [{ kind: "module", id: "auto" }],
        memberOrder: [
          { kind: "node", name: "Missing Node" },
          { kind: "custom", id: "custom" },
          { kind: "direct" },
        ],
      },
      self: { kind: "module", id: "self", name: "Self Module" },
    });

    expect(result.included.map((member) => member.key)).toEqual([
      "custom:custom",
      "direct:DIRECT",
      "node:Node A",
      "node:Allowed",
    ]);
    expect(result.excluded.map((member) => member.key)).toEqual(["module:auto"]);
  });

  it("keeps fallback resolution stable for sparse options and filter misses", () => {
    expect(
      normalizeProxyGroupAdvancedConfig({
        regions: [1, "DE"],
        groupType: "load-balance",
        strategy: "sticky-sessions",
      }),
    ).toEqual({
      regions: ["de"],
      groupType: "load-balance",
      strategy: "sticky-sessions",
    });

    const noAvailableNames = resolveProxyGroupMembers({
      defaultProxyNames: ["REJECT", "Missing Node", "German Node", "Hidden Node", 1] as unknown as string[],
      nodes: [withNodeSourceMetadata(node("German Node"), { sourceId: "source-a", sourceKey: "airport-a" }), node("Hidden Node")],
      advanced: {
        sourceKeys: ["airport-b"],
        includeRegex: "Visible",
      },
    });
    const noAdvanced = resolveProxyGroupMembers({
      defaultProxyNames: ["German Node"],
      nodes: [node("German Node")],
    });
    const emptyNames = resolveProxyGroupMembers({
      defaultProxyNames: undefined as unknown as string[],
      availableProxyNames: undefined,
      nodes: [node("German Node")],
      advanced: {},
    });

    expect(noAvailableNames.included.map((member) => member.key)).toEqual(["reject:REJECT"]);
    expect(noAvailableNames.excluded.map((member) => member.key)).toEqual(["node:German Node", "node:Hidden Node"]);
    expect(noAdvanced.proxyNames).toEqual(["German Node"]);
    expect(emptyNames.included).toEqual([]);
    expect(emptyNames.excluded).toEqual([]);
  });

  it("normalizes sparse advanced values and resolves members from fallback references", () => {
    expect(
      normalizeProxyGroupAdvancedConfig({
        sourceKeys: ["", " airport-a ", "airport-b"],
        regions: ["bad", "KR", "kr"],
        includeRegex: " ",
        excludeRegex: "",
        groupType: "load-balance",
        strategy: "sticky-sessions",
        extraMembers: [
          null,
          { kind: "node", name: " Node B " },
          { kind: "node", name: "Node B" },
          { kind: "module", id: " auto " },
          { kind: "custom", id: "custom" },
        ],
        excludedMembers: [
          { kind: "direct" },
          { kind: "direct" },
          { kind: "custom", id: "disabled" },
        ],
        memberOrder: [
          { kind: "custom", id: "custom" },
          { kind: "module", id: "auto" },
          { kind: "direct" },
        ],
      }),
    ).toEqual({
      sourceKeys: ["airport-a", "airport-b"],
      regions: ["kr"],
      groupType: "load-balance",
      strategy: "sticky-sessions",
      extraMembers: [
        { kind: "node", name: "Node B" },
        { kind: "module", id: "auto" },
        { kind: "custom", id: "custom" },
      ],
      excludedMembers: [{ kind: "direct" }, { kind: "custom", id: "disabled" }],
      memberOrder: [
        { kind: "custom", id: "custom" },
        { kind: "module", id: "auto" },
        { kind: "direct" },
      ],
    });

    const result = resolveProxyGroupMembers({
      defaultProxyNames: ["Auto", "Custom", "DIRECT", "REJECT", "Korea Node", "Unknown"],
      availableProxyNames: ["Auto", "Custom", "DIRECT", "REJECT", "Korea Node", "Other Node"],
      nodes: [
        withNodeSourceMetadata(node("Korea Node"), { sourceId: "source-a", sourceKey: "airport-a" }),
        withNodeSourceMetadata(node("Other Node"), { sourceId: "source-b", sourceKey: "airport-b" }),
      ],
      moduleNames: { auto: "Auto", blank: " " },
      customProxyGroups: [
        { id: "custom", name: "Custom", emoji: "", groupType: "select" },
        { id: "disabled", name: "Disabled", emoji: "", groupType: "select", enabled: false },
      ],
      advanced: {
        sourceKeys: ["airport-a"],
        regions: ["kr"],
        extraMembers: [
          { kind: "node", name: "Other Node" },
          { kind: "module", id: "auto" },
          { kind: "custom", id: "custom" },
          { kind: "direct" },
          { kind: "custom", id: "disabled" },
        ],
        excludedMembers: [{ kind: "direct" }],
        memberOrder: [
          { kind: "custom", id: "custom" },
          { kind: "module", id: "auto" },
          { kind: "node", name: "Korea Node" },
          { kind: "node", name: "Other Node" },
        ],
      },
    });

    expect(result.included.map((member) => member.key)).toEqual([
      "custom:custom",
      "module:auto",
      "node:Korea Node",
      "node:Other Node",
      "reject:REJECT",
    ]);
    expect(result.excluded.map((member) => member.key)).toEqual(["direct:DIRECT"]);
  });
});
