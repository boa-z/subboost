import { getOptionalCurrentAdmin, localAdminRequiredResponse } from "@local/lib/api-auth";
import { apiError, json, readJsonBody } from "@local/lib/http";
import { getTemplateDetail, updateTemplate } from "@local/lib/template-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const admin = await getOptionalCurrentAdmin();

  try {
    const template = await getTemplateDetail(admin?.id ?? null, id);
    if (!template) return apiError("Template not found.", "NOT_FOUND", 404);
    return json({ template });
  } catch (error) {
    if (!admin) return localAdminRequiredResponse();
    return apiError(error instanceof Error ? error.message : "Unable to load template.", "BAD_REQUEST", 400);
  }
}

export async function PUT(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const admin = await getOptionalCurrentAdmin();
  if (!admin) return localAdminRequiredResponse();

  const body = await readJsonBody(request);
  if (!body) return apiError("Invalid JSON body.", "BAD_REQUEST", 400);

  try {
    const template = await updateTemplate(admin.id, id, body);
    if (!template) return apiError("Template not found.", "NOT_FOUND", 404);
    return json({ template });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Unable to update template.", "BAD_REQUEST", 400);
  }
}
