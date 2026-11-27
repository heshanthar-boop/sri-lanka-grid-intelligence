# Sri Lanka Grid Intelligence (SLGI)

Independent, static, Android-friendly explorer for PUCSL public dispatch observations. It is not an official CEB or PUCSL product, a live control-room feed, a complete national generation account, or evidence that an outage, trip, or curtailment occurred.

## Open and install

After the GitHub Pages deployment succeeds, open its HTTPS address in Android Chrome and use **Install app** or **Add to Home screen** if offered. The application shell and previously visited dates are cached for offline use; dates not previously visited are not guaranteed to be available offline. Updates are network-first. Service workers require HTTPS or localhost. No login is needed for the app.

Use the Day / Week / Month buttons above the chart. Week means Monday–Sunday; Month means the calendar month containing the selected date. In week and month views, each point is an original 15-minute reported MW reading. Zoom in to inspect individual times. Missing days and unavailable series are gaps, never zero. The availability count is shown above the chart. Tick the sources, total output and plants you want directly above the chart; open the plants section to select individual plants. Hover, tap, or focus the chart and use left/right arrow keys to inspect values. A plant may belong to a selected source group, so avoid adding them together. The summary cards and investigation panels continue to describe the selected day. Different days may have different source coverage.

The Sri Lanka calendar marks published public and bank holidays from the original government gazettes for 2025 and 2026. Holidays can change; later gazette amendments and special declarations are not automatically included. Other years are clearly marked as not loaded. The calendar starts on Monday, like the government desk calendar; Saturdays and Sundays are shown as bank weekends for the loaded years. Dots show days with accepted data. Choose Day, Week or Month in the calendar, then select a date. If a day has no data, the app says so; for a week or month, it uses an available date in that same period when possible. Previous/next arrows skip unavailable archive days.

Scroll the mouse wheel over the chart to zoom at the pointer (or use + and -), drag across the full chart to select and zoom into a range, then drag left or right to move through the zoomed view (or use the left/right arrows), and Reset to see the full period. “Save chart as PDF” downloads the visible zoomed chart. “Export data to Excel” downloads an .xlsx workbook containing all points in the selected period and selected series (regardless of zoom), plus a source and methodology sheet; missing values stay blank. PDF uses simple Latin font rendering, so non-Latin imported series labels may appear as question marks.

