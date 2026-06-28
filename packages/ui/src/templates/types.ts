export interface Template {
  id: string;
  name: string;
  description: string;
  downloads: number;
  engagementCount: number;
  createdAt: string;
  tags: string[];
  isEngaged?: boolean;
  isOfficial?: boolean;
  isPublic?: boolean;
  proxyGroupCount?: number | null;
  ruleCount?: number | null;
  kind?: "yaml";
}

export type TabValue = "default" | "catalog" | "my";
