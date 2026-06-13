---
title: "7 Signs Your Angular Nx Monorepo Is Slowing Your Team Down"
description: "Your Nx monorepo was meant to make you faster. Learn 7 signs it's quietly slowing your Angular team down, what each one costs, and where to start fixing it."
pubDate: "2026-06-13"
heroImage: "../../assets/blog-images/7-signs-your-nx-monorepo-is-slowing-you-down.png"
---

*Some of these signs come from recent developments in Angular and Nx; others have been slowing teams down for years. Together, they share a single cause.*

A monorepo is one of the most effective ways to manage a large Angular environment. When it is set up well, it lets different teams share code, apply the same conventions everywhere, refactor across applications in a single commit, and keep one shared timeline they can always revert to. When it is set up poorly, it does the opposite. It becomes a large and daunting solution in which a small change can break applications you did not know existed, build times creep upward, and a growing web of dependencies makes adding even simple things time-consuming.

The difference between the two is rarely a single decision. Much like development speed itself, the decline is gradual. Without good architecture, you start fast, but over time you end up crawling; with good architecture, you keep a consistent and predictable pace. The trouble is that the crawling sets in so slowly that it is easy to mistake for normal.

In this article, you will learn to recognize seven signs that your Nx monorepo has started to work against you. Some of these signs relate to recent developments in Angular and Nx, and some have been slowing teams down for years, regardless of the version you are on. By the end, you will be able to tell whether your monorepo is paying for itself, and you will have a clearer idea of where to begin if it is not.

The signs we will cover are as follows:

- **Continuous integration that slows down every sprint**
- **A small change that rebuilds and retests half the repository**
- **A dependency graph that nobody can explain**
- **New developers who take weeks to become productive**
- **Versions left behind because upgrading feels risky**
- **Tooling that every team configures differently**
- **A monorepo that is effectively invisible to AI tooling**

## 1. Continuous integration slows down every sprint

The most common sign, and the easiest to get used to, is a continuous integration (CI) pipeline that takes a little longer every sprint. A pipeline that finished in eight minutes a year ago now takes twenty-five. Developers start a build, switch to something else while they wait, and lose their focus in the process. When developers spend their time waiting for builds and tests, they wander off and become less productive. Nobody decided the pipeline should become this slow; it crept up gradually as the code base grew.

In almost all cases, the cause is a caching setup that is not doing its job, combined with an affected graph that is not actually scoping the work. Either there is no remote cache, so every CI run and every team member recomputes work that has already been done elsewhere, or the cache inputs are configured incorrectly and the cache misses far more often than it hits. Modern Nx has made the well-configured path considerably better than it used to be, with database-backed caching as standard and mature task distribution. That is good news, but it also means that teams without these things in place are falling further behind the baseline rather than holding steady.

The cost here is easy to underestimate, because it is spread out. A few minutes of waiting, multiplied across every developer and every push, adds up to a significant amount of lost time each week, alongside a real bill for compute that rebuilds code that never changed. It is one of the most expensive problems a team can have, precisely because nobody is tracking it.

## 2. A small change rebuilds and retests half the repository

Suppose you fix a small typo in a single component, push your change, and watch CI rebuild and retest twenty projects. The whole purpose of `nx affected` is to limit work to the projects that are genuinely impacted by a change. So when a trivial edit fans out across the workspace, it is a sign that your dependency graph no longer reflects how your code is actually related.

The usual cause is a small number of oversized shared libraries. When everything imports from a single, large `shared-ui` or `shared` library, everything is considered affected the moment that library changes. Barrel files that re-export an entire library through one entry point make this worse, because they couple consumers to code they never use. The remedy is architectural rather than a configuration flag: split those large libraries along meaningful boundaries, so that a change to a button no longer invalidates a feature that only ever used a date pipe.

Until you do, your feedback loop stays slow no matter how well your caching is configured, because the affected set has stopped being meaningful. Worse, developers gradually learn to distrust the CI signal, and that is a difficult habit to undo.

## 3. A dependency graph nobody can explain

Run `nx graph` in front of your team and watch the reaction. If the honest response is a wince, because everything points at everything, there are circular dependencies, and a low-level utility somehow imports from a feature module, then your workspace is missing enforced module boundaries.

In Nx, those boundaries are created with `tags` and the `enforce-module-boundaries` lint rule. They are the difference between a graph that stays a clean hierarchy and one that slowly turns into a tangle. With boundaries in place, features can depend on shared code but shared code cannot reach up into features, and one domain cannot quietly import another. Without them, new code simply imports whatever makes the compiler error go away, and over time the structure stops telling you anything about what is safe to change.

This matters because the graph is meant to be a map. When it is accurate, you can reason about the impact of a change before you make it. When it is not, every change carries an unknown blast radius, and the refactors that would improve the situation keep getting postponed, because nobody is confident about what they might break.

## 4. New developers take weeks to become productive

Another sign is that onboarding a capable new developer takes much longer than it should. They are competent, but they spend weeks finding their footing, because productivity in your workspace depends on knowledge that lives in people's heads rather than in the structure of the code. There is usually one person, and there is always one person, who truly understands how everything fits together, and progress slows noticeably whenever they are on holiday.

