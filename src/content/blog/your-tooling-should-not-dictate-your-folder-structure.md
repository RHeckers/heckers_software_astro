---
title: "Your tooling should not dictate your folder structure"
description: "Almost every Nx workspace I get to work in has the same two folders in the root: apps and libs. That is what Nx gives you, and for a long time I took it as a given, but now I know your tooling should not dictate your folder structure."
pubDate: "2026-09-14"
heroImage: "../../assets/blog-images/nx-folder-structre.png"
categories: ["Angular", "Nx", "Architecture"]
---

Open almost any Nx workspace and you will find the same two folders in the root: `apps` and `libs`. We have worked in repositories like this for so long that the structure has stopped registering as a decision. It is just what an Nx workspace looks like.

I want to argue that it is a decision, that somebody made it for a good reason, and that the reason has nothing to do with your software. The `apps` and `libs` split is not an architecture. It is a side effect of how Nx caches and rebuilds, and in a large workspace it leaves you with a folder structure that describes Nx's internals instead of your system.

This article is about how we got here and what I do instead. The structure I will show you keeps every benefit Nx gives you. It just stops letting the build tool decide where your code lives.

## What Nx is actually optimizing

To see why the default structure exists, you have to look at what Nx is doing underneath.

Nx has two features that everything else hangs off: computational caching and the affected commands. Both operate on a single unit, and that unit is the Nx project (defined by a project.json or a package.json file).

When you run a task, Nx computes a hash from the project's source files, its dependencies, its configuration, and the task itself. If it has seen that hash before, it replays the stored output instead of doing the work. That is the cache.

When you run `nx affected -t test`, Nx compares your working tree against a base commit, works out which files changed, maps those files to projects, and walks the project graph to find everything downstream. Those projects get tested. Everything else is skipped entirely.

Incremental builds work the same way. A buildable library that has not changed is not rebuilt, its previous output is reused, and only the projects above it in the graph are recompiled.

All three features share one property. **Their resolution is the project.** Not the file, not the folder, not the module. If a single file in a project changes, the whole project is considered affected, and so is every project that depends on it.

This is the pivot that the rest of the article turns on, so it is worth stating plainly. A change to one component invalidates its entire project. There is no partial invalidation and no file level granularity. Nx does not know, and does not try to know, that you only touched a comment in a file nobody imports.

## Why that pushes you toward many small projects

Once you understand that the project is the unit, the consequence is obvious.

Picture an Angular application built the traditional way, as one project with a few hundred components inside `src/app`. Every change to any of those components invalidates the project. `nx affected` selects it every time. The cache misses every time. Incremental builds have nothing to be incremental about, because there is only one thing to build.

You get almost nothing out of Nx, because you have given it nothing to work with.

So you split the application up. The checkout flow becomes its own project, the search becomes another, the shared buttons a third. Now a change to checkout affects checkout and whatever sits above it in the graph. Search is untouched, comes straight from the cache, and its tests do not run.

The more finely you split, the more Nx can skip. This is why Nx guidance pushes so hard toward small libraries and a thin application shell, and it is why I wrote in _Effective Angular_ that roughly 80% of your code should live in libraries and 20% in the application. That ratio is not an aesthetic preference. It is the shape that makes the tooling work.

I still believe in it, and splitting code into projects is good for more than caching. A project boundary is far stronger than a folder. It forces you to think about what you export, it usually results in cleaner dependencies, and it makes `nx graph` genuinely useful. None of that is in question here.

## Nx has exactly two project types

Here is where the tooling starts leaking into your folders.

When you split that application up, the pieces have to be created as something, and Nx offers exactly two options. A project is either an **application** or a **library**. That is the entire taxonomy. It is recorded as `projectType` in `project.json`, and it decides which executors are available, whether the project can be served, and how Nx treats it in the graph.

So what is the checkout flow you just extracted? It is not an application. It is not independently deployable, it has no `main.ts`, and nobody serves it. It belongs to the visitor application and it always will.

