// The entry point scripts/build-markdown.ts bundles into
// hooks/vendor/markdown.js: a CommonMark and GFM parser that gives every
// node its offsets in the source. A mod loads only its own files, so the
// parser ships as one generated file.
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";

export function parseMarkdown(markdown: string) {
  return fromMarkdown(markdown, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
}
