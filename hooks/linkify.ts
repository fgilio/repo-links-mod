import type { Nodes, Text } from "mdast";

import { parseMarkdown } from "./vendor/markdown.js";

/**
 * Where a bare `repo#N` points: the `owners` entry for the name, else
 * `defaultOwner`. Without either, it stays text. Keys are lower case, as
 * GitHub compares repo names.
 */
export type Owners = {
  defaultOwner: string | null;
  owners: ReadonlyMap<string, Target>;
};

/**
 * An `owners` entry: the owner, and the repo when the name written in
 * prose differs from it (`tool-lines=fgilio/tool-lines-mod`).
 */
type Target = { owner: string; repo: string | null };

/** An `owners` value: `owner`, or `owner/repo`. */
const TARGET =
  /^(?<owner>[A-Za-z0-9][A-Za-z0-9-]{0,38})(?:\/(?<repo>[A-Za-z0-9._-]{1,100}))?$/u;

/** A GitHub repository. */
export type GitHubRepo = { owner: string; repo: string };

/**
 * What a reference resolves against: the owners options, and the
 * repository of the session, where a bare `#N` points.
 */
type Context = Owners & { here: GitHubRepo | null };

/** One replacement in the source: `[start, end)` becomes `text`. */
type Edit = { start: number; end: number; text: string };

/**
 * Words that read as `word#N` in prose and are never a repo, so `PR#5` or
 * `step#2` stays text. Compared in lower case. Only a bare `repo#N` that
 * falls back to the default owner is held to them.
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
 * A URL kept as written: any scheme followed by `//`, a scheme that takes
 * none (`mailto:`, `data:`, ...), or a `www.` literal. Matched on the whole
 * source, since a URL can span several nodes (`file:///a/~b~` holds a
 * strikethrough). It ends at whitespace, `<`, `>` or a table's `|`, and the
 * scheme's length is bounded so a long word scans in linear time.
 */
const URL =
  /(?<![A-Za-z0-9+.-])(?:[A-Za-z][A-Za-z0-9+.-]{0,31}:\/\/|(?:mailto|data|tel|urn|sms|magnet|news|xmpp):|www\.)[^\s<>|]*/giu;

/**
 * A GitHub reference: `repo#N` or `owner/repo#N`.
 *
 * - Lookbehind: no letter, digit, `_`, `.`, `/`, `#`, `@`, `\` or `-`
 *   before it, so `café#1`, `a/b/c#1`, `me@host#1` and `C:\src\api#1` stay
 *   text.
 * - The owner follows GitHub's rule: letters, digits and hyphens.
 * - A repo may start with `-`, which `linkFor` allows only after an owner.
 * - Lookahead: the number ends the token, so `repo#12abc`, `api#1@host`
 *   and `api#1.5` stay text.
 * - Every quantifier is bounded, so the scan stays linear.
 */
