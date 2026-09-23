import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkoutSchema } from "@/lib/validation";

export async function GET() {
  const checkouts = await prisma.checkout.findMany({
    where: { status: "OPEN" },
    include: { item: true },
    orderBy: { checkedOutAt: "desc" },
    take: 100
  });

  return NextResponse.json({ checkouts });
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = checkoutSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { itemId, checkedOutTo, dueAt, notes, userName, locationName } = parsed.data;
  const item = await prisma.item.findFirst({
    where: {
      archiveState: "ACTIVE",
      OR: [{ id: itemId }, { assetTag: itemId }]
    }
  });

  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const existing = await prisma.checkout.findFirst({
    where: { itemId: item.id, status: "OPEN" }
  });

  if (existing) {
    return NextResponse.json({ error: "This item is already checked out." }, { status: 409 });
  }

  const [user, location] = await Promise.all([
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

  const checkout = await prisma.$transaction(async (tx) => {
    const created = await tx.checkout.create({
      data: {
        itemId: item.id,
        checkedOutTo,
        dueAt: dueAt ? new Date(dueAt) : undefined,
        notes
      },
      include: { item: true }
    });

    const scan = await tx.scan.create({
      data: {
        itemId: item.id,
        userId: user?.id,
        locationId: location?.id,
        intent: "CHECKOUT",
        rawPayload: item.assetTag,
        source: "checkout",
        scannedAt: created.checkedOutAt
      }
    });

    await tx.item.update({
      where: { id: item.id },
      data: {
        foundLocationId: location?.id,
        lastScannedAt: scan.scannedAt,
        lastScannedBy: user?.name ?? checkedOutTo
      }
    });

    return created;
  });

  return NextResponse.json({ checkout }, { status: 201 });
}
