## EgoCraft 0.4.0

EgoCraft is an app for egocentric network analysis, from the interview to the published table. It runs in the browser on a laptop or an iPad, offline, and your data never leaves your device.

**Try it:** https://nu-stats.github.io/egocraft/ (on an iPad: Share ▸ Add to Home Screen). In Pinokio, install this repository.

### What it does
- **Collect interviews** on a laptop or iPad: name generators, questions about each person, boxes, closeness circles, who knows whom, and skip logic. Interviews are kept encrypted on the device, with a back-up reminder.
- **Import** CSV, Excel (.xlsx and .xls), Stata, SPSS and R files, or the exports of Network Canvas, EgoWeb 2.0, EgoNet, E-Net and GraphML. Checks with one-click fixes; names replaced with codes.
- **Look and measure:** sociograms, and the measures you choose for any subgroup (structure, composition, diversity, several kinds of tie, places, change between waves, missing data).
- **Models:** linear and logistic regression with alters nested in egos, and the Stata and R code for the full multilevel model.
- **Report:** one row per ego, a codebook, an APA table, a methods draft, and Stata and R scripts that recompute every number.

### Checked against
Worked by hand; networkx; Stata 19 (measures and models); R with igraph, egor and lme4; StatCraft. See [docs/validation.md](https://github.com/nu-stats/egocraft/blob/main/docs/validation.md).

### Not yet
- The readers for other programs' exports follow their documentation and were tested on made-up files, not real exports (EgoNet's own export format is not publicly documented).
- Not yet tried on a real iPad (it passes an iPad-size Safari-engine test).
- Signed installers.

**Cite:** [10.5281/zenodo.23788152](https://doi.org/10.5281/zenodo.23788152) (all versions; this version is [10.5281/zenodo.23788153](https://doi.org/10.5281/zenodo.23788153)).

### Files attached
- `EgoCraft_Guide.pdf`: the 28-page user guide.
- `EgoCraft_Highlight_share.mp4`: a 2-minute overview.

Part of the Craft family (StatCraft, QualCraft, MapCraft, MergeCraft). MIT or Apache-2.0. An independent project, not affiliated with Network Canvas, EgoNet, egor, E-Net, VennMaker, UCINET or ORA.
