import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { importItemsSchema, makeAssetTag } from "@/lib/validation";

type ImportRow = Record<string, string>;

const headerAliases: Record<string, string> = {
  assettag: "assetTag",
  asset: "assetTag",
  tag: "assetTag",
  name: "name",
  item: "name",
  itemname: "name",
  category: "category",
  manufacturer: "manufacturer",
  make: "manufacturer",
  model: "model",
  serial: "serialNumber",
  serialnumber: "serialNumber",
  location: "homeLocationName",
  homelocation: "homeLocationName",
  home: "homeLocationName",
  notes: "notes",
  note: "notes"
};

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[\s_-]/g, "");
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const next = line[index + 1];

    if (character === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }

  cells.push(current.trim());
  return cells;
}

function parseCsv(text: string) {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return [];
  }

  const headers = parseCsvLine(lines[0]).map((header) => headerAliases[normalizeHeader(header)] ?? normalizeHeader(header));

  return lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    const row: ImportRow = {};
    headers.forEach((header, headerIndex) => {
      row[header] = values[headerIndex]?.trim() ?? "";
    });
    return { lineNumber: index + 2, row };
  });
}

function value(row: ImportRow, key: string) {
  const next = row[key]?.trim();
  return next && next.length > 0 ? next : undefined;
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = importItemsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const rows = parseCsv(parsed.data.csvText);
  const result = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [] as { line: number; error: string }[],
    items: [] as { id: string; assetTag: string; name: string; action: "created" | "updated" }[]
  };

  for (const { lineNumber, row } of rows) {
    const name = value(row, "name");

    if (!name) {
      result.skipped += 1;
      result.errors.push({ line: lineNumber, error: "Missing item name" });
      continue;
    }

    try {
      const assetTag = value(row, "assetTag");
      const homeLocationName = value(row, "homeLocationName") ?? parsed.data.defaultHomeLocationName;
      const homeLocation = homeLocationName
        ? await prisma.location.upsert({
            where: { name: homeLocationName },
            update: {},
            create: { name: homeLocationName }
          })
        : null;

      const data = {
        name,
        category: value(row, "category"),
        manufacturer: value(row, "manufacturer"),
        model: value(row, "model"),
        serialNumber: value(row, "serialNumber"),
        notes: value(row, "notes"),
        ...(homeLocation ? { homeLocationId: homeLocation.id } : {})
      };

      if (assetTag) {
        const existing = await prisma.item.findUnique({
          where: { assetTag }
        });

        if (existing) {
          const item = await prisma.item.update({
            where: { assetTag },
            data,
            select: { id: true, assetTag: true, name: true }
          });
          result.updated += 1;
          result.items.push({ ...item, action: "updated" });
          continue;
        }
      }

      const item = await prisma.item.create({
        data: {
          ...data,
          assetTag: assetTag ?? makeAssetTag()
        },
        select: { id: true, assetTag: true, name: true }
      });
      result.created += 1;
      result.items.push({ ...item, action: "created" });
    } catch (error) {
      result.skipped += 1;
      result.errors.push({
        line: lineNumber,
        error: error instanceof Error ? error.message : "Import failed"
      });
    }
  }

  return NextResponse.json({ result });
}
