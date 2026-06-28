import { describe, expect, it } from "vitest";
import { buildProxyProvidersFromConfig } from "./proxy-providers";

describe("proxy provider config builder", () => {
  it("returns undefined when no URL source can safely become a provider", () => {
    expect(buildProxyProvidersFromConfig({}, { testUrl: "https://test.example.com", testInterval: 60 })).toBeUndefined();
    expect(
      buildProxyProvidersFromConfig(
        {
          sources: [
            null,
            "bad",
            { type: "text", useProxyProviders: true, content: "https://example.com/sub" },
            { type: "url", useProxyProviders: false, content: "https://example.com/sub" },
            { type: "url", useProxyProviders: true, content: "" },
            { type: "url", useProxyProviders: true, content: "ftp://example.com/sub" },
          ],
        },
        { testUrl: "https://test.example.com", testInterval: 60 }
      )
    ).toBeUndefined();
  });

  it("normalizes safe provider names and skips duplicates", () => {
    const providers = buildProxyProvidersFromConfig(
      {
        sources: [
          { id: " airport one ", type: "url", useProxyProviders: true, content: " https://a.example.com/sub " },
          { id: "airport one", type: "url", useProxyProviders: true, content: "https://duplicate.example.com/sub" },
          { type: "url", useProxyProviders: true, content: "https://b.example.com/sub" },
          { id: "bad/url", type: "url", useProxyProviders: true, content: "https://c.example.com/sub" },
        ],
      },
      { testUrl: "https://test.example.com", testInterval: 120 }
    );

    expect(providers).toMatchObject({
      url_airport_one: {
        type: "http",
        url: "https://a.example.com/sub",
        interval: 3600,
        path: "./proxy_providers/url_airport_one.yaml",
        "health-check": {
          enable: true,
          url: "https://test.example.com",
          interval: 120,
        },
      },
      url_1: {
        type: "http",
        url: "https://b.example.com/sub",
      },
      url_bad_url: {
        type: "http",
        url: "https://c.example.com/sub",
      },
    });
    expect(Object.keys(providers || {})).toEqual(["url_airport_one", "url_1", "url_bad_url"]);
  });

  it("builds structured Mihomo provider fields from source provider config", () => {
    const providers = buildProxyProvidersFromConfig(
      {
        sources: [
          {
            id: "source-a",
            sourceKey: "airport-a",
            type: "url",
            useProxyProviders: true,
            content: "https://fallback.example.com/sub",
            proxyProvider: {
              name: "provider1",
              url: "https://provider.example.com/sub.yaml",
              interval: "1800",
              proxy: "DIRECT",
              "size-limit": 0,
              "age-secret-key": "AGE-SECRET-KEY",
              header: {
                "User-Agent": ["mihomo/1.18.3"],
                Authorization: "token 123",
                Empty: "",
              },
              "health-check": {
                enable: true,
                url: "https://www.gstatic.com/generate_204",
                interval: 300,
                timeout: 5000,
                lazy: false,
                "expected-status": 204,
              },
              override: {
                udp: true,
                "dialer-proxy": "proxy",
                "additional-prefix": "provider1 prefix |",
              },
              filter: "(?i)港|hk",
              "exclude-filter": "xxx",
              "exclude-type": "ss|http",
              payload: [{ name: "ss1", type: "ss" }],
            },
          },
        ],
      },
      { testUrl: "https://test.example.com", testInterval: 120 }
    );

    expect(providers).toEqual({
      provider1: {
        type: "http",
        url: "https://provider.example.com/sub.yaml",
        interval: 1800,
        path: "./proxy_providers/provider1.yaml",
        proxy: "DIRECT",
        "size-limit": 0,
        "age-secret-key": "AGE-SECRET-KEY",
        header: {
          "User-Agent": ["mihomo/1.18.3"],
          Authorization: ["token 123"],
        },
        "health-check": {
          enable: true,
          lazy: false,
          url: "https://www.gstatic.com/generate_204",
          interval: 300,
          timeout: 5000,
          "expected-status": 204,
        },
        override: {
          udp: true,
          "dialer-proxy": "proxy",
          "additional-prefix": "provider1 prefix |",
        },
        filter: "(?i)港|hk",
        "exclude-filter": "xxx",
        "exclude-type": "ss|http",
        payload: [{ name: "ss1", type: "ss" }],
      },
    });
  });
});
