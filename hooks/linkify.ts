/**
 * Who owns a repo: the `owners` entry for it, else `defaultOwner`. Without
 * either, a bare `repo#N` stays text. Keys are lower case, as GitHub
 * compares repo names.
 */
export type Owners = {
  defaultOwner: string | null;
  owners: ReadonlyMap<string, string>;
};

/**
 * Words that read as `word#N` in prose and are never a repo, so `PR#5` or
 * `step#2` stays text. Compared in lower case.
 */
const NOT_REPOS = new Set([
  "bug",
  "case",
  "issue",
  "issues",
  "item",
  "mr",
  "no",
  "nr",
  "num",
  "number",
  "page",
  "part",
  "phase",
  "pr",
  "prs",
  "pull",
  "round",
  "step",
  "task",
  "ticket",
  "version",
]);

/**
 * A GitHub reference: `repo#N` or `owner/repo#N`.
 *
 * - Lookbehind: no word, path, `#`, `@` or `.` before it, so `a/b/c#1`,
 *   `me@host#1` and `x.repo#1` stay text.
 * - The owner follows GitHub's rule: letters, digits and hyphens.
 * - The repo needs two characters, so `C#10` and `F#6` stay text.
 * - Lookahead: the number ends the token, so `repo#12abc` stays text.
 */
const REFERENCE =
  /(?<![\w./#@-])(?:(?<owner>[A-Za-z0-9][A-Za-z0-9-]{0,38})\/)?(?<repo>[A-Za-z0-9._-]{2,100})#(?<number>\d{1,9})(?![\w-])/;

/**
 * Spans whose text stays as written: inline code, a markdown link or image,
 * an autolink and a bare URL. Each is matched before a reference that starts
 * inside it, so `[app#5](…)` and `https://x/y#5` are left alone.
 */
const PROTECTED = [
  /(?<tick>`+)[^`][\s\S]*?(?<!`)\k<tick>(?!`)/.source,
  /!?\[[^\]\n]*\]\([^)\n]*\)/.source,
  /<[A-Za-z][A-Za-z0-9+.-]*:[^\s>]*>/.source,
  /\b(?:https?|file):\/\/[^\s<>]+/.source,
];

const INLINE = new RegExp(
  `(?<kept>${PROTECTED.map((p) => `(?:${p})`).join("|")})|${REFERENCE.source}`,
  "g",
);

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;

/**
 * Reads the two options: a default owner, and `repo=owner` pairs separated
 * by commas or newlines. Blank and malformed pairs are skipped.
 */
export function parseOwners(defaultOwner: string, pairs: string): Owners {
  const owners = new Map<string, string>();

  for (const pair of pairs.split(/[,\n]/)) {
    const [repo, owner] = pair.split("=").map((part) => part.trim());
    if (repo && owner) owners.set(repo.toLowerCase(), owner);
  }

  return { defaultOwner: defaultOwner.trim() || null, owners };
}

/**
 * The URL for a reference. GitHub sends `/pull/N` on to `/issues/N` when N
 * is an issue, so one URL serves both.
 */
export function urlFor(owner: string, repo: string, number: string): string {
  return `https://github.com/${owner}/${repo}/pull/${number}`;
}

/**
 * Turns each `repo#N` and `owner/repo#N` in markdown into a link to it, and
 * leaves code, links and URLs as written.
 */
export function linkify(markdown: string, owners: Owners): string {
  if (!markdown.includes("#")) return markdown;

  return splitFences(markdown)
    .map((chunk) =>
      chunk.isCode ? chunk.text : linkifyProse(chunk.text, owners),
    )
    .join("");
}

function linkifyProse(text: string, owners: Owners): string {
  let linked = "";
  let from = 0;

  for (const match of text.matchAll(INLINE)) {
    const link = linkFor(match[0], match.groups ?? {}, owners);
    if (link === null) continue;

    linked += text.slice(from, match.index) + link;
    from = match.index + match[0].length;
  }

  return linked + text.slice(from);
}

/** The markdown link for one match, or null to leave it as written. */
function linkFor(
  match: string,
  { kept, owner, repo, number }: Record<string, string | undefined>,
  { defaultOwner, owners }: Owners,
): string | null {
  if (kept !== undefined || repo === undefined || number === undefined) {
    return null;
  }
  if (!/[A-Za-z]/.test(repo) || NOT_REPOS.has(repo.toLowerCase())) return null;

  const resolved = owner ?? owners.get(repo.toLowerCase()) ?? defaultOwner;
  if (resolved === null) return null;

  return `[${match}](${urlFor(resolved, repo, number)})`;
}

type Chunk = { text: string; isCode: boolean };

/**
 * Splits markdown into prose and fenced code, line by line. A fence closes on
 * a line of the same character, at least as long; an unclosed fence (a reply
 * still streaming) runs to the end.
 */
function splitFences(markdown: string): Chunk[] {
  const chunks: Chunk[] = [];
  let fence: { char: string; length: number } | null = null;
  let current = "";

  const flush = (isCode: boolean) => {
    if (current) chunks.push({ text: current, isCode });
    current = "";
  };

  for (const line of markdown.split(/(?<=\n)/)) {
    if (fence === null) {
      const marker = FENCE_OPEN.exec(line)?.[1];
      if (marker !== undefined) {
        flush(false);
        fence = { char: marker.charAt(0), length: marker.length };
      }
      current += line;
      continue;
    }

    current += line;
    const marker = FENCE_CLOSE.exec(line.replace(/\n$/, ""))?.[1];
    if (
      marker !== undefined &&
      marker.charAt(0) === fence.char &&
      marker.length >= fence.length
    ) {
      flush(true);
      fence = null;
    }
  }

  flush(fence !== null);

  return chunks;
}
