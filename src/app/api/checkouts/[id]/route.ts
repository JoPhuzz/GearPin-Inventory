import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkinSchema } from "@/lib/validation";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json();
  const parsed = checkinSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { userName, locationName, notes } = parsed.data;
  const existing = await prisma.checkout.findUnique({
    where: { id },
    include: { item: true }
  });

  if (!existing) {
    return NextResponse.json({ error: "Checkout not found" }, { status: 404 });
  }

  if (existing.status !== "OPEN") {
    return NextResponse.json({ error: "Checkout is already closed." }, { status: 409 });
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
    const returnedAt = new Date();
    const updated = await tx.checkout.update({
      where: { id },
      data: {
        status: "RETURNED",
        returnedAt,
        notes: [existing.notes, notes].filter(Boolean).join("\n")
      },
      include: { item: true }
    });

    const scan = await tx.scan.create({
      data: {
        itemId: existing.itemId,
        userId: user?.id,
        locationId: location?.id,
        intent: "CHECKIN",
        rawPayload: existing.item.assetTag,
        source: "checkin",
        scannedAt: returnedAt
      }
    });

    await tx.item.update({
      where: { id: existing.itemId },
      data: {
        foundLocationId: location?.id,
        lastScannedAt: scan.scannedAt,
        lastScannedBy: user?.name
      }
    });

    return updated;
  });

  return NextResponse.json({ checkout });
}
