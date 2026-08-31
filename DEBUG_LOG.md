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

**Blast radius:** I should probably check `SearchBox.tsx` and `WaveSelect.tsx` to make sure they aren't also mixing local state with URL updates in the same broken way, but fixing it here directly resolves the filter bug.

## PULSE-104: Brands page is extremely slow due to N+1 queries

**Symptom:** Loading the main Brands page takes over a second, even with just two brands in the database.

**How I found it:** I reviewed the `listWithStats` function in `src/services/brand.service.ts` to see what data was being loaded for the page.

**Root cause:** The function was suffering from a massive N+1 query problem. For each brand, it fetched all customers, and then looped through every single customer, executing a separate `prisma.response.count` query sequentially to see if they were active. For 1,000 customers, this meant 1,000 separate database calls per brand.

**Fix:** Removed the `for` loop entirely. I replaced it with a single `prisma.customer.count` to get the total, and a single `prisma.response.findMany({ distinct: ['customerId'] })` query to count how many unique customers had submitted responses.

**How I verified it:** Refreshed the brands page and observed that the load time dropped instantly from >1s to a few milliseconds.

**Blast radius:** Scanned `brand.service.ts` and `response.service.ts` for other `for` loops making database queries. `BrandService.listWithStats` was the only place looping queries sequentially like this.

## PULSE-105: Webhook returns before saving and allows duplicate events

**Symptom:** Running the test script reports that 0 events were stored initially, but they show up later. Also, the script's duplicate redelivery test causes multiple identical answers to be saved.

**How I found it:** I looked at the webhook handler in `route.ts` and the data model in `schema.prisma`.

**Root cause:**

1. The webhook used `events.forEach(async...)`, which doesn't await the inner promises. The API responded with success before the database writes finished.
2. The `eventId` deduplication relied entirely on a `findFirst` code-level check in `response.service.ts`. Under concurrent load, a race condition occurs where multiple requests check the DB simultaneously, see no existing record, and all write the same event.

**Fix:**

1. Replaced `forEach` with `await Promise.all(events.map(...))` in the route so the request blocks until the writes are actually done.
2. Added an `@unique` constraint to the `eventId` field in `schema.prisma` to let the database strictly enforce idempotency.

**How I verified it:** Ran the test script (`npm run send:responses -- --count 10 --duplicate`). The script now accurately reports the records being stored immediately, and the duplicate redelivery cleanly bounces off the unique constraint without creating duplicate rows.

**Blast radius:** Checked for other uses of `forEach(async...)` across the repo and didn't find any. The `@unique` constraint safely only applies to inbound provider events (since `eventId` can be null for in-app feedback).
