# EgoCraft

EgoCraft is a clean-room app for egocentric network analysis. An
egocentric network is one person (the **ego**), the people they name (the
**alters**), and which of those people know each other (**alter–alter
ties**). EgoCraft takes you from the interview, or the survey files, to the
published table:

0. **Interviews** (optional): collect the data in EgoCraft itself, on a
   laptop or an iPad, with or without a network. Design the questionnaire
   (name generators, questions about each person, boxes and scales,
   closeness circles, who knows whom, and skip logic), then run interviews
   by touch, asked by an interviewer or filled in by the respondent.
   Interviews are kept encrypted on the device, with a reminder to back them
   up, carried to the analysis computer in an encrypted file, and turned into
   a study in one step.
1. **Import** the ego, alter and tie files (CSV, Excel .xlsx or .xls, Stata,
   SPSS or R), in three files, two files, or one wide survey file, or the
   export files of Network Canvas, EgoWeb 2.0, EgoNet, E-Net or GraphML.
2. **Columns**: EgoCraft guesses which column is the ego ID, the alter ID,
   the wave and so on; you check them.
3. **Checks**: duplicate IDs, alters whose ego is missing, lost leading zeros,
   ties to alters nobody named, pairs entered twice. Each problem comes with
   a plain explanation and a one-click fix, and every fix goes in the import
   report. Names can be replaced with codes (A01, A02 …), with the name key
   kept in a separate file locked with a passphrase, or not kept at all.
4. **Data**: the files merged into long (one row per alter), wide (one row
   per ego) and pairs (one row per pair of alters) forms, ready for Stata,
   SPSS, R or Excel. Variables from another file (the rest of your survey)
   can be added to the ego or alter file, matched on IDs.
5. **Sociograms**: one ego, one ego across waves in the same layout, or a
   grid of egos side by side; alters colored and sized by any variable, line
   width by tie strength, line style by tie type; drag alters into place;
   saved as SVG, PNG or vector PDF.