const REFERENCE =
  /(?<![\p{L}\p{N}_./#@\\-])(?:(?<owner>[A-Za-z0-9][A-Za-z0-9-]{0,38})\/)?(?<repo>[A-Za-z0-9._-]{1,100})#(?<number>\d{1,9})(?![\p{L}\p{N}_@-]|\.\d)|(?<![\p{L}\p{N}_./#@\\&-])#(?<bare>\d{1,9})(?![\p{L}\p{N}_@-]|\.\d)/gu;

/**
 * Words after which a bare `#N` is a count or a rank, not a pull request:
 * "Option #1", "step #2", "color #333". Compared in any case, with an
 * optional `.` and whitespace between the word and the `#`.
 */
const PROSE_BEFORE_BARE =
  /(?:^|[^\p{L}\p{N}])(?:chapter|color|colour|day|item|items|level|no|nr|num|number|option|options|page|part|phase|priority|rank|ranked|round|section|step|steps|task|tier|top|version|week)\.?\s*$/iu;

/**
 * A GitHub remote as git writes it: `git@github.com:owner/repo.git`,
 * `ssh://git@github.com/owner/repo` or `https://github.com/owner/repo.git`.
 */
const GITHUB_REMOTE =
  /^(?:https?:\/\/(?:[^@/]+@)?github\.com\/|(?:ssh:\/\/)?git@github\.com[:/])(?<owner>[A-Za-z0-9][A-Za-z0-9-]{0,38})\/(?<repo>[A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?$/u;

/**
 * Nodes whose text stays as written: code, HTML, existing links and images,
 * reference definitions, and references to them.
 */
const KEPT_NODES = new Set<Nodes["type"]>([
  "code",
  "definition",
  "html",
  "image",
  "imageReference",
  "inlineCode",
  "link",
  "linkReference",
]);

/**
 * Inline HTML elements whose content stays as written, between an opening
 * and a closing tag in the same paragraph.
 */
const KEPT_ELEMENTS = new Set(["a", "code", "kbd", "pre", "samp", "tt", "var"]);

/** Nodes whose children are phrasing: text, inline code, inline HTML. */
const PHRASING_PARENTS = new Set<Nodes["type"]>([
  "delete",
  "emphasis",
  "heading",
  "paragraph",
  "strong",
  "tableCell",
]);

/**
 * The name of an HTML tag, read from its start: the parser already found
 * where the tag ends, a quoted `>` in an attribute included.
 */
const HTML_TAG = /^<(?<closing>\/)?(?<name>[A-Za-z][A-Za-z0-9-]*)/u;

/**
 * Reads the two options: a default owner, and `name=owner` or
 * `name=owner/repo` pairs separated by commas or newlines. A pair needs
 * exactly one `=`, a name, and a valid owner, or it is skipped.
 */
export function parseOwners(defaultOwner: string, pairs: string): Owners {
  const owners = new Map<string, Target>();

  for (const pair of pairs.split(/[,\n]/)) {
    const parts = pair.split("=").map((part) => part.trim());
    const [name, value = ""] = parts;
    const target = TARGET.exec(value)?.groups;
    if (parts.length === 2 && name && target?.["owner"] !== undefined) {
      owners.set(name.toLowerCase(), {
        owner: target["owner"],
        repo: target["repo"] ?? null,
      });
    }
  }

  return { defaultOwner: defaultOwner.trim() || null, owners };
}

/** The GitHub repository a git remote URL names, or null for any other. */
export function githubRepoOf(remote: string | null): GitHubRepo | null {
  const groups = GITHUB_REMOTE.exec(remote?.trim() ?? "")?.groups;
  const owner = groups?.["owner"];
  const repo = groups?.["repo"];

  return owner !== undefined && repo !== undefined ? { owner, repo } : null;
}

/**
 * The URL for a reference. GitHub sends `/pull/N` on to `/issues/N` when N
 * is an issue, so one URL serves both.
 */
function urlFor(owner: string, repo: string, number: string): string {
  return `https://github.com/${owner}/${repo}/pull/${number}`;
}

/**
 * Turns each `repo#N` and `owner/repo#N` in the text of a markdown document
 * into a link to it. Only text the parser reads as prose changes: code, HTML,
 * links, images, definitions and URLs stay as written, and so does every
 * byte outside the references.
 */
export function linkify(
  markdown: string,
  owners: Owners,
  here: GitHubRepo | null = null,
): string {
  // No reference without a `#` before a digit: skip the parse, which costs
  // milliseconds on a long reply.
  if (!/#\d/.test(markdown)) return markdown;
  // The parser drops a leading byte-order mark before it counts offsets.
  if (markdown.startsWith("\uFEFF")) {
    return `\uFEFF${linkify(markdown.slice(1), owners, here)}`;
  }

  const edits: Edit[] = [];
  collect(parseMarkdown(markdown), markdown, { ...owners, here }, edits);

  let linked = "";
  let from = 0;
  for (const { start, end, text } of outsideUrls(edits, markdown)) {
    linked += markdown.slice(from, start) + text;
    from = end;
  }

  return linked + markdown.slice(from);
}

/**
 * The edits that overlap no URL. Both lists run in source order, so one
 * pass over each keeps it linear.
 */
function outsideUrls(edits: readonly Edit[], markdown: string): Edit[] {
  const urls = [...markdown.matchAll(URL)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
  let next = 0;

  return edits.filter((edit) => {
    while (next < urls.length && (urls[next]?.end ?? 0) <= edit.start) next++;
    const url = urls[next];
    return url === undefined || url.start >= edit.end;
  });
}

/** Walks the tree in source order, adding an edit for each reference. */
function collect(
  node: Nodes,
  markdown: string,
  context: Context,
  edits: Edit[],
): void {
  if (KEPT_NODES.has(node.type)) return;
  if (node.type === "text") {
    edits.push(...editsIn(node, markdown, context));
    return;
  }
  if (!("children" in node)) return;

  // Open inline elements whose content stays as written, by name. Only
  // phrasing holds inline HTML: a block of HTML is one node of its own.
  const open = new Map<string, number>();
  const isPhrasing = PHRASING_PARENTS.has(node.type);
  for (const child of node.children) {
    if (child.type === "html" && isPhrasing) {
      track(open, child.value);
      continue;
    }
    if (open.size > 0) continue;
    collect(child, markdown, context, edits);
  }
}

/** Counts an inline HTML tag in or out of the open kept elements. */
function track(open: Map<string, number>, tag: string): void {
  const trimmed = tag.trim();
  const groups = HTML_TAG.exec(trimmed)?.groups;
  const name = groups?.["name"]?.toLowerCase();
  if (
    name === undefined ||
    !KEPT_ELEMENTS.has(name) ||
    trimmed.endsWith("/>")
  ) {
    return;
  }

  const depth = (open.get(name) ?? 0) + (groups?.["closing"] ? -1 : 1);
  if (depth > 0) open.set(name, depth);
  else open.delete(name);
}

/** The edits for the references in one text node, read from its source. */
function editsIn(node: Text, markdown: string, context: Context): Edit[] {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) return [];

  const edits: Edit[] = [];
  for (const match of markdown.slice(start, end).matchAll(REFERENCE)) {
    const before = markdown.slice(start, start + match.index);
    const link = linkFor(match[0], match.groups ?? {}, before, context);
    if (link === null) continue;

    const at = start + match.index;
    // `!` before `[` would make the link an image, so it is escaped,
    // unless an odd run of backslashes already escapes it.
    const isBang =
      at > start &&
      markdown[at - 1] === "!" &&
      (/\\*$/u.exec(markdown.slice(start, at - 1))?.[0].length ?? 0) % 2 === 0;
    edits.push({
      start: isBang ? at - 1 : at,
      end: at + match[0].length,
      text: isBang ? `\\!${link}` : link,
    });
  }

  return edits;
}

/** The markdown link for one match, or null to leave it as written. */
function linkFor(
  match: string,
  { owner, repo, number, bare }: Record<string, string | undefined>,
  before: string,
  { defaultOwner, owners, here }: Context,
): string | null {
  if (bare !== undefined) {
    if (here === null || PROSE_BEFORE_BARE.test(before)) return null;
    return `[${match}](${urlFor(here.owner, here.repo, bare)})`;
  }
  if (repo === undefined || number === undefined) return null;
  // GitHub allows a leading `-`, but in prose `-api#1` is a dash and a word.
  if (owner === undefined && repo.startsWith("-")) return null;

  if (owner !== undefined) {
    return `[${match}](${urlFor(owner, repo, number)})`;
  }

  const listed = owners.get(repo.toLowerCase());
  if (listed !== undefined) {
    return `[${match}](${urlFor(listed.owner, listed.repo ?? repo, number)})`;
  }

  const guessed = guess(repo, defaultOwner);
  if (guessed === null) return null;

  return `[${match}](${urlFor(guessed, repo, number)})`;
}

/**
 * The default owner for a bare `repo#N` that reads as a repo: two or more
 * characters, a letter among them, and no prose word.
 */
function guess(repo: string, defaultOwner: string | null): string | null {
  const isRepo =
    repo.length >= 2 &&
    /[A-Za-z]/.test(repo) &&
    !NOT_REPOS.has(repo.toLowerCase());

  return isRepo ? defaultOwner : null;
}
