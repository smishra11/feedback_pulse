"use server";

import { revalidatePath } from "next/cache";
import { ResponseService } from "@/services/response.service";

export async function toggleFlagAction(id: string, isFlagged: boolean) {
  await ResponseService.toggleFlag(id, isFlagged);

  // Revalidate the brand detail page so the table fetches the fresh data
  revalidatePath("/brands/[slug]", "page");
}
