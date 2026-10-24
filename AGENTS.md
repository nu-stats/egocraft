# EgoCraft contributor and agent rules

These rules bind every contributor, human or AI. Read this file, then
`plan/STATUS.md` and `ROADMAP.md`, before you change anything.

## 1. Clean-room rules

EgoCraft rebuilds what personal-network software does, from published
methods and public descriptions. How any existing program is built is never
looked at.

**Allowed**

- Published methods papers and textbooks: Burt (1992) for effective size,
  efficiency, constraint and hierarchy; Borgatti (1997); Everett and
  Borgatti (2005) for ego betweenness; Freeman (1977) and Brandes (2001) for
  betweenness; Krackhardt and Stern (1988) for the E-I index; Blau (1977)
  and Agresti and Agresti (1978) for diversity; Perry, Pescosolido and
  Borgatti (2018) for the field.
- Public help pages, tutorials, documentation and papers that describe what
  programs such as Network Canvas, EgoNet, E-Net, VennMaker, egor, UCINET or
  ORA do.
- Published file-format descriptions (Stata .dta, SPSS .sav, Excel .xlsx,
  GraphML).
- Running another program normally, as a user would, on made-up data, and
  comparing its numbers with EgoCraft's (as `docs/validation.md` does with
  networkx and Stata).

**Forbidden**

- Reading, copying or translating the source code of other ego-network
  programs: Network Canvas (GPL), EgoNet (GPL), egor and egonet (R, GPL
  family), E-Net, VennMaker, UCINET, ORA. Libraries used only as black boxes
  for checking (networkx, igraph) are run, not read for code.
- Decompiling or inspecting other programs' files, libraries or memory.
- Copying another program's interface closely, or its icons, artwork, help
  text or wording beyond common feature and measure names.
- Using another product's name in EgoCraft's name, window titles or file
  names.
- Committing real participant data, or files another program produced from
  real data. Tests and examples use made-up data written for EgoCraft
  (`app/src/sample/sample.ts`, CC0).

## 2. Never lose data

- Nothing changes a study in place. Every fix returns a new study and
  records itself in `study.history`, so the import report and the recipe
  say exactly what was done.
- Bad input gives a clear message, never a crash or a half-changed study.
- Identifiers are compared as text. Leading zeros are never removed; the
  checks offer to put lost ones back.
- Nothing is sent off the computer: no telemetry, no remote fonts or
  scripts, no map tiles, no AI calls. The server listens on 127.0.0.1 only
  and only serves the built app.
- Every data-loss or crash fix comes with a test.

## 3. Layout

```
egocraft/             Pinokio launcher (install, start, update, reset), docs
└── app/              The app (self-contained npm project)
    ├── src/core      Tables, the study and its mapping, XML
    ├── src/io        Reading and writing CSV, Excel, Stata, SPSS, R files
    ├── src/import    Column guessing, ID checks with fixes, other layouts
    ├── src/network   Per-ego networks, subgroups (slices), layouts, sociograms
    ├── src/measures  Structural and composition measures, codebook
    ├── src/reshape   Long, wide and pairs forms
    ├── src/export    Results files, recipe, Stata do-file, R script, ZIP
    ├── src/sample    The made-up sample study (CC0)
    ├── src/ui        React interface
    └── server        Local static server (Node, no packages)
```

- Nothing outside `src/ui` may import React or touch the DOM. The engine
  runs in Node, in the browser and in a worker.
- TypeScript runs directly in Node 24 (type stripping): no `enum`,
  `namespace` or constructor parameter properties; write `import type` for
  types. `npm run typecheck` enforces this.
- Keep native-code dependencies out (Windows Smart App Control blocks
  unsigned native binaries on some machines).
- `src/io/statRead.js` and `statFiles.js` come from Husky Eye View and
  `src/io/table.ts`, `src/core/xml.ts` from QualCraft (same owner, MIT /
  Apache-2.0). Fix bugs there in both places.

## 4. Measures

- Each measure's formula is written out in a comment with its source, and
  in `MEASURE_INFO` in plain words for the codebook.
- A new measure needs a hand-worked test (`structure.test.ts`) and, where an
  independent implementation exists, a comparison recorded in
  `docs/validation.md`.
- Column names are Stata-safe (letters, digits, underscore, 32 characters)
  and labels are 80 characters at most.

## 5. Platforms

Windows, macOS and Linux (Node 24 and a current browser), and the web build
(any static host). Use `node:path` for paths. Do not assume a line ending or
a case-insensitive file system.

## 6. Quality gates and workflow

- Run `npm run ci` in `app` before every commit: type check, tests, build.
- New behavior comes with tests. Tests build their data in code or use the
  sample study.
- One task id per commit where there is one, for example `P4.5: shared
  layouts across waves`.
- Update `plan/STATUS.md` when a task finishes.
- Write American English and plain words. Explain any technical term the
  first time it appears on a screen.
