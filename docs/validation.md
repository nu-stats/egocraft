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
It printed "EgoCraft check passed" (the message now reads "the numbers match").

The first run found a bug in the do-file itself: egos who named nobody are
not in the long file, so their recomputed counts were missing rather than 0.
The do-file now fills them with 0, as it already did for size.

## 3b. StatCraft, 2026-10-24

The same do-file ran unchanged in StatCraft (the clean-room Stata-compatible
app, `statcraft run egocraft_check.do`): it read the `.dta` files with their
labels, ran the merge, `collapse` and every `assert`, and passed.

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

## 5. Models, Stata 19, 2026-10-24

The regression engine (Results ▸ Models) was checked against Stata 19 on the
sample study (2,129 alters in 194 egos). Every coefficient and standard error
agreed to the six decimals Stata prints:

| Model | Stata command | Example |
|---|---|---|
| Linear, clustered by ego | `regress … , vce(cluster ego_id)` | age .1488059 (se .0169327) |
| Linear, categories | `regress … i.relation, vce(cluster ego_id)` | Friend −23.48389 (se 1.081998) |
| Logistic, clustered by ego | `logit … , vce(cluster ego_id)` | _cons .4086449 (se .3963738) |
| Weighted, robust | `regress … [pweight = w], vce(robust)` | same to six decimals |

The do-file the Models panel writes ran unchanged: its `regress` line
reproduced EgoCraft's table (degree on age, network size and relation: R² .2471,
net_size .2161096, se .0279851), and its `mixed … || ego_id:` line fit the
multilevel model. The R code (`lmer … , REML = FALSE`, lme4 2.0.1) gave the
same fixed effects and variances as `mixed` (net_size .2572683; var(ego)
.33495, residual 1.70098). The first category (lowest code) is the reference, as in
Stata.

## 6. egor (R), 2026-10-25

egor 1.25.10, the R package for egocentric network data, was installed from
CRAN and run as a black box (its code was not read), on wave 1 of the sample
study: 200 egos, 1,137 alters and 1,245 alter–alter ties (the pairs tied on
any tie type). Both sides used unweighted ties, with pairs not asked counted
as not tied. `scripts/egor-check.ts` writes the files and EgoCraft's results;
`scripts/egor-check.R` reads them into egor (`threefiles_to_egor`) and
compares every ego.

| Measure | EgoCraft | egor | Egos compared | Largest difference |
|---|---|---|---|---|
| Size | size | number of alters | 200 | 0 |
| Density | density | `ego_density` | 177 | 4.8 × 10⁻¹¹ |
| Constraint | constraint | `ego_constraint` | 192 | 5.0 × 10⁻¹¹ |
| Mean age | composition, mean | `comp_ply(…, mean)` | 191 | 4.4 × 10⁻¹¹ |
| Share women | composition, share | `comp_ply` (share of code 2) | 192 | 4.6 × 10⁻¹¹ |
| Race categories | diversity, categories | `alts_diversity_count` | 192 | 0 |
| Race entropy | diversity, entropy | `alts_diversity_entropy` (base e) | 192 | 5.0 × 10⁻¹¹ |
| E-I index, gender | similarity, E-I | `comp_ei` | 192 | 4.6 × 10⁻¹¹ |

The differences come from EgoCraft rounding results to 10 decimal places.
Two definitions differ, and neither is an error:

- **Egos who named nobody (8 here).** egor gives them 0 categories and an
  entropy of 0; EgoCraft leaves both empty, since with no alters there is
  nothing to be diverse. To match egor, recode them to 0 where size = 0.
- **Entropy's logarithm.** egor uses base 2 unless told otherwise; EgoCraft
  uses the natural logarithm (base e), as above. Divide EgoCraft's value by
  ln 2 (0.693) for egor's default.

## Rerunning the checks

```bash
cd app
node scripts/write-examples.ts --bundle ../check
```

Then run `check/egocraft_check.do` in Stata, `check/egocraft_check.R` in R
(needs igraph), or compare with networkx as above.

For egor (install.packages("egor")):

```bash
cd app
node scripts/egor-check.ts ../check-egor
Rscript scripts/egor-check.R ../check-egor
```
