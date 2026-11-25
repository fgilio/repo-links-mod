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

test(
  "a rewrite keeps the props it does not change",
  ACME_OPTIONS,
  async ($, on) => {
    const drawn: unknown[] = [];
    on("ui.render", { component: "AssistantMessage" }, (engine, e) => {
      drawn.push(e.props);
      const { Text } = engine.ui.resolve(e);

      return Text({ children: ["engine"] });
    });

    const ui = await $.ui.mount({
      plugin: "repo-links",
      surface: "terminal",
      component: "AssistantMessage",
      props: {
        text: "api#1",
        isFirstOfReply: false,
        isSummary: true,
        onScreen: null,
      },
    });
    await ui.unmount();

    expect(drawn).toEqual([
      {
        text: "[api#1](https://github.com/acme/api/pull/1)",
        isFirstOfReply: false,
        isSummary: true,
        onScreen: null,
      },
    ]);
  },
);

test("repo#N and owner/repo#N become links", () => {
  expect(linkify("in api#103, (web-app#663) and widgets/tools#10.", ACME)).toBe(
    "in [api#103](https://github.com/acme/api/pull/103), ([web-app#663](https://github.com/acme/web-app/pull/663)) and [widgets/tools#10](https://github.com/widgets/tools/pull/10).",
  );
});

test("prose that only looks like a reference stays text", () => {
  for (const text of [
    "the #re-mint-the-pat anchor; C#10 F#6 PR#5 step#2 #123",
    "a/b/c#1 me@host#1 repo#12abc 2024#1 api#1.5",
    "api#1@example.org",
    "C:\\src\\api#1",
    "\\api#1",
    "caféapi#3",
  ]) {
    expect(linkify(text, ACME)).toBe(text);
  }
});

test("a qualified or configured repo skips the prose filters", () => {
  expect(linkify("acme/step#2 acme/123#2 acme/r#2", parseOwners("", ""))).toBe(
    "[acme/step#2](https://github.com/acme/step/pull/2) [acme/123#2](https://github.com/acme/123/pull/2) [acme/r#2](https://github.com/acme/r/pull/2)",
  );
  expect(linkify("step#2", parseOwners("", "step=acme"))).toBe(
    "[step#2](https://github.com/acme/step/pull/2)",
  );
});

test("a reference inside emphasis, a heading, a list or a table cell links", () => {
  expect(linkify("_api#1 is ready_ and **api#2**", ACME)).toBe(
    "_[api#1](https://github.com/acme/api/pull/1) is ready_ and **[api#2](https://github.com/acme/api/pull/2)**",
  );
  expect(linkify("# Heading api#1\n- item\n  - nested docs#2", ACME)).toBe(
    "# Heading [api#1](https://github.com/acme/api/pull/1)\n- item\n  - nested [docs#2](https://github.com/acme/docs/pull/2)",
  );
  expect(
    linkify("| URL | Ref |\n|---|---|\n|https://example.com|acme/api#1|", ACME),
  ).toBe(
    "| URL | Ref |\n|---|---|\n|https://example.com|[acme/api#1](https://github.com/acme/api/pull/1)|",
  );
});

test("a link after ! stays a link, not an image", () => {
  expect(linkify("!api#1", ACME)).toBe(
    "\\![api#1](https://github.com/acme/api/pull/1)",
  );
});

test("code, links, references, HTML and URLs stay as written", () => {
  for (const text of [
    "code `docs#1`, ``a `docs#2` b``, [docs#3](https://x), ![docs#4](https://x.png), https://github.com/a/b#5 and <https://x/y#6>",
    "[docs#1][guide]\n\n[guide]: /manual",
    "[guide]: api#1",
    "[docs#1 [FAQ]](/guide)",
    '[guide](doc(a) "api#1")',
    '<a title="api#1">guide</a>',
    "<div>\napi#1\n</div>",
    "ftp://host/path?q=api#1",
    "    api#1",
    "> ~~~\n> api#1\n> ~~~",
  ]) {
    expect(linkify(text, ACME)).toBe(text);
  }
  expect(linkify("x <code>api#1</code> y api#2", ACME)).toBe(
    "x <code>api#1</code> y [api#2](https://github.com/acme/api/pull/2)",
  );
});

