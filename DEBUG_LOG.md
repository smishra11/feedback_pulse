## PULSE-101: Dashboard NPS score truncates decimals instead of rounding

**Symptom:** The headline score on the dashboard doesn't match the result of manually counting the rows and calculating the percentages.

**How I found it:** I traced the dashboard's summary data to `src/lib/nps.ts` and reviewed the math inside the `summarise` function.

**Root cause:** The final NPS calculation used `parseInt(String(promoterShare - detractorShare), 10)`. Because `parseInt` chops off the decimal part of a number instead of mathematically rounding to the nearest integer, values like 40.8 were becoming 40 instead of 41.

**Fix:** Replaced the string conversion and `parseInt` with `Math.round(promoterShare - detractorShare)` to handle the math correctly.

**How I verified it:** I calculated the expected score by hand using the raw counts and verified that the dashboard now displays the exact rounded number.

**Blast radius:** I checked the rest of the codebase for other incorrect uses of `parseInt` on floating-point numbers. Since `summarise` is the only function handling NPS math, this fix is isolated and fully resolves the bug.
