"use client";

import {
  Archive,
  BarChart3,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Flag,
  FileDown,
  Home,
  ListChecks,
  LogIn,
  LogOut,
  MapPin,
  Mic,
  PackagePlus,
  QrCode,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Square,
  Tag,
  UploadCloud,
  UserRound,
  Warehouse
} from "lucide-react";
import Image from "next/image";
import { FormEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";

type Scan = {
  id: string;
  intent: string;
  scannedAt: string;
  latitude?: number | null;
  longitude?: number | null;
  location?: { name: string } | null;
  user?: { name: string } | null;
};

type Checkout = {
  id: string;
  checkedOutTo: string;
  status: "OPEN" | "RETURNED" | "OVERDUE";
  dueAt?: string | null;
  checkedOutAt: string;
  returnedAt?: string | null;
  notes?: string | null;
};

type ReviewItem = {
  id: string;
  itemId?: string | null;
  title: string;
  status: "OPEN" | "RESOLVED" | "DISMISSED";
  detail?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
  item?: {
    id: string;
    assetTag: string;
    name: string;
    category?: string | null;
  } | null;
};

type Item = {
  id: string;
  assetTag: string;
  name: string;
  category?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  notes?: string | null;
  lastScannedAt?: string | null;
  lastScannedBy?: string | null;
  homeLocation?: { name: string } | null;
  foundLocation?: { name: string } | null;
  scans: Scan[];
  checkouts: Checkout[];
};

type ItemForm = {
  name: string;
  assetTag: string;
  category: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  homeLocationName: string;
  notes: string;
};

type LocationSummary = {
  id: string;
  name: string;
  type: string;
  healthScore?: number | null;
  _count: {
    homeItems: number;
    foundItems: number;
    scans: number;
  };
};

type LocationHealth = {
  expectedCount: number;
  foundCount: number;
  missingCount: number;
  outOfPlaceCount: number;
  healthScore: number;
};

type LocationDetail = {
  location: LocationSummary & {
    homeItems: Item[];
    foundItems: Item[];
  };
  health: LocationHealth;
  missingItems: Item[];
  outOfPlaceItems: Item[];
};

type AuditState = {
  id: string;
  locationId: string;
  locationName: string;
  startedAt: string;
  expectedCount: number;
};

type ScanRequestBody = {
  itemId: string;
  intent: "FOUND" | "AUDIT";
  scannedAt: string;
  userName: string;
  locationName: string;
  latitude?: number;
  longitude?: number;
  rawPayload: string;
  source: string;
};

type QueuedScan = ScanRequestBody & {
  localId: string;
  queuedAt: string;
};

type ReportSummary = {
  summary: {
    activeItems: number;
    locations: number;
    scansToday: number;
    openCheckouts: number;
    overdueCheckouts: number;
    openReviews: number;
    neverScannedItems: number;
    outOfPlaceItems: number;
  };
  locationHealth: {
    id: string;
    name: string;
    expectedCount: number;
    foundCount: number;
    missingCount: number;
    outOfPlaceCount: number;
    healthScore: number;
  }[];
  riskItems: {
    id: string;
    assetTag: string;
    name: string;
    homeLocation?: string | null;
    foundLocation?: string | null;
    lastScannedAt?: string | null;
  }[];
  recentScans: {
    id: string;
    intent: string;
    scannedAt: string;
    itemName: string;
    assetTag: string;
    locationName?: string | null;
    userName?: string | null;
  }[];
};

type ImportResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: { line: number; error: string }[];
  items: { id: string; assetTag: string; name: string; action: "created" | "updated" }[];
};

type SpeechRecognitionResultLike = {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
    };
  };
};

type SpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionResultLike) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const emptyForm: ItemForm = {
  name: "",
  assetTag: "",
  category: "",
  manufacturer: "",
  model: "",
  serialNumber: "",
  homeLocationName: "Main Storage",
  notes: ""
};

const readerId = "gearpin-qr-reader";
const offlineQueueKey = "gearpin.offlineScans.v1";

function scanIdFromPayload(payload: string) {
  const trimmed = payload.trim();
  return trimmed.startsWith("gearpin:item:") ? trimmed.replace("gearpin:item:", "") : trimmed;
}

