# Checking EgoCraft's numbers

EgoCraft's measures are checked three ways: by hand on small networks, by
independent programs on the made-up sample study, and by the code
EgoCraft writes for each user (the do-file and R script in every results
bundle).

## 1. Worked by hand

`app/src/measures/structure.test.ts` holds networks small enough to work on
paper, with the expected numbers written out:

- a star of four alters who know nobody (density 0, effective size 4,
  constraint 1/4, ego betweenness 6);
- four alters who all know each other (constraint 4 × (7/16)²);
- a path of three alters (constraint 68/81, ego betweenness 0.5, hierarchy
  from Burt's formula);
- weighted ties, unknown pairs (density with and without them), Yule's Q of
  +1 and −1, and empty networks.

## 2. networkx (Python), 2026-10-24

networkx 3.4.2 computed constraint, effective size and density for every
ego in the sample study (wave 1 and 2, 363 egos with at least one alter),
from EgoCraft's exported `egocraft_long.csv` and `egocraft_pairs.csv`, with
the ego–alter closeness and alter–alter strength as tie weights. networkx
was run as a black box (`nx.constraint`, `nx.effective_size`); its code was
not read.

| Measure | Largest difference |
|---|---|
| Constraint (weighted) | 4.9 × 10⁻¹¹ |
| Effective size (weighted) | 4.9 × 10⁻¹¹ |
| Density | 4.9 × 10⁻¹¹ |

The differences come from EgoCraft rounding results to 10 decimal places.

## 3. Stata 19, 2026-10-24

The do-file EgoCraft writes (`egocraft_check.do`) was run in Stata 19 SE on
the sample study's results bundle. It recomputes size, mean and standard
deviation of alter age, share of alters who are women and number of kin
alters in plain Stata (`collapse`), and `assert`s that every value matches.
It printed "EgoCraft check passed: Stata gives the same numbers."

The first run found a bug in the do-file itself: egos who named nobody are
not in the long file, so their recomputed counts were missing rather than 0.
The do-file now fills them with 0, as it already did for size.

## 4. R with igraph, 2026-10-24

The R script EgoCraft writes (`egocraft_check.R`) was run in R 4.4.3 with
igraph 2.3.4 on the sample study's results bundle. It rebuilds each ego's
network (the ego tied to every alter, with closeness and tie strength as
weights), recomputes size, density and igraph's `constraint()`, and compares
them with EgoCraft's results file. It printed "EgoCraft check passed: igraph
gives the same numbers."

| Measure | Largest difference |
|---|---|
| Size | 0 |
| Density | 4.9 × 10⁻¹¹ |
| Constraint (weighted) | 4.9 × 10⁻¹¹ |

## Rerunning the checks

```bash
cd app
node scripts/write-examples.ts --bundle ../check
```

Then run `check/egocraft_check.do` in Stata, `check/egocraft_check.R` in R
(needs igraph), or compare with networkx as above.
