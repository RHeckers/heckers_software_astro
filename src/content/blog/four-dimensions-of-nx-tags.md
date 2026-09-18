---
title: "Four Dimensions of Nx Tags, and Why One Is Not Enough"
description: "Nx tags are the only thing standing between a large workspace and a plate of spaghetti. Here is why the default single scope stops working, and the four-axis system I use instead."
pubDate: "2026-9-18"
heroImage: "../../assets/blog-images/nx-tags.png"
categories: ["Angular", "Nx", "Architecture"]
---

In the [previous article](/blog/your-tooling-should-not-dictate-your-folder-structure) I argued that the `apps` and `libs` split is a consequence of how Nx caches and rebuilds, and that your folder structure should describe your system instead. I finished with a claim I did not back up: that a folder structure which depends on people remembering it is documentation, not architecture.

This article is about the part that makes it architecture. It is longer and more detailed than the last one, because tags are one of those subjects where the interesting parts are all in the corners.

## What tags actually are

A tag in Nx is a string on a project. That is the whole feature.

```json
{
  "name": "animals-ui",
  "projectType": "library",
  "sourceRoot": "libs/animals/ui/src",
  "tags": ["domain:animals", "type:ui"]
}
```

Nx attaches no meaning to these strings. There is no schema, no validation, no list of allowed values. `domain:animals` means exactly as much as `banana`. You could tag a project `hello` and Nx would accept it without comment.

What makes tags useful is the second half of the feature: the `@nx/enforce-module-boundaries` ESLint rule reads them and turns them into import rules. You declare which tags may depend on which other tags, and the rule walks every import in your workspace and fails the ones that break your declaration.

That combination is what people mean when they say Nx enforces architecture. Nx does not know what a domain is. You define one by tagging projects, you define the rule by writing a constraint, and the linter does the rest.

## Why a large workspace needs them

In a small repository you do not need this. Ten libraries, one team, everyone knows what everything is for. You could enforce boundaries with a code review and a conversation.

The need shows up at a specific moment, and it is usually the same moment. Someone on the tickets team needs a piece of information that happens to live in the animals domain. They are under pressure, the import works, the build is green, and the pull request is approved because the reviewer is looking at the logic rather than the import block at the top of the file.

Nothing is wrong yet. The problem arrives six months later, when a change to the animals domain breaks a ticketing screen that nobody associates with animals. The dependency was never a decision. It was one line, added once, and it stayed.

Multiply that by twelve teams and two years and you have the failure mode every large monorepo shares: not bad code, but a dependency graph nobody designed.

Tags are how you make those moments visible. The line still gets written, but it does not survive the linter, and the developer finds out in seconds rather than in a retrospective.

## What Nx suggests by default

The Nx documentation introduces tags with a single dimension. Their example is scope:

```js
depConstraints: [
  {
    sourceTag: "scope:shared",
    onlyDependOnLibsWithTags: ["scope:shared"],
  },
  {
    sourceTag: "scope:admin",
    onlyDependOnLibsWithTags: ["scope:shared", "scope:admin"],
  },
  {
    sourceTag: "scope:client",
    onlyDependOnLibsWithTags: ["scope:shared", "scope:client"],
  },
];
```

Three tags, three rules, and a workspace where admin and client cannot reach each other while both may use shared.

This is a good introduction and a bad destination. It is easy to read, it demonstrates the mechanism in one screen, and everything you need to understand is visible at once. As a teaching example it does its job.

The trouble is that a lot of teams stop here, and a single dimension cannot express the rules a real workspace needs.

### One axis collapses different questions into one answer

Look at what `scope:client` is being asked to mean. Depending on the workspace, it might be describing which application owns the library, which part of the business it belongs to, or which team maintains it. Those are three different questions and they have three different answers, but there is only one tag to hold them.

