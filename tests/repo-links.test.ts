import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";

import { linkify, parseOwners } from "../hooks/linkify";

const SURFACES = ["terminal", "desktop", "vscode", "mobile"] as const;
const ACME = parseOwners("acme", "");
const ACME_OPTIONS = { options: { defaultOwner: "acme", owners: "" } };

/**
 * Stands for the engine beneath the mod: records the text each reply block
 * reaches it with, and draws a placeholder.
 */
function recordDrawn(on: On): string[] {
  const drawn: string[] = [];
  on("ui.render", { component: "AssistantMessage" }, (engine, e) => {
    drawn.push(e.props.text);
    const { Text } = engine.ui.resolve(e);

    return Text({ children: ["engine"] });
  });

  return drawn;
}

test(
  "the reply drawn carries a link for each repo#N, on every surface",
  ACME_OPTIONS,
  async ($, on) => {
    const drawn = recordDrawn(on);

    const mounted = await Promise.all(
      SURFACES.map((surface) =>
        $.ui.mount({
          plugin: "repo-links",
          surface,
          component: "AssistantMessage",
          props: { text: "Merged api#437 and docs#522.", isFirstOfReply: true },
        }),
      ),
    );
    await Promise.all(mounted.map((ui) => ui.unmount()));

    expect(drawn).toEqual(
      SURFACES.map(
        () =>
          "Merged [api#437](https://github.com/acme/api/pull/437) and [docs#522](https://github.com/acme/docs/pull/522).",
      ),
    );
  },
);

test(
  "a reply with no reference is passed on as received",
  ACME_OPTIONS,
  async ($, on) => {
    const drawn = recordDrawn(on);

    const text = "Nothing to link: C#10, PR#5, #123.";
    const ui = await $.ui.mount({
      plugin: "repo-links",
      surface: "terminal",
      component: "AssistantMessage",
      props: { text, isFirstOfReply: false },
    });
    await ui.unmount();

    expect(drawn).toEqual([text]);
  },
);

test(
  "the owners option picks a repo's owner over the default",
  { options: { defaultOwner: "acme", owners: "tools=widgets" } },
  async ($, on) => {
    const drawn = recordDrawn(on);

    const ui = await $.ui.mount({
      plugin: "repo-links",
      surface: "terminal",
      component: "AssistantMessage",
      props: { text: "app#1 tools#2 other/xy#3", isFirstOfReply: true },
    });
    await ui.unmount();

    expect(drawn).toEqual([
      "[app#1](https://github.com/acme/app/pull/1) [tools#2](https://github.com/widgets/tools/pull/2) [other/xy#3](https://github.com/other/xy/pull/3)",
    ]);
  },
);

test("with no options, only owner/repo#N becomes a link", async ($, on) => {
  const drawn = recordDrawn(on);

  const ui = await $.ui.mount({
    plugin: "repo-links",
    surface: "terminal",
    component: "AssistantMessage",
    props: { text: "app#1 and acme/app#2", isFirstOfReply: true },
  });
  await ui.unmount();

  expect(drawn).toEqual([
    "app#1 and [acme/app#2](https://github.com/acme/app/pull/2)",
  ]);
});

test("repo#N and owner/repo#N become links", () => {
  expect(linkify("in api#103, (web-app#663) and widgets/tools#10.", ACME)).toBe(
    "in [api#103](https://github.com/acme/api/pull/103), ([web-app#663](https://github.com/acme/web-app/pull/663)) and [widgets/tools#10](https://github.com/widgets/tools/pull/10).",
  );
});

test("prose that only looks like a reference stays text", () => {
  const text =
    "the #re-mint-the-pat anchor; C#10 F#6 PR#5 step#2 #123 a/b/c#1 me@host#1 repo#12abc 2024#1";

  expect(linkify(text, ACME)).toBe(text);
});

test("code, links and URLs stay as written", () => {
  const text =
    "code `docs#1`, ``a `docs#2` b``, [docs#3](https://x), ![docs#4](https://x.png), https://github.com/a/b#5 and <https://x/y#6>";

  expect(linkify(text, ACME)).toBe(text);
});

test("fenced code stays as written, an unclosed fence to the end", () => {
  const text =
    "```\ndocs#1\n```\nafter docs#2\n~~~~\nx docs#3\n~~~\nstill docs#4\n~~~~\nout docs#5\n```js\nopen docs#6";

  expect(linkify(text, ACME)).toBe(
    "```\ndocs#1\n```\nafter [docs#2](https://github.com/acme/docs/pull/2)\n~~~~\nx docs#3\n~~~\nstill docs#4\n~~~~\nout [docs#5](https://github.com/acme/docs/pull/5)\n```js\nopen docs#6",
  );
});

test("owner pairs parse loosely, and a blank default is none", () => {
  const { defaultOwner, owners } = parseOwners(
    "  ",
    " Web-App = acme ,bad, =x,tools=widgets\n",
  );

  expect(defaultOwner).toBe(null);
  expect([...owners]).toEqual([
    ["web-app", "acme"],
    ["tools", "widgets"],
  ]);
});
