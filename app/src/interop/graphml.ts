// GraphML (the published GraphML format, graphml.graphdrawing.org) into the
// three tables EgoCraft works on. Each <graph> is one ego's network: graph
// attributes become the ego's variables, nodes the alters, edges between
// alters the alter–alter ties. A node marked as the ego (an attribute such
// as ego = true, or the ID "ego") is taken out; the edges from it to the
// alters become ego–alter variables (ego_tie_<name>). Several files, one
// per ego, can be read together.

import type { DataTable } from '../core/data.ts';
import { tableFromText } from '../core/data.ts';
import { attr, kids, parseXml } from '../core/xml.ts';

export interface ThreeTables {
  egos: DataTable;
  alters: DataTable;
  ties: DataTable | null;
  notes: string[];
}

interface Key {
  name: string;
  for: string;
  default: string | null;
}

const EGO_ATTR = /^(ego_?id|egoid|respondent_?id|resp_?id|participant_?id|case_?id|subject_?id)$/i;
const IS_EGO = /^(ego|is_?ego|isego|networkcanvasego)$/i;
const truthy = (v: string | undefined) => !!v && /^(true|1|yes|y|t)$/i.test(v.trim());
const base = (name: string) => name.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');

/** Column order as first seen, without repeats. */
class Columns {
  readonly names: string[] = [];
  add(n: string) {
    if (!this.names.includes(n)) this.names.push(n);
  }
}

export function graphmlToTables(files: { name: string; text: string }[]): ThreeTables {
  const egoCols = new Columns();
  const alterCols = new Columns();
  const tieCols = new Columns();
  const egoRows: Record<string, string>[] = [];
  const alterRows: Record<string, string>[] = [];
  const tieRows: Record<string, string>[] = [];
  const notes: string[] = [];
  let directed = 0;
  let egoNodes = 0;
  const seenEgo = new Set<string>();
  for (const f of files) {
    const doc = parseXml(f.text, `GraphML file ${f.name}`);
    const root = doc.documentElement;
    if (root?.localName !== 'graphml') throw new Error(`${f.name} is not a GraphML file (its first element is <${root?.localName ?? '?'}>, not <graphml>).`);
    const keys = new Map<string, Key>();
    for (const k of kids(root, 'key')) {
      const id = attr(k, 'id');
      if (!id) continue;
      const def = kids(k, 'default')[0];
      keys.set(id, { name: attr(k, 'attr.name') || id, for: attr(k, 'for') ?? 'all', default: def ? (def.textContent ?? '') : null });
    }
    const dataOf = (el: Element, forWhat: string): Record<string, string> => {
      // In the order the keys are declared: the value given, else the key's default.
      const given = new Map(kids(el, 'data').map((d) => [attr(d, 'key') ?? '', d.textContent ?? '']));
      const out: Record<string, string> = {};
      for (const [id, k] of keys) {
        if (k.for !== forWhat && k.for !== 'all') continue;
        if (given.has(id)) out[k.name] = given.get(id)!;
        else if (k.default !== null) out[k.name] = k.default;
      }
      for (const [id, v] of given) if (!keys.has(id)) out[id || 'value'] = v;
      return out;
    };
    const graphs = kids(root, 'graph');
    if (!graphs.length) throw new Error(`${f.name} has no <graph>.`);
    graphs.forEach((g, gi) => {
      const gdata = dataOf(g, 'graph');
      const idAttr = Object.keys(gdata).find((n) => EGO_ATTR.test(n));
      const graphId = attr(g, 'id');
      const egoId = (idAttr && gdata[idAttr]?.trim()) || (graphs.length === 1 ? base(f.name) : graphId && !/^G\d*$/i.test(graphId) ? graphId : `${base(f.name)}_${gi + 1}`);
      if (seenEgo.has(egoId)) throw new Error(`Two networks have the ego ID "${egoId}". Give each graph its own ID (an ego_id attribute or a graph id).`);
      seenEgo.add(egoId);
      if ((attr(g, 'edgedefault') ?? 'undirected') === 'directed') directed++;
      const egoRow: Record<string, string> = { ego_id: egoId };
      for (const [n, v] of Object.entries(gdata)) if (n !== idAttr) {
        egoCols.add(n);
        egoRow[n] = v;
      }
      egoRows.push(egoRow);
      const nodes = kids(g, 'node').map((n) => ({ id: attr(n, 'id') ?? '', data: dataOf(n, 'node') }));
      const isEgo = (n: { id: string; data: Record<string, string> }) => Object.entries(n.data).some(([k, v]) => IS_EGO.test(k) && truthy(v)) || n.id.toLowerCase() === 'ego' || n.id === egoId;
      const egoNode = nodes.find(isEgo);
      if (egoNode) {
        egoNodes++;
        for (const [n, v] of Object.entries(egoNode.data)) if (!IS_EGO.test(n) && !(n in egoRow)) {
          egoCols.add(n);
          egoRow[n] = v;
        }
      }
      const alters = new Map<string, Record<string, string>>();
      for (const n of nodes) {
        if (n === egoNode) continue;
        const row: Record<string, string> = { ego_id: egoId, alter_id: n.id };
        for (const [k, v] of Object.entries(n.data)) if (!IS_EGO.test(k)) {
          alterCols.add(k);
          row[k] = v;
        }
        alters.set(n.id, row);
        alterRows.push(row);
      }
      for (const e of kids(g, 'edge')) {
        const a = attr(e, 'source') ?? '';
        const b = attr(e, 'target') ?? '';
        const data = dataOf(e, 'edge');
        if (attr(e, 'directed') === 'true') directed++;
        if (egoNode && (a === egoNode.id || b === egoNode.id)) {
          const alter = alters.get(a === egoNode.id ? b : a);
          if (alter) for (const [k, v] of Object.entries(data)) {
            alterCols.add(`ego_tie_${k}`);
            alter[`ego_tie_${k}`] = v;
          }
          continue;
        }
        if (!alters.has(a) || !alters.has(b)) {
          notes.push(`An edge in ${f.name} (${a}–${b}) points to a node that isn't in its graph; it was left out.`);
          continue;
        }
        const row: Record<string, string> = { ego_id: egoId, alter_a: a, alter_b: b };
        for (const [k, v] of Object.entries(data)) {
          tieCols.add(k);
          row[k] = v;
        }
        tieRows.push(row);
      }
    });
  }
  const table = (name: string, idCols: string[], cols: Columns, rows: Record<string, string>[]) => {
    const extra = cols.names.filter((c) => !idCols.includes(c));
    return tableFromText(name, [...idCols, ...extra], rows.map((r) => [...idCols, ...extra].map((c) => r[c] ?? '')));
  };
  notes.unshift(`Read ${egoRows.length} network${egoRows.length === 1 ? '' : 's'} from ${files.length} GraphML file${files.length === 1 ? '' : 's'}: ${alterRows.length} alters and ${tieRows.length} alter–alter ties${egoNodes ? `; the ego node was taken out of ${egoNodes} of them, its edges kept as ego_tie_ variables` : ''}.`);
  if (directed) notes.push('Some ties are directed. EgoCraft treats alter–alter ties as undirected; a pair listed both ways is one tie (the checks show pairs whose two directions disagree).');
  return {
    egos: table('GraphML (egos)', ['ego_id'], egoCols, egoRows),
    alters: table('GraphML (alters)', ['ego_id', 'alter_id'], alterCols, alterRows),
    ties: tieRows.length ? table('GraphML (ties)', ['ego_id', 'alter_a', 'alter_b'], tieCols, tieRows) : null,
    notes,
  };
}
