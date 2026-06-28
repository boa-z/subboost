"use client";

import {
  CheckCircle,
  Clock,
  Download,
  Globe,
  Heart,
  Layers,
  ListChecks,
  Loader2,
  Lock,
  Download as DownloadIcon,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@subboost/ui/components/ui/button";
import { Card, CardContent } from "@subboost/ui/components/ui/card";
import { cn } from "@subboost/ui/lib/utils";
import type { Template } from "./types";

export function TemplateCard({
  template,
  formatNumber,
  formatDate,
  engagementActionLabel = "收藏",
  engagementLoginRequiredLabel = "登录后可收藏",
  onEngage,
  onApply,
  onExport,
  onEdit,
  onDelete,
  isLoggedIn,
  isApplying,
  showDelete,
  showVisibility,
  showEngagement,
}: {
  template: Template;
  formatNumber: (num: number) => string;
  formatDate: (iso: string) => string;
  engagementActionLabel?: string;
  engagementLoginRequiredLabel?: string;
  onEngage: () => void;
  onApply: () => void;
  onExport?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  isLoggedIn: boolean;
  isApplying: boolean;
  showDelete: boolean;
  showVisibility: boolean;
  showEngagement: boolean;
}) {
  const groupCount = typeof template.proxyGroupCount === "number" ? template.proxyGroupCount : null;
  const ruleCount = typeof template.ruleCount === "number" ? template.ruleCount : null;
  return (
    <Card className="border-white/10 bg-white/5 hover:border-white/20 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="font-medium truncate">{template.name}</h4>
            <p className="text-sm text-white/50 mt-1 line-clamp-2">{template.description}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {onExport && (
              <Button
                variant="outline"
                size="icon"
                onClick={onExport}
                title="导出 YAML"
                className="h-8 w-8 border-white/10"
              >
                <DownloadIcon className="h-4 w-4" />
              </Button>
            )}
            {onEdit && (
              <Button
                variant="outline"
                size="icon"
                onClick={onEdit}
                title="编辑 YAML"
                className="h-8 w-8 border-white/10"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {showDelete && onDelete && (
              <Button
                variant="outline"
                size="icon"
                onClick={onDelete}
                title="删除"
                className="h-8 w-8 border-white/10 hover:border-red-500/40 hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <Button size="sm" onClick={onApply} disabled={isApplying} className="gap-1">
              {isApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              {isApplying ? "应用中" : "使用"}
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/40">
          <span className="inline-flex items-center gap-1">
            <Layers className="h-3.5 w-3.5" />
            {groupCount ?? "—"} 代理组
          </span>
          <span className="inline-flex items-center gap-1">
            <ListChecks className="h-3.5 w-3.5" />
            {ruleCount ?? "—"} 规则集
          </span>

          <span className="inline-flex items-center gap-1">
            <Download className="h-3.5 w-3.5" />
            {formatNumber(template.downloads)}
          </span>

          {showEngagement && (
            <button
              onClick={onEngage}
              disabled={!isLoggedIn}
              className={cn(
                "inline-flex items-center gap-1 transition-colors",
                template.isEngaged ? "text-red-400" : "hover:text-red-400",
                !isLoggedIn && "cursor-not-allowed opacity-50"
              )}
              title={!isLoggedIn ? engagementLoginRequiredLabel : engagementActionLabel}
            >
              <Heart className={cn("h-3.5 w-3.5", template.isEngaged && "fill-current")} />
              {formatNumber(template.engagementCount)}
            </button>
          )}

          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {formatDate(template.createdAt)}
          </span>

          {showVisibility && (
            <span className="inline-flex items-center gap-1">
              {template.isPublic ? (
                <>
                  <Globe className="h-3.5 w-3.5 text-green-400" />
                  公开
                </>
              ) : (
                <>
                  <Lock className="h-3.5 w-3.5 text-white/60" />
                  私有
                </>
              )}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
