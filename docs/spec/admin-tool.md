# v1 Admin Tool

The staff back office. Every screen is `role = staff` only, English-only, under `/admin/*`,
gated by `requireStaff()` in the **DAL** (not in layouts —
[`auth-and-permissions.md`](../auth-and-permissions.md) §10).

This document defines **what each screen shows, what it does, and which rules it operates
within** — not pixel layout. Every rule below is already fixed by a closed ticket; the build
assembles CRUD over the entities.

**Admin scope:** Product Management (sellers, donor vehicles, listings, parts), plus the
operational surfaces Vehicle catalogue, Buyers, Threads, **Credits** and **Reviews**, and a
**read-only** Orders view. Staff **cannot act on orders** ([ADR-0009](../adr/0009-seller-operated-orders-cash-on-delivery.md)).
Still out: marketing / customer-service / store-management modules, ad analytics, payout and
invoicing, staff-management UI, impersonation.

There is **no staff-facing notification feed** — staff work from the lists below
([`notifications.md`](../notifications.md) §4).

---

## 1. `/admin` — Dashboard

Read-only counts, each linking to a filtered list:

| Item | Contents | Links to |
|---|---|---|
| **Awaiting seller** | `Order.status = placed`, with the age of the oldest | `/admin/orders` filtered |
| **Awaiting completion** | `Order.status = confirmed`, with the age of the oldest | `/admin/orders` filtered |
| **Pending cancellations** | `CancellationRequest.state = pending` | `/admin/orders` filtered |
| **Reported threads** | `Report` rows not yet resolved. **The only item staff act on.** | `/admin/threads/[id]` |
| **Low credits** | sellers with a balance of 5 or fewer | `/admin/sellers` sorted by balance |

No charts, no revenue, no time series.

---

## 2. `/admin/sellers`

**List** — every `Seller`: `displayName`, Location city, has-login flag, **credit balance**,
counts of active listings / open orders. Sortable by balance.

**`/admin/sellers/new`** — Phase 1 provisioning ([`auth-and-permissions.md`](../auth-and-permissions.md) §4.1):
create the `Seller` profile — `displayName`, contact name / email / phone, **avatar** (optional
upload), embedded **Location** (name, address line, city, postcode, country). **No `User` yet.**
The Seller can be given `DonorVehicle`s and draft `Listing`s immediately, but **cannot publish
until a login is provisioned** ([`auth-and-permissions.md`](../auth-and-permissions.md) §4.4).

**`/admin/sellers/[id]`** — profile + Location + avatar editor, listing/order/thread counts, the
**Credits panel** (§7b), and the login controls:

| Action | Effect | Rule |
|---|---|---|
| **Provision login** | enter a login email (pre-filled from contact email). **Collision check** — reject if the email belongs to **any** `User`. On success: create `User{role:seller}`, link `Seller.userId`, **show a random initial password once** for staff to relay. Not force-rotated. | [`auth-and-permissions.md`](../auth-and-permissions.md) §4.2, [ADR-0004](../adr/0004-one-role-per-user.md) |
| **Disable / Enable login** | Better Auth ban toggle. Profile, listings, orders, messages untouched. | §4.3 |
| **Unlink login** | clear `Seller.userId` **and** disable that `User` (never hard-delete). Seller becomes unavailable until a login is provisioned again. | §4.3, §4.4 |
| **Reset password** | new random password shown once to staff. Works on any `User`. | §4.3, §6 |

A disabled / unlinked seller is **unavailable**: their listings can no longer be reserved, their
public profile is hidden, and no new `Thread` can start ([`auth-and-permissions.md`](../auth-and-permissions.md)
§4.4, [ADR-0006](../adr/0006-both-sides-login-messaging.md)). **Disable** and **Unlink** first
show a warning when the seller has open orders, because nobody can then confirm or complete them.

---

## 3. `/admin/buyers`

**List + `/admin/buyers/[id]`** — view a `Buyer` (name, email, delivery address, order count).
The only action is **Reset password** (§6, no self-serve reset). No buyer creation here —
buyers self-register.

---

## 4. `/admin/catalogue` — Vehicle catalogue

`VehicleMake → VehicleModelGroup → VehicleGeneration` ([ADR-0003](../adr/0003-provenance-first-generation-grain.md)).
The repo **seed fixture is the source of truth**; admin CRUD is minimal and exists mainly to
**add a `VehicleGeneration` during intake** when a donor vehicle is `— NOT LISTED —` on the
sheet ([`seller-intake.md`](../seller-intake.md) §2.4).

