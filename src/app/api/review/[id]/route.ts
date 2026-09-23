import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { updateReviewSchema } from "@/lib/validation";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json();
  const parsed = updateReviewSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { status } = parsed.data;

  try {
    const review = await prisma.reviewQueue.update({
      where: { id },
      data: {
        status,
        resolvedAt: status === "OPEN" ? null : new Date()
      },
      include: {
        item: {
          select: {
            id: true,
            assetTag: true,
            name: true,
            category: true
          }
        }
      }
    });

    return NextResponse.json({ review });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "Review item not found" }, { status: 404 });
    }

    console.error(error);
    return NextResponse.json({ error: "Review update failed" }, { status: 500 });
  }
}
