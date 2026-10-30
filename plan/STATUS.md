# Status

Updated 2026-10-29 (version 0.4.0). Task ids are those in `ROADMAP.md`.

## Phase 0: Setup — done

- P0.1 Repository `nu-stats/egocraft` (private), engine and interface in one
  npm project (`app/`), kept apart by the layout rules in `AGENTS.md`.
- P0.2 `AGENTS.md`, `CLAUDE.md`, licenses, `NOTICE`, `ATTRIBUTION.md`.
- P0.3 `npm run ci`: type check, tests, build.
- P0.4 Made-up sample study (`app/src/sample/sample.ts`, CC0): 200 egos in
  two waves, four relationship types, three alter–alter tie types, pairs not
  asked beyond the tenth alter, a few missing answers, made-up tract codes.
  Written to `examples/` by `node scripts/write-examples.ts`.
- P0.5 Pinokio launcher, local server on 127.0.0.1, README.
- P0.6 CI on Windows, macOS and Linux (`.github/workflows/ci.yml`).

## Phase 1: Import and checks — done

- P1.1 Readers: CSV/TSV, Excel .xlsx and .xls (Excel 97–2003, from the
  published [MS-CFB]/[MS-XLS] descriptions; tested on a file saved by Excel
  16), Stata .dta, SPSS .sav/.zsav, R .rds/.RData, with labels and value
  labels.
- P1.2 Layouts: three files, two files (knows_1 … columns), one wide file
  (alter1_x / x_1 and tie_i_j or knows1-2 columns), and From another
  program: GraphML (one graph per ego; an ego node taken out), Network
  Canvas CSV export and GraphML (nc: graph attributes), EgoWeb 2.0
  ego-alter and alter-pair files, EgoNet (the layout egor documents; EgoNet's
  own export is undocumented), E-Net's row-wise file (its column-wise layout
  is the wide file). Written from documentation only; tested on made-up files
  in the documented layouts. Not yet tried on real exports from those
  programs; openeddi not done. A "codes that mean missing" box works with
  every format.
- P1.3 Column mapping with guesses from names and contents. Saved choices
  for reuse (Columns ▸ Save these choices / Use saved choices; a recipe file
  works too).
- P1.4 ID and link checks with fixes: done (missing IDs, duplicate egos,
  alters of missing egos, lost leading zeros, duplicate alters, egos with no
  alters, tie rows with missing or unknown IDs, self-ties, repeated pairs
  with disagreeing strengths, ties without a type).
- P1.5 Import report: the Checks step lists every step and saves it as text.
- P1.6 Pseudonyms: done (Checks step). Word alter IDs and name-like
  columns are found; values become A01, A02 … within each ego (the same in
  every wave, ties changed to match) or R001 … for egos; the key is saved
  encrypted with a passphrase (AES-256-GCM, PBKDF2-SHA-256) or not kept;
  any text column can be removed.
- P1.7 Project file (.egocraft) and browser autosave: done.

## Phase 2: Merge and reshape — done

- P2.1–P2.4 Long, wide, per-ego networks, pairs form.
- P2.5 Merging outside data into the ego or alter file: done (Data step),
  matched on suggested ID columns, with a preview and a stop on IDs used
  twice in the outside file.
- P2.6 Export of every form to CSV, Excel, .dta and .sav: done.

## Phase 3: Measures — done

- P3.1–P3.11 All measures in the roadmap, each on any subgroup (slice):
  size, ties, density (binary and weighted), degree, ego betweenness, alter
  betweenness, effective size, efficiency, constraint, hierarchy,
  components, largest group, isolates, pairs not known, composition (mean,
  SD, median, min, max, share, count, share at least), diversity (categories,
  Blau, IQV, entropy), ego–alter similarity (E-I, share same, mean absolute
  difference), alter–alter Yule's Q. Alter-level results (P3.11): not yet
  exported separately.
- P3.12 Checked by hand, against networkx, in Stata and with igraph in R
  (`docs/validation.md`). Against egor: not yet.

## Phase 4: Sociograms — done

- P4.1 Spring, circle, rings and sectors layouts; ego shown or hidden.
- P4.2 Color and size by any alter variable, line width by strength, line
  color and dash by tie type, filters by subgroup.
- P4.3 Labels: alter ID, any variable, or none.
- P4.4 Side by side: a grid sorted by size, density, effective size,
  constraint or an ego variable.
- P4.5 Shared layout across waves, new alters marked.
- P4.6 Colorblind-safe palette and legend.
- P4.7 SVG, PNG (3×) and vector PDF (one page; grids on one page).
- P4.8 Drag alters into place (mouse or touch); hand placements kept per ego
  for every wave and saved in the study file, with an undo.

## Phase 5: Results — done

- P5.1 One row per ego (and wave): CSV, Excel, .dta, .sav. P5.2 Codebook.
- P5.3 Recipe (JSON, rerun from Study ▸ Rerun a recipe, which lists any
  step it could not apply), Stata do-file
  (merge + cross-check, passed in Stata 19), R script (igraph cross-check,
  passed in R 4.4.3 with igraph 2.3.4).
- P5.4 Missing-pair rule, and a report per measure: egos with a value, why
  the others have none, mean share of pairs not known and of answers
  missing.
- P5.5 Descriptive table in APA style, overall or split by an ego variable:
  Word (.docx, checked in Word), LaTeX (booktabs), HTML, and as data.
- P5.6 Draft methods section with an APA reference list (Results step and
  the ZIP).
- Alter results (each alter's degree, betweenness, isolate, group size and
  share of constraint): Data step and `egocraft_alter_measures.csv`.

## Phase 6: Data collection — done

