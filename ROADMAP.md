# Roadmap

Each phase ends when its features work end to end and are covered by
tests, and when its measures match hand-worked examples and an independent
program's output on made-up data. Task ids (`P1.2` and so on) go in commit
messages. The current state is in `plan/STATUS.md`.

## Phase 0: Setup

- P0.1 Repository (private, `nu-stats/egocraft`), engine and interface as
  separate packages, lints, formatting.
- P0.2 Contributor rules (`AGENTS.md`, `CLAUDE.md`), licence, notices,
  clean-room rules written down.
- P0.3 One check command: types, lint, unit tests, measure tests, readers.
- P0.4 Made-up sample studies (CC0): 200 egos in two waves, three tie
  types, missing data on purpose, place codes for maps.
- P0.5 Pinokio launcher (`install.js`, `start.js`, `update.js`,
  `reset.js`, `pinokio.js`), fixed local port, README.
- P0.6 CI on Windows, macOS and Linux.

## Phase 1: Import and checks

- P1.1 Readers: CSV/TSV, Excel `.xlsx`/`.xls`, Stata `.dta`, SPSS `.sav`,
  R `.rds`; variable and value labels kept.
- P1.2 Layouts:
  - three files (egos, alters, alter ties);
  - two files (egos with alters; ties inside the alter file as
    `knows_1 … knows_n` columns);
  - one wide file (one row per ego: `alter1_age … alter5_age`, tie columns
    like `tie_1_2`), as Qualtrics, REDCap and the GSS produce;
  - other programs' exports: Network Canvas CSV and GraphML, EgoNet,
    EgoWeb 2.0, openeddi, E-Net's layout.
- P1.3 Column mapping: a screen that guesses which column is `ego_id`,
  `alter_id`, the alter pair, tie type and wave (by name and content), and
  lets you change each guess; mappings saved and reusable.
- P1.4 ID and link checks, each with a plain explanation and a fix:
  - duplicate ego IDs; alters whose `ego_id` has no ego; egos with no
    alters (named nobody, or skipped?);
  - duplicate alter IDs within an ego; tie rows that point to a missing
    alter or to an alter of another ego; self-ties; the same pair twice;
    A–B and B–A disagreeing;
  - tie-type and code values not in the codebook; IDs read as numbers that
    lost leading zeros (`007` → `7`).
- P1.5 Import report: what was read, what changed type, what was fixed
  and how, saved with the project.
- P1.6 Pseudonyms on import: replace names with codes (`A01`, `A02`), keep
  the name key in a separate, encrypted file, or drop it.
- P1.7 Project file: one file holding data, mappings, choices and history.

Done means: every sample layout imports to the same three tables, and every
check fires on a test file built to trip it.

## Phase 2: Merge and reshape

- P2.1 Long form: one row per alter with the ego's variables attached.
- P2.2 Wide form: one row per ego with alter variables spread out
  (`alter1_age …`), with a chosen alter order.
- P2.3 Per-ego networks: each ego's alters and ties as a small graph
  (ego included or left out), for measures and pictures.
- P2.4 Dyad form: one row per ego–alter pair or per alter–alter pair, for
  models.
- P2.5 Merge outside data: join extra ego variables (from the full survey)
  or alter variables by ID, with the same checks as P1.4.
- P2.6 Export any form to CSV, Excel, `.dta` and `.sav`, labels kept.

## Phase 3: Measures

Every measure is computed on a chosen **slice**: one tie type or several,
a subgroup of alters (for example kin only, or alters 65 and older), a
tie-strength cutoff, and ego included or left out. You pick the variables;
EgoCraft names the columns (`density_kin`, `blau_race_all`) Stata-safely and
explains each in a codebook.

- P3.1 Size: number of alters, overall and per slice.
- P3.2 Density: alter–alter ties present divided by pairs possible;
  weighted density for valued ties.
- P3.3 Degree: each alter's ties to other alters; mean and largest degree
  per ego.
