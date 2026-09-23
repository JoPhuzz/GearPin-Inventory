import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const locations = await prisma.location.findMany({
    where: { archiveState: "ACTIVE" },
    include: {
      _count: {
        select: {
          homeItems: {
            where: { archiveState: "ACTIVE" }
          },
          foundItems: {
            where: { archiveState: "ACTIVE" }
          },
          scans: true
        }
      }
    },
    orderBy: [{ name: "asc" }]
  });

  return NextResponse.json({ locations });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    name?: string;
    type?: string;
    notes?: string;
  };
  const name = body.name?.trim();

  if (!name) {
    return NextResponse.json({ error: "Location name is required" }, { status: 400 });
  }

  try {
    const location = await prisma.location.create({
      data: {
        name,
        type: body.type?.trim() || "storage",
        notes: body.notes?.trim() || undefined
      },
      include: {
        _count: {
          select: {
            homeItems: {
              where: { archiveState: "ACTIVE" }
            },
            foundItems: {
              where: { archiveState: "ACTIVE" }
            },
            scans: true
          }
        }
      }
    });

    return NextResponse.json({ location }, { status: 201 });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json({ error: "That location already exists" }, { status: 409 });
    }

    console.error(error);
    return NextResponse.json({ error: "Location save failed" }, { status: 500 });
  }
}