- P6.1 Questionnaire designer (Interviews step): screens in order, wording,
  consent text, questions and answer choices, limits (most people in all, per
  name generator); checks before use; a ready-made example; try it without
  saving; save and open as a file. Skip logic: a screen or question shown
  only when earlier answers meet conditions (the respondent's answers, the
  same person's answers, or how many were named; is, is not, is one of,
  number compares, answered); in the study each conditional variable gets
  <name>_asked (1 asked, 0 skipped), so not asked stays apart from no answer.
- P6.2 Name generators: a growing list typed in; one person named on several
  generators is kept once (gen_<id> = 1 for each); last wave's names offered.
- P6.3 Name interpreters: questions about each person; sorting into boxes;
  a scale.
- P6.4 Who knows whom by drawing (drag one person onto another, or tap two)
  or by piles; completed tie screens give every pair 1 or 0, unreached ones
  leave pairs unknown.
- P6.5 Closeness circles (2–6 rings).
- P6.6 Interviewer and self-completion modes, touch first (iPad), working
  offline; every answer saved at once.
- P6.7 Interviews into the three tables with labels from the wording, the
  mapping filled in; names left out unless asked for; the questionnaire goes
  into the results ZIP as text and as a file.
- P6.8 Interviews kept only encrypted on the device (AES-256-GCM, PBKDF2,
  passphrase never stored); carried by encrypted file; files from several
  devices put together, each interview counted once. Back-up reminder: the
  number of interviews not yet saved to an encrypted file and the time of the
  last back-up, shown before and after unlocking, and a prompt after each
  finished interview. Passphrases are typed in the page (no browser
  prompts); a back-up file is saved by a tap, as iOS needs.
- Checked end to end in the browser at iPad size (768 × 1024): consent,
  questions, two generators, boxes by tap and by drag, closeness, ties by tap
  and by drag, end; then the study passed the checks and the measures matched
  a hand count.
- Piles screen checked by touch at 1024 × 768 (2026-10-25): tapping a
  person now picks them (the tap used to reach the pile too), and each
  who-knows-whom screen keeps its own tie type, so piles no longer replace
  drawn ties. A WebKit (Safari engine) run at iPad size passed; closeness
  circles now fit a landscape screen.
- Not yet: tried on a real iPad (the web address is ready, see README);
  translations.

## iPad and offline — done

- The built app stores itself on first visit (service worker) and opens with
  no network (tested by stopping the server and reloading); manifest and Home
  Screen icons; touch-sized controls; storage kept where the browser allows,
  and a reminder to save the study as a file.
- Web address for iPads: https://nu-stats.github.io/egocraft-app/ (public
  repo nu-stats/egocraft-app, built files only, GitHub Pages), published
  2026-10-25 with `npm run publish-web`.

## Phase 7: Waves — done

- P7.1–P7.2 Alters matched across waves by alter ID, by name or code, or by
  agreeing answers (a suggestion); every ego's matches shown and editable.
- P7.3 Per ego and pair of waves: alters kept, lost, added, Jaccard overlap,
  ties kept, lost and new among kept alters, tie churn, change in every
  measure (`egocraft_change.csv`).
- P7.4 Measures wide by wave (`egocraft_measures_by_wave.csv`).
- P7.5 Sociograms across waves in one layout (Phase 4).

## Phase 8: Multilayer ties — done

- P8.1–P8.3 Subgroups of several tie types with any/all; multiplexity
  (mean kinds per alter, share tied more than one way) from yes/no alter
  columns; overlap of two ego–alter kinds and of two alter–alter tie types.
- P8.4 Sociograms with a separate panel for each tie type.

## Phase 9: Missing data — done

- P9.1 Kinds of missing kept apart (Results ▸ Missing information).
- P9.2 Rule for unknown pairs (not tied / left out) and a cutoff on the
  share of unknown pairs, recorded in the methods draft.
- P9.3 Report per measure. P9.4 Sensitivity table: each measure under each
  rule (`egocraft_sensitivity.csv`).

## Phase 10: Links to the other apps — done

- P10.1 StatCraft: `.dta` files and the check do-file in one ZIP; ran in
  StatCraft and Stata 19.
- P10.2 QualCraft: alters or egos as cases (`ego:alter`), QualCraft code
  matrices back as alter variables.
- P10.3 Husky Eye View: GeoJSON of egos, alters and ego–alter lines; counts
  by tract, county or state. Distance, same-area and areas-reached
  measures.

## Phase 11: Models — done

- P11.1 Alters nested in egos (each alter's answers and position, the ego's
  answers and measures): linear or logistic, standard errors clustered by
  ego; Stata (`mixed`, `melogit`) and R (`lmer`, `glmer`, ML) code for the
  full multilevel model.
- P11.2 One row per ego: robust or ordinary standard errors, weights.
  Survey designs (strata, PSUs) are not handled in the app; the code can be
  edited for `svy`.
- P11.3 ergm.ego starting point (R, egor and ergm.ego).
- Checked against Stata 19 to six decimals (regress, logit, clusters,
  robust, pweights); the lme4 code matched `mixed`. See docs/validation.md.

## Phase 12: Release — partly done

- P12.2 Illustrated guide (24-page PDF) made 2026-10-25 with the headless
  screenshot pipeline (kept with the media, not in the repository); the
  2-minute highlight video was made earlier.
- P12.3 Example study marked CC0 (`examples/README.md`); public data sets
  not included.
- P12.4 `CITATION.cff` added; DOI waits for a public release.
- P12.1 Web build: published at https://nu-stats.github.io/egocraft-app/
  (2026-10-25). Not done: signed installers (wait on the code-signing
  accounts).
