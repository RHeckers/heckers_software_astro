---
title: "Onboarding an Existing Project into Your Nx Monorepo Without Rewriting It"
description: "Most monorepo migrations stall halfway, with a project stuck between the shape it had and the shape the workspace needs. Here is why that happens, and an approach that brings a tangled codebase in, seals it, and untangles it from the leaves up, with every step leaving the workspace in a complete state."
pubDate: "2026-10-25"
heroImage: "../../assets/blog-images/onboarding-existing-projects.png"
categories: ["Angular", "Nx", "Architecture"]
---

The worst state an Nx workspace can be in is not "no boundaries". It is "boundaries for some of it". I see this more often than any other problem when I look at a monorepo for the first time: three applications that follow the rules, one that half follows them, and a fourth that was brought in eighteen months ago and still looks exactly like the standalone repository it came from, except that now it lives in `apps/` and imports things it should not.

Nobody plans for that. The migration started with good intentions, somebody moved a few folders, the first lint run reported four hundred violations, every fix cascaded into three more, and the work was parked "until there is time". There is never time. So the workspace carries two conventions indefinitely, and every new developer has to learn both and guess which one applies.

This article is about doing it differently. Not about the target structure, which I have written about [elsewhere](https://www.heckerssoftware.com/blog/your-tooling-should-not-dictate-your-folder-structure/), but about the path from a tangled existing project to that structure, in a way that never leaves the workspace half done. The approach rests on one idea: **you do not restructure the project, you seal it and extract from it, leaves first.** The tangled core stays private while it shrinks, and only what is genuinely about the application stays private at the end.

## Why migrations stall

A migration stalls for one reason, and it is a sequencing mistake rather than an effort problem.

The instinct is to start with the folders. Take the incoming project, split it into `data-access`, `ui`, `features`, tag everything, turn the boundary rules on, and fix what breaks. That is how the target structure is described, so it feels like the natural order.

The trouble is that an existing project has dependencies in the wrong places, because nothing ever stopped it from having them. A component imports a service three folders away. A utility reaches into a store because that was convenient once. Two modules import each other through a barrel and nobody has noticed. When you split that project into libraries and turn the rules on, **every one of those wrong dependencies becomes a visible violation at the same moment.** Four hundred of them, on the first run.

Then the cascade starts. To fix a `ui` component that imports a store, you move the store, but the store imports a type from the component's folder, so you move the type, but the type is used by a feature that now has a circular reference. Each fix opens two more. At some point the team concludes, correctly, that fixing all of it means rewriting most of the application, and they stop. The folders have already moved, so the project is now in the worst state: split up, tagged, rules off, and no longer matching either convention.

The mistake is not the ambition. It is that the first step exposed every problem at once and made the remaining work indivisible. The fix is a sequence in which every step is complete on its own, so that stopping at any point leaves a workspace with one convention, not two.

## The reframe

Before the steps, the idea that makes them work.

An application in a well-structured workspace owns its own libraries. Its features, its UI, its data access live under `apps/<name>/` and nothing outside the application may import them. That is not a compromise for legacy code. It is the rule for every application, and it means **application-private code is allowed to be shaped however the application likes.** The workspace does not care whether `apps/legacy/` is a beautiful lattice of small libraries or one large project with a tangle in the middle, as long as nothing outside it depends on the tangle.

So the goal of onboarding is not to make the incoming project look like the others on the inside on day one. The goal is three things, in order:

1. **Seal it.** Nothing outside may import from it, and it may only import from the workspace through legal channels.
2. **Extract what others already need.** Code that other applications or domains depend on moves out first, into properly placed, properly tagged libraries.
3. **Extract the rest of its domain code**, piece by piece, into `libs/<domain>`, until what remains in the application is only what is truly about that application.

The tangled core stays inside the application while this happens, for as long as it takes. That is the part the team was dreading rewriting, and you never rewrite it. You take pieces out of it, leaves first, and the tangle shrinks until it is gone.

The third point deserves emphasis, because it is where I see teams stop too early. It is tempting to extract only what other applications need right now and call the rest application-private. But shared domain code is shared whether or not a second consumer exists yet. A product catalogue model, its store, the presentational components that render a product the same way everywhere: those belong in `libs/products` even if the warehouse is the only application using products today, because the next application that touches products should find them there, already shaped by the rules, rather than build its own copy in `apps/<other>/` with slightly different assumptions. Putting shared domain code where it lives is what makes it visible, and visibility is what makes reuse happen.

Note the word *shared*. A domain folder holds the part of a domain that every application agrees on. It does not hold everything that mentions the domain. An application can and often does have domain logic of its own: validation rules that only apply at the warehouse, a product status that only the kiosk cares about, a computed field that one screen needs. That code is about products and it is still application code, because no other application would want it as it stands. It lives in `apps/warehouse/data-access` or `apps/warehouse/utils`, imports the shared domain, and extends it. The split is not "domain code goes to `libs/`, the rest stays". It is "the shared part of a domain goes to `libs/<domain>`, and each application keeps its own part next to its screens".

## Rule one: every step leaves a complete state

Each step below ends with the workspace in a state you could stop at. One convention, enforced, with the incoming project either fully inside the rules or fully outside them, never between. If a step cannot be finished in the time available, it is not started.

That rule sounds like process. It is actually what prevents the two-convention trap, because the trap is nothing more than a step that was started and not finished.

## Step 0: bring it in whole

Move the incoming project into the workspace as **one project**. Not split, not restructured. One application under `apps/`, with its existing source tree intact, its own `project.json`, and its build, serve and test targets wired up.

```
apps/
├── visitor/
├── keeper-mobile/
└── warehouse/          ← the incoming project, untouched inside
    ├── project.json
    └── src/
        └── app/        ← whatever it looked like before
```

Resist the urge to tidy. The point of this step is that the project builds and tests inside the workspace, through Nx, with caching and `affected` working, and with no change to its internals. If it has its own `package.json`, merge dependencies into the root and resolve version conflicts now; that is real work and it is the right work for this step, because it is the part that can break the build. Folder structure cannot break the build, so it waits.

Tag the project as an application:

```json
{ "name": "warehouse", "tags": ["app:warehouse", "type:app"] }
```

Done. The workspace now has one more application, and it follows one rule: it is an application. That is a complete state.

## Step 1: seal the perimeter

Now make the application's edges honest, without touching its interior.

The incoming project almost certainly imports things it should not, and other things in the workspace may already have started importing from it, if it was dropped in some time ago. Both directions need a rule, and the application tag gives you both:

```js
{
  sourceTag: 'app:warehouse',
  onlyDependOnLibsWithTags: ['app:warehouse', 'domain:*'],
}
```

Read as two statements. The warehouse may import its own libraries and any domain. Nothing else may import from the warehouse, because no other rule permits `app:warehouse` as a target.

Turn that on and look at what fails. The violations fall into exactly two categories, and that is the whole value of this step.

**Inbound violations** are other projects importing from the warehouse. They are rare and they are the most important thing to fix first, because each one is a piece of the warehouse that something else already depends on. Write them down; they are your extraction list for the next step.

**Outbound violations** are the warehouse reaching somewhere illegal: into another application's libraries, into a `platform:server` library from a browser app, into a deep path past a barrel. These are usually few, because the project was standalone until recently and had nothing to reach into. Fix them, or put them in the `allow` list with a comment and a ticket, and move on.

Notice what this step did not do. It did not turn on `type:` rules inside the warehouse. The warehouse's interior is one project with one set of tags, so the type rules have nothing to say about it. Its `ui` code importing its `data-access` code is invisible to lint, because there is no `ui` library and no `data-access` library, only an application. That is deliberate and it is correct: the interior is private, and private code is allowed to be tangled.

After this step the warehouse is a sealed box. Its edges are enforced, its interior is its own business, and the workspace has one convention. Stop here if you need to; nothing is half done.

## Step 2: extract what others already need

Your inbound list from step 1 names the pieces of the warehouse that other projects already depend on. Each one is a piece of shared code that is currently living in the wrong place, and each one is a self-contained extraction.

Take them one at a time. For each piece:

1. Decide where it belongs. A date utility goes to `libs/shared/utils`. A product type goes to `libs/products/types`. A store other applications need goes to `libs/products/data-access`. The destination is the structure you already use for the rest of the workspace, so the decision is usually obvious.
2. Create the destination library with your generator, so it arrives tagged and placed correctly.
3. Move the code, and repoint every importer, inside and outside the warehouse, to the new alias. `nx g move` handles the mechanical part when you are moving a whole library; for a piece of a larger project you move the files and fix imports by hand, and the compiler tells you what you missed.
4. Run lint. The new library is subject to the full type and domain rules, because it is a real library now. If it imports something it should not, that is a dependency the piece was carrying, and it has to be resolved before the extraction is complete.

That fourth point is where extractions get stuck, and it has a specific answer in the next step. For now, the rule is: an extraction is finished when the new library passes lint, or it is reverted. A library that is half out, with violations suppressed, is the two-convention trap in miniature.

When the inbound list is empty, nothing outside the warehouse depends on its interior. Every piece that was already shared has a proper home. That is a complete state, and a reasonable place to pause. It is not the end, because the warehouse still holds domain code that nobody else happens to import yet, and that code has a home too.

## Step 3: untangle from the leaves

Steps 1 and 2 handled the edges. What remains is a project whose interior still has dependencies pointing every direction, and most of that interior is domain code that belongs in `libs/`. The question is how to get it there without the cascade that stalled the first attempt.

The answer is a technique, and it is the one thing I would ask you to take from this article.

**Extract leaves first.** A leaf is a module that depends on nothing else inside the application: a pure utility, a set of types, a presentational component with inputs and nothing injected. Leaves are the only modules that can be extracted with no risk of a wrong-direction dependency, because they have no dependencies to be wrong. Move a leaf out, point the application at the new library, and lint passes by construction.

Then the next layer. Once the leaves are out, some modules that depended only on leaves now depend only on things outside the application. They have become leaves. Extract those. Repeat.

This is the opposite of what the stalled migration tried. That attempt started at the top, with features, and every feature dragged its entire dependency closure with it. Working from the bottom, each extraction drags nothing, and the tangle is left behind in the shrinking application where it is allowed to exist. You are not untangling the knot. You are pulling the loose threads out of it until what is left is small enough not to matter.

### Finding the leaves

You need a file-level dependency graph, because `nx graph` works at the project level and the warehouse is one project. Two tools do this well: `madge` and `dependency-cruiser`. Either will give you, for every file, what it imports and what imports it.

```
npx madge --extensions ts --json apps/warehouse/src > deps.json
```

From that, leaves are the files whose outgoing edges all point outside the application. Sort by number of inbound edges and extract the most-imported leaves first: those are the ones whose extraction frees the most other modules to become leaves in turn.

Both tools also report circular dependencies, which brings us to the part that makes people give up.

### Breaking cycles

A cycle is two or more modules that import each other, usually through a barrel that hides the loop. Cycles are why the first migration attempt felt like a rewrite: a module in a cycle can never be a leaf, so it can never be extracted cleanly, and the cycle usually includes the most central modules in the application.

Almost every cycle I have seen in Angular code has the same shape, and the same fix.

**Types and implementation in one file.** `product.store.ts` exports both the `Product` interface and the store. `product-card.component.ts` imports `Product` from the store file. The store, for its own reasons, imports something from a file that imports the component. Nobody intended a cycle; it exists because a type lived next to its first user.

The fix is to move the type into its own module, usually a `types` library, and repoint both sides. The component imports the type from `types`. The store imports the type from `types`. Neither imports the other. The cycle is gone, and the `types` library is a leaf, so it extracts immediately. I would estimate that this one move resolves the majority of cycles in a typical application.

**A barrel that re-exports everything.** `index.ts` exports forty things, so importing one of them evaluates all forty, and somewhere in those forty is an import back to the file you started from. The fix is to stop importing from the barrel inside the application and import from files directly until the extraction is done. Barrels are for the outside of a library, not for traffic inside it.

**Two services that genuinely call each other.** Rarer, and real. `OrderService` calls `InventoryService` to reserve stock, and `InventoryService` calls `OrderService` to find pending orders. This is a design problem, not a file-layout problem, and no amount of moving fixes it. The resolution is to invert one direction: `InventoryService` exposes an injection token that `OrderService` provides an implementation for, or the shared concern is pulled into a third thing both depend on. Expect one or two of these per application. Do them last, and do them on purpose.

Once the cycles are broken, every module in the application is either a leaf or will become one as leaves are removed. The extraction proceeds mechanically from there.

### Where the extracted code goes

Every extracted piece gets one of two destinations, and the default is the domain.

**Domain code goes to `libs/<domain>`.** A `Product` type goes to `libs/products/types`. The product store goes to `libs/products/data-access`. A product card with inputs and nothing injected goes to `libs/products/ui`. It does not matter that the warehouse is currently the only application importing any of it. The domain is the home for code about the business, and placing it there is what lets the next application find it instead of rebuilding it. If the domain does not exist in the workspace yet, create it; a domain with one consumer is still a domain, and it is visible in `libs/` to everyone who comes after.

The test for whether something belongs in the domain: **would a second application built on this part of the business want it unchanged?** If yes, it is shared domain code and it moves to `libs/<domain>`. If it would need to change, because it encodes a rule or a screen that only the warehouse has, it is application code, even when it is clearly about the domain.

Validation is the example that comes up most. Every application agrees that a product needs a SKU and a non-negative price, so those rules live in `libs/products/utils` as a shared validation set. The warehouse additionally requires a bin location, which no other application has a concept of. That rule does not go to the domain with a flag on it. It lives in `apps/warehouse/utils`, imports the shared set, and adds to it. The domain holds the rules everyone shares and stays extensible; each application owns the rules that are its own. The same shape applies to computed fields, status enums, formatting, and anything else where "about the domain" and "shared by every application" turn out to be different things.

**Application code goes to the warehouse's own libraries**, under `apps/warehouse/`:

```
apps/warehouse/
├── shell/
├── features/
├── data-access/
├── ui/
└── utils/
```

The warehouse's routed pages, its orchestration across domains, a receipt layout that only a warehouse terminal prints: these go to `apps/warehouse/features` or `apps/warehouse/ui`, tagged `app:warehouse` and the right `type:`, and the type rules apply to them from that moment. This is the first time the warehouse's interior has had any boundary at all, and it arrived one library at a time rather than all at once.

One honesty check on the domain side. Code that is *about* products but that encodes the warehouse's assumptions, a product store with a `warehouseId` baked into every query, say, is not shared domain code. Moving it to `libs/products` as it stands creates a domain library that knows one application, which every other application will then inherit. Either generalize it first, so the assumption becomes a parameter, or keep it in `apps/warehouse/data-access`, where application-specific domain logic belongs. The domain is for code that any application could use, not for code that one application happens to have written.

### Knowing when to stop

The application shrinks with every extraction, and the question is when it is small enough.

My answer: **the migration is over when every piece of shared domain code is in its domain, and the application holds only what is truly its own.** A shell with routing and bootstrap, feature libraries for its screens, and the application's own domain logic, the validation, computed fields and data access that no other application would want, kept next to the screens that use it. At that point the warehouse looks like every other application in the workspace, its domains are visible in `libs/` for anyone who needs them, and nothing about products or orders is hidden inside an application folder where the next team cannot see it.

The path there can be gradual. After step 2 the perimeter is sealed and nothing outside depends on the interior, so the remaining extraction can proceed one leaf at a time, whenever someone is in that code anyway. Because leaf extraction is mechanical and self-contained, it does not need a project or a budget. It needs a rule that any module you touch, you consider extracting, and a graph you can consult to see whether it is a leaf yet. What it does need is a direction: the shared domain code is going to `libs/`, and the application keeps only its own extensions of it.

What you must not do is the thing the first attempt did: split the interior into libraries before the cycles are broken, turn the rules on, and leave the violations. That produces the half-migrated state this article is about, and it is strictly worse than leaving the interior as one project.

## Enforcement that only moves one way

The rules need to be on for all of this to mean anything, and they need to be on in a way that lets the warehouse be a work in progress without the rest of the workspace losing enforcement. Flat ESLint config makes this straightforward.

The baseline is `error` for everything. The warehouse, while it is being untangled, gets a file-pattern override:

```js
export default [
  {
    rules: { '@nx/enforce-module-boundaries': ['error', config] },
  },
  {
    files: ['apps/warehouse/**/*.ts'],
    rules: { '@nx/enforce-module-boundaries': ['warn', config] },
  },
];
```

Everything in the workspace is held to the rules. The warehouse warns instead, so that its known violations do not break the build while they are being worked through. As libraries are extracted from it and pass lint, they leave the override's file pattern and are held to `error` like everything else. The override shrinks as the migration proceeds, and when the warehouse is a shell, you delete it.

Two guards keep the warnings from going stale.

**A cap that only goes down.** `maxWarnings` on the warehouse's lint target, set to the current count on the day you turn the rules on, and lowered every time somebody fixes one. The build fails if the count ever goes up. This turns "we have warnings" into "we have exactly 183 warnings and the number is falling", which is a state a team can see and a manager can track.

**An `allow` list for the ones you are deliberately leaving.** A violation you have decided not to fix this quarter goes in the rule's `allow` array with a comment saying why and a ticket number. It is in version control, it shows up in review when somebody adds to it, and it is a list that is expected to shrink. That is a better home for known debt than a warning nobody reads.

Both of these are the opposite of what a stalled migration leaves behind, which is a rule turned off and four hundred violations nobody can count.

## Cadence

Two kinds of work are in the steps above, and they want different cadences.

**Steps 0 through 2 are a project.** Bringing the code in, sealing the perimeter, and extracting what others need is a bounded piece of work with a definition of done, and it should be scheduled as one. A week for a mid-sized application is realistic, and most of it is step 0, resolving dependency versions.

**Step 3 is a habit.** Leaf extraction is mechanical and self-contained, and the cost of doing one is small. It belongs in the ordinary flow of work: whoever touches a module checks whether it is a leaf, and if it is, extracts it as part of the change. The graph tells you what is a leaf; the generator makes the new library; the compiler finds the imports. An hour, usually less.

Cycle breaking sits between the two. It is not mechanical, so it needs someone who understands the application, but it is also not large; a handful of cycles per application, each fixed in an afternoon. I would schedule it explicitly, after step 2 and before relying on the leaf-extraction habit, because until the cycles are broken the habit has nothing to work on.

## Signs that it is stalling

Finally, the symptoms I look for when a migration has quietly stopped, so you can catch them early.

**Warnings that have not moved.** If `maxWarnings` has been at the same number for a month, nobody is extracting leaves. The habit has not taken, and it needs either a dedicated push or a conversation about why.

**New code in the old shape.** If developers are adding features inside the tangled interior rather than in `apps/warehouse/features/`, the two-convention trap is reforming. The fix is usually the generator: if the only way to make a new feature is the generator, it lands in the right place.

**An `allow` list that grows.** Entries added faster than they are removed means violations are being filed rather than fixed. Each entry should have a ticket, and the tickets should be closing.

**A split that happened before the cycles were broken.** Someone, eager to make progress, divided the interior into libraries while it still had cycles, and now there are suppressed errors in lint. Revert the split. It feels like going backwards; it is actually the only way forward, because the libraries cannot be made to pass until the cycles are gone, and the cycles are easier to break in one project than across six.

Each of these is cheap to detect and expensive to ignore, which is the usual shape of the thing.

## What this gives you

A migration that can stop at any step and leave the workspace with one convention. An incoming project that is sealed on day two and extracted from over the following weeks, with nothing rewritten and the tangled core shrinking rather than being attacked, until its shared domain code is where every other team can find it, and what remains behind is the application's own screens and its own extensions of the domains it uses. Enforcement that holds everywhere except inside the one project being worked on, and a count that only falls.

Most importantly, a team that is not afraid of the next project, because the approach does not depend on the incoming code being tidy. It depends only on being able to find the leaves, and every codebase has leaves.

If you have a workspace with a project stuck halfway, the first step is almost always the same: find out whether the interior has cycles, and how many. That one number tells you how much of the above you need. It is the kind of assessment I do with teams regularly, and it tends to take an afternoon.

I run Nx and Angular architecture reviews and workshops for teams working in large workspaces. If you would like a second opinion on yours, [get in touch](https://www.heckerssoftware.com/#contactForm).
