import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { updateItemSchema } from "@/lib/validation";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const item = await prisma.item.findUnique({
    where: { id },
    include: {
      homeLocation: true,
      foundLocation: true,
      scans: {
        orderBy: { scannedAt: "desc" },
        take: 100,
        include: {
          location: true,
          user: true
        }
      },
      checkouts: {
        orderBy: { checkedOutAt: "desc" },
        take: 20
      }
    }
  });

  if (!item || item.archiveState === "ARCHIVED") {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  return NextResponse.json({ item });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json();
  const parsed = updateItemSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { homeLocationName, archive, ...data } = parsed.data;

  try {
    const homeLocation = homeLocationName
      ? await prisma.location.upsert({
          where: { name: homeLocationName },
          update: {},
          create: { name: homeLocationName }
        })
      : null;

    const item = await prisma.item.update({
      where: { id },
      data: {
        ...data,
        ...(homeLocation ? { homeLocationId: homeLocation.id } : {}),
        ...(archive ? { archiveState: "ARCHIVED", archivedAt: new Date() } : {})
      },
      include: {
        homeLocation: true,
        foundLocation: true,
        scans: {
          orderBy: { scannedAt: "desc" },
          take: 100,
          include: {
            location: true,
            user: true
          }
        },
        checkouts: {
          orderBy: { checkedOutAt: "desc" },
          take: 20
        }
      }
    });

    return NextResponse.json({ item });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "That asset tag is already in use. Try a different tag." },
        { status: 409 }
      );
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    console.error(error);
    return NextResponse.json({ error: "Item update failed" }, { status: 500 });
  }
}
