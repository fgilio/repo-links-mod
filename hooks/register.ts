import type { EngineInterface, Register } from "claude-code";

import { type GitHubRepo, githubRepoOf, linkify, parseOwners } from "./linkify";

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
  const linksSessionRepo = options["sessionRepo"] !== false;
  // Insertion order is recency order: a hit moves to the end, and the
  // oldest entry goes first.
  const cache = new Map<string, string>();

  const linked = (text: string, here: GitHubRepo | null): string => {
    // A bare #N reads differently in another repo, so the repo is in the key.
    const key = `${here === null ? "" : `${here.owner}/${here.repo}`}\0${text}`;
    const hit = cache.get(key);
    if (hit !== undefined) {
      cache.delete(key);
      cache.set(key, hit);
      return hit;
    }

    const result = linkify(text, owners, here);
    cache.set(key, result);
    if (cache.size > CACHE_SIZE) {
      const oldest = cache.keys().next();
      if (oldest.done !== true) cache.delete(oldest.value);
    }
    return result;
  };

  on("ui.render", { component: "AssistantMessage" }, async ($, e, next) => {
    const here = linksSessionRepo ? await sessionRepo($) : null;
    const text = linked(e.props.text, here);
    if (text === e.props.text) return next(e);

    return next({ ...e, props: { ...e.props, text } });
  });
};

/**
 * The GitHub repository of the session's folder, where a bare `#N` points;
 * null outside a git repository or for a remote on another host.
 */
async function sessionRepo($: EngineInterface): Promise<GitHubRepo | null> {
  const repo = await $.session.repo().catch(() => null);

  return githubRepoOf(repo?.remote ?? null);
}

function stringOption(value: unknown): string {
  return typeof value === "string" ? value : "";
}
