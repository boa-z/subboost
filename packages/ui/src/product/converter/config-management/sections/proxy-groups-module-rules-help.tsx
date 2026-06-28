"use client";

import * as Popover from "@radix-ui/react-popover";
import { AlertCircle, HelpCircle } from "lucide-react";

export function ExperimentalCnRuleHelpButton() {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/40 transition-colors hover:bg-white/10 hover:text-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          aria-label="国内服务实验性选项说明"
          title="国内服务实验性选项说明"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={8}
          className="z-50 w-[420px] rounded-xl border border-white/10 bg-black/90 backdrop-blur-md shadow-2xl p-3"
        >
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-amber-300" />
              <div className="text-white font-medium">实验性：启用后置geosite/cn.mrs规则</div>
            </div>
            <div className="text-white/60 leading-relaxed">
              开启后，会额外启用 <span className="font-mono">cn</span>（
              <span className="font-mono">geosite/cn.mrs</span>）规则，该规则会被放到{" "}
              <span className="font-mono">🌍 非中国</span> 之后。
            </div>
            <div className="text-white/60 leading-relaxed">
              预期结果：不会发生DNS泄露的同时正确分流绝大多数国内站点；但也可能导致意料之外的分流错误。
            </div>
          </div>
          <Popover.Arrow className="fill-white/10" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function CnIpNoResolveHelpButton() {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/40 transition-colors hover:bg-white/10 hover:text-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          aria-label="国内服务 no-resolve 说明"
          title="国内服务 no-resolve 说明"
        >
          <AlertCircle className="h-3.5 w-3.5" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={8}
          className="z-50 w-[360px] rounded-xl border border-white/10 bg-black/90 backdrop-blur-md shadow-2xl p-3"
        >
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-300" />
              <div className="text-white font-medium">国内服务 cn-ip no-resolve</div>
            </div>
            <div className="text-white/60 leading-relaxed space-y-1">
              <div>
                开启后将使用 <span className="font-mono">RULE-SET,cn-ip,🔒 国内服务,no-resolve</span>
              </div>
              <div>开启：不会发生DNS泄露，但部分国内站点无法正确分流</div>
              <div>关闭：大多数国内站点可以正确分流，但会发生DNS泄露</div>
            </div>
            <div className="pt-2 border-t border-white/10 text-[10px] text-white/40">
              该开关仅影响“国内服务”的 GeoIP（cn-ip）规则，不影响其它代理组。
            </div>
          </div>
          <Popover.Arrow className="fill-white/10" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