But there is no project type for "part of an application". So you make it a library.

Read that again, because the whole problem is in that sentence. **You create a library not because the code is a library in any meaningful sense, but because Nx has no other project type to offer you.**

That checkout flow is not reusable. It is not shared. It has exactly one consumer and it will never have a second. Calling it a library is a small lie we tell the tool so that the tool will cache it for us.

The lie itself is fine. It costs nothing, it buys real build performance, and there is no reason to fight it.

The problem is what we did next.

## The folder structure inherited the lie

Nx creates two root folders that mirror the two project types. Applications go in `apps`, libraries go in `libs`. As a default that mapping is clean, obvious, and completely defensible.

Then we followed it. Every project went into the folder matching its type, and since nearly everything is a library, nearly everything ended up in `libs`.

Here is what that produces in a real workspace after a couple of years:

```
libs/
├── visitor/                one app only
├── visitor-mobile/         one app only
├── zoo-keeper-mobile/          one app only
├── ticket-kiosk/           one app only
├── signage-screens/        one app only
├── shared/                 any app, internal
├── zoo-design-system/      published to npm
├── eslint-plugin-zoo/      published to npm
├── nx-preset-zoo/          published to npm
└── zoo-api-client/         published to npm
```

Look at what is grouped together here, and at what the grouping is based on.

`visitor` is private to one application, and nobody else should ever touch it. `shared` is the opposite: every application may import it, but it never leaves the repository. `zoo-design-system` is published to a registry, which means it has consumers you cannot see, a version number that means something, and a deprecation policy.

Three completely different contracts. Three different sets of rules about who may import what. And they sit as siblings in the same folder, because they happen to share a `projectType` value in a JSON file.

That is the heart of it. **The only thing all ten folders have in common is an implementation detail of the build tool.** The things that actually differ between them, ownership, reach, and whether they have external consumers, are invisible.

A developer joining on Monday opens `libs`, sees ten folders that look identical, and has no way to tell which of them they may import. The structure carries no information, so they ask a colleague instead. That question then gets asked for the rest of the repository's life.

## The apps folder has its own version of this

The same thing happens on the other side, in a smaller way.

```
apps/
├── visitor/
├── visitor-e2e/
├── visitor-mobile/
├── visitor-mobile-e2e/
├── zoo-keeper-mobile/
├── zoo-keeper-mobile-e2e/
├── ticket-kiosk/
├── ticket-kiosk-e2e/
├── signage-screens/
└── signage-screens-e2e/
```

Five applications, ten folders. Half of this listing is Cypress or Playwright projects that you open once a month.

An e2e project is not a peer of the application. It is part of it, it exists only to test it, and it means nothing without it. But Nx generates it as a sibling, because a flat structure is all the two project types allow, and so your `apps` folder is twice as long as the number of applications you actually have.

## So what should the folders be based on?

If not the project type, then what?

The answer I have settled on is: **who owns it, and who is allowed to use it.** Those are the two questions people actually ask when they open a folder, and they are exactly the two the default structure cannot answer.

That gives three groups, not two.

- Code owned by one application, which nobody else may import.
- Domain code, which any application may import, but which stays inside the repository.
- Published code, which has consumers outside the repository entirely.
  Three groups, three root folders:

```
apps/                                 libs/                       packages/
├── visitor/                          ├── animals/                ├── zoo-design-system/
│   ├── shell/                        │   ├── data-access/        ├── eslint-plugin-zoo/
│   ├── features/                     │   ├── ui/                 ├── nx-preset-zoo/
│   ├── data-access/                  │   ├── utils/              └── zoo-api-client/
│   ├── ui/                           │   └── types/
│   └── e2e/                          ├── enclosures/
├── visitor-mobile/                   ├── feeding/
├── zoo-keeper-mobile/                    ├── tickets/
├── ticket-kiosk/                     ├── …  other domains
└── signage-screens/                  └── shared/
                                          ├── data-access/
                                          ├── ui/
                                          │   ├── mobile/
                                          │   └── desktop/
                                          ├── utils/
                                          └── types/
```

