// The entry point scripts/build-markdown.ts bundles into
// hooks/vendor/markdown.js: a CommonMark and GFM parser that gives every
// node its offsets in the source. A mod loads only its own files, so the
// parser ships as one generated file.
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";

/**
 * GFM without its tree transforms. The autolink literal transform splits
 * text nodes after parsing and leaves the new nodes without source
 * positions, so the mod could not edit them. The tokenizer still finds
 * every literal it can, with positions; linkify keeps the rest of the URLs
 * it scans as written.
 */
const mdastExtensions = gfmFromMarkdown().map(
  ({ transforms: _transforms, ...extension }) => extension,
);

export function parseMarkdown(markdown: string) {
  return fromMarkdown(markdown, { extensions: [gfm()], mdastExtensions });
}
