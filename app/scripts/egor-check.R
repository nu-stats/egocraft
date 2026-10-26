# EgoCraft against egor, run as a black box (see docs/validation.md).
#   Rscript egor-check.R <folder written by egor-check.ts>
# Needs the egor package (install.packages("egor")).
args <- commandArgs(trailingOnly = TRUE)
dir <- if (length(args)) args[1] else "."
suppressPackageStartupMessages(library(egor))
egos <- read.csv(file.path(dir, "egos.csv"))
alters <- read.csv(file.path(dir, "alters.csv"))
edges <- read.csv(file.path(dir, "edges.csv"))
names(edges)[1] <- "ego_id"
e <- threefiles_to_egor(egos = egos, alters.df = alters, edges = edges,
  ID.vars = list(ego = "ego_id", alter = "alter_id", source = "Source", target = "Target"))
ours <- read.csv(file.path(dir, "egocraft_w1.csv"))
val <- function(x) { if (is.data.frame(x)) x[[ncol(x)]] else as.numeric(x) }
ids <- as_egos_df(e)$.egoID
theirs <- data.frame(
  ego_id = ids,
  size = val(comp_ply(e, "age", length)),
  density = val(ego_density(e)),
  constraint = val(ego_constraint(e)),
  mean_age = val(comp_ply(e, "age", mean, na.rm = TRUE)),
  pct_gender_2 = val(comp_ply(e, "gender", function(x) mean(x == 2, na.rm = TRUE))),
  ncat_race = val(alts_diversity_count(e, "race")),
  entropy_race = val(alts_diversity_entropy(e, "race", base = exp(1))),
  ei_gender = val(comp_ei(e, "gender", "gender"))
)
m <- merge(ours, theirs, by = "ego_id", suffixes = c(".egocraft", ".egor"))
cat("egor", as.character(packageVersion("egor")), "-", nrow(m), "egos\n\n")
cat(sprintf("%-14s %8s %8s %12s %8s\n", "measure", "both", "differ", "largest", "NA only"))
for (v in setdiff(names(theirs), "ego_id")) {
  a <- m[[paste0(v, ".egocraft")]]; b <- m[[paste0(v, ".egor")]]
  b[is.nan(b)] <- NA
  both <- !is.na(a) & !is.na(b)
  d <- abs(a[both] - b[both])
  cat(sprintf("%-14s %8d %8d %12.3g %8s\n", v, sum(both), sum(d > 1e-6), if (length(d)) max(d) else NA,
    paste0(sum(is.na(a) & !is.na(b)), "/", sum(!is.na(a) & is.na(b)))))
  bad <- which(both)[d > 1e-6]
  if (length(bad)) print(head(data.frame(ego = m$ego_id[bad], egocraft = a[bad], egor = b[bad], size = m$size.egocraft[bad]), 5))
}
cat("\n'NA only' = EgoCraft has no value but egor does / egor has none but EgoCraft does.\n")
