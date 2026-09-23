import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createReviewSchema } from "@/lib/validation";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const includeClosed = searchParams.get("includeClosed") === "true";

  const reviews = await prisma.reviewQueue.findMany({
    where: includeClosed ? undefined : { status: "OPEN" },
    include: {
      item: {
        select: {
          id: true,
          assetTag: true,
          name: true,
          category: true
        }
      }
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100
  });

  return NextResponse.json({ reviews });
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = createReviewSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { itemId, title, detail } = parsed.data;

  if (itemId) {
    const item = await prisma.item.findFirst({
      where: { id: itemId, archiveState: "ACTIVE" }
    });

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }
  }

  const review = await prisma.reviewQueue.create({
    data: {
      itemId,
      title,
      detail
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

  return NextResponse.json({ review }, { status: 201 });
}
