import assert from 'node:assert/strict';
import { test } from 'node:test';
import { strToU8, zipSync } from 'fflate';
import { columnIndex } from '../core/data.ts';
import { newStudy } from '../core/study.ts';
import { blockingIssues } from '../import/checks.ts';
import { guessMapping } from '../import/guess.ts';
import { detectWide, wideToThree } from '../import/layouts.ts';
import { parseCsv } from '../io/table.ts';
import { tableFromText } from '../core/data.ts';
import type { InFile } from './formats.ts';
import { OTHER_FORMATS, readOther } from './formats.ts';

// Every file here is made up for these tests, in the layouts the programs' documentation describes.
const file = (name: string, text: string): InFile => ({ name, bytes: strToU8(text) });
const fmt = (id: string) => OTHER_FORMATS.find((f) => f.id === id)!;
const asStudy = (t: { egos: any; alters: any; ties: any }) => ({ ...newStudy('t'), egos: t.egos, alters: t.alters, ties: t.ties, mapping: guessMapping(t.egos, t.alters, t.ties) });

test('Network Canvas CSV: sessions stacked, node and edge types from file names, true/false as 1/0, apostrophes taken off', () => {
  const s1 = [
    file('case01_a1b2_ego.csv', 'networkCanvasEgoUUID,networkCanvasCaseID,networkCanvasSessionID,networkCanvasProtocolName,sessionStart,sessionFinish,sessionExported,age\ne-0001,case01,a1b2,Demo,2026-01-05T10:00:00Z,2026-01-05T10:40:00Z,2026-01-06T09:00:00Z,34\n'),
    file('case01_a1b2_attributeList_Person.csv', "nodeID,networkCanvasEgoUUID,networkCanvasUUID,name,close,support_emotional,support_financial\n1,e-0001,n-0001,Avery,true,true,false\n2,e-0001,n-0002,'-Blake,false,false,false\n3,e-0001,n-0003,Corin,,true,true\n"),
    file('case01_a1b2_edgeList_Knows.csv', 'edgeID,from,to,networkCanvasEgoUUID,networkCanvasUUID,networkCanvasSourceUUID,networkCanvasTargetUUID,strength\n1,1,2,e-0001,x-0001,n-0001,n-0002,2\n'),
  ];
  const s2 = zipSync({
    'case02_c3d4_ego.csv': strToU8('networkCanvasEgoUUID,networkCanvasCaseID,age\ne-0002,case02,41\n'),
    'case02_c3d4_attributeList_Person.csv': strToU8('nodeID,networkCanvasEgoUUID,networkCanvasUUID,name,close\n1,e-0002,n-0101,Dana,true\n2,e-0002,n-0102,Emery,true\n'),
    'case02_c3d4_edgeList_Knows.csv': strToU8('edgeID,from,to,networkCanvasEgoUUID,networkCanvasUUID,networkCanvasSourceUUID,networkCanvasTargetUUID\n'),
  });
  const t = readOther(fmt('networkCanvas'), [...s1, { name: 'case02.zip', bytes: s2 }], { missingCodes: [] });
  assert.equal(t.egos.rows.length, 2);
  assert.equal(t.alters.rows.length, 5);
  assert.equal(t.alters.rows[1]![columnIndex(t.alters, 'name')], '-Blake');
  const close = columnIndex(t.alters, 'close');
  assert.deepEqual(t.alters.rows.map((r) => r[close]), [1, 0, null, 1, 1]);
  assert.deepEqual(t.alters.columns[close]!.valueLabels, { '1': 'Yes', '0': 'No' });
  assert.equal(t.alters.rows[0]![columnIndex(t.alters, 'node_type')], 'Person');
  assert.equal(t.ties!.rows[0]![columnIndex(t.ties!, 'edge_type')], 'Knows');
  const s = asStudy(t);
  assert.deepEqual([s.mapping.egoId, s.mapping.alterEgoId, s.mapping.alterId, s.mapping.tieA, s.mapping.tieB, s.mapping.tieType], ['networkCanvasEgoUUID', 'networkCanvasEgoUUID', 'nodeID', 'from', 'to', 'edge_type']);
  assert.deepEqual(blockingIssues(s).map((i) => i.title), []);
});

test('Network Canvas GraphML: case ID, session and protocol from the nc: attributes of each graph', () => {
  const g = `<graphml xmlns="http://graphml.graphdrawing.org/xmlns" xmlns:nc="urn:example">
 <key id="age" attr.name="age" attr.type="int" for="graph"/>
 <key id="name" attr.name="name" attr.type="string" for="node"/>
 <key id="kin" attr.name="kin" attr.type="boolean" for="node"/>
 <graph id="G" edgedefault="undirected" nc:caseId="case02" nc:sessionUUID="f9e8" nc:protocolName="Demo">
  <data key="age">41</data>
  <node id="n-0101"><data key="name">Dana</data><data key="kin">true</data></node>
  <node id="n-0102"><data key="name">Emery</data><data key="kin">false</data></node>
  <edge source="n-0101" target="n-0102"/>
 </graph>
</graphml>`;
  const t = readOther(fmt('graphml'), [file('case02_f9e8.graphml', g)], { missingCodes: [] });
  assert.deepEqual(t.egos.columns.map((c) => c.name), ['ego_id', 'session_id', 'protocol_name', 'age'], 'the case ID becomes the ego ID');
  assert.equal(t.egos.rows[0]![0], 'case02');
  assert.deepEqual(t.alters.rows.map((r) => r[columnIndex(t.alters, 'kin')]), [1, 0]);
  assert.equal(t.ties!.rows.length, 1);
});

