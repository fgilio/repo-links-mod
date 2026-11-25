// The Claude Code API the mod and its tests use, so `bun run typecheck` and
// the type-aware lint run with no Claude Code installed. Each shape copies
// the real declaration, narrowed to the members the mod touches. The real
// declarations are generated and never committed: `bun run typecheck:mod`
// checks the mod against them, without this file.
declare module "claude-code" {
  const opaque: unique symbol;

  /** A value the mod passes through and never reads inside. */
  type Opaque<Name extends string> = { readonly [opaque]: Name };

  // MARK: Render

  export type RenderSurface = "terminal" | "desktop" | "vscode" | "mobile";

  export type OnScreen = { first: number; last: number; of: number };

  export type RenderPropsOf = {
    AssistantMessage: {
      text: string;
      isFirstOfReply: boolean;
      isSummary?: true;
      onScreen?: OnScreen | null;
    };
  };

  export type RenderComponent = keyof RenderPropsOf;

  export type RenderInput<C extends RenderComponent = RenderComponent> = {
    readonly component: C;
    readonly surface: RenderSurface;
    readonly requestId: string;
    readonly props: RenderPropsOf[C];
  };

  export type RenderElement = Opaque<"element">;

  export type RenderMatcher<C extends RenderComponent> = {
    readonly component: C;
  };

  // MARK: Hooks

  export type ElementTable = {
    Text: (props: { children: string[] }) => RenderElement;
  };

  export type SessionRepo = {
    root: string;
    remote: string | null;
    internal: boolean;
    name: string | null;
  };

  export type EngineInterface = {
    session: {
      repo: () => Promise<SessionRepo | null>;
    };
    ui: {
      resolve: (e: { surface: RenderSurface }) => ElementTable;
    };
  };

  export type Next<E, R> = (e: E) => Promise<R>;

  export type Hook<E, R> = (
    $: EngineInterface,
    e: E,
    next: Next<E, R>,
  ) => R | Promise<R>;

  export type On = {
    <C extends RenderComponent>(
      event: "ui.render",
      matcher: RenderMatcher<C>,
      hook: Hook<RenderInput<C>, RenderElement>,
    ): unknown;
    (
      event: "session.repo",
      hook: Hook<Record<string, never>, { value: SessionRepo | null }>,
    ): unknown;
  };

  export type PluginOptions = Readonly<
    Record<string, string | number | boolean | readonly string[]>
  >;

  export type Register = (on: On, options: PluginOptions) => unknown;
}

declare module "claude-code/testing" {
  import type {
    On,
    PluginOptions,
    RenderComponent,
    RenderPropsOf,
    RenderSurface,
  } from "claude-code";

  export type Mounted = {
    unmount: () => Promise<void>;
  };

  export type MountTarget<
    P extends RenderSurface,
    C extends RenderComponent,
  > = {
    plugin: string;
    surface: P;
    component: C;
    props: RenderPropsOf[C];
  };

  export type Engine = {
    ui: {
      mount: <P extends RenderSurface, C extends RenderComponent>(
        target: MountTarget<P, C>,
      ) => Promise<Mounted>;
    };
  };

  export type TestBody = ($: Engine, on: On) => unknown;

  export const test: {
    (name: string, body: TestBody): void;
    (name: string, config: { options: PluginOptions }, body: TestBody): void;
  };

  export type Matchers = {
    toBe: (expected: unknown) => void;
    toEqual: (expected: unknown) => void;
  };

  export const expect: (received: unknown, message?: string) => Matchers;
}
