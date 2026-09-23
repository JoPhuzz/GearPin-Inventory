import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createItemSchema, makeAssetTag } from "@/lib/validation";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query")?.trim();

  const items = await prisma.item.findMany({
    where: {
      archiveState: "ACTIVE",
      ...(query
        ? {
            OR: [
              { name: { contains: query } },
              { assetTag: { contains: query } },
              { category: { contains: query } },
              { manufacturer: { contains: query } },
              { model: { contains: query } },
              { serialNumber: { contains: query } }
            ]
          }
        : {})
    },
    include: {
      homeLocation: true,
      foundLocation: true,
      scans: {
        orderBy: { scannedAt: "desc" },
        take: 5,
        include: { location: true }
      },
      checkouts: {
        orderBy: { checkedOutAt: "desc" },
        take: 3
      }
    },
    orderBy: [{ lastScannedAt: "desc" }, { updatedAt: "desc" }]
  });

  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = createItemSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { homeLocationName, assetTag, ...data } = parsed.data;
  try {
    const homeLocation = homeLocationName
      ? await prisma.location.upsert({
          where: { name: homeLocationName },
          update: {},
          create: { name: homeLocationName }
        })
      : null;

    const item = await prisma.item.create({
      data: {
        ...data,
        assetTag: assetTag ?? makeAssetTag(),
        homeLocationId: homeLocation?.id
      },
      include: {
        homeLocation: true,
        foundLocation: true,
        scans: {
          orderBy: { scannedAt: "desc" },
          take: 5,
          include: { location: true }
        },
        checkouts: {
          orderBy: { checkedOutAt: "desc" },
          take: 3
        }
      }
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "That asset tag is already in use. Try a different tag or leave it blank." },
        { status: 409 }
      );
    }

    console.error(error);
    return NextResponse.json({ error: "Item save failed" }, { status: 500 });
  }
}
