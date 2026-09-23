import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type CsvCell = string | number | Date | null | undefined;

function csvEscape(value: CsvCell) {
  const text = value instanceof Date ? value.toISOString() : String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function csv(headers: string[], rows: CsvCell[][]) {
  return [headers.map(csvEscape).join(","), ...rows.map((row) => row.map(csvEscape).join(","))].join("\n");
}

function csvResponse(filename: string, body: string) {
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`
    }
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") ?? "items";

  if (type === "items") {
    const items = await prisma.item.findMany({
      include: {
        homeLocation: true,
        foundLocation: true,
        checkouts: {
          where: { status: "OPEN" },
          take: 1
        }
      },
      orderBy: { updatedAt: "desc" },
      take: 5000
    });

    return csvResponse(
      "gearpin-items.csv",
      csv(
        [
          "assetTag",
          "name",
          "category",
          "manufacturer",
          "model",
          "serialNumber",
          "archiveState",
          "homeLocation",
          "foundLocation",
          "lastScannedAt",
          "lastScannedBy",
          "checkoutStatus",
          "checkedOutTo"
        ],
        items.map((item) => [
          item.assetTag,
          item.name,
          item.category,
          item.manufacturer,
          item.model,
          item.serialNumber,
          item.archiveState,
          item.homeLocation?.name,
          item.foundLocation?.name,
          item.lastScannedAt,
          item.lastScannedBy,
          item.checkouts[0]?.status,
          item.checkouts[0]?.checkedOutTo
        ])
      )
    );
  }

  if (type === "scans") {
    const scans = await prisma.scan.findMany({
      include: {
        item: true,
        location: true,
        user: true
      },
      orderBy: { scannedAt: "desc" },
      take: 5000
    });

    return csvResponse(
      "gearpin-scans.csv",
      csv(
        [
          "scannedAt",
          "intent",
          "assetTag",
          "itemName",
          "location",
          "user",
          "latitude",
          "longitude",
          "source",
          "rawPayload"
        ],
        scans.map((scan) => [
          scan.scannedAt,
          scan.intent,
          scan.item.assetTag,
          scan.item.name,
          scan.location?.name,
          scan.user?.name,
          scan.latitude,
          scan.longitude,
          scan.source,
          scan.rawPayload
        ])
      )
    );
  }

  if (type === "checkouts") {
    const checkouts = await prisma.checkout.findMany({
      include: { item: true },
      orderBy: { checkedOutAt: "desc" },
      take: 5000
    });

    return csvResponse(
      "gearpin-checkouts.csv",
      csv(
        [
          "assetTag",
          "itemName",
          "checkedOutTo",
          "status",
          "checkedOutAt",
          "dueAt",
          "returnedAt",
          "notes"
        ],
        checkouts.map((checkout) => [
          checkout.item.assetTag,
          checkout.item.name,
          checkout.checkedOutTo,
          checkout.status,
          checkout.checkedOutAt,
          checkout.dueAt,
          checkout.returnedAt,
          checkout.notes
        ])
      )
    );
  }

  if (type === "reviews") {
    const reviews = await prisma.reviewQueue.findMany({
      include: { item: true },
      orderBy: { createdAt: "desc" },
      take: 5000
    });

    return csvResponse(
      "gearpin-reviews.csv",
      csv(
        ["createdAt", "status", "title", "detail", "assetTag", "itemName", "resolvedAt"],
        reviews.map((review) => [
          review.createdAt,
          review.status,
          review.title,
          review.detail,
          review.item?.assetTag,
          review.item?.name,
          review.resolvedAt
        ])
      )
    );
  }

  return NextResponse.json({ error: "Unknown export type" }, { status: 400 });
}
