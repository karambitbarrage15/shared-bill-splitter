# Shared Bill Splitter

A full-stack bill-splitting application designed for shared households. It calculates proportional shares in integer cents, allocates remainder cents deterministically according to member addition order, prevents double-charging with idempotency keys, and eliminates race conditions via atomic SQLite updates.

---

## 🎬 Video Walkthrough

Watch the 3-minute code and architecture walkthrough:  
👉 **[Code Walkthrough Video (YouTube)](https://youtu.be/ONiynTHxuFE)**

---

## 🛠️ Stack

- **API:** Hono on Cloudflare Workers
- **Database:** Cloudflare D1 (SQLite) with schema migrations
- **Web:** React 19, Vite, TanStack Router
- **Language:** TypeScript on both ends (strict mode, zero `any`)
- **Tests:** Vitest inside the Workers runtime (`24/24` passing)
- **Quality:** Biome linter & formatter (`pnpm check` passing)

---

## 💡 Decisions & Trade-Offs

1. **Integer cents only:** All money is stored and computed strictly as integer cents (`amountCents`) to avoid floating-point rounding errors. When a bill cannot be split evenly across $N$ members, the remainder (`totalCents % N`) is distributed 1 cent per member in order of their addition (`position ASC`).
2. **Explicit `position` column:** Members have an indexed `position` integer column instead of relying on autoincrement IDs or creation timestamps. This guarantees stable, deterministic ordering across queries, database migrations, and bill splits.
3. **Atomic payments with conditional update:** Concurrency is handled at the database level using `UPDATE shares SET paid_at = ?, idempotency_key = ? WHERE id = ? AND paid_at IS NULL`. By evaluating affected rows (`meta.changes`), simultaneous requests cannot double-pay the same share. Replays with the identical `Idempotency-Key` safely return the existing receipt (`200 OK`), while conflicting keys are rejected with `409 Conflict`.

---

## 🛡️ Edge Cases Handled

- **Home with no members:** Rejects bill creation with HTTP `422`.
- **Invalid monetary values:** Rejects amounts that are negative, zero, float decimals, or non-numbers with HTTP `422`.
- **Uneven bill splits:** Extra remainder cents are distributed one by one in the order members joined.
- **Duplicate payment retries:** Idempotency key replay returns `200` with original receipt without double-charging.
- **Concurrent double-payments:** Atomic conditional SQL update ensures only one in-flight payment succeeds; the second receives `409 Conflict`.
- **Non-existent resources:** Missing homes, bills, or shares cleanly return HTTP `404`.
- **API delays or 500 errors:** Web client wraps calls with graceful error handling and loading indicators, ensuring the interface never crashes.

---

## 🚀 Running Locally

```bash
# Install dependencies
pnpm install

# Start backend (:8787) and frontend (:5173) concurrently
pnpm dev

# Run full test suite (24 tests)
pnpm test

# Format & Lint check (Biome)
pnpm check

# TypeScript typecheck
pnpm typecheck
```
