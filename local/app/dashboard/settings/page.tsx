"use client";

import * as React from "react";
import { Download, LogOut, ServerCog, ShieldCheck, Upload } from "lucide-react";

import { Button } from "@subboost/ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@subboost/ui/components/ui/card";
import { useUserStore } from "@subboost/ui/store/user-store";

type BackupImportResult = {
  subscriptions?: {
    imported?: unknown;
    skipped?: unknown;
  };
  templates?: {
    imported?: unknown;
    skipped?: unknown;
  };
};

function readCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function buildImportMessage(result: BackupImportResult): string {
  const subscriptionImported = readCount(result.subscriptions?.imported);
  const subscriptionSkipped = readCount(result.subscriptions?.skipped);
  const templateImported = readCount(result.templates?.imported);
  const templateSkipped = readCount(result.templates?.skipped);
  const skipped = subscriptionSkipped + templateSkipped;
  return `导入完成：${subscriptionImported} 个订阅，${templateImported} 个模板${skipped > 0 ? `，跳过 ${skipped} 项` : ""}`;
}

export default function SettingsPage() {
  const { user, fetchUser, logout } = useUserStore();
  const [backupStatus, setBackupStatus] = React.useState<string>("");
  const [backupError, setBackupError] = React.useState<string>("");
  const [isExporting, setIsExporting] = React.useState(false);
  const [isImporting, setIsImporting] = React.useState(false);
  const [replaceOnImport, setReplaceOnImport] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    void fetchUser();
  }, [fetchUser]);

  const handleLogout = async () => {
    await logout();
    window.location.href = "/login";
  };

  const handleExportBackup = async () => {
    setBackupStatus("");
    setBackupError("");
    setIsExporting(true);
    try {
      const response = await fetch("/api/backup", { cache: "no-store" });
      if (!response.ok) throw new Error("导出失败，请确认已登录。");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `subboost-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setBackupStatus("已导出备份文件");
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : "导出失败");
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportBackupFile = async (file: File | null | undefined) => {
    if (!file) return;
    setBackupStatus("");
    setBackupError("");
    setIsImporting(true);
    try {
      const backup = JSON.parse(await file.text()) as unknown;
      const response = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: replaceOnImport ? "replace" : "append",
          backup,
        }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string; result?: BackupImportResult } | null;
      if (!response.ok) throw new Error(data?.error || "导入失败，请检查备份文件。");
      setBackupStatus(buildImportMessage(data?.result || {}));
      await fetchUser();
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : "导入失败");
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1">账户设置</h1>
          <p className="text-white/50">本地管理员、订阅容量和运行端点</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 space-y-0">
            <div className="rounded-lg bg-indigo-500/20 p-2 text-indigo-300">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <CardTitle className="text-base">本地管理员</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs text-white/40">用户名</p>
              <p className="mt-1 font-medium">{user?.username || "未登录"}</p>
            </div>
            <div>
              <p className="text-xs text-white/40">已保存订阅</p>
              <p className="mt-1 font-medium">{user ? `${user.subscriptionCount} / ${user.quota.maxSubscriptions}` : "-"}</p>
            </div>
            <Button variant="destructive" className="gap-2" onClick={() => void handleLogout()} disabled={!user}>
              <LogOut className="h-4 w-4" />
              退出登录
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-3 space-y-0">
            <div className="rounded-lg bg-sky-500/20 p-2 text-sky-300">
              <ServerCog className="h-5 w-5" />
            </div>
            <CardTitle className="text-base">运行端点</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-white/60">
            <div>
              <p className="text-xs text-white/40">存活检查</p>
              <code className="mt-1 block rounded-md bg-white/5 px-3 py-2 text-white/70">/api/health/live</code>
            </div>
            <div>
              <p className="text-xs text-white/40">就绪检查</p>
              <code className="mt-1 block rounded-md bg-white/5 px-3 py-2 text-white/70">/api/health/ready</code>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-3 space-y-0">
            <div className="rounded-lg bg-emerald-500/20 p-2 text-emerald-300">
              <Download className="h-5 w-5" />
            </div>
            <CardTitle className="text-base">备份与恢复</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-white/55">
              导出当前账号已保存的订阅和自定义模板；导入备份时默认追加为新数据。
            </p>
            <div className="flex flex-wrap gap-2">
              <Button className="gap-2" onClick={() => void handleExportBackup()} disabled={!user || isExporting}>
                <Download className="h-4 w-4" />
                {isExporting ? "导出中" : "导出备份"}
              </Button>
              <Button
                variant="secondary"
                className="gap-2"
                onClick={() => fileInputRef.current?.click()}
                disabled={!user || isImporting}
              >
                <Upload className="h-4 w-4" />
                {isImporting ? "导入中" : "导入备份"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => void handleImportBackupFile(event.target.files?.[0])}
              />
            </div>
            <label className="flex items-start gap-2 text-xs text-white/50">
              <input
                type="checkbox"
                checked={replaceOnImport}
                onChange={(event) => setReplaceOnImport(event.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 accent-emerald-500"
              />
              <span>
                导入前清空当前已保存订阅和自定义模板
              </span>
            </label>
            {backupStatus && <p className="text-xs text-emerald-300">{backupStatus}</p>}
            {backupError && <p className="text-xs text-red-300">{backupError}</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
