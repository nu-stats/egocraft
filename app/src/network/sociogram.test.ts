import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newProject, projectFromJson, projectToJson } from '../project.ts';
import { sampleStudy } from '../sample/sample.ts';
import type { LayoutKind } from './layout.ts';
import { layout } from './layout.ts';
import { ALL, buildNetworks } from './networks.ts';
import { DEFAULT_OPTIONS, placeNodes, sociogramData, sociogramSvg } from './sociogram.ts';

const now = new Date('2026-10-24T12:00:00Z');

test('every layout keeps alters inside the frame and is the same each time', () => {
  const input = { ids: ['1', '2', '3', '4', '5'], edges: [[0, 1], [1, 2]] as [number, number][], ring: [4, 3, 3, null, 1], group: ['a', 'a', 'b', null, 'b'], seed: '7' };
  for (const kind of ['force', 'circle', 'rings', 'sectors'] as LayoutKind[]) {
    const p = layout(kind, input);
    assert.equal(p.size, 5, kind);
    for (const { x, y } of p.values()) assert.ok(Math.abs(x) <= 1 && Math.abs(y) <= 1, `${kind}: ${x},${y}`);
    assert.deepEqual([...layout(kind, input).entries()], [...p.entries()], `${kind} is repeatable`);
  }
});

test('a sociogram of a sample ego: one circle per alter plus the ego, ties by type, escaped title', () => {
  const s = sampleStudy(now);
  const nets = buildNetworks(s);
  const net = nets.egos.find((n) => n.alters.length >= 6 && n.ties.some((t) => t.state))!;
  const data = sociogramData(s, net, ALL);
  assert.equal(data.nodes.length, net.alters.length);
  assert.ok(data.edges.length > 0);
  const opts = { ...DEFAULT_OPTIONS, colorBy: 'relation', sizeBy: 'closeness', title: 'Ego <101>' };
  const svg = sociogramSvg({ study: s, data, positions: placeNodes(s, data, opts, net.key), opts, tieTypes: nets.tieTypes });
  assert.ok(svg.startsWith('<svg'));
  assert.match(svg, /Ego &lt;101&gt;/);
  const circles = svg.match(/<circle /g)!.length;
  // Alters + ego + legend dots (four relations, Missing).
  assert.equal(circles, net.alters.length + 1 + 5);
  assert.match(svg, />Kin</);
});

test('a project file round-trips', () => {
  const p = newProject(sampleStudy(now));
  const back = projectFromJson(projectToJson(p));
  assert.equal(back.study.egos.rows.length, p.study.egos.rows.length);
  assert.deepEqual(back.measures, p.measures);
  assert.throws(() => projectFromJson('{"format":"other"}'), /not an EgoCraft project/);
  assert.throws(() => projectFromJson('nope'), /not valid JSON/);
});