So people start encoding several things in one string. `scope:client-tickets-ui` is a tag I have seen in the wild more than once. It works, technically, but every rule that mentions it has to name the whole combination, and adding a fourth concept means renaming every tag in the workspace.

### The interesting rules are the ones that cross axes

Here are three rules I want in every workspace I work in:

1. A UI library may not import a data-access library.
2. The visitor application may not import the kiosk application's libraries.
3. A library that runs on the server may not import Angular.

The first is about layer. The second is about ownership. The third is about runtime platform. None of them is about the same thing as the others, and no single dimension can express all three.

With one axis you can pick one of these rules and enforce it properly. The others end up in a style guide.

### A missing tag is a silent hole

There is a detail in the Nx documentation that deserves more attention than it usually gets:

> Projects without any tags cannot depend on any other projects.

This is excellent behaviour. An untagged project is refused rather than ignored, which means forgetting to tag something fails loudly.

But it only protects the untagged project as a _source_. If a tagged project imports an untagged one, whether that import is allowed depends entirely on how you wrote your rules, and the most common way of writing them lets it through. I will come back to this when we get to the app axis, because it is the single most valuable thing in this article.

## Four axes

Here is what I tag instead. Four dimensions, each answering one question, each independent of the others.

```
type:                 domain:              app:                   platform:
  type:shell            domain:animals       app:visitor            platform:desktop
  type:feature          domain:feeding       app:visitor-mobile     platform:mobile
  type:ui               domain:tickets       app:keeper-mobile      platform:angular
  type:data-access      …  other domains     app:ticket-kiosk       platform:server
  type:util             domain:shared        app:signage-screens
```

- **type** is the layer a library sits in.
- **domain** is the part of the business it belongs to.
- **app** is the application that owns it.
- **platform** is where it can run.

Every library carries a type. Domain code also carries a domain, application code also carries an app, and the platform axis is optional because most libraries run anywhere.

An animals UI library is `["domain:animals", "type:ui"]`. A visitor checkout feature is `["app:visitor", "type:feature"]`. A shared component that only works on a phone is `["domain:shared", "type:ui", "platform:mobile"]`.

Before writing any rules, there is one piece of mechanics you need to know, because everything below depends on it.

> **Constraints are combined with AND.** For a given source project, every constraint whose `sourceTag` matches one of its tags applies. A library tagged `domain:animals` and `type:ui` is subject to both the animals rule and the ui rule, and an import has to satisfy both.

This is what makes multiple dimensions work at all. The axes do not interfere with each other. You write each one as if it were the only one, and Nx intersects them.

### Axis one: type

The type axis describes layers, and the rule is that every layer reaches down only.

```js
depConstraints: [
  {
    sourceTag: "type:shell",
    onlyDependOnLibsWithTags: ["type:*"],
  },
  {
    sourceTag: "type:feature",
    onlyDependOnLibsWithTags: ["type:*"],
    notDependOnLibsWithTags: ["type:shell", "type:feature"],
  },
  {
    sourceTag: "type:ui",
    onlyDependOnLibsWithTags: ["type:ui", "type:util"],
  },
  {
    sourceTag: "type:data-access",
    onlyDependOnLibsWithTags: ["type:data-access", "type:util"],
  },
  {
    sourceTag: "type:util",
    onlyDependOnLibsWithTags: ["type:util"],
  },
];
```

Read from the bottom. A util may only use other utils, which keeps it a leaf. A data-access library may use other data-access libraries and utils. A UI library may use other UI libraries and utils. A feature may use anything except another feature or a shell. A shell may use anything.

The most useful thing in this configuration is what is missing from it. There is no rule connecting `type:ui` and `type:data-access`. They are peers, and they never reach each other in either direction. A presentational component does not fetch, a store does not render, and the only thing allowed to talk to both is a feature that sits above them.

That single absence removes an entire category of bad code from your workspace. Once a component cannot inject a store, the question of how it gets its data has exactly one answer, and you stop having that argument in code review.

