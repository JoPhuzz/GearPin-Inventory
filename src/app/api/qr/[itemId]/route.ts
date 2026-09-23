import QRCode from "qrcode";
import { prisma } from "@/lib/db";

type RouteContext = {
  params: Promise<{ itemId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { itemId } = await context.params;
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: { id: true }
  });

  if (!item) {
    return new Response("Item not found", { status: 404 });
  }

  const svg = await QRCode.toString(`gearpin:item:${item.id}`, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320
  });

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400"
    }
  });
}