Each folder now has a contract you can state in a single sentence:

- **`apps`**: one root folder per application. Nobody else may import it.
- **`libs`**: domain code. Any application may import it.
- **`packages`**: published. Semantic versioning, and strangers on the other end.
  Nothing here changes what Nx does. Every folder still contains ordinary Nx projects with their own `project.json`. Caching, `affected`, incremental builds and the project graph all behave exactly as before, because Nx does not care where on disk a project lives. It cares that the project exists and that it can hash it.

What changes is that the folder structure now describes your system instead of Nx's taxonomy.

### Applications own their libraries

This is the biggest departure and the one people push back on first, so it is worth being precise about what it is and is not.

A library belonging to exactly one application moves inside that application's folder. The checkout feature of the visitor application lives at `apps/visitor/features/checkout`, not at `libs/visitor/features/checkout`.

It is still a library project. It still has `"projectType": "library"` in its `project.json`. It is still cached, still tracked by `affected`, still a node in the graph, still buildable if you want it to be. Not one thing about the Nx behaviour changes.

What changes is that the path tells the truth. This code belongs to the visitor application. It was only ever made into a library so that Nx could cache it, and putting it next to the application it serves says that out loud. A developer working on the visitor application now has everything that application contains in one place, instead of jumping between two root folders and guessing which `visitor` folder they want.

It also gives the e2e project a sensible home. `apps/visitor/e2e` is obviously the visitor application's end to end tests, and your `apps` listing goes back to one entry per application.

### libs becomes domain code and nothing else

Once app-specific libraries have moved into `apps` and publishable ones into `packages`, what remains in `libs` is domain code. Animals, enclosures, feeding, tickets, and a `shared` folder for the things that genuinely cross every domain.

Each domain contains the same four kinds of library: `data-access`, `ui`, `utils` and `types`. These are the categories I described in the book, with one adjustment. Features are no longer a domain concern by default, because a feature is usually routed and owned by a particular application.

The `shared` folder contains the same four kinds of library, which is deliberate. Shared is not a magic location with its own rules. It is a domain whose name happens to be `shared`, and whose only distinction is that everybody is allowed to reach it.

### packages is for code that leaves the building

A design system published to npm is a different kind of obligation from a library imported across the repository. Breaking it costs somebody outside your team their afternoon. It needs a changelog, a version policy, and a deprecation path.

Giving it a root folder of its own is a small change that makes that obligation visible every time anyone opens the repository, instead of hiding it among nine internal libraries.

## What this does to Nx Console and your editor

This is the part I did not anticipate and now would not give up.

Nx Console lists your projects, and in a default workspace that list is flat and long. Five applications, five e2e projects, and fifty-odd libraries, all siblings, all sorted alphabetically. `visitor-checkout` sits next to `visitor-mobile-shell` sits next to `zoo-api-client`. You end up using the search box for everything, because scanning the list is hopeless.

Once projects are grouped by ownership, that list becomes a tree that matches how you think about the system. Expanding `visitor` gives you its shell, its features, its data access, its UI and its e2e project. Everything that application contains, under one node, and nothing that it does not.

The file explorer in your editor improves in the same way. Collapsed, the root of the repository is three folders instead of two crowded ones. Expanding `apps` gives you five applications rather than ten mixed entries. Expanding `libs` gives you domains, and expanding a domain gives you four libraries with entirely predictable names. The amount of scrolling you do before you find anything drops sharply, and so does the number of folders you have to mentally filter out.

There is a practical consequence for running tasks too. Because the grouping is by ownership rather than project type, the projects you want to work with together are adjacent. Running all of the visitor application's tests, or graphing just that application's dependencies, means working with one contiguous part of the tree rather than picking projects out of an alphabetical list and hoping you got them all.

