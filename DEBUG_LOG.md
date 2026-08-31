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
