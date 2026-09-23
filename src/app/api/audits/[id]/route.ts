import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json()) as {
    foundCount?: number;
    missingCount?: number;
    notes?: string;
  };

  try {
    const audit = await prisma.auditSession.update({
      where: { id },
      data: {
        completedAt: new Date(),
        foundCount: body.foundCount ?? 0,
        missingCount: body.missingCount ?? 0,
        notes: body.notes?.trim() || undefined
      },
      include: { location: true }
    });

    return NextResponse.json({ audit });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "Audit not found" }, { status: 404 });
    }

    console.error(error);
    return NextResponse.json({ error: "Audit update failed" }, { status: 500 });
  }
}
