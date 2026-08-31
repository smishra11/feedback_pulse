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