- `VehicleMake` — `name`, `slug`, `country`, `displayOrder`, `isActive`.
- `VehicleModelGroup` — `makeId`, `name` (e.g. `A4, S4`), `slug`, `displayOrder`, `isActive`.
- `VehicleGeneration` — `modelGroupId`, `label` (`A4 S4 B5 8D (1994–1999)`), `chassisCodes[]`,
  `productionStart/End`, `displayOrder`, `isActive`.
- `isActive = false` hides a row from the funnel without deleting rows that provenance points
  at.

**No `Fitment` anything** — the entity does not exist in v1.

---

## 5. `/admin/parts` — Parts & PartNumbers ([#5](https://github.com/Lucy-yunn/carparts/issues/5))

**List / search** — by `internalCode` (`PRT-000123`), name, or `PartNumber.normalized`.

**`/admin/parts/[code]`** — the Part detail page:
- `name`, `categoryId` (leaf), `attributes` (per-Category Zod-validated JSONB), `partStatus`
  (`provisional → confirmed`, staff-only, no going back), `pnStatus` (`unknown` / `unverified`
  / `verified`), `notes`.
- **`PartNumber` rows** — `raw` + `normalized`, `numberType` (`oem`/`aftermarket`/`casting`/
  `trade`/`other`), `brand` (free text), `isPrimary` (≤1), `verified`. Add / edit / remove.
  Cross-brand numbers join the **same** Part only after staff verify interchangeability.
- **De-dup** — creating a Part or adding a number searches `PartNumber.normalized` first and
  **offers existing Parts** before a new one is created. Never auto-merges.
- **Hard-merge** — staff merge two Parts with a **tombstone + audit log entry** (unlike the
  low-stakes reference data elsewhere). Supersession is deferred (`PartNumberLink` reserved).

**Listing intake reads/writes Parts** — see §7.

---

## 6. `/admin/donor-vehicles` + `/admin/listings` — Product Management (donor-first intake)

The core staff workflow ([`seller-intake.md`](../seller-intake.md), [ADR-0007](../adr/0007-staff-entry-no-submission-entity.md)).
Staff transcribe the returned intake sheet.

### 6.1 `/admin/donor-vehicles/[id]` — create the car once

Per `Vehicles` row on the sheet:
- `sellerId`, `generationId` (**required** — resolve `— NOT LISTED —` by adding a
  `VehicleGeneration` in §4), `label` (staff reference).
- Nullable: `donorYear`, `vin` (shown **masked** to buyers), `vinDerivedNotes` (staff-only),
  `mileageKm`, `registrationCountry`, `notes`.
- **`scrapReason`** — nullable **free text**, the seller's own words on why the car was scrapped.
  The field's placeholder suggests examples (accident, flood, end of life) but accepts anything.
  It is shown to buyers on the donor-vehicle page.
- **Structured detail** (nullable, shown to buyers on the Listing): `engine`, `engineCode`,
  `fuel`, `transmission`, `bodyStyle`, `drivetrain`.
- `DonorVehiclePhoto` 0..n (optional).
- No lifecycle status — it is a data record.

### 6.2 `/admin/listings/new` (against a `DonorVehicle`) + `/admin/listings/[id]` — the editor

Per `Parts` row:
1. **Part** — match-or-create via §5 de-dup. The seller's free-text part name + visible codes
   drive the search.
2. **This item** — `condition` (`new` / `used_good` / `needs_repair`) + `conditionNotes`
   (seller's words, **as written**); `ListingDefect` rows (staff split the sheet's
   one-fault-per-line into rows, each with an optional photo link); `priceEur` **copied
   unchanged** from the sheet; `negotiable`; `sellerSku`, `warehouseLocation`, `removalNotes`;
   dimensions (`lengthCm` / `widthCm` / `heightCm` / `weightKg` / `packageSizeNotes`).
3. **Photos** — upload from the seller's folder, **downscale on ingest** (~2000 px longest
   edge), order (first = primary), soft cap ~15. Only these enter Vercel Blob.
   The browser shrinks each photo to 2000 px JPEG before sending; nothing over 4 MB is sent
   (clear message instead), and `serverActions.bodySizeLimit` is `4.4mb`, under the 4.5 MB a
   hosted function accepts. The server still downscales with `sharp` (issue #37,
   `lib/photo-upload-limits.ts`).
4. **Publish checklist** — `draft → published` requires: ≥1 photo · `condition` set ·
   `priceEur > 0` · `Part` linked with a leaf `Category` · `DonorVehicle` linked · ≥1
   `PartNumber` **or** "no visible number" ticked · **the seller is available** (has an active
   login) · **the seller has at least one credit**. Publishing charges one credit in the same
   transaction ([`seller-credits.md`](../seller-credits.md) §3). There is **no review state /
   approval queue** — the checklist is the gate.