test('EgoWeb 2.0: ego variables split off the ego-alter file, alter pairs as ties, study missing codes made missing', () => {
  const egoAlter = 'EgoID,ego_age,Density,Alter Number,Alter Name,NG_friends,alter_close\n101_A,34,0.33,1,Avery,1,3\n101_A,34,0.33,2,Blake,1,-1\n101_A,34,0.33,3,Corin,0,2\n102_B,41,1.00,1,Dana,1,1\n102_B,41,1.00,2,Emery,1,2\n';
  const pairs = 'EgoID,Alter 1 Number,Alter 1 Name,Alter 2 Number,Alter 2 Name,knows\n101_A,1,Avery,2,Blake,1\n102_B,1,Dana,2,Emery,1\n';
  const t = readOther(fmt('egoWeb'), [file('ego-alter.csv', egoAlter), file('alter-pair.csv', pairs)], { missingCodes: ['-1'] });
  assert.deepEqual(t.egos.columns.map((c) => c.name), ['ego_id', 'ego_age', 'Density']);
  assert.deepEqual(t.egos.rows.map((r) => r[0]), ['101_A', '102_B']);
  assert.deepEqual(t.alters.columns.map((c) => c.name), ['ego_id', 'alter_id', 'Alter Name', 'NG_friends', 'alter_close']);
  assert.equal(t.alters.columns[1]!.label, 'Alter Number');
  assert.deepEqual(t.alters.rows.map((r) => r[4]), [3, null, 2, 1, 2], '-1 is missing');
  assert.deepEqual(t.alters.rows.map((r) => r[1]), [1, 2, 3, 1, 2], 'IDs are never made missing');
  const s = asStudy(t);
  assert.deepEqual([s.mapping.tieA, s.mapping.tieB, s.mapping.tieValue], ['alter_a', 'alter_b', 'knows']);
  assert.deepEqual(blockingIssues(s).map((i) => i.title), []);
});

test('EgoNet (egor’s documented layout): an ego file and per-ego alter and edge files in folders, semicolons', () => {
  const zip = zipSync({
    'egos.csv': strToU8('egoID;age\n1;34\n2;41\n'),
    'alters/1.csv': strToU8('egoID;alterID;name;close\n1;1;Avery;3\n1;2;Blake;2\n1;3;Corin;1\n'),
    'alters/2.csv': strToU8('egoID;alterID;name;close\n2;1;Dana;2\n2;2;Emery;3\n'),
    'edges/1.csv': strToU8('Source;Target;weight\n1;2;1\n'),
    'edges/2.csv': strToU8('Source;Target;weight\n1;2;2\n'),
  });
  const t = readOther(fmt('egoNet'), [{ name: 'export.zip', bytes: zip }], { missingCodes: [] });
  assert.equal(t.egos.rows.length, 2);
  assert.equal(t.alters.rows.length, 5);
  assert.deepEqual(t.ties!.rows.map((r) => [r[columnIndex(t.ties!, 'egoID')], r[columnIndex(t.ties!, 'Source')], r[columnIndex(t.ties!, 'Target')]]), [[1, 1, 2], [2, 1, 2]], 'the ego of an edge file comes from its name');
  assert.deepEqual(blockingIssues(asStudy(t)).map((i) => i.title), []);
});

test('E-Net row-wise file: three sections, ties matched to their ego through the alters', () => {
  const vna = '*ego data\nID Age Sex\n1 34 Female\n2 41 Male\n*alter data\nFrom To Friend Kin Age Sex\n1 1_1 1 0 30 Male\n1 1_2 1 1 52 Female\n1 1_3 0 1 19 Male\n2 2_1 1 0 44 Female\n2 2_2 0 1 70 Male\n*alter-alter data\nFrom To Knows\n1_1 1_2 1\n2_1 2_2 1\n1_1 2_2 1\n';
  const t = readOther(fmt('eNet'), [file('study.vna', vna)], { missingCodes: [] });
  assert.equal(t.egos.rows.length, 2);
  assert.deepEqual(t.alters.columns.map((c) => c.name), ['ego_id', 'alter_id', 'Friend', 'Kin', 'Age', 'Sex']);
  assert.deepEqual(t.ties!.rows, [[1, '1_1', '1_2', 1], [2, '2_1', '2_2', 1]]);
  assert.match(t.notes.join(' '), /1 rows name alters of different egos/);
  const s = asStudy(t);
  assert.deepEqual([s.mapping.egoId, s.mapping.alterId, s.mapping.tieValue], ['ID', 'alter_id', 'Knows']);
  assert.deepEqual(blockingIssues(s).map((i) => i.title), []);
});

test('E-Net column-wise layout reads as one wide file, ties named knows1-2', () => {
  const csv = parseCsv('ID,Age,Sex,A1Age,A2Age,A3Age,A1Friend,A2Friend,A3Friend,knows1-2,knows1-3,knows2-3\n1,34,Female,30,52,19,1,1,0,1,0,0\n2,41,Male,44,70,,1,0,,1,,\n');
  const wide = tableFromText('enet.csv', csv.columns, csv.rows.map((r) => r.map((c) => (c === null ? '' : String(c)))));
  const layout = detectWide(wide, 'ID');
  assert.deepEqual(layout.tieColumns.map((c) => c.column), ['knows1-2', 'knows1-3', 'knows2-3']);
  const three = wideToThree(wide, 'ID', layout);
  assert.equal(three.alters.rows.length, 5);
  assert.equal(three.ties.rows.length, 4);
});
