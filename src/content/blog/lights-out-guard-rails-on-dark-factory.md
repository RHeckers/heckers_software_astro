---
title: "Lights Out, Guard Rails On: Building Your First Software Dark Factory"
description: "A dark factory runs with the lights off: coding agents pick up tickets and open pull requests while nobody watches. The agents are the easy part. This is a tour of the guard rails that decide whether you wake up to merged features or to a very confident mess."
pubDate: "2026-10-29"
heroImage: "../../assets/blog-images/lights-out-dark-factory.png"
categories: ["AI", "Architecture", "Nx"]
---

In manufacturing, a *dark factory* is a plant that runs with the lights off. Robots build robots overnight, and the only humans around are the ones who designed the line, deal with what it rejects, and decide what it builds next. Nobody stands at the conveyor belt.

Software is getting its own version. Tickets go in on one side, coding agents pick them up, and pull requests come out the other side, at three in the morning, on a Sunday, ten at a time. The demos make it look like the hard part is the agent. It is not. A model that writes plausible code is a commodity now. What turns that model into a factory, rather than a very fast way to produce plausible-looking regressions, is everything around it.

I have built a few of these now, and rebuilt each one more times than I would like to admit. The first versions were small and forgiving. The later ones ran against real monorepos, with real teams, a real review culture and real consequences when something slipped through. The models changed between iterations, the tooling changed, the prompts changed completely. One lesson survived every version, so I will put it up front:

**An agent is only as good as the feedback loop it runs in. A dark factory is a feedback-loop machine, and the agents are the cheap part.**

This article is a tour of the guard rails that make up that loop, in roughly the order I learned to need them. It is not a tutorial; every section below could be its own article, and the hardest parts are the ones that only show up when the line runs on a specific codebase with a specific team. But by the end you should know what a responsible first factory looks like, what to build first, and where the dark spots are.

## The line, end to end

Before the guard rails, the shape of the thing. A software dark factory is a pipeline with six stations:

1. **Intake.** A human states an intent. Something turns it into a bounded, implementable story, or refuses to.
2. **Context.** The agent gets exactly the knowledge it needs about the codebase, and no more.
3. **Execution.** One story runs in isolation, with hard limits on what the agent may touch and spend.
4. **Verification.** Machines decide whether the result is any good. This is where most of the engineering goes.
5. **The merge gate.** A human, or for a few low-risk categories a policy, decides whether it lands.
6. **Telemetry.** Every run is measured, so you can tell improvement from luck.

Humans sit at two points: deciding what gets built, and deciding what gets merged. Everything in between runs dark. Every station has its own guard rails, and a gap in any one of them shows up downstream as something that looks like an agent being stupid, when it is really the factory being leaky.

## Guard rail 1: specs, not tickets

The most common way to make an agent fail is to give it a ticket written for a human. It is also the first mistake I made: the earliest version of my line was fed straight from the existing backlog, and it was the first thing I threw away. "Add filtering to the invoices page" is a fine ticket for a colleague who knows the product, can ask questions at standup, and will notice that filtering by status needs an index. For an agent it is an invitation to guess.

So the intake does not accept tickets. It accepts **bounded stories**:

- **Goal**: what changes for the user, in one or two sentences.
- **Acceptance criteria**: concrete and checkable. "Filtering by status returns only matching invoices, including when paginated", not "filtering works".
- **Allowed paths**: which projects or libraries the change may touch.
- **Out of scope**: what it must not do, even if it seems helpful.

A planning agent can help turn an intent into this shape, and it has a code graph to ask which libraries are involved. But it also needs permission to say no. If it cannot bound the story, it sends it back to a human with questions instead of guessing. That refusal is the first guard rail, and the one teams most often skip, because a factory that rejects work feels slower. It is not. A rejected story costs a minute; a merged guess costs a week. If I could only keep one guard rail, it would be this one: almost every bad pull request I have traced back started as a story that should have been refused.

The *allowed paths* field matters more than it looks. It becomes the story's **declared write set**, and later stations use it twice: to fail a story whose diff wanders outside it, and to decide which stories can run at the same time.

## Guard rail 2: a ledger the agents actually use

Agents forget. Every run starts with an empty head, and anything the previous run learned, half-finished or noticed in passing is gone unless it was written down somewhere the next run will look.

