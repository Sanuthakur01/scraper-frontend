// Tests for lib/markdown.ts (IJF AI's answers). Run: npm test (in client/).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inlineParts, parseBlocks } from './markdown.ts';

const ANSWERS = [
  'Top companies, latest day:\n\n| Company | Jobs |\n|---|---|\n| Acme Analytics | 2 |\n| Zeta Labs | 1 |\n\nThat is all.',
  '# Briefing\n- **4 new jobs** today\n- Data Analyst leads\n  with 3\n\n1. First\n2. Second',
  '| not a table\nstill text\n|---\n| x |',
];

test('every half-arrived answer is read to the end (the text streams in)', () => {
  for (const answer of ANSWERS) {
    for (let n = 0; n <= answer.length; n++) {
      const blocks = parseBlocks(answer.slice(0, n)); // would hang before the fix
      assert.ok(Array.isArray(blocks));
    }
  }
});

test('tables, lists, headings and paragraphs', () => {
  const [intro, table, outro] = parseBlocks(ANSWERS[0]);
  assert.deepEqual(intro, { type: 'p', lines: ['Top companies, latest day:'] });
  assert.deepEqual(table, { type: 'table', head: ['Company', 'Jobs'], rows: [['Acme Analytics', '2'], ['Zeta Labs', '1']] });
  assert.deepEqual(outro, { type: 'p', lines: ['That is all.'] });
  const [h, ul, ol] = parseBlocks(ANSWERS[1]);
  assert.deepEqual(h, { type: 'h', text: 'Briefing' });
  assert.deepEqual(ul, { type: 'ul', items: ['**4 new jobs** today', 'Data Analyst leads with 3'] });
  assert.deepEqual(ol, { type: 'ol', items: ['First', 'Second'] });
  assert.equal(parseBlocks('| a |').length, 1, 'a lone "|" line is just text');
});

test('bold, code, links only to dashboard pages', () => {
  assert.deepEqual(inlineParts('**4** jobs, see [Data Analyst](/course/data-analyst?days=7) or [evil](https://evil.example) and `x`'), [
    { type: 'strong', text: '4' },
    { type: 'text', text: ' jobs, see ' },
    { type: 'link', text: 'Data Analyst', href: '/course/data-analyst?days=7' },
    { type: 'text', text: ' or ' },
    { type: 'text', text: 'evil' },
    { type: 'text', text: ' and ' },
    { type: 'code', text: 'x' },
  ]);
  assert.equal(inlineParts('[x](//evil.example)')[0].type, 'text', 'not to another site');
  assert.equal(inlineParts('[x](javascript:alert(1))')[0].type, 'text');
});
