import assert from 'node:assert/strict';
import { test } from 'node:test';
import { columnIndex } from '../core/data.ts';
import { guessMapping } from '../import/guess.ts';
import { graphmlToTables } from './graphml.ts';

// Made up for this test, following the published GraphML format.
const twoGraphs = `<?xml version="1.0" encoding="UTF-8"?>
<graphml xmlns="http://graphml.graphdrawing.org/xmlns">
  <key id="g0" for="graph" attr.name="respondent_id" attr.type="string"/>
  <key id="g1" for="graph" attr.name="age" attr.type="int"/>
  <key id="n0" for="node" attr.name="ego" attr.type="boolean"><default>false</default></key>
  <key id="n1" for="node" attr.name="relation" attr.type="string"/>
  <key id="e0" for="edge" attr.name="closeness" attr.type="int"/>
  <key id="e1" for="edge" attr.name="type" attr.type="string"><default>knows</default></key>
  <graph id="G0" edgedefault="undirected">
    <data key="g0">007</data><data key="g1">41</data>
    <node id="me"><data key="n0">true</data></node>
    <node id="1"><data key="n1">kin</data></node>
    <node id="2"><data key="n1">friend</data></node>
    <node id="3"><data key="n1">friend</data></node>
    <edge source="me" target="1"><data key="e0">5</data></edge>
    <edge source="2" target="me"><data key="e0">3</data></edge>
    <edge source="1" target="2"/>
    <edge source="2" target="3"><data key="e1">work</data></edge>
  </graph>
  <graph id="G1" edgedefault="undirected">
    <data key="g0">008</data><data key="g1">29</data>
    <node id="1"><data key="n1">kin</data></node>
    <node id="2"><data key="n1">kin</data></node>
  </graph>
</graphml>`;

test('GraphML: one graph per ego, the ego node taken out, ego–alter edges kept as ego_tie_ variables', () => {
  const t = graphmlToTables([{ name: 'study.graphml', text: twoGraphs }]);
  assert.deepEqual(t.egos.columns.map((c) => c.name), ['ego_id', 'age']);
  assert.deepEqual(t.egos.rows.map((r) => r[0]), ['007', '008'], 'leading zeros kept');
  assert.deepEqual(t.alters.columns.map((c) => c.name), ['ego_id', 'alter_id', 'relation', 'ego_tie_closeness', 'ego_tie_type']);
  assert.equal(t.alters.rows.length, 5);
  const close = columnIndex(t.alters, 'ego_tie_closeness');
  assert.deepEqual(t.alters.rows.slice(0, 3).map((r) => r[close]), [5, 3, null]);
  assert.deepEqual(t.ties!.rows, [['007', 1, 2, 'knows'], ['007', 2, 3, 'work']]);
  const m = guessMapping(t.egos, t.alters, t.ties);
  assert.deepEqual([m.egoId, m.alterEgoId, m.alterId, m.tieA, m.tieB, m.tieType], ['ego_id', 'ego_id', 'alter_id', 'alter_a', 'alter_b', 'type']);
  assert.match(t.notes[0]!, /2 networks .* 5 alters and 2 alter–alter ties; the ego node was taken out of 1/);
});

test('GraphML: one file per ego takes the ego ID from the file name; mistakes get plain messages', () => {
  const one = (id: string) => `<graphml><graph edgedefault="undirected"><node id="a"/><node id="b"/><edge source="a" target="b"/></graph></graphml>`.replace('<graph ', `<graph id="${id}" `);
  const t = graphmlToTables([{ name: 'R-12.graphml', text: one('G') }, { name: 'R-13.graphml', text: one('G') }]);
  assert.deepEqual(t.egos.rows.map((r) => r[0]), ['R-12', 'R-13']);
  assert.equal(t.ties!.rows.length, 2);
  assert.throws(() => graphmlToTables([{ name: 'x.graphml', text: '<gexf/>' }]), /not a GraphML file/);
  assert.throws(() => graphmlToTables([{ name: 'a.graphml', text: one('G') }, { name: 'a.xml', text: one('G') }]), /Two networks have the ego ID "a"/);
});
