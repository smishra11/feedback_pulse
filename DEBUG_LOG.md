## PULSE-101: Dashboard NPS score truncates decimals instead of rounding

**Symptom:** The headline score on the dashboard doesn't match the result of manually counting the rows and calculating the percentages.

**How I found it:** I traced the dashboard's summary data to `src/lib/nps.ts` and reviewed the math inside the `summarise` function.

**Root cause:** The final NPS calculation used `parseInt(String(promoterShare - detractorShare), 10)`. Because `parseInt` chops off the decimal part of a number instead of mathematically rounding to the nearest integer, values like 40.8 were becoming 40 instead of 41.

**Fix:** Replaced the string conversion and `parseInt` with `Math.round(promoterShare - detractorShare)` to handle the math correctly.

**How I verified it:** I calculated the expected score by hand using the raw counts and verified that the dashboard now displays the exact rounded number.

**Blast radius:** I checked the rest of the codebase for other incorrect uses of `parseInt` on floating-point numbers. Since `summarise` is the only function handling NPS math, this fix is isolated and fully resolves the bug.

## PULSE-102: Pagination shows duplicate rows

**Symptom:** You see a row on page 1 of the feedback table, go to page 2, and see the exact same row again.

**How I found it:** I jumped into `src/services/response.service.ts` to look at how `listFeedback` handles the sorting and offset logic.

**Root cause:** The database queries were sorting solely by `score` or `respondedAt`. Since a lot of rows have the exact same score or timestamp, the database treats them as ties and sorts them randomly on every query. When you ask for page 2, the ties shuffle, pushing a page 1 row down into the page 2 offset.

**Fix:** Added `id` as a secondary sort key to both the raw SQL query and the Prisma `orderBy` array. This acts as a tie-breaker so the database order is strictly deterministic.

**How I verified it:** I went to a wave that had a bunch of identical scores and clicked back and forth between the pages. The rows stayed put.

**Blast radius:** I noticed `loadWaveFeedback` also sorts only by date without a tie-breaker. However, since it pulls the whole dataset at once without `OFFSET`/`LIMIT` pagination, the shuffling doesn't cause any duplicate row issues in the UI. The fix in `listFeedback` covers the bug completely.

## PULSE-103: Bucket filter is one click behind

**Symptom:** Clicking a filter like "Detractors" doesn't do anything. Clicking it a second time applies it. It always feels like it's applying the previous click.

**How I found it:** I looked at the click handler (`onSelect`) in `src/components/BucketFilter.tsx`.

**Root cause:** The handler called `setBucket(next)` but then immediately built the new URL using the `bucket` state variable. Since React state updates are async, `bucket` still held the stale value, so it was pushing the old filter to the URL.

**Fix:** I ripped out the local `useState` completely. The URL should be the single source of truth anyway. I updated the `onSelect` function to use the incoming `next` argument directly when setting the URL param, and swapped the active styling check to use the `current` prop.

**How I verified it:** Clicked around the different buckets and confirmed the URL and table update instantly on the very first click.

**Blast radius:** I checked `SearchBox.tsx` and `WaveSelect.tsx` to ensure they aren't mixing local state with URL updates in the same broken way. Both of those components correctly use the current values before pushing to the router, so the bug was isolated to the bucket filter.

## PULSE-104: Brands page is extremely slow due to N+1 queries

**Symptom:** Loading the main Brands page takes over a second, even with just two brands in the database.

**How I found it:** I reviewed the `listWithStats` function in `src/services/brand.service.ts` to see what data was being loaded for the page.

**Root cause:** The function was suffering from a massive N+1 query problem. For each brand, it fetched all customers, and then looped through every single customer, executing a separate `prisma.response.count` query sequentially to see if they were active. For 1,000 customers, this meant 1,000 separate database calls per brand.

**Fix:** Removed the `for` loop entirely. I replaced it with a single `prisma.customer.count` to get the total, and a single `prisma.response.findMany({ distinct: ['customerId'] })` query to count how many unique customers had submitted responses.

**How I verified it:** Refreshed the brands page and observed that the load time dropped instantly from >1s to a few milliseconds.

**Blast radius:** Scanned `brand.service.ts` and `response.service.ts` for other `for` loops making database queries. `BrandService.listWithStats` was the only place looping queries sequentially like this.

## PULSE-105: Webhook returns before saving and allows duplicate events

**Symptom:** Running the test script reports that 0 events were stored initially, but they show up later. Also, the script's duplicate redelivery test causes multiple identical answers to be saved, and eventually crashes the API with a 500 error.

