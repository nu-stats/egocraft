# Attribution

Files in this repository that come from elsewhere, the packages the app
ships with, and the methods it implements.

## Files

| File | Author | Source | License |
|---|---|---|---|
| `app/src/io/statRead.js`, `app/src/io/statFiles.js` | Husky Eye View contributors (nu-stats) | `nu-stats/husky-eye-view`, `src/analysis/` | MIT |
| `app/src/io/table.ts`, `app/src/core/xml.ts` | QualCraft contributors (nu-stats) | `nu-stats/qualcraft` | MIT OR Apache-2.0 |
| `app/public/icon.svg`, `icon.png` | EgoCraft contributors | drawn for EgoCraft (`app/scripts/make-icon.mjs`) | MIT OR Apache-2.0 |
| `app/src/sample/sample.ts`, `examples/*` | EgoCraft contributors | made-up study written for EgoCraft; no real people | CC0 1.0 |

## Packages in the app

| Package | Used for | License |
|---|---|---|
| react, react-dom | interface | MIT |
| fflate | ZIP files (.xlsx, the results bundle) | MIT |
| @xmldom/xmldom | reading Excel's XML | MIT |

Build and test tools (not shipped): vite, typescript.

## Methods

| Measure | Source |
|---|---|
| Effective size, efficiency, constraint, hierarchy | Burt, R. S. (1992). *Structural Holes*. Harvard University Press. Borgatti, S. P. (1997). Structural holes: Unpacking Burt's redundancy measures. *Connections* 20(1). |
| Ego betweenness | Everett, M., and Borgatti, S. P. (2005). Ego network betweenness. *Social Networks* 27(1). |
| Betweenness | Freeman, L. C. (1977). A set of measures of centrality based on betweenness. *Sociometry* 40(1). Brandes, U. (2001). A faster algorithm for betweenness centrality. *Journal of Mathematical Sociology* 25(2). |
| E-I index | Krackhardt, D., and Stern, R. N. (1988). Informal networks and organizational crises. *Social Psychology Quarterly* 51(2). |
| Blau's index, IQV | Blau, P. M. (1977). *Inequality and Heterogeneity*. Free Press. Agresti, A., and Agresti, B. F. (1978). Statistical analysis of qualitative variation. *Sociological Methodology* 9. |
| Yule's Q | Yule, G. U. (1900). On the association of attributes in statistics. *Philosophical Transactions of the Royal Society A* 194. |
| Spring layout | Fruchterman, T. M. J., and Reingold, E. M. (1991). Graph drawing by force-directed placement. *Software: Practice and Experience* 21(11). |
| Colors | Okabe, M., and Ito, K. (2008). Color universal design. |
