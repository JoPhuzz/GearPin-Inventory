import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const location = await prisma.location.findUnique({
    where: { id },
    include: {
      homeItems: {
        where: { archiveState: "ACTIVE" },
        include: {
          foundLocation: true,
          scans: {
            orderBy: { scannedAt: "desc" },
            take: 1,
            include: { user: true, location: true }
          }
        },
        orderBy: { name: "asc" }
      },
      foundItems: {
        where: { archiveState: "ACTIVE" },
        include: {
          homeLocation: true,
          scans: {
            orderBy: { scannedAt: "desc" },
            take: 1,
            include: { user: true, location: true }
          }
        },
        orderBy: { name: "asc" }
      },
      auditSessions: {
        orderBy: { startedAt: "desc" },
        take: 5
      }
    }
  });

  if (!location || location.archiveState === "ARCHIVED") {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  const expectedCount = location.homeItems.length;
  const foundHomeItems = location.homeItems.filter((item) => item.foundLocationId === location.id);
  const missingItems = location.homeItems.filter((item) => item.foundLocationId !== location.id);
  const outOfPlaceItems = location.foundItems.filter((item) => item.homeLocationId !== location.id);
  const healthScore =
    expectedCount === 0
      ? 100
      : Math.max(0, Math.round((foundHomeItems.length / expectedCount) * 100) - outOfPlaceItems.length * 5);

  return NextResponse.json({
    location,
    health: {
      expectedCount,
      foundCount: foundHomeItems.length,
      missingCount: missingItems.length,
      outOfPlaceCount: outOfPlaceItems.length,
      healthScore
    },
    missingItems,
    outOfPlaceItems
  });
}