Note the `type:feature` rule, which uses both properties at once. It says: you may depend on anything with a type, except shells and other features. This is a deliberate combination and it is worth understanding why it is written this way rather than as a long allow list. If you later add a new type, a feature should probably be allowed to use it, and this rule already permits that. The things a feature must never touch are a short, stable list.

### Axis two: domain

The domain axis is the simplest of the four. A domain may import itself and it may import shared.

```js
{
  sourceTag: 'domain:animals',
  onlyDependOnLibsWithTags: ['domain:animals', 'domain:shared'],
}
```

One of these per domain, plus one rule for shared itself, which may only depend on shared:

```js
{
  sourceTag: 'domain:shared',
  onlyDependOnLibsWithTags: ['domain:shared'],
}
```

That last rule is the one people forget, and it matters more than the others. Without it, shared may import from any domain, and within a year your shared folder depends on half the workspace and cannot be moved, split, or reasoned about. Shared code that imports domain code is not shared code.

When the tickets domain needs something from the animals domain, the resulting lint error is not an obstacle to work around. It is telling you one of three things: your domain boundaries are wrong, the code belongs in shared, or these two domains are really one domain. All three are worth knowing, and all three are conversations that would not have happened if the import had just been allowed.

### Axis three: app

This is where I see most workspaces get it subtly wrong, and where the payoff for getting it right is largest.

The instinct is to write a deny list. This application may not depend on the other applications:

```js
{
  sourceTag: 'app:visitor',
  notDependOnLibsWithTags: [
    'app:visitor-mobile',
    'app:keeper-mobile',
    'app:ticket-kiosk',
    'app:signage-screens',
  ],
}
```

It reads naturally and it does what it says. With five applications it is twenty tag references spread across five rules.

Now add a sixth application. You write a new rule with five entries, and you edit all five existing rules to add the newcomer. Six edits for one application, and every one of them is a place to make a mistake.

Here is the same boundary written as an allow list:

```js
{
  sourceTag: 'app:visitor',
  onlyDependOnLibsWithTags: ['app:visitor', 'domain:*'],
}
```

Each rule now names only itself and the domains. Ten tag references instead of twenty, and adding a sixth application means adding one rule and editing none.

But the maintenance saving is not the real reason to prefer it. The real reason is what happens when something is tagged wrongly.

Under the deny list, a library with a missing, misspelled or forgotten app tag matches none of the banned tags, so the import is **allowed**. Your boundary silently does not apply to it, and nothing in your build will ever tell you.

Under the allow list, that same library is not in the permitted set, so the import is **refused**. You find out immediately, and the error names the project.

That is the difference between failing open and failing closed, and in a workspace where tags are written by humans it is the difference between a boundary and a suggestion.

The `domain:*` glob is what makes the allow list practical. Nx supports wildcard matching on tags, so `domain:*` covers every domain including ones that do not exist yet. An application may reach into any domain, and no domain may ever reach back into an application, because no domain rule permits an `app:` tag.

There is one subtlety worth stating explicitly, because it confuses people the first time they hit it:

> `onlyDependOnLibsWithTags` means **at least one** of these tags, not all of them.

A library tagged `["domain:animals", "type:ui"]` satisfies the visitor application's rule because `domain:animals` matches `domain:*`. The fact that `type:ui` is not in the list does not matter. The type axis is enforced by its own separate rule, which is exactly what you want, and it is why the axes stay independent.

### Axis four: platform

The fourth axis is for code that genuinely cannot run everywhere. It is optional, it should stay small, and most libraries should carry no platform tag at all.

```js
{
  sourceTag: 'platform:desktop',
  notDependOnLibsWithTags: ['platform:mobile', 'platform:server'],
  bannedExternalImports: ['@capacitor/*'],
},
{
  sourceTag: 'platform:mobile',
  notDependOnLibsWithTags: ['platform:desktop', 'platform:server'],
},
{
  sourceTag: 'platform:server',
  notDependOnLibsWithTags: ['platform:desktop', 'platform:mobile'],
  bannedExternalImports: ['@capacitor/*', '@angular/*'],
}
```

