import { NextRequest } from "next/server";
import {
  adminUnauthorizedResponse,
  getRecipeAdminAccess,
} from "@/lib/recipe-admin-auth";
import {
  revalidateRecipesRequestSchema,
  revalidateRecipesSuccessSchema,
} from "@/lib/recipe-admin-contracts";
import { revalidateRecipePaths } from "@/lib/recipe-admin-revalidate";
import { parseJsonRequest } from "@/lib/recipe-admin-route-errors";

export const dynamic = "force-dynamic";

// Called by the CLI sync scripts, which write to Convex without going through
// Next, so prerendered recipe pages refresh at once instead of after revalidate.
export async function POST(request: NextRequest) {
  const access = await getRecipeAdminAccess();
  if (!access.ok) return adminUnauthorizedResponse(access);

  const parsed = await parseJsonRequest(request, revalidateRecipesRequestSchema);
  if (!parsed.ok) return parsed.response;

  const slugs = [...new Set(parsed.data.slugs)];
  for (const slug of slugs) revalidateRecipePaths(slug);

  return Response.json(
    revalidateRecipesSuccessSchema.parse({ type: "success", slugs }),
  );
}