- P3.4 Betweenness: ego betweenness (how much the ego sits between alters
  who do not know each other) and alter betweenness.
- P3.5 Structural holes (Burt): effective size, efficiency, constraint and
  hierarchy, binary and weighted.
- P3.6 Components and isolates: number of separate groups of alters (ego
  left out), share in the largest group, alters tied to no other alter.
- P3.7 Composition: share, mean, median, spread of any alter variable
  (share women, mean age, share who smoke).
- P3.8 Diversity: number of categories, Blau's index (chance two alters
  differ), IQV (Blau scaled 0–1), Shannon entropy.
- P3.9 Ego–alter similarity: E-I index (ties outside minus inside the
  ego's group, over all ties), share same as ego, mean absolute
  difference for numeric variables, Yule's Q.
- P3.10 Tie strength and duration: mean, spread, share strong ties, mean
  and median years known, contact frequency.
- P3.11 Alter-level results too (an alter's degree, betweenness), for
  multilevel models.
- P3.12 Measure tests: hand-worked small networks with known answers, and
  comparisons with egor run separately on the sample studies.

## Phase 4: Sociograms

- P4.1 One ego's network: force-directed, circle, concentric rings (by
  closeness, as VennMaker and Network Canvas collect them) and sectors (by
  group) layouts; ego shown or hidden.
- P4.2 Node size, color and shape by any variable; line width by tie
  strength; line style or color by tie type; filter by tie type or subgroup
  (the same slices as Phase 3).
- P4.3 Labels: codes, names (only if kept) or none.
- P4.4 Side by side: a grid of egos, sorted or grouped by a variable
  (for example, the 12 egos with the highest constraint).
- P4.5 Fixed layout across waves and tie types, so change is visible.
- P4.6 Colorblind-safe palettes and an automatic legend.
- P4.7 Export SVG, PNG (300–600 dpi) and PDF; the grid as one figure.
- P4.8 Drag nodes by hand, then lock the layout.

## Phase 5: Results file, code record and reports

- P5.1 **One row per ego**: `ego_id`, `wave` and every chosen measure, ready
  to merge back into the survey data. CSV, Excel, `.dta` and `.sav`.
- P5.2 Codebook: each column's measure, slice, formula in words, and
  citation.
- P5.3 **The code that produced it**:
  - an EgoCraft recipe (every import, check fix, slice and measure, in
    order), which reruns the whole analysis on updated data;
  - a Stata do-file that loads the results, merges them into the survey
    file by `ego_id` and labels them, and recomputes size and composition
    measures in plain Stata as a cross-check;
  - an R script that recomputes the measures with igraph and egor as an
    independent check.
- P5.4 Missing-data report per measure (see Phase 9; basic version here).
- P5.5 Tables: descriptive table of measures (mean, SD, range, N), by
  group if chosen; export to Word, Excel, HTML and LaTeX, in APA style.
- P5.6 Methods paragraph: a short draft describing the name generators,
  measures and missing-data rules, with citations, to edit for a paper.

Done means: the sample study goes from raw files to a merged `.dta`,
three figures and a Word table, and the do-file and R script give the same
numbers.

## Phase 6: Data collection

Built-in interviewing, so a study can start in EgoCraft. Designed from
published descriptions of these methods, not from other programs' code.

- P6.1 Protocol designer: order of screens, consent text, question wording,
  limits (most alters, most pairs to ask).
- P6.2 Name generators: type names into a growing list; several generators
  that add to one list (with "already named" shown); pick from a roster
  (for example, last wave's alters).
- P6.3 Name interpreters: a form per alter; drag alters into bins
  (categories) or onto a scale (ordinal); one question across all alters
  at once.
- P6.4 Alter–alter ties without 435 questions: drag one alter onto
  another to draw a tie; "who knows whom" grouping (drag alters into
  piles); a tie-type picker for multilayer ties.
- P6.5 Closeness circles: drag alters onto concentric rings.
- P6.6 Interviewer mode and self-completion mode, on a laptop or tablet
  browser, working offline; answers saved after every screen.
- P6.7 Saved straight into the three tables, with the protocol stored so
  the codebook writes itself.
- P6.8 Encrypted local storage on the collecting device; transfer by file,
  not by a server.

## Phase 7: Waves

- P7.1 Several waves in one project; egos matched by `ego_id`.
- P7.2 Matching the same alter across waves: suggested matches (same name
  code, similar attributes), confirmed by the user; in collection, last
  wave's roster offered first.
- P7.3 Change measures per ego: alters kept, dropped and added; turnover
  (share of alters replaced); Jaccard similarity of the alter sets; ties
  kept, lost and new (tie churn); change in each Phase 3 measure.
- P7.4 Long ego-by-wave file and wide file (`density_w1`, `density_w2`).
- P7.5 Sociograms across waves with a fixed layout; dropped alters faded,
  new alters marked.

## Phase 8: Multilayer ties

- P8.1 Tie types as layers throughout: ego–alter and alter–alter, each
  layer directed or not, weighted or not.
- P8.2 Multiplexity: number of tie types per alter; share of alters with
  more than one type; overlap between two layers (do advice givers also
  give money?).
- P8.3 Measures on any combination of layers (union, intersection).
- P8.4 Sociograms with layers as line colors or as separate panels.

## Phase 9: Missing data

- P9.1 Kinds of missing, kept apart: alter variable not answered, alter
  pair not asked (over the limit), "don't know", ego named nobody, ego
  skipped the module.
- P9.2 Rules per measure, chosen and recorded: use observed pairs only;
  treat not-asked pairs as no tie (flagged); leave the measure missing
  above a cutoff; report the lowest and highest possible density.
- P9.3 Report: per ego and overall, how much each measure rests on missing
  information; in the codebook and the methods paragraph.
- P9.4 Sensitivity table: key results under each rule side by side.

## Phase 10: Links to the other apps

- P10.1 **StatCraft**: "Open in StatCraft" writes the `.dta` and do-file
  from Phase 5 and opens them; StatCraft reads them with labels intact.
- P10.2 **QualCraft**: link interview material to alters. A QualCraft case
  can be an ego; a passage or code can be attached to an alter ("talks
  about her sister as her main support"); code counts become alter
  variables; sociograms can color alters by a QualCraft code; clicking an
  alter opens its passages in QualCraft.
- P10.3 **Husky Eye View**: map geocoded alters. Alter places as
  latitude/longitude, census tract GEOID or address (geocoding off by
  default, opt in per project, with the addresses shown before sending,
  as QualCraft P2.5). Geographic measures: mean ego–alter distance, share
  of alters in the same tract or county, number of counties reached. A
  GeoJSON of egos, alters and ego–alter lines for HEV's My Files layer,
  and tract counts for HEV's Merge & Export.

## Phase 11: Models

- P11.1 Alters nested in egos: multilevel models of alter outcomes
  (is this alter a source of support?) with ego and alter predictors;
  first as files ready for StatCraft, Stata and R, then built in.
- P11.2 Ego-level regression of measures on survey variables, with survey
  weights.
- P11.3 Pointers to ergm.ego-style models for ego-sampled data.

## Phase 12: Release

- P12.1 Installers for Windows, macOS and Linux, signed; web build.
- P12.2 Illustrated guide (PDF) and a 90-second highlight video made with
  the same headless screencast pipeline as Husky Merge and HEV.
- P12.3 Example studies that may be redistributed (made-up CC0 studies;
  public data such as GSS network modules only after checking their terms).
- P12.4 Citation file and DOI (Zenodo), as for HEV.

## Later

- Online survey export (Qualtrics/REDCap question blocks generated from a
  protocol).
- Team collection: merging projects from several interviewers.
- Survey weights in every table.
- Translations of the interviewing screens.