This axis is a deny list rather than an allow list, which contradicts the advice I just gave for apps. That is deliberate. A missing platform tag means the library runs anywhere, which is the correct default and the common case. If I used an allow list here, every untagged library would be refused by the platform rules, and I would be forced to tag all several hundred of them for no benefit.

The rule of thumb: allow list when the absence of a tag is a mistake, deny list when the absence of a tag is a meaningful state.

Notice also that this is the first rule to use `bannedExternalImports`, which is a different mechanism entirely. Everything above constrains dependencies on _your own projects_. This constrains dependencies on _npm packages_, and it is worth a section of its own.

## Constraining external packages

Two properties in `depConstraints` deal with node modules rather than workspace projects.

### bannedExternalImports

A list of packages a matching project may not import. Wildcards are supported, and they are the whole point:

```js
{
  sourceTag: 'type:util',
  bannedExternalImports: ['@angular/*', 'rxjs'],
}
```

`@angular/*` matches every Angular entry point. You can also put a wildcard in the middle, so `*react*` matches `react`, `react-dom` and `react-native` in one entry.

I use this in two places. On `type:util`, to keep utility libraries framework-free, which makes them testable without a TestBed and portable if you ever need them somewhere else. And on `platform:server`, to keep server-side code free of browser frameworks.

The Nx docs give a third example worth knowing about: NestJS and Angular both export a decorator called `Injectable`, and auto-import in an IDE will happily give a developer the wrong one. Banning `@nestjs/*` on frontend projects turns a confusing runtime failure into a lint error.

### allowedExternalImports

The inverse, and considerably stricter. An exclusive list of what a project may import:

```js
{
  sourceTag: 'type:util',
  allowedExternalImports: ['date-fns'],
}
```

Anything not in the list is refused. Note the empty array case, which is genuinely useful:

```js
{
  sourceTag: 'domain:core',
  allowedExternalImports: [],
}
```

That project may import no external packages at all. If you have a domain model you want kept clean of infrastructure, this is how you say so in a way that survives a new developer.

The two properties can be combined, and the docs give a neat example of an allow list with a hole in it:

```js
{
  sourceTag: 'type:ui',
  allowedExternalImports: ['@angular/*'],
  bannedExternalImports: ['@angular/common/http'],
}
```

Angular is fine, `HttpClient` is not. A UI library that cannot reach `@angular/common/http` cannot make an HTTP call, which is the type boundary from earlier enforced a second time at the package level.

### checkNestedExternalImports

By default both properties only look at direct imports. Set this to `true` at the rule level and the checks also apply to packages your dependencies pull in transitively:

```js
'@nx/enforce-module-boundaries': ['error', {
  checkNestedExternalImports: true,
  depConstraints: [ /* ... */ ],
}]
```

This is stricter than most workspaces want, and the docs note that the nested check compares whole package names, so subpath entries behave differently than you might expect. I would not turn it on by default. It is worth knowing about when you have a genuine requirement, for example a library that must not transitively depend on anything with a particular licence.

## The rest of the rule options

Everything so far has been inside `depConstraints`. The rule itself takes several options that do not involve tags at all, and a few of them are worth turning on.

### allow

An escape hatch. A list of imports that skip all checks:

```js
allow: ["@zoo/tickets/data-access"];
```

I use this during migrations, as a visible list of known violations. It has two properties I like: it lives in version control so it only shrinks, and adding to it shows up in code review, which means somebody has to defend the addition out loud.

### enforceBuildableLibDependency

Defaults to `false`. Turn it on:

```js
enforceBuildableLibDependency: true;
```

It stops a buildable library from importing a non-buildable one. Without it you get a build that works locally and fails when you publish or when incremental builds kick in, and the error is a long way from the cause.

