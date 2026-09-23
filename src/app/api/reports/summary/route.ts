import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    items,
    locations,
    scansToday,
    openCheckouts,
    openReviews,
    recentScans
  ] = await Promise.all([
    prisma.item.findMany({
      where: { archiveState: "ACTIVE" },
      include: {
        homeLocation: true,
        foundLocation: true
      },
      orderBy: [{ lastScannedAt: "asc" }, { updatedAt: "desc" }]
    }),
    prisma.location.findMany({
      where: { archiveState: "ACTIVE" },
      include: {
        homeItems: {
          where: { archiveState: "ACTIVE" }
        },
        foundItems: {
          where: { archiveState: "ACTIVE" }
        }
      },
      orderBy: { name: "asc" }
    }),
    prisma.scan.count({
      where: {
        scannedAt: {
          gte: today
        }
      }
    }),
    prisma.checkout.findMany({
      where: { status: "OPEN" },
      include: { item: true },
      orderBy: { checkedOutAt: "desc" }
    }),
    prisma.reviewQueue.count({
      where: { status: "OPEN" }
    }),
    prisma.scan.findMany({
      include: {
        item: true,
        location: true,
        user: true
      },
      orderBy: { scannedAt: "desc" },
      take: 8
    })
  ]);

  const now = new Date();
  const neverScannedItems = items.filter((item) => !item.lastScannedAt);
  const outOfPlaceItems = items.filter(
    (item) => item.homeLocationId && item.foundLocationId && item.homeLocationId !== item.foundLocationId
  );
  const overdueCheckouts = openCheckouts.filter(
    (checkout) => checkout.dueAt && checkout.dueAt < now
  );

  const locationHealth = locations.map((location) => {
    const expectedCount = location.homeItems.length;
    const foundHomeItems = location.homeItems.filter((item) => item.foundLocationId === location.id);
    const outOfPlaceCount = location.foundItems.filter((item) => item.homeLocationId !== location.id).length;
    const missingCount = expectedCount - foundHomeItems.length;
    const healthScore =
      expectedCount === 0
        ? 100
        : Math.max(0, Math.round((foundHomeItems.length / expectedCount) * 100) - outOfPlaceCount * 5);

    return {
      id: location.id,
      name: location.name,
      expectedCount,
      foundCount: foundHomeItems.length,
      missingCount,
      outOfPlaceCount,
      healthScore
    };
  });

  return NextResponse.json({
    summary: {
      activeItems: items.length,
      locations: locations.length,
      scansToday,
      openCheckouts: openCheckouts.length,
      overdueCheckouts: overdueCheckouts.length,
      openReviews,
      neverScannedItems: neverScannedItems.length,
      outOfPlaceItems: outOfPlaceItems.length
    },
    locationHealth,
    riskItems: [...neverScannedItems, ...outOfPlaceItems]
      .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index)
      .slice(0, 6)
      .map((item) => ({
        id: item.id,
        assetTag: item.assetTag,
        name: item.name,
        homeLocation: item.homeLocation?.name ?? null,
        foundLocation: item.foundLocation?.name ?? null,
        lastScannedAt: item.lastScannedAt
      })),
    recentScans: recentScans.map((scan) => ({
      id: scan.id,
      intent: scan.intent,
      scannedAt: scan.scannedAt,
      itemName: scan.item.name,
      assetTag: scan.item.assetTag,
      locationName: scan.location?.name ?? null,
      userName: scan.user?.name ?? null
    }))
  });
}