6. **Measures** you choose, for the whole network or any **subgroup** (kin
   only, one tie type, alters 65 and older, strong ties only): size, density,
   degree, ego and alter betweenness, effective size, efficiency, constraint,
   hierarchy, components, isolates, composition (mean, share …), diversity
   (Blau, IQV, entropy), ego–alter similarity (E-I index) and alter–alter
   homophily (Yule's Q).
7. **Results**: one row per ego (and wave) to merge back into your survey
   data, with a codebook, an APA-style descriptive table for Word or LaTeX, a
   draft methods section with references, a report of how much each measure
   rests on missing answers, a Stata do-file that merges the results and
   recomputes them as a check, an R script that recomputes them with igraph,
   and a recipe of every step. Also on the Results step:
   - **Change between waves**: alters kept, lost and added for each ego,
     their overlap, ties kept and lost, and the change in every measure,
     with alters matched by ID, by name or code, or by agreeing answers
     (checked by hand).
   - **Models**: linear and logistic regression, for alters nested in egos
     (standard errors clustered by ego) or one row per ego (robust standard
     errors, weights), with Stata and R code for the full multilevel model
     and a starting point for ergm.ego. Checked against Stata 19.
   - **Use with your other apps**: files for StatCraft or Stata, alters and
     egos as QualCraft cases (and QualCraft codes back as alter variables),
     and a map file or counts by census area for Husky Eye View.

   The measures also cover several kinds of tie (multiplexity, overlap,
   any-or-all subgroups, a sociogram panel for each tie type), places
   (distance from ego to alters, same tract, county or state, areas
   reached) and missing data (the kinds of missing kept apart, a cutoff for
   unknown pairs, and a table of how much the rule for unknown pairs
   matters).

Everything runs on your own computer. Files are read in the browser, studies
are kept in the browser and in the `.egocraft` files you save, and nothing is
sent anywhere.

> **Status (version 0.4.0): Phases 0–11 work, and it runs offline on an
> iPad at https://nu-stats.github.io/egocraft-app/.** What is left of the
> release (Phase 12) is signed installers. See [ROADMAP.md](ROADMAP.md) and
> [plan/STATUS.md](plan/STATUS.md) for the detailed state. How the numbers were checked is in
> [docs/validation.md](docs/validation.md).

EgoCraft is part of the "Craft" family with StatCraft and QualCraft. It is an
independent project, not affiliated with Network Canvas, EgoNet, egor, E-Net,
VennMaker, UCINET or ORA. See [NOTICE](NOTICE).

## How to use it

### With Pinokio (one click)

1. In Pinokio, open EgoCraft and click **Install**. It installs the packages
   and builds the app (a minute or two).
2. Click **Start**, then **Open EgoCraft**.
3. Choose **Open the sample study** to explore a made-up study of 200 people
   in two waves, or **Start a new study** for your own files.

**Update** pulls the latest version and rebuilds. **Reset** removes the
installed packages and the built app; your studies are not touched.

### From a terminal

Node.js 24 or later is needed.

```bash
cd app
npm ci
npm run build
npm run serve
```

Then open the address it prints (`http://127.0.0.1:4320/` by default). Use
`npm run serve -- --port 5000` for another port. `npm run dev` starts the
development server instead.

### Your files

| Layout | What EgoCraft expects |
|---|---|
| Three files | Egos: one row per person interviewed (and per wave). Alters: one row per person named, with the ego's ID and an alter ID unique within that ego. Ties (optional): one row per pair of alters, with the ego's ID and both alter IDs; optionally a tie type, a strength, and a "tied or not" column where 0 means not tied and an empty cell means not asked. |
| Two files | The ego file, and an alter file with one column per other alter (`knows_1`, `knows_2` …). |
| One wide file | One row per ego, alters spread across columns (`alter1_age`, `alter2_age` … or `age_1`, `age_2` …), ties in columns such as `tie_1_2` or `knows1-2`. |
| From another program | Network Canvas's CSV export (…_ego.csv, …_attributeList_<type>.csv, …_edgeList_<type>.csv) or GraphML; EgoWeb 2.0's ego-alter and alter-pair files; EgoNet's ego file with an alter and an edge file per ego; E-Net's row-wise file (*ego data, *alter data, *alter-alter data); any GraphML with one graph per ego. Choose all the files, or the ZIP. These readers follow each program's documentation and have been tested on made-up files only. |

The sample study's three files are in [examples/](examples/).

### Where studies are kept

The open study is kept in the browser's own storage (IndexedDB) for the
address EgoCraft runs at, so it is still there next time. To keep a copy,
move it to another computer, or share it, use **Study ▸ Save as a file**
(`.egocraft`, a JSON file) and **Open a study file**.

Browsers can clear what they keep, and Safari on iPad and iPhone does after
some weeks without a visit or when space runs low. EgoCraft asks the browser
to keep its storage, shows when you last saved the study as a file, and
reminds you to save one now and then.

### On an iPad (or offline anywhere)

EgoCraft is a web app that works without a network once it has been opened:
the first visit stores the whole app on the device (a service worker), and
it can be added to the Home Screen, where it opens full screen like an app.
Screens work by touch: large buttons, drag alters with a finger, and
**Choose a file** in place of dragging files in.

1. Open **https://nu-stats.github.io/egocraft-app/** in Safari on the iPad.
2. Tap the Share button, then **Add to Home Screen**.
3. Open it from the Home Screen. From then on it opens with or without a
   network, and saving files puts them in the Files app.

That address is the public repository
[nu-stats/egocraft-app](https://github.com/nu-stats/egocraft-app), which
holds only the built app (no source code), served by GitHub Pages. No study
data goes there: the site only hands out the app's files. The Pinokio address
(`http://127.0.0.1:…`) works only on the computer running Pinokio.

To publish a new version there (maintainers, with git and an authorized `gh`):

```bash
cd app
npm run publish-web
```

Devices that already have EgoCraft get the new version the next time they
open it with a network.

## Programmatic access

EgoCraft has no web API: its server only hands out the app's files, and all
work happens in the browser. The engine (`app/src`, everything outside
`src/ui`) is plain TypeScript with no browser code, so scripts can use it
directly with Node 24.

### JavaScript (Node 24)

Save as `app/scripts/my-measures.ts` and run `node scripts/my-measures.ts`
in `app`:

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import { readDataFile } from '../src/io/read.ts';
import { newStudy } from '../src/core/study.ts';
import { guessMapping } from '../src/import/guess.ts';
import { runChecks } from '../src/import/checks.ts';
import { computeMeasures } from '../src/measures/measures.ts';
import { csvOf } from '../src/export/export.ts';

const read = (f: string) => readDataFile(f, new Uint8Array(readFileSync(f)));
const egos = await read('../examples/sample-egos.csv');
const alters = await read('../examples/sample-alters.csv');
const ties = await read('../examples/sample-ties.csv');
const study = { ...newStudy('My study'), egos, alters, ties, mapping: guessMapping(egos, alters, ties) };

for (const issue of runChecks(study)) console.log(issue.severity, issue.title);

const kin = { id: 'kin', label: 'Kin only', tieTypes: ['kin'], alterConditions: [{ column: 'relation', op: 'is' as const, values: ['1'] }], minWeight: null };
const results = computeMeasures(study, [
  { spec: { kind: 'size' }, sliceId: 'all' },
  { spec: { kind: 'density' }, sliceId: 'all' },
  { spec: { kind: 'constraint' }, sliceId: 'all' },
  { spec: { kind: 'density' }, sliceId: 'kin' },
  { spec: { kind: 'composition', variable: 'age', stat: 'mean' }, sliceId: 'all' },
], [kin]);
writeFileSync('measures.csv', csvOf(results.table));
```

`bundleZip` in `src/export/export.ts` writes the same ZIP as the Results
step (measures, codebook, do-file, R script, recipe).

Models work the same way (`src/models`):

```ts
import { alterModelData } from '../src/models/modelData.ts';
import { fitModel, modelTable } from '../src/models/regress.ts';

const alters = alterModelData(study, results); // one row per alter, with net_… ego measures
const fit = fitModel(alters, { kind: 'linear', outcome: 'degree', predictors: ['age', 'net_size', 'relation'], categorical: ['relation'], weight: null, se: 'cluster', cluster: 'ego_id' });
writeFileSync('model.csv', csvOf(modelTable(fit)));
```

### Python

Python can drive the same script and read its output:

```python
import subprocess, csv
subprocess.run(["node", "scripts/my-measures.ts"], cwd="app", check=True)
with open("app/measures.csv", encoding="utf-8-sig") as f:
    rows = list(csv.DictReader(f))
print(rows[0])
```

Or work from the files the Results step saves: `egocraft_measures.csv` (one
row per ego), `egocraft_long.csv` (one row per alter) and
`egocraft_pairs.csv` (one row per pair of alters, with `tied` = 1, 0 or
empty).

### curl

The local server answers only on 127.0.0.1. To check that it is running:

```bash
curl -I http://127.0.0.1:4320/
```

## For contributors

Read [AGENTS.md](AGENTS.md) first: the clean-room rules (no code from other
network programs, published formulas only), the never-lose-data rules and the
layout. Then:

```bash
cd app
npm ci
npm run ci        # type check, tests, build
npm run examples  # rewrite examples/ from the sample study
```

## License

MIT OR Apache-2.0, at your option. The sample study is made up and CC0.
Third-party files and the methods' sources are listed in
[ATTRIBUTION.md](ATTRIBUTION.md).