That is the job of the work ledger. I use [Beads](https://github.com/steveyegge/beads), a git-backed, dependency-aware issue tracker that lives in the repository itself. Stories are beads, dependencies are explicit, `bd ready` lists what can be worked on now, and an agent that discovers a follow-up files a new bead instead of losing it when its context ends. Hash-based IDs mean several agents on several branches do not collide.

Two lessons, both learned the boring way, more than once:

- **Agents forget the ledger exists, so do not rely on them remembering.** Beads ships a Claude Code SessionStart hook (`bd setup claude`) that injects the workflow and the ready work at the start of every session, and again after context compaction. That covers *remembering*. *Doing* is a different matter: the claim and the close belong to the orchestrator, not the agent, and a Stop hook can refuse to let a run end while the rules it must follow are unmet. The agent's own ledger job shrinks to the one thing it is genuinely best at: filing what it discovers along the way. Without that division, the ledger is a well-organised museum.
- **It is not your team's tracker, and it should not try to be.** Beads syncs with GitHub Issues, Jira, Azure DevOps and others. Humans plan in the tool they already use; a label or a board lane like *AI-ready* is the signal; a scheduled sync pulls those items into Beads. The human tool is the source for *what*. Beads is the source for *how, and in what order*. Agents never write to the human tool directly, only through the sync.

## Guard rail 3: context is a platform, not a prompt

A large repository does not fit in a context window, and an agent that greps its way around one will find *a* pattern, not *your* pattern. The fix is not a bigger prompt. It is treating context as infrastructure that someone owns.

For a small or medium repository, that platform is surprisingly modest:

- **The project graph.** In an Nx workspace the agent can ask which projects exist, what depends on what, and what a change affects, instead of guessing from folder names. The Nx MCP server exposes exactly that.
- **Layered instruction files.** A root `CLAUDE.md` (or equivalent) with how to build, test and lint, and the ledger rules. Then a short one per domain with *its* conventions: how aggregates and IDs work in the backend, how stores and components are structured in the frontend. Short, specific, maintained like code.
- **Module boundaries as rules, not advice.** If your architecture says a feature may not import another domain, that has to be a lint error, not a sentence in a README. Agents follow errors far more reliably than prose. I wrote about [encoding boundaries with Nx tags](https://www.heckerssoftware.com/blog/four-dimensions-of-nx-tags/) before; in a factory they stop being nice to have.

What I would deliberately *not* start with, having tried both: vector search over the codebase, and graph databases. Vector retrieval is good at "find something like this" and bad at "what depends on this", which is the question an agent actually needs answered. Graph databases earn their place at a scale where the built-in project graph and language-server tooling run out, which is a lot later than most teams think.

## Guard rail 4: one story, one sandbox, hard limits

Each story runs alone: its own git worktree or container, a fresh branch, and nothing shared with other runs. Then the limits:

- **A budget**: maximum turns, maximum tokens, maximum wall-clock time per story, and a daily spending cap for the whole factory.
- **Allowlisted tools**: edit files, run the project's own commands, use the context tools. Not "anything in the shell".
- **No production credentials, ever.** No network beyond the package registry. Write access to its own branch, nothing else.
- **A kill switch**: one command that drains the queue and stops everything in flight.

None of this is about distrusting the model. It is about making failure cheap. A story that goes off the rails inside a budgeted, isolated worktree costs you a few cents and a discarded branch. The same story with your cloud credentials and an unlimited turn count costs you a weekend.

## Guard rail 5: separate agents, opposite objectives

The single biggest quality jump I have seen, across every iteration, is not a better model. It is refusing to let the agent that wrote the code be the one that judges it. An agent asked to review its own work has already decided the work is right.

So the factory has roles, each with its own context and its own objective:

- **Planner**: turns intent into bounded stories. Never writes code.
- **Tester**: writes or extends tests *from the story alone*, before seeing any implementation, so the tests encode the spec rather than the code.
- **Implementer**: one story, one worktree. Its objective is to make it pass.
- **Reviewer**: a fresh context that sees only the story, the diff and the blast radius. Its objective is to find reasons to reject. Ideally a different model, or at least a very different prompt, so it does not share the implementer's blind spots. It does not chat; it returns structured findings, and a high-severity finding fails the story.
- **Orchestrator**: plain, deterministic code. It routes work, enforces budgets, retries, and escalates to a human after a few failed loops. It is not an LLM, because the one component that decides what happens next should not be creative.

The agents never talk to each other. Everything passes through the orchestrator as artefacts (a story, a diff, a findings file), which also gives you an audit trail for free.

## Guard rail 6: verification is the product

If you remember one section, make it this one. Agents are extremely good at producing code that passes the checks you have. So the checks you have *are* the quality of your factory, and most of the engineering effort belongs here. Every time I rebuilt a line, effort moved out of the agent configuration and into this section, and every time quality went up.

The layers, from cheap to expensive:

- **The basics, as errors**: strict types, lint, formatting, module boundaries, and the tests of everything the change affects (`nx affected` in an Nx workspace, and that includes the .NET side if you give it a project with `build`, `test` and `lint` targets).
- **A write-set check**: if the diff touches a project outside the story's declared write set, the story fails. That is a scoping error, not something to fix in review.
- **Mutation testing** on changed files, with Stryker for TypeScript and Stryker.NET for C#. It changes your code on purpose and checks that some test notices. This matters more with agents than with humans, because agents are excellent at writing tests that pass and mediocre at writing tests that fail for the right reason. And once the score becomes a gate, they will learn to game it, by writing tests that target the mutated lines specifically. I have watched it happen. Audit the test diffs, not just the number.
- **A hidden test suite**: acceptance and contract tests in a place the agent has no path to, not in its repository, not on its filesystem, not over its network. It sees pass or fail and a redacted message, never the test source. Anything an agent can read, it will overfit to, consciously or not. This is a held-out set, the same idea as in machine learning, and it is the final gate, not the inner loop.
- **Architecture fitness functions**: small scripts that assert the invariants you care about. No new dependencies into deprecated libraries, bundle size per app within budget, zero boundary violations.
- **Supply-chain checks**: dependency, license and secret scanning, because agents add packages freely.
- **Flake quarantine**: flaky tests are tracked and quarantined centrally. Otherwise an agent will "fix" a flaky test the fastest way it knows, which is by weakening it.

Red loops back to the implementer with the output. After a few loops, it goes to a human. That escalation rule is itself a guard rail; without it, an agent can spend an impressive budget convincing a test to agree with it.

## Guard rail 7: merge like a team, not like ten individuals

Once agents open pull requests faster than people used to, "green on its branch" stops meaning "green on main". Two changes can each pass alone and break together.

A **merge queue** fixes that: each pull request is rebased onto what is about to land and the affected checks run again before it merges. GitHub, GitLab and tools like Mergify all offer a version of it; check what your plan includes. It also acts as a throttle. When the queue backs up, the orchestrator stops dispatching new stories instead of piling up stale branches.

The same thinking decides **what may run in parallel**. Not hand-written labels, but the graph: two stories can run at the same time when their write sets do not overlap. Build a conflict graph from the declared write sets and their affected projects, schedule by priority, and let anything that conflicts with a running story wait. The few things the graph cannot see, database migrations, shared schemas, generated API clients, translation files, get marked as exclusive, so any story touching them runs alone.

And then the **human gate**. A person reads the summary, the diff and the evidence: what was tested, what the graph said would be affected, what the reviewer flagged. Over time, some categories can merge without a human, things like dependency bumps, documentation, or test-only changes, but only behind feature flags, with a canary and automatic rollback when error rates move. Everything else waits for a human, and should.

## Guard rail 8: everything the agent reads is untrusted

Your agents read tickets, READMEs, test output, error messages, package documentation and web pages. Every one of those is a place where someone can write "ignore your previous instructions and…". Prompt injection is not a theoretical risk in a factory; it is an input-validation problem with a very large attack surface.

The basics: treat tool output as data, never as instructions. Pin dependencies. Do not run install scripts from packages you have not vetted. Keep the agent's permissions small enough that a successful injection cannot do much. And be careful with the tempting idea of letting agents read the open internet while they implement.

## Guard rail 9: measure, or you are guessing

From the very first run, log everything: tokens, turns, wall-clock time, how many verification loops it took, whether it passed the hidden suite, and whether a human edited the pull request before or after merging. A spreadsheet is fine to start with.

Two things grow out of that log:

- **A golden set.** Historical stories with their merged diff and review outcome. When you change a model, a prompt, a tool or a gate, you replay the set and compare. Without it, every improvement is an anecdote.
- **A random audit.** Once a week, a human reads a random sample of what the factory merged, especially what it merged without a human. It is cheap, and it is the only way you will notice slow drift before your users do.

## The first three weeks

Everything above sounds like a platform team's year. It does not have to start that way, and the lines that worked best for me never did. They all started the same way: the smallest factory that is still a factory, which is a queue, a script that runs one story, and gates that decide whether the result is good. This is the order I build them in now.

**Week one: one story, end to end, by hand.** One repository, ideally a monorepo so affected checks and boundaries come for free. Install the ledger and write the rules into your instruction files. Write five small, real, well-bounded stories. Write a script that creates a worktree, hands one story to a headless agent run with a turn limit and a tool allowlist, runs the affected checks and opens a pull request. Run it on all five and read every pull request properly. That is your baseline, and the beginning of your golden set.

**Week two: gates.** Strict types and boundaries as errors. Mutation testing on changed files as a merge rule. A second, reviewer-only agent run that sees the diff and the story and returns findings. The write-set check.

**Week three: automation.** A scheduled job that syncs the AI-ready items, picks one ready story, claims it and runs it. Branch protection that requires the checks. A first, simple form of merge queue.

Then, and only then, decide what to build next, based on what the log says, not on what the last conference talk said. Skipping straight to parallel agents and auto-merge is the fastest way I know to end up turning the lights back on. A practical note while you are at it: running headless agents on your own machine under your own subscription is one thing; running them on CI servers usually needs an API key or different terms, so check what your plan allows before you move the runner.

## The dark spots

I promised a tour, not a manual, and the honest truth is that the hard parts of a dark factory are the ones a tour cannot cover, because they depend on your codebase, your team and your risk appetite. These are the questions that came up in every setup I have worked on, and that this article deliberately leaves open:

- **How big is a story?** Too small and the planning overhead eats the gain. Too big and the agent loses the plot halfway. Where the line sits depends on your architecture more than on the model.
- **What does a good acceptance criterion look like for an agent?** One a human would understand is often one an agent can satisfy trivially. Writing criteria that cannot be gamed is a skill, and your team does not have it yet.
- **What goes in the domain instruction files, and who keeps them true?** Stale context is worse than no context, because the agent will follow it confidently.
- **Where do the mutation thresholds sit?** Too strict and nothing merges; too loose and the score is decoration. And how do you notice when the agents have started gaming it?
- **Who owns the hidden suite?** It needs maintenance, it slows feedback, and the agents will sometimes fail it without understanding why. Somebody has to decide what goes in it and how much of the failure to reveal.
- **Which changes may merge without a human?** That is a risk decision, not a technical one, and in most organisations nobody has the mandate to make it yet.
- **What happens to your team?** When implementation becomes cheap, specification, review and verification become the job. That is a different skill set, a different review culture and, for some people, a different career. The factory is the easy part of that change.
- **What does it cost?** Per story, per month, per avoided bug. If you cannot answer that after a month of running, you are not running a factory; you are running an experiment without a hypothesis.

None of these have a universal answer. They have *your* answer, and finding it is mostly a matter of running the line on real work, watching where it leaks, and fixing the factory rather than the output. That takes a few iterations whoever does it. The difference is whether those iterations are your first ones.

## In short

A software dark factory is not a smarter agent. It is a line built around ordinary agents: bounded stories that can be refused, a ledger that remembers, context treated as infrastructure, isolated and budgeted runs, separate agents with opposite objectives, verification layered until passing it actually means something, a merge queue, untrusted inputs treated as untrusted, and a log that tells you whether any of it is working. Start with one story and one script, add gates before you add speed, and let the measurements decide what comes next.

## Build it with someone who has turned the lights off before

You can build all of this yourself, and this article should give you a head start. But most of what makes a factory work is in the details between the sections: the exact shape of a story, the reviewer prompt that finds real problems instead of style nits, the gate thresholds for *your* test suite, the first ten stories that prove the line before anyone trusts it.

That is what my workshop **[AI-Native Development: From Autocomplete to Automation](https://heckerssoftware.com/services/workshops#ai)** is for. It runs on your own codebase, not a toy project: we set up the agents, the ledger, the gates and the chain from ticket to pull request together, so your team leaves with a working line and knows how to keep it honest.

If you would rather have the line built and running before your team takes it over, that is a [forward-deployed engagement](https://heckerssoftware.com/services/forward-deployed-engineering): I come into your team, build the factory on your repositories, run the first stories through it with you, and hand it over with the decisions written down.

Either way, it starts with a short conversation about where you are. [Get in touch](https://heckerssoftware.com/#contactForm), and I will tell you honestly what your first factory should look like, and which dark spots you are likely to hit first.
