/**
 * The workshop catalogue. Text only: the home page carousel and the
 * workshops service page pair each entry with their own images.
 *
 * `id` doubles as the anchor on /services/workshops, so a link from the
 * home page lands on the matching workshop. The order here is the order
 * everywhere: the AI delivery workshop leads because it teaches the way
 * our forward-deployed team works; the rest follow from the AI feature
 * down to the foundation it needs.
 */
export type WorkshopId =
  | "ai"
  | "ai-frontend"
  | "nx-monorepo"
  | "enterprise-angular";

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
    id: "ai",
    title: "AI-Native Development: From Autocomplete to Automation",
    tag: "AI • Delivery",
    description:
      "For development teams that use AI for code suggestions and the occasional question, and want to go much further: agents that pick up a ticket, write the code and the tests, and open a pull request for a person to review. One day on your own codebase, taught the way we work in our own engagements.",
    bullets: [
      "Where your team stands today and what is realistic next: from suggestions in the editor to agents that finish whole tasks while a person checks the result",
      "Setting up coding agents such as Claude Code or Copilot so they know your codebase: the project structure, your conventions, and how to build and test",
      "Instructions and reusable skills committed to the repository, so the whole team gets the same results, not only the early adopters",
      "Handing the routine work to agents: tests, migrations, refactors, dependency upgrades and documentation, running in the background while people do the thinking",
      "Automating the chain: an agent takes a ticket, makes the change, runs the tests and opens a pull request that is ready for review",
      "Keeping quality up: a review checklist for AI-written code, which decisions the agent may take and which stay with a person",
    ],
    outcome:
      "Agent instructions and skills committed to your repository, a review checklist for AI-written pull requests, one routine job (tests, upgrades or documentation) running automated, and a plan for which parts of your delivery to automate next.",
  },
  {
    id: "ai-frontend",
    title: "Building AI-Driven Front-End Systems",
    tag: "AI • Angular",
    description:
      "For teams asked to put AI into their Angular application and finding out that the chat box is the easy part. You build three things: a dashboard that answers questions about your data, a chat that replies with real components instead of text, and a single message that runs a multi-step task.",
    bullets: [
      "AI-driven dashboards: a user asks a question in plain language and gets the right chart, table or filter, built from your own data",
      "Chats that answer with components: the model picks a table, a chart, a form or an approve button from your own component library and the application renders it",
      "One message, many steps: a request such as moving all open invoices for a customer to next month becomes a chain of API calls, with each step shown and confirmed before anything changes",
      "The plumbing in Angular: streaming answers, long-running tasks, partial results, cancellation and retries, with signals instead of a tangle of subscriptions",
      "Where the model runs: in the browser, on your backend or in a separate service, and what each means for security, cost and speed",
      "Keeping it safe and testable: what the model may and may not do, how to test features that do not give the same answer twice, and what to show the user when it goes wrong",
    ],
    outcome:
      "One of the three features working inside your own application, the set of components the model is allowed to use, and the rules and tests for the next features written down.",
  },
  {
    id: "nx-monorepo",
    title: "Nx Monorepos That Work for You",
    tag: "Platform • Nx",
    description:
      "For teams on Nx, or moving to it, whose workspace has grown faster than its rules: apps that import each other freely, a folder structure nobody can explain to a new hire, and CI that gets slower every month. A deep dive into the architecture of a monorepo that stays healthy, shares more code, ships faster and lets fewer bugs reach production.",
    bullets: [
      "Workspace architecture: how to split apps and libraries by domain and type, and a folder structure a new developer understands on day one",
      "Module boundaries the build enforces: tags and lint rules that stop the wrong imports before they are merged",
      "Bringing existing projects into the workspace in stages, without stopping releases while you do it",
      "Getting the most out of Nx Cloud: remote caching, distributed task execution and flaky-test detection, so CI only runs what changed",
      "Keeping the monorepo from degrading: the metrics to watch, the checks that run on every pull request, and the rules that keep structure from drifting",
      "Code sharing that pays off: shared libraries with clear owners and public APIs, so one fix lands everywhere and fewer bugs make it to production",
    ],
    outcome:
      "A target architecture for your workspace, module boundary rules and tags applied to it, a CI setup that only builds and tests what changed, and a staged plan for the projects that are not in the workspace yet.",
  },
  {
    id: "enterprise-angular",
    title: "Enterprise Angular Architecture",
    tag: "Architecture • Angular",
    description:
      "For teams whose Angular app has grown faster than its structure, and who are about to build AI features on top of it. We find where it hurts, including the places you have stopped noticing, and show the way out.",
    bullets: [
      "Every change breaks something else: bringing dependency rules to a grown codebase",
      "State scattered everywhere, and the bugs nobody can reproduce",
      "The app feels slow but nothing looks wrong: finding the real cause",
      "Signals, standalone and zoneless adopted in place, with no big-bang rewrite",
      "Shared components that get used instead of copied: what belongs in the library and what does not",
      "Tests that pass while production breaks: what to test at which level",
      "Your own codebase, reviewed together: the problems you have stopped seeing",
    ],
    outcome:
      "A written set of architecture rules for your app, the lint configuration that enforces them, and a prioritised list of the places in your code that break them today.",
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
    "Topics combined from the catalogue or built from scratch: AI features, state, performance, testing, migrations, tooling, UI libraries, whatever your code needs",
    "Every example and exercise taken from your own repository",
    "Format chosen with you: one day, two days, or a series of half-days between sprints",
    "Decisions written down and enforced in the build, like every other workshop",
  ],
  outcome:
    "A workshop that exists only for your team, with the same deliverables as the others: written decisions, the lint rules that enforce them, and a list of the places in your code that break them today.",
} as const satisfies Omit<Workshop, "id"> & { id: "tailored" };
