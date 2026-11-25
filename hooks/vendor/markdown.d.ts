import type { Root } from "mdast";

/**
 * Parses CommonMark with GFM (tables, autolink literals, footnotes,
 * strikethrough, task lists) into mdast, every node with its offsets in
 * `markdown`. Generated: see scripts/build-markdown.ts.
 */
export function parseMarkdown(markdown: string): Root;
