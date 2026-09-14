/**
 * The workshop catalogue. Text only: the home page carousel and the
 * workshops service page pair each entry with their own images.
 *
 * `id` doubles as the anchor on /services/workshops, so a link from the
 * home page lands on the matching workshop.
 */
export type WorkshopId =
  | "enterprise-angular"
  | "nx-monorepo"
  | "ai"
  | "ui-libraries";

export interface Workshop {
  id: WorkshopId;
  title: string;
  tag: string;
  /** Who this workshop is for, in one sentence. */
  description: string;
  bullets: string[];
  /** What the team leaves with. */
  outcome: string;
}

export const WORKSHOPS: readonly Workshop[] = [
  {
    id: "enterprise-angular",
    title: "Enterprise Angular Patterns",
    tag: "Architecture • Angular",
    description:
      "For teams whose Angular app has grown faster than its structure. We find where it hurts, including the places you have stopped noticing, and show you the way out.",
    bullets: [
      "Every change breaks something else: bringing dependency rules to a grown codebase",
      "State scattered everywhere, and the bugs nobody can reproduce",
      "The app feels slow but nothing looks wrong: finding the real cause",
      "Signals, standalone and zoneless adopted in place, with no big-bang rewrite",
      "Tests that pass while production breaks: what to test at which level",
      "Your own codebase, reviewed together: the problems you have stopped seeing",
    ],
    outcome:
      "A written set of architecture rules for your app, the lint configuration that enforces them, and a prioritised list of the places in your code that break them today.",
  },
  {
    id: "nx-monorepo",
    title: "Nx Monorepo Enablement",
    tag: "Platform • Nx",
    description:
      "For teams whose builds and CI keep getting slower, and whose apps have quietly grown into each other.",
    bullets: [
      "An hour of CI for a one-line change: affected commands and caching that only run what changed",
      "Apps and libraries that import each other freely: module boundaries the build enforces",
      "Moving your existing apps into one workspace in stages, while releases keep shipping",
      "Nx Cloud, remote caching and distributed tasks for pipelines that are fast and stay fast",
      "A look at your own project graph: the hidden coupling and duplicated code you did not know were there",
    ],
    outcome:
      "Module boundary rules and tags applied to your workspace, a CI configuration that only builds what changed, and a staged plan for the apps that are not in the workspace yet.",
  },
  {
    id: "ai",
    title: "Using AI Effectively in Angular and Nx Projects",
    tag: "AI • Productivity",
    description:
      "For teams where AI use is spreading unevenly: some developers fly, others distrust every suggestion, and nobody has agreed on the rules.",
    bullets: [
      "Why AI code drifts from your conventions, and how to stop it",
      "Setting up coding agents such as Claude Code or Copilot with your project graph, conventions and guardrails",
      "Shared instructions and skills so everyone benefits, not just the early adopters",
      "Refactors, tests and migrations with AI, while your team stays in control",
      "The risks already in your workflow today, and the policies that close them",
    ],
    outcome:
      "Shared agent instructions committed to your repository, a review checklist for AI-assisted pull requests, and a written policy your team agreed on together.",
  },
  {
    id: "ui-libraries",
    title: "Building Enterprise-Grade UI Libraries",
    tag: "UI Libraries • Angular",
    description:
      "For teams whose shared components get copied instead of reused, and where every brand tweak turns into a fork.",
    bullets: [
      "Why teams fork your components instead of using them, and the fix",
      "The same button built four times: deciding what belongs in the library",
      "Design tokens so a new brand does not mean a new copy of the library",
      "The accessibility gaps you cannot see: keyboard, focus and screen readers",
      "One release breaks every consumer: safe versioning in an Nx workspace",
      "Your library, reviewed: the hidden coupling that keeps teams from using it",
    ],
    outcome:
      "A component inventory of your library with what to keep, merge and remove, a token structure for theming, and a versioning and release process the consumers can rely on.",
  },
] as const;

/**
 * The workshop without a fixed topic: shaped with the client from an intake
 * call and a read of their code. Listed on the service page only; the home
 * page carousel shows the four fixed topics.
 */
export const TAILORED_WORKSHOP = {
  id: "tailored",
  title: "A workshop built around your team",
  tag: "Tailored • Your topic",
  description:
    "For teams whose problem does not fit a catalogue entry. We start from a call about what is actually slowing you down, read your codebase, and build the workshop around that: one topic from the list, a mix of several, or something nobody has written a course for yet.",
  bullets: [
    "An intake call to find the real problem, not the one in the ticket",
    "Topics combined from the catalogue or built from scratch: state, performance, testing, migrations, tooling, whatever your code needs",
    "Every example and exercise taken from your own repository",
    "Format chosen with you: one day, two days, or a series of half-days between sprints",
    "Decisions written down and enforced in the build, like every other workshop",
  ],
  outcome:
    "A workshop that exists only for your team, with the same deliverables as the others: written decisions, the lint rules that enforce them, and a list of the places in your code that break them today.",
} as const satisfies Omit<Workshop, "id"> & { id: "tailored" };
