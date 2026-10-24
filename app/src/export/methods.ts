// A draft methods paragraph (P5.6): the sample, the network data, the
// checks, the measures with their sources, and the missing-pair rule, in
// plain sentences to edit for a paper, with an APA reference list.

import type { Study } from '../core/study.ts';
import type { MeasureRequest, MeasureSpec } from '../measures/measures.ts';
import { MEASURE_INFO } from '../measures/measures.ts';
import * as S from '../measures/structure.ts';
import type { Slice, StudyNetworks } from '../network/networks.ts';
import { ALL, buildNetworks, describeSlice, graphFor } from '../network/networks.ts';
import { APP_VERSION } from '../version.ts';

const REFERENCES: Record<string, string> = {
  'Burt (1992)': 'Burt, R. S. (1992). Structural holes: The social structure of competition. Harvard University Press.',
  'Borgatti (1997)': "Borgatti, S. P. (1997). Structural holes: Unpacking Burt's redundancy measures. Connections, 20(1), 35–38.",
  'Everett and Borgatti (2005)': 'Everett, M., & Borgatti, S. P. (2005). Ego network betweenness. Social Networks, 27(1), 31–38.',
  'Freeman (1977)': 'Freeman, L. C. (1977). A set of measures of centrality based on betweenness. Sociometry, 40(1), 35–41.',
  'Blau (1977)': 'Blau, P. M. (1977). Inequality and heterogeneity: A primitive theory of social structure. Free Press.',
  'Agresti and Agresti (1978)': 'Agresti, A., & Agresti, B. F. (1978). Statistical analysis of qualitative variation. Sociological Methodology, 9, 204–237.',
  'Krackhardt and Stern (1988)': 'Krackhardt, D., & Stern, R. N. (1988). Informal networks and organizational crises: An experimental simulation. Social Psychology Quarterly, 51(2), 123–140.',
  'Verbrugge (1979)': 'Verbrugge, L. M. (1979). Multiplexity in adult friendships. Social Forces, 57(4), 1286–1309.',
  'Yule (1900)': 'Yule, G. U. (1900). On the association of attributes in statistics. Philosophical Transactions of the Royal Society of London, Series A, 194, 257–319.',
};

/** "Burt (1992)" → "Burt, 1992" for a parenthetical citation. */
const cite = (c: string) => c.replace(/ \((\d{4})\)/, ', $1').replace(' and ', ' & ');

function phrase(spec: MeasureSpec): string {
  switch (spec.kind) {
    case 'size': return 'network size (the number of alters)';
    case 'ties': return 'the number of ties among alters';
    case 'density': return 'density (the share of alter pairs who know each other, ego excluded)';
    case 'weightedDensity': return 'weighted density (the mean tie strength over all alter pairs)';
    case 'meanDegree': return 'mean degree (the average number of other alters each alter knows)';
    case 'maxDegree': return 'the largest degree among alters';
    case 'egoBetweenness': return 'ego betweenness';
    case 'egoBetweennessNorm': return 'ego betweenness divided by the number of alter pairs';
    case 'meanAlterBetweenness': return 'mean alter betweenness (ego excluded)';
    case 'maxAlterBetweenness': return 'the largest alter betweenness (ego excluded)';
    case 'effectiveSize': return 'effective size';
    case 'efficiency': return 'efficiency (effective size divided by size)';
    case 'constraint': return 'constraint';
    case 'hierarchy': return 'hierarchy';
    case 'components': return 'the number of components among alters (ego excluded)';
    case 'largestComponentShare': return 'the share of alters in the largest component';
    case 'isolates': return 'the number of isolates (alters who know no other alter)';
    case 'unknownPairs': return 'the number of alter pairs whose tie was not reported';
    case 'composition': {
      if (spec.stat === 'share' || spec.stat === 'count') return `the ${spec.stat === 'share' ? 'share' : 'number'} of alters with ${spec.variable} = ${(spec.values ?? []).join(' or ')}`;
      if (spec.stat === 'shareAtLeast') return `the share of alters with ${spec.variable} of at least ${spec.values?.[0]}`;
      const what = { mean: 'mean', sd: 'standard deviation', median: 'median', min: 'lowest value', max: 'highest value' }[spec.stat];
      return `the ${what} of alters' ${spec.variable}`;
    }
    case 'diversity': return `${{ blau: "Blau's index", iqv: 'the index of qualitative variation (IQV)', entropy: 'entropy', categories: 'the number of categories' }[spec.index]} of alters' ${spec.variable}`;
    case 'similarity': return `${{ ei: 'the E-I index', sameShare: 'the share of alters with the same', meanAbsDiff: 'the mean absolute difference between ego and alters in' }[spec.index]}${spec.index === 'ei' ? ` for ${spec.alterVariable} (alters different from ego minus alters the same, over all alters)` : ` ${spec.alterVariable}${spec.index === 'sameShare' ? ' as ego' : ''}`}`;
    case 'yulesQ': return `alter–alter homophily on ${spec.variable} (Yule's Q)`;
    case 'multiplexity': return spec.stat === 'mean' ? `multiplexity, the mean number of kinds of tie per alter (${spec.columns.join(', ')})` : `the share of alters tied to the ego in more than one way (${spec.columns.join(', ')})`;
    case 'layerOverlap': return `the overlap of ${spec.a} and ${spec.b} ties to the ego (alters with both over alters with either)`;
    case 'tieMultiplexity': return 'the share of tied alter pairs tied in more than one way';
    case 'tieLayerOverlap': return `the overlap of ${spec.a} and ${spec.b} ties among alters (pairs with both over pairs with either)`;
  }
}