function displayDate(value?: string | null) {
  if (!value) {
    return "Not scanned";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formFromItem(item: Item): ItemForm {
  return {
    name: item.name,
    assetTag: item.assetTag,
    category: item.category ?? "",
    manufacturer: item.manufacturer ?? "",
    model: item.model ?? "",
    serialNumber: item.serialNumber ?? "",
    homeLocationName: item.homeLocation?.name ?? "",
    notes: item.notes ?? ""
  };
}

function openCheckout(item?: Item | null) {
  return item?.checkouts.find((checkout) => checkout.status === "OPEN") ?? null;
}

function subscribeToOnlineStatus(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);

  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getOnlineStatus() {
  return navigator.onLine;
}

function getServerOnlineStatus() {
  return true;
}

function makeLocalId() {
  return `offline-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadOfflineQueue() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const value = window.localStorage.getItem(offlineQueueKey);
    return value ? (JSON.parse(value) as QueuedScan[]) : [];
  } catch {
    return [];
  }
}

function saveOfflineQueue(scans: QueuedScan[]) {
  window.localStorage.setItem(offlineQueueKey, JSON.stringify(scans));
}

async function getGps() {
  if (!("geolocation" in navigator)) {
    return {};
  }

  return new Promise<{ latitude?: number; longitude?: number }>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        }),
      () => resolve({}),
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 5000 }
    );
  });
}

export function InventoryConsole() {
  const [items, setItems] = useState<Item[]>([]);
  const [locations, setLocations] = useState<LocationSummary[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [reports, setReports] = useState<ReportSummary | null>(null);
  const [locationDetail, setLocationDetail] = useState<LocationDetail | null>(null);
  const [activeAudit, setActiveAudit] = useState<AuditState | null>(null);
  const [query, setQuery] = useState("");
  const [locationName, setLocationName] = useState("");
  const [locationType, setLocationType] = useState("storage");
  const [form, setForm] = useState<ItemForm>(emptyForm);
  const [importCsv, setImportCsv] = useState("");
  const [importDefaultLocation, setImportDefaultLocation] = useState("Main Storage");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [manualPayload, setManualPayload] = useState("");
  const [scanLocation, setScanLocation] = useState("Main Storage");
  const [scanUser, setScanUser] = useState("Demo Tech");
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<Item | null>(null);
  const [detailForm, setDetailForm] = useState<ItemForm>(emptyForm);
  const [checkoutTo, setCheckoutTo] = useState("");
  const [checkoutDueAt, setCheckoutDueAt] = useState("");
  const [checkoutNotes, setCheckoutNotes] = useState("");
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewDetail, setReviewDetail] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [scannerRunning, setScannerRunning] = useState(false);
  const [scannerStatus, setScannerStatus] = useState("Camera idle");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [notice, setNotice] = useState("Ready");
  const [queuedScans, setQueuedScans] = useState<QueuedScan[]>([]);
  const [syncingQueue, setSyncingQueue] = useState(false);
  const online = useSyncExternalStore(
    subscribeToOnlineStatus,
    getOnlineStatus,
    getServerOnlineStatus
  );
  const scannerRef = useRef<{ clear: () => Promise<void> } | null>(null);

  useEffect(() => {
    queueMicrotask(() => setQueuedScans(loadOfflineQueue()));
  }, []);

  useEffect(() => {
    async function loadInitialLocations() {
      const response = await fetch("/api/locations", {
        cache: "no-store"
      });
      const data = (await response.json()) as { locations: LocationSummary[] };
      setLocations(data.locations);

      if (data.locations.length > 0) {
        const detailResponse = await fetch(`/api/locations/${data.locations[0].id}`, {
          cache: "no-store"
        });
        const detailData = (await detailResponse.json()) as LocationDetail;
        setLocationDetail(detailData);
        setScanLocation(detailData.location.name);
      }
    }

    void loadInitialLocations();
    void loadReviews();
    void loadReports();
    // Initial boot load only; later review refreshes are user/action driven.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadItems(query);
    }, 180);

    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (online && queuedScans.length > 0) {
      void syncQueuedScans();
    }
    // This effect should run only when connectivity changes or queue length changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, queuedScans.length]);

  async function loadItems(search = "") {
    const response = await fetch(`/api/items?query=${encodeURIComponent(search)}`, {
      cache: "no-store"
    });
    const data = (await response.json()) as { items: Item[] };
    setItems(data.items);
  }

  async function loadReviews() {
    const response = await fetch("/api/review", {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(await readError(response, "Review queue failed"));
    }

    const data = (await response.json()) as { reviews: ReviewItem[] };
    setReviews(data.reviews);
  }

  async function loadReports() {
    const response = await fetch("/api/reports/summary", {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(await readError(response, "Reports failed"));
    }

    const data = (await response.json()) as ReportSummary;
    setReports(data);
  }

  async function loadLocations() {
    const response = await fetch("/api/locations", {
      cache: "no-store"
    });
    const data = (await response.json()) as { locations: LocationSummary[] };
    setLocations(data.locations);

    if (!locationDetail && data.locations.length > 0) {
      await loadLocationDetail(data.locations[0].id);
    }
  }

  async function loadLocationDetail(locationId: string) {
    const response = await fetch(`/api/locations/${locationId}`, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(await readError(response, "Location detail failed"));
    }

    const data = (await response.json()) as LocationDetail;
    setLocationDetail(data);
    setScanLocation(data.location.name);
  }

  async function loadItemDetail(itemId: string) {
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/items/${itemId}`, {
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(await readError(response, "Item detail failed"));
      }

      const data = (await response.json()) as { item: Item };
      setDetailItem(data.item);
      setDetailForm(formFromItem(data.item));
      setCheckoutTo("");
      setCheckoutDueAt("");
      setCheckoutNotes("");
      setReviewTitle(`Review ${data.item.assetTag}`);
      setReviewDetail("");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Item detail failed");
      setDetailItem(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function openItemDetail(itemId: string) {
    setActiveItemId(itemId);
    await loadItemDetail(itemId);
  }

  function notify(message: string) {
    setNotice(message);
    setToast(message);
  }

  async function readError(response: Response, fallback: string) {
    try {
      const data = (await response.json()) as { error?: unknown };
      return typeof data.error === "string" ? data.error : fallback;
    } catch {
      return fallback;
    }
  }

  function updateForm(field: keyof ItemForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateDetailForm(field: keyof ItemForm, value: string) {
    setDetailForm((current) => ({ ...current, [field]: value }));
  }

  async function importItems(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);

    try {
      const response = await fetch("/api/import/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csvText: importCsv,
          defaultHomeLocationName: importDefaultLocation
        })
      });

      if (!response.ok) {
        throw new Error(await readError(response, "Import failed"));
      }

      const data = (await response.json()) as { result: ImportResult };
      setImportResult(data.result);
      await loadItems(query);
      await loadLocations();
      await loadReports();
      notify(`Import complete: ${data.result.created} created, ${data.result.updated} updated`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  async function createLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);

    try {
      const response = await fetch("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: locationName,
          type: locationType
        })
      });

      if (!response.ok) {
        throw new Error(await readError(response, "Location save failed"));
      }

      const data = (await response.json()) as { location: LocationSummary };
      setLocations((current) => [...current, data.location].sort((a, b) => a.name.localeCompare(b.name)));
      setLocationName("");
      await loadLocationDetail(data.location.id);
      await loadReports();
      notify(`Location saved: ${data.location.name}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Location save failed");
    } finally {
      setBusy(false);
    }
  }

  async function createItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);

    try {
      const response = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });

      if (!response.ok) {
        throw new Error(await readError(response, "Item save failed"));
      }

      const data = (await response.json()) as { item: Item };
      setItems((current) => [data.item, ...current]);
      setDetailItem(data.item);
      setDetailForm(formFromItem(data.item));
      setActiveItemId(data.item.id);
      await loadLocations();
      await loadReports();
      setForm({ ...emptyForm, homeLocationName: form.homeLocationName });
      notify(`Saved ${data.item.assetTag}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Item save failed");
    } finally {
      setBusy(false);
    }
  }

  function startVoiceEntry() {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;

    if (!Recognition) {
      notify("Speech entry is not available in this browser");
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      updateForm("name", transcript);
      notify("Voice captured");
    };
    recognition.onerror = () => notify("Voice entry stopped");
    recognition.start();
  }

  function resolveItemId(payload: string) {
    const code = scanIdFromPayload(payload);
    return items.find((item) => item.id === code || item.assetTag === code)?.id ?? code;
  }

  function updateQueuedScans(scans: QueuedScan[]) {
    saveOfflineQueue(scans);
    setQueuedScans(scans);
  }

  function queueScan(body: ScanRequestBody) {
    const queued = {
      ...body,
      localId: makeLocalId(),
      queuedAt: new Date().toISOString()
    };
    updateQueuedScans([...loadOfflineQueue(), queued]);
    setManualPayload("");
    notify(`Offline scan queued: ${body.rawPayload}`);
    setScannerStatus("Scan queued for sync");
  }

  async function refreshAfterScan(itemId?: string) {
    if (itemId) {
      setActiveItemId(itemId);
    }

    setManualPayload("");
    await loadItems(query);

    if (itemId) {
      await loadItemDetail(itemId);
    }

    if (locationDetail) {
      await loadLocationDetail(locationDetail.location.id);
    }

    await loadReports();
  }

  async function saveScan(body: ScanRequestBody) {
    const response = await fetch("/api/scans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(await readError(response, "Scan save failed"));
    }

    return (await response.json()) as { scan: { itemId: string } };
  }

  async function syncQueuedScans() {
    const currentQueue = loadOfflineQueue();

    if (syncingQueue || currentQueue.length === 0 || !online) {
      return;
    }

    setSyncingQueue(true);
    const remaining: QueuedScan[] = [];
    let syncedCount = 0;

    try {
      for (const queuedScan of currentQueue) {
        const body: ScanRequestBody = {
          itemId: queuedScan.itemId,
          intent: queuedScan.intent,
          scannedAt: queuedScan.scannedAt,
          userName: queuedScan.userName,
          locationName: queuedScan.locationName,
          latitude: queuedScan.latitude,
          longitude: queuedScan.longitude,
          rawPayload: queuedScan.rawPayload,
          source: queuedScan.source
        };

        try {
          await saveScan(body);
          syncedCount += 1;
        } catch {
          remaining.push(queuedScan);
        }
      }

      updateQueuedScans(remaining);

      if (syncedCount > 0) {
        await refreshAfterScan();
        notify(`Synced ${syncedCount} offline scan${syncedCount === 1 ? "" : "s"}`);
      }
    } finally {
      setSyncingQueue(false);
    }
  }

  async function logScan(payload: string) {
    const itemId = resolveItemId(payload);
    setBusy(true);
    let scanBody: ScanRequestBody | null = null;

    try {
      const gps = await getGps();
      scanBody = {
        itemId,
        intent: activeAudit ? "AUDIT" : "FOUND",
        scannedAt: new Date().toISOString(),
        userName: scanUser,
        locationName: scanLocation,
        rawPayload: payload,
        source: "mobile-web",
        ...gps
      };

      if (!online) {
        queueScan(scanBody);
        return;
      }

      const data = await saveScan(scanBody);
      await refreshAfterScan(data.scan.itemId);
      notify("Scan saved");
      setScannerStatus("Scan saved");
    } catch (error) {
      if (error instanceof TypeError && scanBody) {
        queueScan(scanBody);
      } else {
        notify(error instanceof Error ? error.message : "Scan save failed");
        setScannerStatus("Scan save failed");
      }
    } finally {
      setBusy(false);
    }
  }

  async function startScanner() {
    if (scannerRef.current) {
      return;
    }

    const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
    if (!window.isSecureContext && !isLocalhost) {
      notify("Camera scan needs HTTPS on phones. Manual asset-tag scan works here.");
      setScannerStatus("HTTPS required for camera");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      notify("This browser does not expose camera access for QR scanning.");
      setScannerStatus("Camera unavailable");
      return;
    }

    try {
      setScannerRunning(true);
      setScannerStatus("Starting camera...");
      const { Html5QrcodeScanner } = await import("html5-qrcode");
      const scanner = new Html5QrcodeScanner(
        readerId,
        {
          fps: 10,
          qrbox: { width: 240, height: 240 },
          rememberLastUsedCamera: true
        },
        false
      );

      scannerRef.current = scanner;
      scanner.render(
        async (decodedText) => {
          setScannerStatus("QR detected. Saving scan...");
          notify("QR detected");
          window.navigator.vibrate?.(80);
          await stopScanner();
          await logScan(decodedText);
        },
        () => {
          setScannerStatus("Camera live. Looking for QR...");
        }
      );
      notify("Scanner ready");
      setScannerStatus("Camera live. Looking for QR...");
    } catch (error) {
      setScannerRunning(false);
      scannerRef.current = null;
      notify(error instanceof Error ? error.message : "Scanner failed to start");
      setScannerStatus("Scanner failed to start");
    }
  }

  async function stopScanner() {
    if (!scannerRef.current) {
      setScannerRunning(false);
      setScannerStatus("Camera idle");
      return;
    }

    await scannerRef.current.clear();
    scannerRef.current = null;
    setScannerRunning(false);
    setScannerStatus("Camera stopped");
  }

  async function archiveItem(itemId: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archive: true })
      });

      if (!response.ok) {
        throw new Error(await readError(response, "Archive failed"));
      }

      await loadItems(query);
      await loadLocations();
      await loadReports();
      if (activeItemId === itemId) {
        setActiveItemId(null);
        setDetailItem(null);
      }
      notify("Item archived");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Archive failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveItemDetail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!detailItem) {
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`/api/items/${detailItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(detailForm)
      });

      if (!response.ok) {
        throw new Error(await readError(response, "Item update failed"));
      }

      const data = (await response.json()) as { item: Item };
      setDetailItem(data.item);
      setDetailForm(formFromItem(data.item));
      setItems((current) => current.map((item) => (item.id === data.item.id ? data.item : item)));
      await loadLocations();
      await loadReports();
      if (locationDetail) {
        await loadLocationDetail(locationDetail.location.id);
      }
      notify(`Updated ${data.item.assetTag}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Item update failed");
    } finally {
      setBusy(false);
    }
  }

  async function checkoutItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!detailItem) {
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/checkouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: detailItem.id,
          checkedOutTo: checkoutTo,
          dueAt: checkoutDueAt ? new Date(checkoutDueAt).toISOString() : undefined,
          notes: checkoutNotes,
          userName: scanUser,
          locationName: scanLocation
        })
      });

      if (!response.ok) {
        throw new Error(await readError(response, "Checkout failed"));
      }

      await loadItems(query);
      await loadItemDetail(detailItem.id);
      await loadReports();
      if (locationDetail) {
        await loadLocationDetail(locationDetail.location.id);
      }
      notify(`Checked out to ${checkoutTo}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Checkout failed");
    } finally {
      setBusy(false);
    }
  }

  async function checkInItem(checkoutId: string) {
    if (!detailItem) {
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`/api/checkouts/${checkoutId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userName: scanUser,
          locationName: scanLocation,
          notes: checkoutNotes
        })
      });

      if (!response.ok) {
        throw new Error(await readError(response, "Check-in failed"));
      }

      await loadItems(query);
      await loadItemDetail(detailItem.id);
      await loadReports();
      if (locationDetail) {
        await loadLocationDetail(locationDetail.location.id);
      }
      notify("Item checked in");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Check-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function createReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setBusy(true);
    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: detailItem?.id,
          title: reviewTitle,
          detail: reviewDetail
        })
      });

      if (!response.ok) {
        throw new Error(await readError(response, "Review flag failed"));
      }

      await loadReviews();
      await loadReports();
      setReviewDetail("");
      notify("Review item opened");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Review flag failed");
    } finally {
      setBusy(false);
    }
  }

  async function updateReview(reviewId: string, status: "RESOLVED" | "DISMISSED") {
    setBusy(true);
    try {
      const response = await fetch(`/api/review/${reviewId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });

      if (!response.ok) {
        throw new Error(await readError(response, "Review update failed"));
      }

      await loadReviews();
      await loadReports();
      notify(status === "RESOLVED" ? "Review resolved" : "Review dismissed");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Review update failed");
    } finally {
      setBusy(false);
    }
  }

  async function startAudit() {
    if (!locationDetail) {
      notify("Pick a location before starting audit mode");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId: locationDetail.location.id })
      });

      if (!response.ok) {
        throw new Error(await readError(response, "Audit start failed"));
      }

      const data = (await response.json()) as {
        audit: {
          id: string;
          locationId: string;
          startedAt: string;
          expectedCount: number;
          location: { name: string };
        };
      };

      setActiveAudit({
        id: data.audit.id,
        locationId: data.audit.locationId,
        locationName: data.audit.location.name,
        startedAt: data.audit.startedAt,
        expectedCount: data.audit.expectedCount
      });
      setScanLocation(data.audit.location.name);
      notify(`Audit started: ${data.audit.location.name}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Audit start failed");
    } finally {
      setBusy(false);
    }
  }

  async function endAudit() {
    if (!activeAudit || !locationDetail) {
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`/api/audits/${activeAudit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          foundCount: locationDetail.health.foundCount,
          missingCount: locationDetail.health.missingCount,
          notes: `${locationDetail.health.outOfPlaceCount} out-of-place items at completion`
        })
      });

      if (!response.ok) {
        throw new Error(await readError(response, "Audit finish failed"));
      }

      notify(`Audit finished: ${locationDetail.location.name}`);
      setActiveAudit(null);
      await loadLocationDetail(locationDetail.location.id);
      await loadReports();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Audit finish failed");
    } finally {
      setBusy(false);
    }
  }

  const detailCheckout = openCheckout(detailItem);

  return (
    <main className="app-shell">
      <div className="top-bar">
        <div className="brand-row">
          <div className="brand">
            <h1>GearPin</h1>
            <span>Inventory accountability</span>
          </div>
          <div className="status-pill">
            <ShieldCheck size={16} />
            {online ? "Online" : "Offline"}
          </div>
        </div>
        {queuedScans.length > 0 ? (
          <div className="queue-strip" role="status">
            <div>
              <strong>{queuedScans.length} offline scan{queuedScans.length === 1 ? "" : "s"} queued</strong>
              <span>Saved locally with original scan time, location, user, GPS, and audit intent.</span>
            </div>
            <button className="btn btn-secondary" type="button" onClick={syncQueuedScans} disabled={!online || syncingQueue}>
              <UploadCloud size={18} />
              {syncingQueue ? "Syncing" : "Sync"}
            </button>
          </div>
        ) : null}
        <div className="notice" role="status">
          {notice}
        </div>
      </div>

      <div className="workgrid">
        <section className="panel" aria-labelledby="add-item-heading">
          <div className="panel-header">
            <h2 className="panel-title" id="add-item-heading">
              <PackagePlus size={20} />
              Add Item
            </h2>
            <button className="btn btn-secondary" type="button" onClick={startVoiceEntry}>
              <Mic size={18} />
              Speak
            </button>
          </div>

          <form className="quick-form" onSubmit={createItem}>
            <div className="field-grid">
              <input
                className="input span-2"
                value={form.name}
                onChange={(event) => updateForm("name", event.target.value)}
                placeholder="Item name"
                required
              />
              <input
                className="input"
                value={form.assetTag}
                onChange={(event) => updateForm("assetTag", event.target.value)}
                placeholder="Asset tag"
              />
              <input
                className="input"
                value={form.category}
                onChange={(event) => updateForm("category", event.target.value)}
                placeholder="Category"
              />
              <input
                className="input"
                value={form.manufacturer}
                onChange={(event) => updateForm("manufacturer", event.target.value)}
                placeholder="Manufacturer"
              />
              <input
                className="input"
                value={form.model}
                onChange={(event) => updateForm("model", event.target.value)}
                placeholder="Model"
              />
              <input
                className="input"
                value={form.serialNumber}
                onChange={(event) => updateForm("serialNumber", event.target.value)}
                placeholder="Serial"
              />
              <input
                className="input"
                value={form.homeLocationName}
                onChange={(event) => updateForm("homeLocationName", event.target.value)}
                placeholder="Home location"
              />
              <textarea
                className="textarea span-2"
                value={form.notes}
                onChange={(event) => updateForm("notes", event.target.value)}
                placeholder="Notes"
              />
            </div>
            <button className="btn btn-primary" disabled={busy} type="submit">
              <Save size={18} />
              Save
            </button>
          </form>
        </section>

        <section className="panel" aria-labelledby="import-heading">
          <div className="panel-header">
            <h2 className="panel-title" id="import-heading">
              <UploadCloud size={20} />
              Import
            </h2>
          </div>

          <form className="quick-form" onSubmit={importItems}>
            <div className="field-grid">
              <textarea
                className="textarea span-2 import-textarea"
                value={importCsv}
                onChange={(event) => setImportCsv(event.target.value)}
                placeholder="assetTag,name,category,manufacturer,model,serialNumber,homeLocation,notes"
                required
              />
              <input
                className="input span-2"
                value={importDefaultLocation}
                onChange={(event) => setImportDefaultLocation(event.target.value)}
                placeholder="Default home location"
              />
            </div>
            <button className="btn btn-secondary" disabled={busy || !importCsv.trim()} type="submit">
              <UploadCloud size={18} />
              Import Items
            </button>
          </form>

          {importResult ? (
            <div className="import-result">
              <div className="stat-grid">
                <div className="stat-tile">
                  <PackagePlus size={17} />
                  <span>Created</span>
                  <strong>{importResult.created}</strong>
                </div>
                <div className="stat-tile">
                  <RefreshCw size={17} />
                  <span>Updated</span>
                  <strong>{importResult.updated}</strong>
                </div>
                <div className="stat-tile">
                  <Archive size={17} />
                  <span>Skipped</span>
                  <strong>{importResult.skipped}</strong>
                </div>
                <div className="stat-tile">
                  <ListChecks size={17} />
                  <span>Rows</span>
                  <strong>{importResult.items.length}</strong>
                </div>
              </div>
              {importResult.errors.length > 0 ? (
                <div className="review-card">
                  <strong>Import Errors</strong>
                  {importResult.errors.slice(0, 4).map((error) => (
                    <span key={`${error.line}-${error.error}`}>
                      Line {error.line}: {error.error}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="panel" aria-labelledby="scan-heading">
          <div className="panel-header">
            <h2 className="panel-title" id="scan-heading">
              <QrCode size={20} />
              Scan
            </h2>
            <div className="button-row">
              <button className="btn btn-secondary" type="button" onClick={startScanner} disabled={scannerRunning}>
                <Camera size={18} />
                Start
              </button>
              <button className="btn btn-quiet" type="button" onClick={stopScanner} disabled={!scannerRunning}>
                <Square size={16} />
                Stop
              </button>
            </div>
          </div>

          <div id={readerId} className="scan-reader" />
          <div className={`scanner-status ${scannerRunning ? "live" : ""}`} role="status">
            <span className="scanner-dot" aria-hidden="true" />
            {scannerStatus}
          </div>
          {queuedScans.length > 0 ? (
            <div className="offline-queue">
              <div>
                <strong>Offline Queue</strong>
                <span>
                  {queuedScans.length} scan{queuedScans.length === 1 ? "" : "s"} waiting to sync
                </span>
              </div>
              <button className="btn btn-quiet" type="button" onClick={syncQueuedScans} disabled={!online || syncingQueue}>
                <UploadCloud size={18} />
                {syncingQueue ? "Syncing" : "Sync"}
              </button>
            </div>
          ) : null}

          <div className="quick-form" style={{ marginTop: 12 }}>
            <div className="field-grid">
              <input
                className="input"
                value={scanUser}
                onChange={(event) => setScanUser(event.target.value)}
                placeholder="User"
              />
              <input
                className="input"
                value={scanLocation}
                onChange={(event) => setScanLocation(event.target.value)}
                placeholder="Found location"
              />
              <input
                className="input span-2"
                value={manualPayload}
                onChange={(event) => setManualPayload(event.target.value)}
                placeholder="QR or asset tag"
              />
            </div>
            <button
              className="btn btn-primary"
              disabled={busy || manualPayload.trim().length === 0}
              type="button"
              onClick={() => logScan(manualPayload)}
            >
              <CheckCircle2 size={18} />
              Log Scan
            </button>
          </div>
        </section>

        <section className="panel" aria-labelledby="locations-heading">
          <div className="panel-header">
            <h2 className="panel-title" id="locations-heading">
              <Warehouse size={20} />
              Locations
            </h2>
            {activeAudit ? <span className="tag">Audit live</span> : null}
          </div>

          <div className="location-list">
            {locations.map((location) => (
              <button
                className={`location-chip ${locationDetail?.location.id === location.id ? "selected" : ""}`}
                key={location.id}
                type="button"
                onClick={() => void loadLocationDetail(location.id)}
              >
                <strong>{location.name}</strong>
                <span>
                  {location._count.homeItems} expected / {location._count.foundItems} found
                </span>
              </button>
            ))}
          </div>

          <form className="quick-form" onSubmit={createLocation} style={{ marginTop: 12 }}>
            <div className="field-grid">
              <input
                className="input"
                value={locationName}
                onChange={(event) => setLocationName(event.target.value)}
                placeholder="New location"
              />
              <input
                className="input"
                value={locationType}
                onChange={(event) => setLocationType(event.target.value)}
                placeholder="Type"
              />
            </div>
            <button className="btn btn-quiet" disabled={busy || !locationName.trim()} type="submit">
              <Save size={18} />
              Add Location
            </button>
          </form>

          {locationDetail ? (
            <div className="audit-box">
              <div className="audit-header">
                <div>
                  <div className="detail-subtitle">{locationDetail.location.name}</div>
                  <span className="muted">{locationDetail.location.type}</span>
                </div>
                <div className="health-score">{locationDetail.health.healthScore}%</div>
              </div>

              <div className="stat-grid">
                <div className="stat-tile">
                  <ClipboardCheck size={17} />
                  <span>Expected</span>
                  <strong>{locationDetail.health.expectedCount}</strong>
                </div>
                <div className="stat-tile">
                  <CheckCircle2 size={17} />
                  <span>Found</span>
                  <strong>{locationDetail.health.foundCount}</strong>
                </div>
                <div className="stat-tile">
                  <Search size={17} />
                  <span>Missing</span>
                  <strong>{locationDetail.health.missingCount}</strong>
                </div>
                <div className="stat-tile">
                  <MapPin size={17} />
                  <span>Out of Place</span>
                  <strong>{locationDetail.health.outOfPlaceCount}</strong>
                </div>
              </div>

              <div className="button-row">
                <button className="btn btn-secondary" disabled={busy || !!activeAudit} type="button" onClick={startAudit}>
                  <ClipboardCheck size={18} />
                  Start Audit
                </button>
                <button className="btn btn-primary" disabled={busy || !activeAudit} type="button" onClick={endAudit}>
                  <CheckCircle2 size={18} />
                  End Audit
                </button>
              </div>

              {activeAudit ? (
                <div className="notice">
                  Audit scanning into {activeAudit.locationName}. Use QR scan or manual asset tag.
                </div>
              ) : null}

              <div className="audit-lists">
                <div>
                  <div className="detail-subtitle">Missing</div>
                  {locationDetail.missingItems.length === 0 ? (
                    <div className="mini-empty">Nothing missing.</div>
                  ) : (
                    locationDetail.missingItems.slice(0, 5).map((item) => (
                      <button
                        className="mini-row"
                        key={item.id}
                        type="button"
                        onClick={() => void openItemDetail(item.id)}
                      >
                        <strong>{item.name}</strong>
                        <span>{item.assetTag}</span>
                      </button>
                    ))
                  )}
                </div>
                <div>
                  <div className="detail-subtitle">Out of Place</div>
                  {locationDetail.outOfPlaceItems.length === 0 ? (
                    <div className="mini-empty">No stray items.</div>
                  ) : (
                    locationDetail.outOfPlaceItems.slice(0, 5).map((item) => (
                      <button
                        className="mini-row"
                        key={item.id}
                        type="button"
                        onClick={() => void openItemDetail(item.id)}
                      >
                        <strong>{item.name}</strong>
                        <span>{item.assetTag}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <section className="panel" aria-labelledby="review-heading">
          <div className="panel-header">
            <h2 className="panel-title" id="review-heading">
              <ListChecks size={20} />
              Review
            </h2>
            <button className="btn btn-quiet" type="button" onClick={loadReviews}>
              <RefreshCw size={18} />
            </button>
          </div>

          <div className="review-list">
            {reviews.length === 0 ? (
              <div className="mini-empty">No open review items.</div>
            ) : (
              reviews.map((review) => (
                <article className="review-card" key={review.id}>
                  <div>
                    <strong>{review.title}</strong>
                    <span>
                      {review.item ? `${review.item.name} / ${review.item.assetTag}` : "General review"}
                    </span>
                    {review.detail ? <p>{review.detail}</p> : null}
                  </div>
                  <div className="button-row">
                    {review.item ? (
                      <button className="btn btn-quiet" type="button" onClick={() => void openItemDetail(review.item!.id)}>
                        <Clock3 size={18} />
                        Detail
                      </button>
                    ) : null}
                    <button
                      className="btn btn-secondary"
                      disabled={busy}
                      type="button"
                      onClick={() => updateReview(review.id, "RESOLVED")}
                    >
                      <CheckCircle2 size={18} />
                      Resolve
                    </button>
                    <button
                      className="btn btn-quiet"
                      disabled={busy}
                      type="button"
                      onClick={() => updateReview(review.id, "DISMISSED")}
                    >
                      <Archive size={18} />
                      Dismiss
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="panel" aria-labelledby="reports-heading">
          <div className="panel-header">
            <h2 className="panel-title" id="reports-heading">
              <BarChart3 size={20} />
              Reports
            </h2>
            <button className="btn btn-quiet" type="button" onClick={loadReports}>
              <RefreshCw size={18} />
            </button>
          </div>

          {!reports ? (
            <div className="empty-detail">Loading reports...</div>
          ) : (
            <div className="report-stack">
              <div className="stat-grid">
                <div className="stat-tile">
                  <PackagePlus size={17} />
                  <span>Active Items</span>
                  <strong>{reports.summary.activeItems}</strong>
                </div>
                <div className="stat-tile">
                  <QrCode size={17} />
                  <span>Scans Today</span>
                  <strong>{reports.summary.scansToday}</strong>
                </div>
                <div className="stat-tile">
                  <LogOut size={17} />
                  <span>Open Checkouts</span>
                  <strong>{reports.summary.openCheckouts}</strong>
                </div>
                <div className="stat-tile">
                  <Flag size={17} />
                  <span>Open Reviews</span>
                  <strong>{reports.summary.openReviews}</strong>
                </div>
                <div className="stat-tile">
                  <Search size={17} />
                  <span>Never Scanned</span>
                  <strong>{reports.summary.neverScannedItems}</strong>
                </div>
                <div className="stat-tile">
                  <MapPin size={17} />
                  <span>Out of Place</span>
                  <strong>{reports.summary.outOfPlaceItems}</strong>
                </div>
              </div>

              <div className="export-row">
                <a className="btn btn-secondary" href="/api/reports/export?type=items">
                  <FileDown size={18} />
                  Items CSV
                </a>
                <a className="btn btn-quiet" href="/api/reports/export?type=scans">
                  <FileDown size={18} />
                  Scans CSV
                </a>
                <a className="btn btn-quiet" href="/api/reports/export?type=checkouts">
                  <FileDown size={18} />
                  Checkouts CSV
                </a>
                <a className="btn btn-quiet" href="/api/reports/export?type=reviews">
                  <FileDown size={18} />
                  Reviews CSV
                </a>
              </div>

              <div className="report-section">
                <div className="detail-subtitle">Location Health</div>
                {reports.locationHealth.length === 0 ? (
                  <div className="mini-empty">No locations yet.</div>
                ) : (
                  reports.locationHealth.slice(0, 4).map((location) => (
                    <div className="report-row" key={location.id}>
                      <div>
                        <strong>{location.name}</strong>
                        <span>
                          {location.foundCount}/{location.expectedCount} found, {location.missingCount} missing,{" "}
                          {location.outOfPlaceCount} out
                        </span>
                      </div>
                      <span className="tag">{location.healthScore}%</span>
                    </div>
                  ))
                )}
              </div>

              <div className="report-section">
                <div className="detail-subtitle">Needs Attention</div>
                {reports.riskItems.length === 0 ? (
                  <div className="mini-empty">No risk items in this snapshot.</div>
                ) : (
                  reports.riskItems.map((item) => (
                    <button className="mini-row" key={item.id} type="button" onClick={() => void openItemDetail(item.id)}>
                      <strong>{item.name}</strong>
                      <span>
                        {item.assetTag} / {item.foundLocation ?? item.homeLocation ?? "No location"} /{" "}
                        {displayDate(item.lastScannedAt)}
                      </span>
                    </button>
                  ))
                )}
              </div>

              <div className="report-section">
                <div className="detail-subtitle">Recent Scans</div>
                {reports.recentScans.length === 0 ? (
                  <div className="mini-empty">No scans yet.</div>
                ) : (
                  reports.recentScans.slice(0, 5).map((scan) => (
                    <div className="report-row" key={scan.id}>
                      <div>
                        <strong>
                          {scan.intent} / {scan.assetTag}
                        </strong>
                        <span>
                          {scan.locationName ?? "No location"} / {scan.userName ?? "No user"}
                        </span>
                      </div>
                      <span>{displayDate(scan.scannedAt)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </section>

        <section className="panel" aria-labelledby="items-heading">
          <div className="panel-header">
            <h2 className="panel-title" id="items-heading">
              <Search size={20} />
              Items
            </h2>
            <button className="btn btn-quiet" type="button" onClick={() => loadItems(query)}>
              <RefreshCw size={18} />
            </button>
          </div>

          <input
            className="input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search inventory"
          />
        </section>

        <section className="panel detail-panel" aria-labelledby="detail-heading">
          <div className="panel-header">
            <h2 className="panel-title" id="detail-heading">
              <Clock3 size={20} />
              Item Detail
            </h2>
            {detailItem ? <span className="tag">{detailItem.scans.length} scans</span> : null}
          </div>

          {!detailItem ? (
            <div className="empty-detail">
              {detailLoading ? "Loading item..." : "Select an item or scan a QR code."}
            </div>
          ) : (
            <div className="detail-stack">
              <div className="detail-hero">
                <div>
                  <div className="item-title">{detailItem.name}</div>
                  <div className="button-row">
                    <span className="tag">
                      <Tag size={13} />
                      {detailItem.assetTag}
                    </span>
                    {detailItem.category ? <span className="tag">{detailItem.category}</span> : null}
                  </div>
                </div>
                <div className="qr-box">
                  <Image
                    alt={`QR for ${detailItem.name}`}
                    height={96}
                    src={`/api/qr/${detailItem.id}`}
                    unoptimized
                    width={96}
                  />
                </div>
              </div>

              <div className="stat-grid">
                <div className="stat-tile">
                  <Home size={17} />
                  <span>Home</span>
                  <strong>{detailItem.homeLocation?.name ?? "Unset"}</strong>
                </div>
                <div className="stat-tile">
                  <MapPin size={17} />
                  <span>Last Found</span>
                  <strong>{detailItem.foundLocation?.name ?? "Not scanned"}</strong>
                </div>
                <div className="stat-tile">
                  <UserRound size={17} />
                  <span>Last User</span>
                  <strong>{detailItem.lastScannedBy ?? "No user"}</strong>
                </div>
                <div className="stat-tile">
                  <Clock3 size={17} />
                  <span>Last Scan</span>
                  <strong>{displayDate(detailItem.lastScannedAt)}</strong>
                </div>
                <div className="stat-tile span-2">
                  <LogOut size={17} />
                  <span>Custody</span>
                  <strong>
                    {detailCheckout ? `Checked out to ${detailCheckout.checkedOutTo}` : "Available"}
                  </strong>
                </div>
              </div>

              <div className="checkout-box">
                <div className="audit-header">
                  <div>
                    <div className="detail-subtitle">Checkout</div>
                    <span className="muted">
                      {detailCheckout
                        ? `Out since ${displayDate(detailCheckout.checkedOutAt)}`
                        : "Assign custody without changing item history."}
                    </span>
                  </div>
                  {detailCheckout ? <span className="tag">Open</span> : <span className="tag">Ready</span>}
                </div>

                {detailCheckout ? (
                  <div className="checkout-current">
                    <div>
                      <span>Checked out to</span>
                      <strong>{detailCheckout.checkedOutTo}</strong>
                    </div>
                    <div>
                      <span>Due</span>
                      <strong>{displayDate(detailCheckout.dueAt)}</strong>
                    </div>
                    <button
                      className="btn btn-primary"
                      disabled={busy}
                      type="button"
                      onClick={() => checkInItem(detailCheckout.id)}
                    >
                      <LogIn size={18} />
                      Check In
                    </button>
                  </div>
                ) : (
                  <form className="quick-form" onSubmit={checkoutItem}>
                    <div className="field-grid">
                      <input
                        className="input"
                        value={checkoutTo}
                        onChange={(event) => setCheckoutTo(event.target.value)}
                        placeholder="Checked out to"
                        required
                      />
                      <input
                        className="input"
                        value={checkoutDueAt}
                        onChange={(event) => setCheckoutDueAt(event.target.value)}
                        type="datetime-local"
                      />
                      <textarea
                        className="textarea span-2"
                        value={checkoutNotes}
                        onChange={(event) => setCheckoutNotes(event.target.value)}
                        placeholder="Checkout notes"
                      />
                    </div>
                    <button className="btn btn-secondary" disabled={busy || !checkoutTo.trim()} type="submit">
                      <LogOut size={18} />
                      Check Out
                    </button>
                  </form>
                )}
              </div>

              <div className="review-box">
                <div className="audit-header">
                  <div>
                    <div className="detail-subtitle">Flag for Review</div>
                    <span className="muted">Open a follow-up without changing scan history.</span>
                  </div>
                  <Flag size={18} />
                </div>
                <form className="quick-form" onSubmit={createReview}>
                  <div className="field-grid">
                    <input
                      className="input"
                      value={reviewTitle}
                      onChange={(event) => setReviewTitle(event.target.value)}
                      placeholder="Review title"
                      required
                    />
                    <textarea
                      className="textarea"
                      value={reviewDetail}
                      onChange={(event) => setReviewDetail(event.target.value)}
                      placeholder="What needs follow-up?"
                    />
                  </div>
                  <button className="btn btn-quiet" disabled={busy || !reviewTitle.trim()} type="submit">
                    <Flag size={18} />
                    Flag Item
                  </button>
                </form>
              </div>

              <form className="quick-form" onSubmit={saveItemDetail}>
                <div className="field-grid">
                  <input
                    className="input span-2"
                    value={detailForm.name}
                    onChange={(event) => updateDetailForm("name", event.target.value)}
                    placeholder="Item name"
                    required
                  />
                  <input
                    className="input"
                    value={detailForm.assetTag}
                    onChange={(event) => updateDetailForm("assetTag", event.target.value)}
                    placeholder="Asset tag"
                  />
                  <input
                    className="input"
                    value={detailForm.category}
                    onChange={(event) => updateDetailForm("category", event.target.value)}
                    placeholder="Category"
                  />
                  <input
                    className="input"
                    value={detailForm.manufacturer}
                    onChange={(event) => updateDetailForm("manufacturer", event.target.value)}
                    placeholder="Manufacturer"
                  />
                  <input
                    className="input"
                    value={detailForm.model}
                    onChange={(event) => updateDetailForm("model", event.target.value)}
                    placeholder="Model"
                  />
                  <input
                    className="input"
                    value={detailForm.serialNumber}
                    onChange={(event) => updateDetailForm("serialNumber", event.target.value)}
                    placeholder="Serial"
                  />
                  <input
                    className="input"
                    value={detailForm.homeLocationName}
                    onChange={(event) => updateDetailForm("homeLocationName", event.target.value)}
                    placeholder="Home location"
                  />
                  <textarea
                    className="textarea span-2"
                    value={detailForm.notes}
                    onChange={(event) => updateDetailForm("notes", event.target.value)}
                    placeholder="Notes"
                  />
                </div>
                <button className="btn btn-primary" disabled={busy} type="submit">
                  <Save size={18} />
                  Update
                </button>
              </form>

              <div className="full-history">
                <div className="detail-subtitle">Scan History</div>
                {detailItem.scans.length === 0 ? (
                  <div className="empty-detail">No scans yet.</div>
                ) : (
                  detailItem.scans.map((scan) => (
                    <div className="scan-row" key={scan.id}>
                      <div>
                        <strong>{scan.intent}</strong>
                        <span>{scan.location?.name ?? "No location"}</span>
                      </div>
                      <div>
                        <strong>{displayDate(scan.scannedAt)}</strong>
                        <span>{scan.user?.name ?? detailItem.lastScannedBy ?? "No user"}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </section>

        <section className="item-list" aria-live="polite">
          {items.map((item) => (
            <article className={`item-card ${activeItemId === item.id ? "active" : ""}`} key={item.id}>
              <div className="item-title-row">
                <div className="item-main">
                  <div className="item-title">{item.name}</div>
                  <div className="button-row">
                    <span className="tag">
                      <Tag size={13} />
                      {item.assetTag}
                    </span>
                    {item.category ? <span className="tag">{item.category}</span> : null}
                    {openCheckout(item) ? <span className="tag checkout-tag">Out</span> : null}
                  </div>
                  <span className="muted">
                    {[item.manufacturer, item.model, item.serialNumber].filter(Boolean).join(" / ") || "No model data"}
                  </span>
                </div>
                <div className="qr-box">
                  <Image
                    alt={`QR for ${item.name}`}
                    height={96}
                    src={`/api/qr/${item.id}`}
                    unoptimized
                    width={96}
                  />
                </div>
              </div>

              <div className="button-row">
                <button className="btn btn-secondary" type="button" onClick={() => logScan(item.id)}>
                  <CheckCircle2 size={18} />
                  Found
                </button>
                <button
                  className="btn btn-quiet"
                  type="button"
                  onClick={() => void openItemDetail(item.id)}
                  disabled={detailLoading}
                >
                  <Clock3 size={18} />
                  Detail
                </button>
                <button className="btn btn-danger" type="button" onClick={() => archiveItem(item.id)}>
                  <Archive size={18} />
                  Archive
                </button>
              </div>

              <div className="history">
                <div className="history-row">
                  <span>
                    <MapPin size={14} /> {item.foundLocation?.name ?? item.homeLocation?.name ?? "No location"}
                  </span>
                  <span>{displayDate(item.lastScannedAt)}</span>
                </div>
                <div className="history-row">
                  <span>
                    <UserRound size={14} /> {item.lastScannedBy ?? "No user"}
                  </span>
                  <span>{item.scans.length} recent</span>
                </div>
                {activeItemId === item.id
                  ? item.scans.map((scan) => (
                      <div className="history-row" key={scan.id}>
                        <span>{scan.intent}</span>
                        <span>
                          {scan.location?.name ?? "No location"} / {displayDate(scan.scannedAt)}
                        </span>
                      </div>
                    ))
                  : null}
              </div>
            </article>
          ))}
        </section>
      </div>

      {toast ? <div className="toast">{toast}</div> : null}
    </main>
  );
}