test("a code span needs matching backtick runs", () => {
  expect(linkify("a `` see acme/api#1 `", ACME)).toBe(
    "a `` see [acme/api#1](https://github.com/acme/api/pull/1) `",
  );
});

test("fenced code stays as written, an unclosed fence to the end", () => {
  const text =
    "```\ndocs#1\n```\nafter docs#2\n~~~~\nx docs#3\n~~~\nstill docs#4\n~~~~\nout docs#5\n```js\nopen docs#6";

  expect(linkify(text, ACME)).toBe(
    "```\ndocs#1\n```\nafter [docs#2](https://github.com/acme/docs/pull/2)\n~~~~\nx docs#3\n~~~\nstill docs#4\n~~~~\nout [docs#5](https://github.com/acme/docs/pull/5)\n```js\nopen docs#6",
  );
});

test("CRLF lines and inline backtick runs close their fences", () => {
  expect(linkify("~~~\r\ncode\r\n~~~\r\nacme/api#1", ACME)).toBe(
    "~~~\r\ncode\r\n~~~\r\n[acme/api#1](https://github.com/acme/api/pull/1)",
  );
  expect(linkify("```` ``` example ``` ````\n\nacme/api#2", ACME)).toBe(
    "```` ``` example ``` ````\n\n[acme/api#2](https://github.com/acme/api/pull/2)",
  );
});

/** How long linkify takes on a run of unmatched `[` before a reference. */
function timeFor(brackets: number): number {
  const text = `${"[".repeat(brackets)} api#1`;
  const start = performance.now();
  linkify(text, ACME);
  return performance.now() - start;
}

test("time grows linearly with unmatched brackets", () => {
  timeFor(1000);

  // Quadratic growth makes 8x the input take 64x the time. Linear growth
  // takes about 8x; 24x leaves room for a noisy machine.
  expect(timeFor(64_000) / Math.max(timeFor(8000), 1) < 24).toBe(true);
});

test("a URL keeps its text across nodes, with or without //", () => {
  for (const text of [
    "file:///tmp/~acme/api#12~",
    "data:text/plain,api#1",
    "mailto:api#1",
    "[www.example.com/api#1]",
    "ftp://host/_api#1_",
  ]) {
    expect(linkify(text, ACME)).toBe(text);
  }
  expect(linkify("See [www.example.com] for acme/api#1", ACME)).toBe(
    "See [www.example.com] for [acme/api#1](https://github.com/acme/api/pull/1)",
  );
});

test("a leading byte-order mark keeps the offsets right", () => {
  expect(linkify("\uFEFFacme/api#12", ACME)).toBe(
    "\uFEFF[acme/api#12](https://github.com/acme/api/pull/12)",
  );
});

test("a repo may start with - after an owner only", () => {
  expect(linkify("acme/-docs#12 and -docs#3", ACME)).toBe(
    "[acme/-docs#12](https://github.com/acme/-docs/pull/12) and -docs#3",
  );
});

test("an escaped ! is not escaped again", () => {
  expect(linkify("\\!api#1", ACME)).toBe(
    "\\![api#1](https://github.com/acme/api/pull/1)",
  );
  expect(linkify("\\\\!api#1", ACME)).toBe(
    "\\\\\\![api#1](https://github.com/acme/api/pull/1)",
  );
});

test("an inline element's content stays as written, a quoted > in a tag included", () => {
  for (const text of [
    'See <a title="1 > 0" href="/guide">acme/api#1</a>',
    'x <code title=">">api#1</code>',
  ]) {
    expect(linkify(text, ACME)).toBe(text);
  }
});

test("text with no # before a digit is returned without a parse", () => {
  const text = "# Heading\n\n| a | b |\n|---|---|\n| c | d |";

  expect(linkify(text, ACME)).toBe(text);
});

test("an owner pair needs exactly one =", () => {
  expect([...parseOwners("", "api=one=two").owners]).toEqual([]);
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
