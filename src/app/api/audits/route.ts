import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  const body = (await request.json()) as { locationId?: string };

  if (!body.locationId) {
    return NextResponse.json({ error: "Location is required" }, { status: 400 });
  }

  const expectedCount = await prisma.item.count({
    where: {
      archiveState: "ACTIVE",
      homeLocationId: body.locationId
    }
  });

  const audit = await prisma.auditSession.create({
    data: {
      locationId: body.locationId,
      expectedCount
    },
    include: { location: true }
  });

  return NextResponse.json({ audit }, { status: 201 });
}
