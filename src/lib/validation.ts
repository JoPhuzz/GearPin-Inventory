import { z } from "zod";

const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

export const createItemSchema = z.object({
  assetTag: z.preprocess(blankToUndefined, z.string().trim().min(2).optional()),
  name: z.string().trim().min(2),
  category: z.preprocess(blankToUndefined, z.string().trim().optional()),
  manufacturer: z.preprocess(blankToUndefined, z.string().trim().optional()),
  model: z.preprocess(blankToUndefined, z.string().trim().optional()),
  serialNumber: z.preprocess(blankToUndefined, z.string().trim().optional()),
  notes: z.preprocess(blankToUndefined, z.string().trim().optional()),
  homeLocationName: z.preprocess(blankToUndefined, z.string().trim().optional())
});

export const updateItemSchema = createItemSchema.partial().extend({
  archive: z.boolean().optional()
});

export const scanSchema = z.object({
  itemId: z.string().min(1),
  intent: z.enum(["FOUND", "AUDIT", "CHECKOUT", "CHECKIN", "MOVE"]).default("FOUND"),
  scannedAt: z.string().datetime().optional(),
  userName: z.preprocess(blankToUndefined, z.string().trim().optional()),
  locationName: z.preprocess(blankToUndefined, z.string().trim().optional()),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  rawPayload: z.preprocess(blankToUndefined, z.string().trim().optional()),
  source: z.string().trim().default("mobile")
});

export const checkoutSchema = z.object({
  itemId: z.string().min(1),
  checkedOutTo: z.string().trim().min(2),
  dueAt: z.preprocess(blankToUndefined, z.string().datetime().optional()),
  notes: z.preprocess(blankToUndefined, z.string().trim().optional()),
  userName: z.preprocess(blankToUndefined, z.string().trim().optional()),
  locationName: z.preprocess(blankToUndefined, z.string().trim().optional())
});

export const checkinSchema = z.object({
  userName: z.preprocess(blankToUndefined, z.string().trim().optional()),
  locationName: z.preprocess(blankToUndefined, z.string().trim().optional()),
  notes: z.preprocess(blankToUndefined, z.string().trim().optional())
});

export const createReviewSchema = z.object({
  itemId: z.preprocess(blankToUndefined, z.string().trim().optional()),
  title: z.string().trim().min(2),
  detail: z.preprocess(blankToUndefined, z.string().trim().optional())
});

export const updateReviewSchema = z.object({
  status: z.enum(["OPEN", "RESOLVED", "DISMISSED"])
});

export const importItemsSchema = z.object({
  csvText: z.string().min(1),
  defaultHomeLocationName: z.preprocess(blankToUndefined, z.string().trim().optional())
});

export function makeAssetTag() {
  const stamp = Date.now().toString(36).toUpperCase();
  return `GP-${stamp}`;
}

export function parseQrPayload(payload: string) {
  const trimmed = payload.trim();
  if (trimmed.startsWith("gearpin:item:")) {
    return trimmed.replace("gearpin:item:", "");
  }

  return trimmed;
}
