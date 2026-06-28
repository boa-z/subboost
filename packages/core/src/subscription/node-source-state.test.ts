import { describe, expect, it } from "vitest";
import type { ParsedNode } from "../types/node";
import {
  ORIGIN_NAME_KEY,
  SOURCE_IDS_KEY,
  getNodeOriginName,
  getNodeSourceIds,
  getNodeSourceKeys,
  getNodeSourceTags,
  keepOnlyValidNodeSourceIds,
  makeUniqueName,
  normalizeNodeOriginName,
  normalizeSourceKey,
  withNodeSourceMetadata,
  withNodeSourceId,
  withUniqueNodeNames,
  withoutNodeSourceIds,
} from "./node-source-state";

function node(name: string, patch: Record<string, unknown> = {}): ParsedNode {
  return {
    name,
    type: "ss",
    server: "ss.example.com",
    port: 8388,
    cipher: "aes-128-gcm",
    password: "secret",
    ...patch,
  } as ParsedNode;
}

describe("node source state helpers", () => {
  it("makes unique node names and preserves unchanged nodes by identity", () => {
    const used = new Set(["Node", "Node (2)", "未命名节点"]);
    expect(makeUniqueName(" Node ", used)).toBe("Node (3)");
    expect(makeUniqueName(" ", used)).toBe("未命名节点 (2)");

    const first = node("Fresh");
    const result = withUniqueNodeNames([first, node("Fresh"), node("")], new Set<string>());
    expect(result[0]).toBe(first);
    expect(result.map((item) => item.name)).toEqual(["Fresh", "Fresh (2)", "未命名节点"]);
  });

  it("normalizes origin names and source ids conservatively", () => {
    const sourceNode = node("Renamed", {
      [ORIGIN_NAME_KEY]: " Origin ",
      [SOURCE_IDS_KEY]: [" a ", "", "a", 1, "b"],
    });

    expect(getNodeOriginName(sourceNode)).toBe(" Origin ");
    expect(getNodeOriginName(node("Plain", { [ORIGIN_NAME_KEY]: " " }))).toBe("Plain");
    expect(normalizeNodeOriginName(sourceNode)).toBe(sourceNode);
    expect(normalizeNodeOriginName(node("Plain"))).toMatchObject({
      [ORIGIN_NAME_KEY]: "Plain",
    });
    expect(getNodeSourceIds(sourceNode)).toEqual(["a", "b"]);
    expect(getNodeSourceIds(node("Plain", { [SOURCE_IDS_KEY]: "bad" }))).toEqual([]);
  });

  it("adds, removes, and filters source ids without losing unrelated nodes", () => {
    const base = node("Node");
    expect(withNodeSourceId(base, " ")).toBe(base);

    const withA = withNodeSourceId(base, " source-a ");
    const withDuplicate = withNodeSourceId(withA, "source-a");
    const withB = withNodeSourceId(withA, "source-b");

    expect(getNodeSourceIds(withA)).toEqual(["source-a"]);
    expect(withDuplicate).toEqual(withA);
    expect(getNodeSourceIds(withB)).toEqual(["source-a", "source-b"]);
    expect(withoutNodeSourceIds(base, new Set(["source-a"]))).toBe(base);
    expect(withoutNodeSourceIds(withB, new Set(["source-c"]))).toBe(withB);
    expect(withoutNodeSourceIds(withB, new Set(["source-b"]))).toMatchObject({
      [SOURCE_IDS_KEY]: ["source-a"],
    });
    expect(withoutNodeSourceIds(withA, new Set(["source-a"]))).toBeNull();
    expect(keepOnlyValidNodeSourceIds(base, new Set(["source-a"]))).toBe(base);
    expect(keepOnlyValidNodeSourceIds(withB, new Set(["source-a", "source-b"]))).toBe(withB);
    expect(keepOnlyValidNodeSourceIds(withB, new Set(["source-b"]))).toMatchObject({
      [SOURCE_IDS_KEY]: ["source-b"],
    });
    expect(keepOnlyValidNodeSourceIds(withA, new Set(["source-b"]))).toBeNull();
  });

  it("tracks stable source keys and tags for reusable node-pool filters", () => {
    const base = node("Node");
    const withAirport = withNodeSourceMetadata(base, {
      sourceId: " source-a ",
      sourceKey: " Airport A ",
      sourceTag: "机场 A",
    });
    const withDuplicate = withNodeSourceMetadata(withAirport, {
      sourceId: "source-a",
      sourceKey: "airport-a",
      sourceTag: "机场 A",
    });
    const withSelfHosted = withNodeSourceMetadata(withAirport, {
      sourceId: "source-b",
      sourceKey: "Self Hosted",
      sourceTag: "自建",
    });

    expect(normalizeSourceKey(" Airport A / HK ")).toBe("airport-a-hk");
    expect(getNodeSourceIds(withAirport)).toEqual(["source-a"]);
    expect(getNodeSourceKeys(withAirport)).toEqual(["airport-a"]);
    expect(getNodeSourceTags(withAirport)).toEqual(["机场 A"]);
    expect(withDuplicate).toEqual(withAirport);
    expect(getNodeSourceIds(withSelfHosted)).toEqual(["source-a", "source-b"]);
    expect(getNodeSourceKeys(withSelfHosted)).toEqual(["airport-a", "self-hosted"]);
    expect(getNodeSourceTags(withSelfHosted)).toEqual(["机场 A", "自建"]);
  });
});