This is the human cost of the previous two signs. When your library boundaries map cleanly onto domains, and those boundaries are enforced by tooling, the code base teaches new team members how it is organized. When they do not, the only way to learn the system is to absorb it from whoever happens to be holding it in their memory.

The cost is twofold. First, there is the reduced output of every new hire during those extra weeks, which is real money. Second, there is the risk of concentrating so much essential knowledge in one or two people. It also limits how quickly you can grow the team, because every new person places the same load on the same bottleneck.

## 5. You are several versions behind because upgrading feels risky

You are running a version of Angular and Nx that is a year or two old. Everyone agrees that you should upgrade, and yet it keeps not happening, because the last attempt was painful and nobody wants to lose a sprint to it.

Two things make this more serious than it feels. The first is that support windows are finite. Nx gives each major version a fixed period before it falls out of long-term support, so "a little behind" eventually becomes "unsupported," with the security and compatibility exposure that implies. The second is that staying current is not only a matter of willingness, because the wider ecosystem takes time to catch up whenever a new major version of Angular is released. At the time of writing, for example, Nx had not yet shipped official support for Angular 22, which is exactly the kind of timing that catches teams off guard during an upgrade.

A healthy workspace treats upgrades as small, routine, and frequent, with `nx migrate` doing much of the work. An unhealthy one allows them to accumulate into a single, dreaded migration. The cost of falling behind is that you cannot adopt the very things that would make you faster, such as stable Signal Forms, the Resource API, zoneless change detection, and faster build and test tooling, while your security exposure grows and your stack becomes a harder sell to the senior developers you would like to hire.

## 6. Every team configures its tooling differently

Shared tooling is one of the main reasons to adopt a monorepo, so it is worth noticing when it quietly fragments. One team's libraries use one TypeScript configuration; another team's differ for reasons nobody remembers. Linting rules vary. Test setup is bespoke from one project to the next. The same dependency exists at three different versions in three corners of the repository.

This matters more at the moment than it usually would, because the Angular and Nx tooling baseline is shifting. Vitest is now the recommended test runner for Angular, dependency versions can be managed centrally, and faster compilers are arriving. Modernizing is demanding enough when you have a single shared foundation to move. Without one, every team has to make every change independently, so in practice most teams make none of them, and the drift compounds.

The cost is duplicated effort, subtle bugs caused by version differences between projects, and a workspace where the answer to "how do we do this here" depends entirely on which folder you happen to be in. The uniformity you adopted a monorepo to gain has quietly slipped away.

## 7. Your monorepo is effectively invisible to AI tooling

The final sign is a more recent one, and increasingly the one with the most to gain from being addressed. You point an AI coding assistant at your repository and the results are mediocre. It does not understand how your projects relate, it suggests changes that break things downstream, and on the whole it works blind.

The reason is that the same lack of structure that slows down your developers also slows down AI tooling. The features that give an assistant real context about a workspace, such as the project graph, the dependencies between projects, the task configuration, and the metadata that Nx now exposes specifically so that assistants can reason about a code base rather than guess at it, only pay off when that underlying structure genuinely exists and is accurate. A workspace with clear boundaries and a trustworthy graph is one an assistant can navigate. A tangled one is something it can only stumble through, in much the same way that a new developer would.

The cost is that you leave one of the largest current improvements to developer productivity on the table. Teams whose architecture is legible gain compounding leverage from AI assistance and from features such as self-healing CI; teams whose architecture is not, do not. That gap is widening rather than narrowing.

## Summary

In this article, you learned to recognize seven signs that an Nx monorepo has started to slow a team down, from continuous integration that drifts slower each sprint to a workspace that AI tooling cannot navigate. Some of these signs are tied to recent developments in Angular and Nx, and some have been with us for years, but they share a common cause.

That cause is worth stating plainly: a monorepo is not a monolith. Putting all of your code in one place is not architecture; it is only colocation. The benefits, which are coordinated change, fast feedback, safe refactoring, and shared standards, come from deliberate boundaries. They come from libraries that map onto real domains, dependency rules enforced by tooling, a graph that stays a clean hierarchy, and upgrades kept small and routine. Without that, you take on the hardest part of a monorepo, which is having everyone in one code base, while giving up the part that was supposed to make it worthwhile.

The encouraging news is that none of these signs is a dead end. The graph can be untangled, oversized libraries can be split incrementally rather than in a single rewrite, boundaries can be introduced and enforced, and caching can be made to do its job. It is methodical work with a clear return, and the cost of leaving it undone only grows with each sprint.

---

If you are a developer and several of these signs sound familiar, the people who own your team's delivery timeline have most likely not seen the situation framed this way. The slowdown is hard to notice precisely because it is gradual, and naming it is the first step toward addressing it.

At Heckers Software, I run focused Nx and Angular architecture reviews that turn a list like this into a concrete, prioritized plan: what to address first, what it is costing you now, and how to do it without bringing feature work to a halt. If a few of these signs hit close to home, it is a conversation worth having.

→ heckerssoftware.com