### banTransitiveDependencies

Defaults to `false`. When enabled, a project may only import packages declared in its own `package.json` or the root one.

This catches a common and genuinely nasty class of bug. Your library imports `lodash`, it works because something else in the workspace depends on `lodash`, and then that other project drops the dependency and your library breaks for reasons that have nothing to do with anything you changed.

I would enable this in a workspace with buildable or publishable libraries, and think about it in one without.

### allowCircularSelfDependency and ignoredCircularDependencies

The rule detects cycles, including a project importing itself through its own path alias. The first option disables the self-check. The second takes pairs of projects to skip:

```js
ignoredCircularDependencies: [["feature-project-a", "myapp"]];
```

Project names support `*` for broader matching. Both of these are pressure valves for migrations rather than things you want in a settled workspace. A cycle you have decided to ignore is still a cycle, and it will still confuse `affected`.

### checkDynamicDependenciesExceptions

Nx flags static imports of lazy-loaded libraries, because importing one eagerly defeats the lazy loading you configured. This option lists imports to skip that check:

```js
checkDynamicDependenciesExceptions: ["@myorg/lazy-project/component/*"];
```

Reach for it when you have a genuine reason to import something both ways, for example a type-only import from a lazy route.

### allSourceTags

Back inside `depConstraints`, and the one property I have not used yet. A constraint must specify either `sourceTag` or `allSourceTags`, and the latter requires the source project to carry **all** of the listed tags:

```js
{
  allSourceTags: ['type:ui', 'platform:mobile'],
  bannedExternalImports: ['@angular/platform-browser'],
}
```

This is how you express a rule about an intersection rather than an axis. Most of your rules should be single-axis, because that is what keeps the system comprehensible, but when you genuinely need "mobile UI libraries specifically", this is the tool.

## The failure mode nobody talks about

Everything above is correct and none of it is sufficient, for a reason that has nothing to do with the rules themselves.

Count what we have. Five type rules, one per domain, one per application, three platform rules. With fourteen domains and five applications that is twenty-seven constraint objects, written by hand, most of them identical apart from a name.

Now picture a developer on a Tuesday. They create a new domain, generate its libraries, build the feature, open a pull request and ship it. At no point did anything require them to open `eslint.config.mjs`, because the feature works perfectly without it.

No constraint has that domain as its `sourceTag`. Nothing restricts those libraries. The lint passes. You have a boundary that exists in your documentation and in nobody's build.

And because of the "at least one" semantics from earlier, their libraries are perfectly importable by everything else, so nothing downstream complains either.

The rules are not the problem. Remembering to write them is the problem.

## Generating the constraints

The fix is to stop writing them by hand. The flat config is a JavaScript module, which means the constraints can be derived from the workspace itself:

```js
// eslint.config.mjs
import { collectTags } from "./tools/collect-tags.mjs";

const domains = [...collectTags(process.cwd(), "domain:")].filter(
  (tag) => tag !== "domain:shared",
);

const domainConstraints = domains.map((domain) => ({
  sourceTag: domain,
  onlyDependOnLibsWithTags: [domain, "domain:shared"],
}));

const apps = [...collectTags(process.cwd(), "app:")];

const appConstraints = apps.map((app) => ({
  sourceTag: app,
  onlyDependOnLibsWithTags: [app, "domain:*"],
}));
```

`collectTags` walks the workspace, reads every project's configuration, and returns the set of tags carrying a given prefix. Fifty lines of code, no dependencies beyond the devkit.

Then you assemble the pieces:

```js
depConstraints: [
  ...typeConstraints,
  ...domainConstraints,
  {
    sourceTag: 'domain:shared',
    onlyDependOnLibsWithTags: ['domain:shared'],
  },
  ...appConstraints,
  ...platformConstraints,
],
```

Two static sets that you write once, two generated sets that maintain themselves, and one explicit exception for shared.

