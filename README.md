# GearPin Inventory

Mobile-first inventory accountability for AV, venue, campus, and technical operations teams.

## MVP Spine

- Item CRUD with archive states instead of deletion
- QR code generation with item-record payloads
- Camera QR scanning plus manual asset-tag fallback
- Append-only scan history with timestamp, user, location, and GPS fields
- Fast mobile search
- SQLite + Prisma for the first local database

## Current Status

The initial MVP spine is running as a Next.js app with Prisma + SQLite. It supports:

- Adding inventory items with quick mobile-friendly fields
- Auto-generating asset tags when left blank
- Generating QR codes that point to item records
- Scanning QR codes through the phone camera over HTTPS
- Logging manual scans by asset tag
- Capturing scan timestamp, user, location, and GPS fields when available
- Queueing scans locally when the app is offline or the scan request cannot reach the server
- Syncing queued scans later while preserving original scan time, user, location, GPS, raw payload, and audit intent
- Showing recent scan history on item cards
- Showing full item detail with editable fields
- Showing full scan history for the selected item
- Creating and selecting storage locations
- Showing location health, expected items, found items, missing items, and out-of-place items
- Starting and ending lightweight audit sessions
- Reusing QR/manual scan flow for audit scans
- Checking items out to a person with optional due date and notes
- Checking items back in while recording custody scan history
- Opening item-linked review queue follow-ups
- Resolving or dismissing review queue items without deleting history
- Showing an operations report snapshot with active items, scans today, checkouts, reviews, risk counts, location health, recent scans, and needs-attention items
- Exporting CSV reports for items, scans, checkouts, and reviews
- Archiving items instead of deleting them
- Searching active inventory by name, tag, category, manufacturer, model, or serial

## Run Locally

```bash
cp .env.example .env
npm install
npm run prisma:push
npm run prisma:seed
npm run dev
```

Open `http://localhost:3000`.

## Phone Testing

For phone UI testing on the same Wi-Fi network, use the network URL printed by Next, for example:

```text
http://<your-computer-ip>:3000
```

Camera access on mobile browsers generally requires HTTPS. For QR scanner testing, run a temporary HTTPS tunnel:

```bash
npx --yes cloudflared tunnel --url http://localhost:3000
```

Open the generated `https://...trycloudflare.com` URL on the phone. Use test data only while a tunnel is running because it exposes the local dev app publicly.

## Test Checklist

- Add a new item and confirm the status line says it saved.
- Search for the item by asset tag.
- Log a manual scan by asset tag and confirm scan history updates.
- Tap `Start`, allow camera permission, and scan a generated QR code.
- Confirm the scanner shows `QR detected. Saving scan...` and then `Scan saved`.
- Put the phone in airplane mode, scan or manually log a known asset tag, and confirm the app shows an offline queued scan.
- Turn the phone back online, tap `Sync` if it does not sync immediately, and confirm the queued scan lands in item history.
- Open item detail, update a field, and confirm the item card/detail panel refresh.
- Create a location and confirm it appears in the Locations panel.
- Start an audit for a location and confirm scan location switches to that room.
- End the audit and confirm the audit closes without deleting scan history.
- Open item detail, check an item out to a person, and confirm custody shows as open.
- Try checking the same item out again and confirm the app rejects the duplicate open checkout.
- Check the item back in and confirm scan history includes `CHECKOUT` and `CHECKIN`.
- Open item detail, flag it for review, and confirm it appears in the Review panel.
- Resolve or dismiss the review item and confirm it leaves the open queue.
- Open the Reports panel and confirm summary counts load.
- Download Items, Scans, Checkouts, and Reviews CSV exports.
- Try a duplicate asset tag and confirm the app shows a visible error.
- Archive an item and confirm it leaves active search without deleting scan history.

## Development Priorities

1. Item CRUD, QR generation, QR scanning, scan history, search
2. Locations, storage health, audit mode, GPS tracking
3. Offline sync, checkout hardening, review queue hardening, reporting/export hardening

## Accountability Rules

- Scans are never deleted.
- Items and locations are archived, not permanently removed.
- QR codes identify records; they do not store large datasets.
- Mobile speed and reliability beat visual complexity.

## Useful Commands

```bash
npm run lint
npm run build
npm run prisma:push
npm run prisma:seed
```

## Notes

- Localtunnel was unreliable during phone testing; Cloudflare quick tunnel worked.
- Next dev needs tunnel hosts added to `allowedDevOrigins` in `next.config.ts` when testing through a public HTTPS tunnel.
- `npm audit --omit=dev` currently reports two moderate findings through Next's bundled PostCSS dependency. The suggested force fix would be a breaking downgrade, so it has not been applied.
