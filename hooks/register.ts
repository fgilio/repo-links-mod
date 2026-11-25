import type { Register } from "claude-code";

import { linkify, parseOwners } from "./linkify";

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

  on("ui.render", { component: "AssistantMessage" }, (_$, e, next) => {
    const text = linkify(e.props.text, owners);
    if (text === e.props.text) return next(e);

    return next({ ...e, props: { ...e.props, text } });
  });
};

function stringOption(value: unknown): string {
  return typeof value === "string" ? value : "";
}