const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : xs.length === 2 ? `${xs[0]} and ${xs[1]}` : `${xs.slice(0, -1).join('; ')}; and ${xs.at(-1)}`);
const fmt = (v: number, d = 2) => v.toFixed(d);

export interface MethodsText {
  paragraphs: string[];
  references: string[];
}

export function methodsText(study: Study, measures: MeasureRequest[], slices: Slice[], nets: StudyNetworks = buildNetworks(study)): MethodsText {
  const paragraphs: string[] = [];
  const waves = nets.waves.length;
  const egoIds = new Set(nets.egos.map((n) => n.id));
  const sizes = nets.egos.map((n) => n.alters.length);
  const total = sizes.reduce((a, b) => a + b, 0);
  const mean = total / Math.max(1, sizes.length);
  const sd = sizes.length > 1 ? Math.sqrt(sizes.reduce((a, b) => a + (b - mean) ** 2, 0) / (sizes.length - 1)) : 0;
  const zero = sizes.filter((s) => s === 0).length;
  paragraphs.push(
    `The data include ${egoIds.size.toLocaleString('en-US')} respondents (egos)${waves > 1 ? ` interviewed in up to ${waves} survey waves (${nets.egos.length.toLocaleString('en-US')} ego-waves)` : ''}, who named ${total.toLocaleString('en-US')} alters in all (M = ${fmt(mean)}, SD = ${fmt(sd)}, range ${Math.min(...sizes)}–${Math.max(...sizes)} per ${waves > 1 ? 'ego-wave' : 'ego'}). ${zero ? `${zero} ${waves > 1 ? 'ego-waves' : 'egos'} named no one.` : 'Every ego named at least one alter.'}`,
  );
  if (study.ties) {
    let pairs = 0;
    let unknown = 0;
    for (const net of nets.egos) {
      const g = graphFor(study, net, ALL);
      pairs += (g.n * (g.n - 1)) / 2;
      unknown += S.unknownPairs(g);
    }
    const types = nets.tieTypes;
    let p = `For each pair of alters, respondents reported whether the two know each other${types.length > 1 ? ` (tie types: ${types.join(', ')})` : ''}${study.mapping.tieWeight ? ', and how strong the tie is' : ''}.`;
    if (unknown) p += ` Of ${pairs.toLocaleString('en-US')} alter pairs, ${unknown.toLocaleString('en-US')} (${fmt((100 * unknown) / Math.max(1, pairs), 1)}%) were not asked or not answered; these pairs were ${study.settings.missingPairs === 'noTie' ? 'counted as not tied' : 'left out of the density calculations'}.`;
    if (study.mapping.egoAlterStrength) p += ` Ego–alter tie strength (${study.mapping.egoAlterStrength}) was used as the weight of ego's ties in effective size and constraint.`;
    paragraphs.push(p);
  } else paragraphs.push('Ties among alters were not collected, so only size and composition measures were computed.');
  const fixes = study.history.filter((h) => h.kind === 'fix');
  if (fixes.length) paragraphs.push(`Before analysis, the files were checked for duplicate and unmatched IDs. The following corrections were made: ${list(fixes.map((f) => f.text.replace(/\.$/, '').replace(/^./, (c) => c.toLowerCase())))}.`);
  const sliceOf = new Map([[ALL.id, ALL], ...slices.map((s) => [s.id, s] as const)]);
  const used = new Set<string>();
  const bySlice = new Map<string, string[]>();
  for (const r of measures) {
    const c = MEASURE_INFO[r.spec.kind].citation;
    let text = phrase(r.spec);
    if (c) {
      for (const part of c.split('; ')) used.add(part);
      text += ` (${c.split('; ').map(cite).join('; ')})`;
    }
    const list2 = bySlice.get(r.sliceId) ?? [];
    if (!list2.includes(text)) list2.push(text);
    bySlice.set(r.sliceId, list2);
  }
  const parts: string[] = [];
  for (const [id, items] of bySlice) {
    const s = sliceOf.get(id) ?? ALL;
    parts.push(id === 'all' ? `For each ${waves > 1 ? 'ego-wave' : 'ego'} we computed ${list(items)}.` : `For the subgroup "${s.label}" (${describeSlice(s)}) we computed ${list(items)}.`);
  }
  if (parts.length) paragraphs.push(parts.join(' '));
  paragraphs.push(`Measures were computed with EgoCraft ${APP_VERSION}, which also wrote the Stata do-file and R script used to recompute size, composition, density and constraint as a check.`);
  return { paragraphs, references: [...used].map((u) => REFERENCES[u]).filter((r): r is string => !!r).sort() };
}

export function methodsPlainText(m: MethodsText): string {
  return [...m.paragraphs, '', 'References', '', ...m.references].join('\n\n').replace(/\n{3,}/g, '\n\n') + '\n';
}