Colours follow the broad conventions shown in [PUCSL generation reports](https://www.pucsl.gov.lk/wp-content/uploads/2024/07/Generation-Report-16.-07.2024-second-Copy-Copy.pdf): blue major hydro, yellow coal, red CEB oil, purple IPP oil, green wind, cyan mini hydro and orange solar. Storage uses a separate colour. See the chart legend for names.

The included dates are genuine verified source records, not demonstration data. Select a date and then choose source groups, the net total, or a reported plant/aggregate. A source series can be an aggregate (for example, solar, wind or mini hydro), even when shown in the plant selector. The status line says **not live**.

## Deploy on GitHub Pages

1. Create a public GitHub repository and upload all the contents of this directory, including the hidden `.github` directory and archive. Use `main` as the default branch.
2. In **Settings → Pages → Build and deployment**, choose **GitHub Actions**. Under **Settings → Actions → General**, permit Actions and allow the workflow to write repository contents if your account policies require it.
3. Open **Actions → Collect and publish → Run workflow**. Wait for both build and deploy to succeed, then open the Pages URL shown in the deployment job. The URL is normally `https://OWNER.github.io/REPOSITORY/`; the workflow uses relative paths so a project subdirectory works.
4. Daily collection is scheduled for 03:00 UTC (08:30 Sri Lanka time), subject to GitHub scheduling delays and service availability. Scheduled workflows can be disabled after inactivity; check Actions regularly. Pushes to `main` also deploy but do not automatically collect; manual and scheduled runs collect first.
5. If collection fails, the workflow preserves downloaded raw snapshots and diagnostic information, deploys whatever was already validated, and ends with a failed reporting job. Inspect `archive/api-last-run.json`, `archive/backfill-last-run.json` and the Actions logs. Repository branch protection, Pages settings, permissions, limits, GitHub service changes, or source changes may require adjustments.

**Public visibility:** source code and files committed to a public repository, including archived raw source data, are public. The Pages artifact contains the app and normalized data, not the raw archive. Verify PUCSL/CEB reuse and redistribution terms for your intended use; no public reuse license was established in this research. A Git repository is not a guarantee of permanent preservation: make independent backups and monitor storage and retention limits.

## Run and test locally

Requires Python 3.10+ and Node only for the optional JS syntax check. From this directory:

```sh
python -m pip install -r requirements.txt
python -m http.server 8000
# Visit http://localhost:8000/
python -m unittest discover -s tests -v
node --check app.js
node --test tests/test_charts.js tests/test_exports.js
```

Do not open `index.html` directly with `file://`: browsers restrict data loading and service workers. No external chart library, API credential or build process is required for the app.

## Collection and historical backfill

`python scripts/collect_recent.py` checks for missing dates in the most recent seven Sri Lanka calendar days, then tries up to three seven-day batches for older gaps within the past 365 days. The older batches rotate so that a persistent gap does not block all other months. When the source is unavailable, the job stops making further requests and retries on a later run. The portal may be delayed, changed, unavailable, or protected in future. For a manual historical backfill, for example:

```sh
python scripts/portal.py --date 2026-11-20 --date 2026-11-21
python scripts/backfill.py --start 2025-11-26 --end 2026-11-25 --workers 1 --stop-on-network-error
python scripts/ingest.py --local archive/raw/15-Minutes-Report-Mar-2025-_web-upload-2.xlsx
# Optional: discover monthly XLSX links currently listed by PUCSL. This can download many files.
python scripts/ingest.py --discover
```

Portal collection stores the exact response and contemporaneous metadata as content-addressed gzip files, with SHA-256 hashes. Batch responses may contain multiple days; filter by the Sri Lanka reporting day before checking a specific normalized file. Each day then undergoes checks for 96 expected timestamps, duplicate plant/time pairs, numeric ranges, metadata classifications and completeness per observed plant. It rejects unknown categories and incomplete data instead of filling gaps with zeros. It does **not** establish whether a plant entirely absent from a response should have been present; such omissions can make a complete-looking day incomplete. The portal supplies no separate independently verified day-total check in this pipeline. The app total is the sum of the returned series; storage is signed. Metadata changes, historical corrections and source revisions can cause conflicting dates: the raw revision is retained, but an existing normalized day is not silently overwritten. Review source, metadata and logs manually before deliberately reconciling a correction. Existing dates are skipped by scheduled collection, so it does not automatically detect later corrections. Collection completeness depends on the source being available; the calendar shows the number of archived days in the past 365 days. No guarantee of automatic retrieval for future schema changes is implied.

The workbook importer expects a specific published layout and rejects other layouts, missing numbers, non-96 time labels, mismatched sheet/printed dates and group totals that differ by more than 5 MW from the reported total. Inspect `archive/last-run.json` for rejected sheets. The March 2025 workbook has a printed 18 March date on all 18 dated sheets; 17 sheets conflict with their tab names and are quarantined. Only 18 March is initially accepted. This conservative rule may exclude valid data; do not infer the other dates without further corroboration. The 2025 workbook and portal may differ in coverage and estimates; do not assume their source groups are fully comparable.

Timestamps in API records use UTC. The March 2025 portal observation at `2025-03-17T18:45:00Z` agrees with the 18 March workbook's 00:15 values for several plants, supporting conversion to UTC+05:30. We interpret 00:15–next 00:00 as interval-ending labels for the purpose of fixed day/night windows, but the source's interval-average versus instantaneous measurement meaning is not established. The app reports mean MW and summed-observation shares; it does not claim exact MWh. Midnight is associated with the preceding day by this convention.

The solar investigation shows the reported 10:00–16:00 minimum and maximum. It is a screening context, not a curtailment estimate. Establishing curtailed energy requires generation availability, irradiance and operator evidence. Source mix shares divide each source's sum of observations by the signed sum of all reported sources. These are **observation shares**, not verified energy shares. Negative storage contributions can produce negative shares. Data completeness, telemetry and estimated rooftop or embedded generation affect interpretation. Day is 06:00–18:00 and night is 18:00–06:00 local time, not actual sunrise/sunset.

The event screen flags consecutive observations from a reported plant or aggregate when the decrease is both at least 100 MW and at least 30% of the preceding positive value. It shows the largest five. Changes are candidates for investigation, not verified incidents; planned operation, storage charging, weather, data corrections and aggregation can produce them. It cannot detect changes between samples or establish causes.

## CSV import

CSV stays in browser memory and disappears on reload. It is never sent to the server. Use UTF-8 and columns `timestamp,source,category,mw`. Supply exactly 96 unique quarter-hour labels per source: `YYYY-MM-DDT00:15` through `YYYY-MM-DDT23:45`, then the following date `T00:00`; optional seconds `:00` and optional `+05:30` are accepted. All sources must use the same grid, with consistent category names and numeric MW. Use category `Major hydro` for the hydro metrics and `Solar` for the solar indicator. Example of the first and last lines only (a real import needs all 96):

```csv
timestamp,source,category,mw
2025-03-18T00:15,Example plant,Major hydro,10
2025-03-19T00:00,Example plant,Major hydro,12
```

These two example values illustrate format only and are not included as measurements. Validate the origin, units and semantics of any imported CSV independently.

## Sources checked on 27 November 2026

- [PUCSL generation information](https://www.pucsl.gov.lk/daily-generation-reports-2/) lists monthly 15-minute workbooks through March 2025 on the inspected page. The actual March file was downloadable. The linked “latest reports” SharePoint route redirected to Microsoft sign-in in our check; access can differ by user and time.
- [PUCSL electricity dispatch portal](https://gendata.pucsl.gov.lk/home) and its public `api/actual-system-dispatch` and `api/metadata/power-plants` endpoints responded during this check, including 15-minute data for 25 November 2026. They are not guaranteed stable public APIs; no service-level agreement or reuse license was verified.
- [CEB's daily generation page](https://ceb.lk/?page_id=407) describes daily net generation and says some solar and mini-hydro figures are estimated. It is not a verified downloadable 15-minute CEB archive in this project. The rendered report values did not load in the research fetch.
- PUCSL's [generation data page](https://www.pucsl.gov.lk/generation-data/) links its dashboards and archives. Public availability does not establish reuse rights or completeness.

On the 27 November check, the portal returned null values for all requested observations for 26 November, so that date was rejected and its raw response kept for diagnosis. This could reflect reporting delay or another source issue; no cause was established.
