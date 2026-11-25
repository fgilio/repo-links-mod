# repo-links

A [Claude Code](https://code.claude.com) mod that turns GitHub references in Claude's replies into links. With `acme` as the default owner, `api#103` links to `https://github.com/acme/api/pull/103`, and `widgets/tools#10` to that repo's pull request. GitHub sends `/pull/N` on to `/issues/N` when N is an issue, so one link serves both.

```text
● Merged api#437 and widgets/tools#10.
         ‾‾‾‾‾‾‾     ‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾ links
```

## What it links

- `owner/repo#N`: that owner's repo. Always, with no setup.
- `repo#N`: the owner the `owners` option names for the repo, else the default owner. With neither, it stays text.

## What it leaves as text

- Inline code, fenced code, markdown links and images, autolinks and bare URLs.
- One-character names (`C#10`, `F#6`), names with no letter (`2024#1`) and prose words (`PR#5`, `step#2`, `issue#3`).
- A token inside a path or an address (`a/b/c#1`, `me@host#1`), and a number with more after it (`repo#12abc`).

The mod changes the drawing only. The stored message, `/copy` and ctrl+o keep the text as Claude wrote it. The terminal draws each link as an OSC 8 hyperlink, so the text reads as before and a click opens it.

## Options

Set them in `/config`, or in `settings.json` under `pluginConfigs["repo-links@fgilio"].options`:

```json
{
  "pluginConfigs": {
    "repo-links@fgilio": {
      "options": {
        "defaultOwner": "acme",
        "owners": "tool-lines-mod=fgilio, rails=rails"
      }
    }
  }
}
```

| Option | Default | What it does |
| --- | --- | --- |
| `defaultOwner` | empty | The GitHub user or organization for a bare `repo#N`. Empty links `owner/repo#N` only |
| `owners` | empty | Repos outside the default owner, as `repo=owner` pairs separated by commas or newlines |

To fill `owners` from an account's repositories, with forks left out:

```sh
gh repo list fgilio --limit 1000 --json name,isFork \
  -q '[.[] | select(.isFork | not) | "\(.name)=fgilio"] | join(", ")'
```

## Requirements

- Claude Code 2.1.302 or newer. CI runs the mod's tests on 2.1.302.

## Install

```text
/plugin marketplace add fgilio/claude-plugins
/plugin install repo-links@fgilio
```

Then run `/reload-plugins`.

## Development

You need [Bun](https://bun.sh) and Claude Code.

```sh
bun install              # the pinned tools, and the pre-commit hook
bun run check            # format, lint, type check, Markdown and the Bun tests
bun run typecheck:mod    # the strict type check, against Claude Code's types
claude plugin test .     # the mod's tests, inside Claude Code
claude plugin validate .
claude --plugin-dir .    # a session with the mod loaded
```

The repository follows the fleet standard in [fgilio/claude-plugins](https://github.com/fgilio/claude-plugins/blob/main/fleet/README.md), with the code profile. A few parts are particular to a mod:

- **Tests**: the tests in `tests/` import `claude-code/testing`, so only `claude plugin test .` runs them, and CI does so in its `mod-tests` job. `bun run test` is `bun test ./scripts`: the Bun tests of the scripts, named `*.spec.ts` because `claude plugin test` loads every `*.test.ts` as a mod test.
- **Types**: the plugin API's declarations come from the Claude Code binary and are never committed. `bun run typecheck:mod` runs `scripts/claude-code-types.ts`, which writes them to the gitignored `.claude-plugin/types/claude-code.d.ts`, then checks the mod with `tsconfig.mod.json`, which has no Node or Bun globals, as in Claude Code. The script runs the binary with no credentials, so it makes no model call. It uses `--claude <path>`, else `$CLAUDE_CODE_BIN`, else the `claude` on your PATH. CI runs it in `mod-tests` on the pinned release.
- **Without Claude Code**: `bun run typecheck` (the fleet's pass, in `bun run check`) types the mod against `types/claude-code-shim.d.ts`, a copy of the Claude Code API shapes the mod and its tests use, narrowed to the members they touch. Only `typecheck:mod` checks the mod against the declarations of a real Claude Code release.
- **A new Claude Code release**: set `CLAUDE_CODE_VERSION` and `CLAUDE_CODE_SHA256` in `.github/workflows/ci.yml` together. `typecheck:mod` fails in CI when the binary's version differs from `CLAUDE_CODE_VERSION`.

## License

[MIT](LICENSE)
