import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { scanSchema } from "@/lib/validation";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get("itemId") ?? undefined;

  const scans = await prisma.scan.findMany({
    where: itemId ? { itemId } : undefined,
    include: {
      item: true,
      location: true,
      user: true
    },
    orderBy: { scannedAt: "desc" },
    take: 100
  });

  return NextResponse.json({ scans });
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = scanSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const {
    itemId: requestedItemId,
    userName,
    locationName,
    scannedAt,
    latitude,
    longitude,
    ...scanData
  } = parsed.data;

  const [item, user, location] = await Promise.all([
    prisma.item.findFirst({
      where: {
        archiveState: "ACTIVE",
        OR: [{ id: requestedItemId }, { assetTag: requestedItemId }]
      }
    }),
    userName
      ? prisma.user.upsert({
          where: { email: `${userName.toLowerCase().replaceAll(" ", ".")}@gearpin.local` },
          update: { name: userName },
          create: {
            name: userName,
            email: `${userName.toLowerCase().replaceAll(" ", ".")}@gearpin.local`
          }
        })
      : null,
    locationName
      ? prisma.location.upsert({
          where: { name: locationName },
          update: {},
          create: { name: locationName }
        })
      : null
  ]);

  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const scan = await prisma.scan.create({
    data: {
      ...scanData,
      itemId: item.id,
      userId: user?.id,
      locationId: location?.id,
      scannedAt: scannedAt ? new Date(scannedAt) : new Date(),
      latitude,
      longitude
    },
    include: {
      item: true,
      location: true,
      user: true
    }
  });

  await prisma.item.update({
    where: { id: item.id },
    data: {
      foundLocationId: location?.id,
      lastScannedAt: scan.scannedAt,
      lastScannedBy: user?.name,
      lastLatitude: latitude,
      lastLongitude: longitude
    }
  });

  return NextResponse.json({ scan }, { status: 201 });
}
