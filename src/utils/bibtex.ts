export interface Author {
    first: string;
    last: string;
}

export interface BibEntry {
    type: string;
    key: string;
    fields: Record<string, string>;
    authors: Author[];
    /** The exact source text of this entry, from `@type{` to its closing
     *  `}` — used to show/copy the real BibTeX instead of a reconstruction
     *  that only knows about a handful of fields. */
    raw: string;
}

export function parseBibTeX(input: string): BibEntry[] {
    const entries: BibEntry[] = [];
    const rawEntries = input.split(/@(\w+)\s*\{/g).slice(1);

    for (let i = 0; i < rawEntries.length; i += 2) {
        const type = rawEntries[i].trim();
        const body = rawEntries[i+1];
        if (!body) continue;

        const keyMatch = body.match(/^\s*([^,]+),/);
        const key = keyMatch ? keyMatch[1].trim() : 'unknown';

        // The opening `{` right after `@type` was already consumed by the
        // split above, so `body` starts at depth 1 — scan for the matching
        // closing brace to recover exactly this entry's source text, rather
        // than guessing where it ends.
        let depth = 1;
        let closeIndex = body.length;
        for (let pos = 0; pos < body.length; pos++) {
            const char = body[pos];
            if (char === '{') depth++;
            else if (char === '}') {
                depth--;
                if (depth === 0) {
                    closeIndex = pos;
                    break;
                }
            }
        }
        const raw = `@${type}{${body.slice(0, closeIndex + 1)}`;

        const fields: Record<string, string> = { title: "Untitled", year: "0000" };

        const fieldRegex = /(\w+)\s*=\s*(?:\{((?:[^{}]|{[^{}]*})*)\}|"((?:[^"]|\\")*)"|(\d+))/g;

        let match;
        while ((match = fieldRegex.exec(body)) !== null) {
            const fieldKey = match[1].toLowerCase();
            const val = match[2] || match[3] || match[4] || "";
            fields[fieldKey] = val.replace(/\s+/g, ' ').trim();
        }

        let authors: Author[] = [];
        if (fields.author) {
            authors = fields.author.split(/\s+and\s+/i).map(str => {
                const parts = str.split(',');
                if (parts.length > 1) {
                    return { first: parts[1].trim(), last: parts[0].trim() };
                } else {
                    const names = str.trim().split(' ');
                    const last = names.pop() || "";
                    const first = names.join(' ');
                    return { first, last };
                }
            });
        }

        entries.push({ type, key, fields, authors, raw: raw.trim() });
    }
    return entries;
}

export function formatAuthor(auth: Author) {
    return auth.first ? `${auth.first} ${auth.last}` : auth.last;
}

// A stable, URL-safe anchor per entry (from its citation key, which is
// already unique) — shared by the Publications page (which sets this as
// each entry's id) and anywhere else that links to a specific entry (e.g.
// the homepage's "Latest Publications"), so the two never drift apart.
export function slugForEntry(entry: BibEntry): string {
    return entry.key.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Sorting by `year` alone leaves same-year entries in whatever order they
// happen to appear in the .bib file, not chronological order — a talk in
// August would sort however it fell relative to a December paper, purely by
// coincidence. Prefer the full `date` field (YYYY-MM-DD) when present, and
// only fall back to Jan 1 of `year` for entries that don't have one.
export function publicationDate(entry: BibEntry): Date {
    const dateStr = entry.fields.date;
    if (dateStr) {
        const parsed = new Date(dateStr);
        if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    const year = parseInt(entry.fields.year, 10);
    return new Date(Number.isNaN(year) ? 0 : year, 0, 1);
}

export function sortByDateDesc(entries: BibEntry[]): BibEntry[] {
    return [...entries].sort((a, b) => publicationDate(b).getTime() - publicationDate(a).getTime());
}

// A manual `tags = {journal}` (or `tags = {conference, workshop}`) field —
// unlike `keywords` (topical, drives the filterable keyword cloud), this is
// for a small set of labels describing what kind of publication this is,
// shown as plain badges next to the PDF/DOI/BibTeX links.
export function parseTags(entry: BibEntry): string[] {
    if (!entry.fields.tags) return [];
    return entry.fields.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
}

// A manual `awards = {Best paper}` (or `awards = {Best paper, Audience choice}`)
// field — rendered as its own (pink) badge, ahead of the tags, so a
// recognition like this stands out from the plain type labels.
export function parseAwards(entry: BibEntry): string[] {
    if (!entry.fields.awards) return [];
    return entry.fields.awards
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean);
}

export function parseKeywords(entry: BibEntry): string[] {
    if (!entry.fields.keywords) return [];
    return entry.fields.keywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
}
