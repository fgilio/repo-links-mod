import type { Register } from "claude-code";

import { linkify, parseOwners } from "./linkify";

/**
 * How many reply blocks keep their linked text. The hook runs again for a
 * block on every redraw (a scroll, a resize), and parsing a long reply each
 * time would cost more than looking it up.
 */
const CACHE_SIZE = 500;

/**
 * Links each `repo#N` in Claude's replies to its GitHub pull request or
 * issue. The rewrite changes the drawing only: the stored message, `/copy`
 * and ctrl+o keep the text as Claude wrote it.
 */
export const register: Register = (on, options) => {
  const owners = parseOwners(
    stringOption(options["defaultOwner"]),
    stringOption(options["owners"]),
  );
  // Insertion order is recency order: a hit moves to the end, and the
  // oldest entry goes first.
  const cache = new Map<string, string>();

  const linked = (text: string): string => {
    const hit = cache.get(text);
    if (hit !== undefined) {
      cache.delete(text);
      cache.set(text, hit);
      return hit;
    }

    const result = linkify(text, owners);
    cache.set(text, result);
    if (cache.size > CACHE_SIZE) {
      const oldest = cache.keys().next();
      if (oldest.done !== true) cache.delete(oldest.value);
    }
    return result;
  };

  on("ui.render", { component: "AssistantMessage" }, (_$, e, next) => {
    const text = linked(e.props.text);
    if (text === e.props.text) return next(e);

    return next({ ...e, props: { ...e.props, text } });
  });
};

function stringOption(value: unknown): string {
  return typeof value === "string" ? value : "";
}