**How I found it:** I looked at the webhook handler in `route.ts`, the deduplication logic in `response.service.ts`, and the data model in `schema.prisma`.

**Root cause:**

1. The webhook used `events.forEach(async...)`, which doesn't await the inner promises. The API responded with success before the database writes finished.
2. The `eventId` deduplication relied entirely on a `findFirst` code-level check. Under concurrent load, a race condition occurs where multiple requests check the DB simultaneously, see no existing record, and all write the same event.
3. Once the unique constraint was added, concurrent identical requests caused the DB to throw a constraint error, crashing the API route.

**Fix:**

1. Replaced `forEach` with `await Promise.all(events.map(...))` in the route so the request blocks until the writes are actually done.
2. Added an `@unique` constraint to the `eventId` field in `schema.prisma` to let the database strictly enforce idempotency.
3. Wrapped the database `create` call in a `try/catch` to gracefully catch and ignore the unique constraint error without crashing.

**How I verified it:** Ran the test script (`npm run send:responses -- --count 10 --duplicate`). The script now accurately reports the records being stored immediately, the duplicate redelivery cleanly bounces off the unique constraint without creating duplicate rows, and the API no longer crashes.

**Blast radius:** Checked for other uses of `forEach(async...)` across the repo and didn't find any. The `@unique` constraint safely only applies to inbound provider events.

## PULSE-106: Missing feedback due to timezone offset

**Symptom:** The dashboard shows "No feedback yet" for specific waves (like the Flash Feb 2026 wave), even though responses exist in the database.

**How I found it:** Looked at how the date filters were constructed in `waveWindow` inside `src/services/wave.service.ts`.

**Root cause:** The function used `.setHours()` which applies the local timezone offset to the date. If the server is in a timezone ahead of UTC, setting local time to 23:59 actually shifts the UTC window backward (e.g., to 18:29 UTC in IST). This chopped off the end of the day, artificially excluding any feedback that landed late in the evening UTC.

**Fix:** Swapped `.setHours()` with `.setUTCHours()` so the window correctly spans the absolute 00:00:00 to 23:59:59 bounds of the UTC calendar day.

**How I verified it:** Checked the dashboard for the Flash wave. The missing feedback instantly appeared and populated the scores.

**Blast radius:** Checked `format.ts` or other date utilities to see if we were blindly relying on local timezone functions elsewhere. The bug seems confined to this specific database boundary calculation.

## PULSE-107: SQL Injection and crash on single quotes in search

**Symptom:** Typing a single quote (like in the word "can't") into the feedback search box causes the entire page to crash.

**How I found it:** I noticed that the search query in `src/services/response.service.ts` was using `prisma.$queryRawUnsafe` and dynamically injecting the unescaped `${search}` string directly into an `ILIKE` SQL clause.

**Root cause:** Because the search term wasn't parameterized, a single quote in the input prematurely closed the SQL string boundary, resulting in a Postgres syntax error and a 500 crash.

**Fix:** Removed the raw SQL entirely. I unified the search and non-search logic into a single Prisma `findMany` query, utilizing Prisma's native `{ contains: search, mode: "insensitive" }` filter. Prisma automatically parameterizes the inputs, preventing SQL injection and handling quotes safely.

**How I verified it:** Searched for `can't` and `' OR 1=1 --`. The app no longer crashes and safely returns matching (or zero) results.

**Blast radius:** Checked for other usages of `$queryRawUnsafe` in the repository; this was the only instance.

---

## Stage 2: Feature Flag Implementation

**Feature:** Allow reviewers to flag/unflag feedback for follow-up and filter the table to see only flagged items. The filter survives a page refresh.

**Decisions & Architecture:**

1. **Data Model:** Added a `flagged Boolean @default(false)` column to the `Response` model in `schema.prisma` and ran `npx prisma db push` to avoid heavy migrations, adhering to `decisions.md`.
2. **Service Layer:** Added `toggleFlag` to `ResponseService` and updated `listFeedback` to accept a `flagged` boolean, ensuring route handlers and UI components don't touch Prisma directly.
3. **State Management (Filter):** Following the pattern set by `BucketFilter` and `SearchBox`, I stored the flagged filter state in the URL search params (`?flagged=true`). This natively guarantees that the filter survives a page refresh, works seamlessly with pagination, and keeps the UI shareable.
4. **Mutation (Toggling the Flag):** Used a Next.js Server Action (`src/actions/responses.ts`) wired to a `<form>` inside the `FeedbackTable`. This allows us to cleanly mutate the database and trigger `revalidatePath("/brands/[slug]", "page")` to instantly refresh the server-rendered table without needing complex client-side state.