A new domain is now constrained the moment it has a tag. Nobody has to remember anything, and the config stops growing linearly with the workspace.

## Tags have to be output, not convention

Generated constraints are only as trustworthy as the tags they read, and tags typed by hand go missing eventually. So the last piece is a set of custom generators, one for each kind of thing the workspace can contain.

| generator    | creates                                 | tags it writes                            |
| ------------ | --------------------------------------- | ----------------------------------------- |
| `app`        | application, shell and e2e              | `app:<name>` + `type:app \| shell \| e2e` |
| `app-lib`    | data-access, ui or util                 | `app:<app>` + `type:<kind>`               |
| `domain`     | data-access, ui, util and types at once | `domain:<name>` + `type:<kind>`           |
| `domain-lib` | one library in an existing domain       | `domain:<domain>` + `type:<kind>`         |
| `shared-lib` | one library under shared                | `domain:shared` + `type:<kind>`           |
| `feature`    | a feature and facade                    | scope tag + `type:feature`                |
| `package`    | a publishable library                   | `domain:shared` + `type:<kind>`           |

Running `nx g @zoo/nx-preset:domain vet` creates four projects, four path aliases and eight tags, and updates `tsconfig.base.json` on the way through. The developer supplied one word. Every tag was computed from arguments they had already given.

That is the whole chain, and it only holds if every link does. Generators make the tags true. True tags make the generated constraints trustworthy. Trustworthy constraints make the boundaries real. Remove any one of the three and you are back to a wiki page that describes a system nobody enforces.

## Turning it on without stopping the world

Everything above describes a finished state. If you are adding this to a workspace that already exists, do it in this order:

**Tag everything and move nothing.** Tags are free, reversible, and invisible to the build. This step alone forces you to classify every project explicitly, and that classification is routinely surprising. A library sitting in shared turns out to have one consumer. A library named after one application turns out to be used by three.

**Turn the constraints on as warnings.** Severity is just the first element of the rule configuration:

```js
'@nx/enforce-module-boundaries': ['warn', { /* ... */ }]
```

Now you have a list of every boundary you have already broken. Check your lint target while you are here, because `maxWarnings` in `nx.json` or `project.json` will happily turn your warnings back into build failures.

**Fix one domain at a time, and promote it to error as you go.** Flat config lets later entries override earlier ones by file pattern, so enforcement becomes a ratchet rather than a switch:

```js
export default [
  { rules: { "@nx/enforce-module-boundaries": ["warn", config] } },

  {
    files: ["libs/animals/**/*.ts", "libs/tickets/**/*.ts"],
    rules: { "@nx/enforce-module-boundaries": ["error", config] },
  },
];
```

Move domains into the second block as you finish them. This matters more than it looks: a blanket `warn` also disarms the code that was already correct, and warnings nobody is actively burning down become invisible within about a week.

**Generate the constraints and write the generators last**, once the shape has stopped changing.

## What tags will not do for you

Tags constrain the dependency graph. That is a large and important job, and it is the only job they do.

They will not stop a shared component from needing to behave differently in one application than in another. They will not stop a utility nobody imports from ending up in your initial bundle because of one line that runs when the module is evaluated. They will not stop a store from answering two questions at once, so that every application needing one of them gets both. And they will not stop a library from hard coding a string that one application needs to phrase differently for its users.

Every one of those is a problem in code that is correctly placed and correctly tagged. They are the problems you get to have once the graph is under control, and in my experience they are where the remaining cost is hiding in a mature workspace.

If you are staring at a single `scope:` dimension and wondering how much of the above applies to you, the tagging step is a day of work and tells you a great deal. And if the last section sounded like a description of your repository rather than a list of hypotheticals, that is the kind of thing I do for a living.

I run architecture reviews and workshops for teams working in large Angular and Nx workspaces. If you would like a second opinion on yours, [get in touch](https://www.heckerssoftware.com/contact).