None of this changes what the tooling can do. It changes how quickly you can find what you want, and over a couple of years with several developers, that is not a small saving.

## Keeping the structure in place

A folder structure that depends on people remembering it is documentation, not architecture. Two things keep this one honest, and neither of them is a wiki page.

The first is Nx tags. Every project carries tags describing its type, its domain, and the application that owns it, and `@nx/enforce-module-boundaries` turns those tags into lint rules. An application may reach into any domain. No domain may ever reach back. No application may import another application's libraries. When somebody writes an import that crosses one of those lines, the build fails rather than the review catching it, which is the only version of a boundary that actually holds.

Getting those rules right is a longer subject than it looks, and I will come back to it in a separate article, because the way most workspaces write them has a failure mode that is genuinely hard to spot.

The second thing is generators, and this is the piece that keeps the folder structure itself intact.

### Generators are what make the structure real

Nothing about the structure above is self-enforcing. If a developer runs `nx g @nx/angular:library` with the default options, they get a library wherever Nx decides to put it, tagged with nothing, and your careful three-folder split has a hole in it. One hole becomes five, and within a year you are back to a flat `libs` folder with a couple of extra directories on top.

So I do not let people run the built-in generators. Each kind of thing the workspace can contain gets its own generator, and each one knows where that kind of thing belongs.

| generator    | creates                                  | where it lands              |
| ------------ | ---------------------------------------- | --------------------------- |
| `app`        | application, shell and e2e               | `apps/<app>/`               |
| `app-lib`    | data-access, ui or utils                 | `apps/<app>/<kind>/`        |
| `domain`     | data-access, ui, utils and types at once | `libs/<domain>/`            |
| `domain-lib` | data-access, ui, utils or types          | `libs/<domain>/<kind>/`     |
| `shared-lib` | one library under shared                 | `libs/shared/<kind>/`       |
| `feature`    | a feature and facade                     | a domain, shared, or an app |
| `package`    | a publishable library                    | `packages/`                 |

Running `nx g @zoo/nx-preset:domain vet` creates four projects, four path aliases and the tags for all of them, and updates `tsconfig.base.json` on the way through. The developer supplied one word. Everything else, including the location, was derived from which generator they chose.

That is the whole point. The developer never decides where a library goes, because choosing the generator has already decided it. There is no opportunity to put a domain library in `apps`, or an app-specific library in `libs`, because no generator will do that for you.

I covered writing custom generators in _Effective Angular_, and the mechanics have not changed much since. What has changed is how I think about what they are for. I used to see them mainly as a consistency tool, a way to stop people deviating from conventions. I now see them as the thing that makes the structure true. A convention that relies on discipline decays. A convention that falls out of the tooling does not.

## What this does and does not solve

A structure like this fixes a specific class of problem, and it fixes it permanently. It tells you where code belongs. It stops applications coupling to each other. It keeps domains apart. It survives new developers and new domains, because nobody has to remember it. And it gives you back a root folder you can actually read.

It does not fix the problems that appear once code is genuinely shared, and those are the ones that tend to cost the most.

A shared component that has to behave differently in the mobile application than in the kiosk, where the obvious solutions leave both implementations in both bundles. A utility nobody imports that ends up in your initial bundle anyway, because of one line that runs when the module is evaluated. A store that answers two questions at once, so every application needing one of them gets both. Strings hard coded inside a library that one application needs to phrase differently for its own users.

Those are different problems with different answers, and most of them have nothing to do with folders. But every one of them is easier to reason about when the structure underneath is sound, which is why I always start here.

If your Nx workspace has grown past the point where the folder structure helps you, this is a good weekend of work with a payoff that compounds. And if that last section described your repository a little too accurately, that is the kind of thing I do for a living.

I run architecture reviews and workshops for teams working in large Angular and Nx workspaces. If you would like a second opinion on yours, [get in touch](https://www.heckerssoftware.com/#contactForm).