5. **Status transitions** — `draft → published` (one credit); `published ↔ cancelled`
   (`cancelled → published` costs one credit); `published` / `cancelled → archived` (terminal).
   Staff **never** set `sold` by hand. `published → reserved → sold` and `reserved → published`
   are driven by the order lifecycle only, and cost no credit.

**Build note:** the editor must not assume only staff create a `draft` — the future
self-serve path reuses `draft` + the checklist as its approval gate ([ADR-0007](../adr/0007-staff-entry-no-submission-entity.md)).

### 6.3 `/admin/listings` — list

All statuses, all sellers. Filter by status / seller / Category. Bulk actions are not
required for v1 volume.

---

## 7. `/admin/orders` — Orders (**read-only**, [`order-model.md`](../order-model.md))

**List** — every `Order`, newest first. Columns: code, item, buyer, seller, status, placed date
and **age** for open orders, and a badge for a pending cancellation. Filters over `status`
(`placed` / `confirmed` / `completed` / `cancelled` / `refused`), by seller, and **"cancellation
pending"**. Sortable by age, so stuck orders float to the top.

**`/admin/orders/[code]`** — full visibility: delivery snapshot, buyer name and phone, seller,
every timestamp, the `CancellationRequest` and its reason, the `refusalNote`.

**There are no action buttons.** Staff cannot confirm, complete, refuse, cancel, approve a
cancellation, or raise one; only the seller (and, for cancellation, the buyer and the 7-day timer)
can ([ADR-0009](../adr/0009-seller-operated-orders-cash-on-delivery.md)). When an order is stuck
the staff contact the seller by phone.

The old `/admin/cancellations` page is removed. Its data is the "cancellation pending" filter
above. The daily **Vercel Cron** sweep still auto-approves requests past `autoApproveAt`, and
overdue requests also resolve lazily on read ([ADR-0005](../adr/0005-always-approves-cancellation.md)).

---

## 7b. Credits — `/admin/credit-bundles` and the seller Credits panel

- **`/admin/credit-bundles`** — CRUD over `CreditBundle` (`name`, `credits`, `priceEur`,
  `isActive`, `displayOrder`). Inactive bundles cannot be chosen for a new top-up.
- **Credits panel** on `/admin/sellers/[id]`: the current balance; **Add bundle** (choose a bundle,
  writes a `topup` ledger entry); **Adjust** (a positive or negative number and a **required note**,
  writes an `adjustment` entry); and the full ledger, newest first, with kind, amount, note, staff
  member and date. Rows are never edited or deleted.

Rules: [`seller-credits.md`](../seller-credits.md).

---

## 8. `/admin/reviews` — Reviews

A list of every `Review`, newest first, filterable by seller and by hidden or visible. Each row
shows the seller, the reviewer, rating, text, the context label (purchased part or "No purchase"),
the seller's reply, and its hidden state. **Hide** requires a reason and **Unhide** is available.
Staff cannot write, edit or reply. Rules: [`reviews.md`](../reviews.md) §5.

---

## 9. `/admin/threads` — Messaging moderation ([`messaging-model.md`](../messaging-model.md) §7)

**List** — every `Thread`, newest by `lastMessageAt`, flagging those with an open `Report`.
Unconditional read access — Threads are not private from the operator.

**`/admin/threads/[id]`** — the full message log + moderation controls:

| Action | Effect |
|---|---|
| **Post as "IVO Support"** | a `Message` with `senderRole = staff`, rendered to both parties as a distinct labelled entry — never as the seller. |
| **Lock / Unlock** | a locked Thread accepts no messages from buyer or seller; both see *"This conversation was closed by IVO."* Reversible. |
| **Resolve report** | clears the `Report` from the queue (`resolvedAt`, `resolvedBy`). |
| **Block a `User`** | sets `User.messagingBlockedAt` — that user cannot start or reply to any Thread anywhere; existing Threads become read-only for them. |

No message deletion or redaction — the log is append-only.

---

## 10. Authorization summary

| Rule | Where |
|---|---|
| Every `/admin/*` route + data function + Server Action | `requireStaff()` in the DAL |
| Wrong-role authenticated request (e.g. a buyer opens `/admin`) | plain **403 page** (not a redirect, not a 404) |
| Staff accounts | seed script only — **no creation UI here** |
| Impersonation | not built |
| Staff have **no** seller-center access | they see every seller's data here instead |
| Staff order actions | **none** — read-only ([ADR-0009](../adr/0009-seller-operated-orders-cash-on-delivery.md)) |
