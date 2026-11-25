import type { Nodes, Text } from "mdast";

import { parseMarkdown } from "./vendor/markdown.js";

/**
 * Who owns a repo: the `owners` entry for it, else `defaultOwner`. Without
 * either, a bare `repo#N` stays text. Keys are lower case, as GitHub
 * compares repo names.
 */
export type Owners = {
  defaultOwner: string | null;
  owners: ReadonlyMap<string, string>;
};

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
 * A URL with any scheme, kept as written. The parser already makes links of
 * `http`, `https` and `www.` literals; this covers `ftp://`, `ssh://` and the
 * rest. The scheme's length is bounded so a long word scans in linear time.
 */
const SCHEME_URL = /[A-Za-z][A-Za-z0-9+.-]{0,31}:\/\/\S*/u.source;

/**
 * A GitHub reference: `repo#N` or `owner/repo#N`.
 *
 * - Lookbehind: no letter, digit, `_`, `.`, `/`, `#`, `@`, `\` or `-`
 *   before it, so `café#1`, `a/b/c#1`, `me@host#1` and `C:\src\api#1` stay
 *   text.
 * - The owner follows GitHub's rule: letters, digits and hyphens.
 * - Lookahead: the number ends the token, so `repo#12abc`, `api#1@host`
 *   and `api#1.5` stay text.
 * - Every quantifier is bounded, so the scan stays linear.
 */
const REFERENCE =
  /(?<![\p{L}\p{N}_./#@\\-])(?:(?<owner>[A-Za-z0-9][A-Za-z0-9-]{0,38})\/)?(?<repo>[A-Za-z0-9._][A-Za-z0-9._-]{0,99})#(?<number>\d{1,9})(?![\p{L}\p{N}_@-]|\.\d)/u
    .source;

const SCAN = new RegExp(`(?<kept>${SCHEME_URL})|${REFERENCE}`, "gu");

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

const HTML_TAG =
  /^<(?<closing>\/)?(?<name>[A-Za-z][A-Za-z0-9-]*)\b[^>]*?(?<selfClosing>\/)?>$/u;

/**
 * Reads the two options: a default owner, and `repo=owner` pairs separated
 * by commas or newlines. A pair needs exactly one `=` and both sides, or it
 * is skipped.
 */
export function parseOwners(defaultOwner: string, pairs: string): Owners {
  const owners = new Map<string, string>();

  for (const pair of pairs.split(/[,\n]/)) {
    const parts = pair.split("=").map((part) => part.trim());
    const [repo, owner] = parts;
    if (parts.length === 2 && repo && owner) {
      owners.set(repo.toLowerCase(), owner);
    }
  }

  return { defaultOwner: defaultOwner.trim() || null, owners };
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
export function linkify(markdown: string, owners: Owners): string {
  if (!markdown.includes("#")) return markdown;

  const edits: Edit[] = [];
  collect(parseMarkdown(markdown), markdown, owners, edits);

  let linked = "";
  let from = 0;
  for (const { start, end, text } of edits) {
    linked += markdown.slice(from, start) + text;
    from = end;
  }

  return linked + markdown.slice(from);
}

/** Walks the tree in source order, adding an edit for each reference. */
function collect(
  node: Nodes,
  markdown: string,
  owners: Owners,
  edits: Edit[],
): void {
  if (KEPT_NODES.has(node.type)) return;
  if (node.type === "text") {
    edits.push(...editsIn(node, markdown, owners));
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
    collect(child, markdown, owners, edits);
  }
}

/** Counts an inline HTML tag in or out of the open kept elements. */
function track(open: Map<string, number>, tag: string): void {
  const groups = HTML_TAG.exec(tag.trim())?.groups;
  const name = groups?.["name"]?.toLowerCase();
  if (
    name === undefined ||
    !KEPT_ELEMENTS.has(name) ||
    groups?.["selfClosing"]
  ) {
    return;
  }

  const depth = (open.get(name) ?? 0) + (groups?.["closing"] ? -1 : 1);
  if (depth > 0) open.set(name, depth);
  else open.delete(name);
}

/** The edits for the references in one text node, read from its source. */
function editsIn(node: Text, markdown: string, owners: Owners): Edit[] {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) return [];

  const edits: Edit[] = [];
  for (const match of markdown.slice(start, end).matchAll(SCAN)) {
    const link = linkFor(match[0], match.groups ?? {}, owners);
    if (link === null) continue;

    const at = start + match.index;
    // `!` before `[` would make the link an image, so it is escaped.
    const isBang = at > start && markdown[at - 1] === "!";
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
  { kept, owner, repo, number }: Record<string, string | undefined>,
  { defaultOwner, owners }: Owners,
): string | null {
  if (kept !== undefined || repo === undefined || number === undefined) {
    return null;
  }

  const resolved =
    owner ?? owners.get(repo.toLowerCase()) ?? guess(repo, defaultOwner);
  if (resolved === null) return null;

  return `[${match}](${urlFor(resolved, repo, number)})`;
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
