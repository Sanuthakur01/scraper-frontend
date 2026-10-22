// IJF AI's answers as blocks: a small, safe part of Markdown (paragraphs, headings, bullets, numbered
// lists, small tables). Pure, so it is tested on every half-arrived answer (the text streams in).
// components/ChatMarkdown.tsx draws the blocks; inline marks (bold, links…) are split by inlineParts.

export type Block =
  | { type: 'p'; lines: string[] }
  | { type: 'h'; text: string }
  | { type: 'ul' | 'ol'; items: string[] }
  | { type: 'table'; head: string[]; rows: string[][] };

const BULLET = /^\s*[-*•]\s+/;
const NUMBER = /^\s*\d+[.)]\s+/;
const HEADING = /^#{1,4}\s+(.*)$/;
const TABLE_RULE = /^\s*\|?[\s:-]+\|[\s|:-]*$/;

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());

export function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.trim().startsWith('|') && TABLE_RULE.test(lines[i + 1] ?? '')) {
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]));
      blocks.push({ type: 'table', head, rows });
      continue;
    }
    const heading = line.match(HEADING);
    if (heading) {
      blocks.push({ type: 'h', text: heading[1] });
      i++;
      continue;
    }
    if (BULLET.test(line) || NUMBER.test(line)) {
      const ordered = NUMBER.test(line);
      const items: string[] = [];
      while (i < lines.length && (BULLET.test(lines[i]) || NUMBER.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        if (BULLET.test(lines[i]) || NUMBER.test(lines[i])) items.push(lines[i].replace(NUMBER, '').replace(BULLET, ''));
        else items[items.length - 1] += ` ${lines[i].trim()}`;
        i++;
      }
      blocks.push({ type: ordered ? 'ol' : 'ul', items });
      continue;
    }
    // A paragraph: this line (always taken, so a half-arrived table row can't stall the loop), then
    // lines until a blank line, a list, a table or a heading.
    const para = [lines[i++]];
    while (i < lines.length && lines[i].trim() && !BULLET.test(lines[i]) && !NUMBER.test(lines[i]) && !lines[i].trim().startsWith('|') && !HEADING.test(lines[i])) para.push(lines[i++]);
    blocks.push({ type: 'p', lines: para });
  }
  return blocks;
}

export type Inline = { type: 'text' | 'strong' | 'em' | 'code'; text: string } | { type: 'link'; text: string; href: string };

const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\)|(?<![\w*])\*[^*\s][^*\n]*\*(?!\w)|(?<!\w)_[^_\s][^_\n]*_(?!\w))/g;

// Only links into the dashboard ("/course/data-analyst?days=7"); any other link is shown as its words.
export const isPage = (href: string) => href.startsWith('/') && !href.startsWith('//');

export function inlineParts(text: string): Inline[] {
  return text
    .split(INLINE)
    .filter((part) => part !== '')
    .map((part): Inline => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return { type: 'strong', text: part.slice(2, -2) };
      if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return { type: 'code', text: part.slice(1, -1) };
      const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      if (link) return isPage(link[2]) ? { type: 'link', text: link[1], href: link[2] } : { type: 'text', text: link[1] };
      if (/^[*_].+[*_]$/.test(part) && part.length > 2) return { type: 'em', text: part.slice(1, -1) };
      return { type: 'text', text: part };
    });
}
