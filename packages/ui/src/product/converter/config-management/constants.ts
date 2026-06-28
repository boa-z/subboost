import { FileCode, Link2, Server } from "lucide-react";
import type { SourceType } from "@subboost/ui/store/config-store";

export const sourceTypeInfo: Record<
  SourceType,
  {
    label: string;
    icon: typeof Link2;
    placeholder: string;
  }
> = {
  url: { label: "订阅链接", icon: Link2, placeholder: "https://example.com/sub?token=xxx" },
  yaml: { label: "YAML 配置", icon: FileCode, placeholder: "proxies:\n  - name: 节点名称\n    type: vmess\n    ..." },
  nodes: {
    label: "节点链接",
    icon: Server,
    placeholder:
      "ss://...\nssr://...\nvmess://...\nvless://...\ntrojan://...\nanytls://...\nhysteria2://... / hy2://...\ntuic://...\n(socks5://... / socks4://...)",
  },
};
