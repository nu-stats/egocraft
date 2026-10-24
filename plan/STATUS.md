# Status

Updated 2026-10-24. Task ids are those in `ROADMAP.md`.

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

## Phase 1: Import and checks — mostly done

- P1.1 Readers: CSV/TSV, Excel .xlsx, Stata .dta, SPSS .sav/.zsav, R
  .rds/.RData, with labels and value labels. Not yet: .xls (asks the user
  to save as .xlsx).
- P1.2 Layouts: three files, two files (knows_1 … columns), one wide file
  (alter1_x / x_1 and tie_i_j columns). The column guesses know the ID
  column names Network Canvas exports use, but no real Network Canvas export
  has been tried yet. Not yet: dedicated
  readers for EgoNet, EgoWeb 2.0, openeddi, E-Net layouts and GraphML.
- P1.3 Column mapping with guesses from names and contents. Saved mappings
  for reuse: not yet (the recipe stores them).
- P1.4 ID and link checks with fixes: done (missing IDs, duplicate egos,
  alters of missing egos, lost leading zeros, duplicate alters, egos with no
  alters, tie rows with missing or unknown IDs, self-ties, repeated pairs
  with disagreeing strengths, ties without a type).
- P1.5 Import report: the Checks step lists every step and saves it as text.
- P1.6 Pseudonyms on import: not yet.
- P1.7 Project file (.egocraft) and browser autosave: done.

## Phase 2: Merge and reshape — done

- P2.1–P2.4 Long, wide, per-ego networks, pairs form.
- P2.5 Merging outside data into the ego or alter file: not yet.
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

## Phase 4: Sociograms — core done

- P4.1 Spring, circle, rings and sectors layouts; ego shown or hidden.
- P4.2 Color and size by any alter variable, line width by strength, line
  color and dash by tie type, filters by subgroup.
- P4.3 Labels: alter ID, any variable, or none.
- P4.4 Side by side: a grid sorted by size, density, effective size,
  constraint or an ego variable.
- P4.5 Shared layout across waves, new alters marked.
- P4.6 Colorblind-safe palette and legend. P4.7 SVG and PNG (3×); PDF not
  yet. P4.8 Dragging nodes: not yet.

## Phase 5: Results — partly done

- P5.1 One row per ego (and wave): CSV, Excel, .dta, .sav. P5.2 Codebook.
- P5.3 Recipe (JSON, not yet replayable from the interface), Stata do-file
  (merge + cross-check, passed in Stata 19), R script (igraph cross-check,
  passed in R 4.4.3 with igraph 2.3.4).
- P5.4 Missing-pair rule and note; per-measure missing report: not yet.
- P5.5 Descriptive table (CSV, Excel, Stata, SPSS); Word, LaTeX and APA
  layout: not yet. P5.6 Methods paragraph: not yet.

## Phases 6–12

Not started.
