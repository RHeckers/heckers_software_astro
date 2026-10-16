---
title: "Smart and Dumb Components Are Not Enough: The Slice in Between"
description: "Container and presentational components are a good start, and a bad place to stop. Here is where the friction comes from in a large Angular workspace, what a domain slice and a feature slice are, when a slice is the right call, and what goes wrong when it is not."
pubDate: "2026-10-16"
heroImage: "../../assets/blog-images/slices-between-smart-and-dumb.png"
categories: ["Angular", "Nx", "Architecture"]
---

Most Angular teams split their components into two kinds: the ones that fetch data and the ones that display it. Whether they call it container and presentational, smart and dumb, or page and UI component, the idea is the same, and it is a good one. It is also, in my experience, the point where most teams stop thinking about component architecture, and somewhere around the second year of a large codebase, it starts to cost them.

The cost does not usually look like a component with thirty inputs. It looks like a value that enters at a routed page and has to pass through four presentational components to reach the one that needs it, with three of those components carrying an input they never use. That is prop drilling, it is the main friction in a two-category model, and it is what this article is about.

The answer I use is a third category, which I call a **slice**, with two flavors that I set up in every Nx workspace I work on.

A note on the word before we start. "Slice" is not an official term and you will not find it in the Angular documentation. I call it that because it is a fully self-contained UI slice of a domain or a feature, closer to a widget than to a page. If your team has another name for the same thing, keep yours. The idea matters more than the label.

> The examples use the zoo workspace from my talk at Angular Zürich, on GitHub at [RHeckers/zoopervisor-nx-demo](https://github.com/RHeckers/zoopervisor-nx-demo). They assume Angular 20 with signals and NgRx Signal Store, but nothing here depends on the store library. If the repository is useful to you, a star is appreciated 😄.

## Two kinds of component

If you have not met the pattern under these names, here it is in full. Dan Abramov described it in 2015 as **container and presentational components**, writing about React. The Angular community mostly says **smart and dumb**. Both names describe the same two roles.

A **container component** owns a screen. In an Angular application it is almost always the routed component, which is why I usually just say *page*. The page injects what it needs, decides what to load and when, and hands the results to the components beneath it. It is the one place on a screen that knows where data comes from.

In a workspace with more than a handful of pages, the page does not compute its lookups itself. They are shared, through a facade service or, in signal-based code, an **inject function**: a plain function that runs in an injection context and returns the composed signals.

```ts
// libs/animals/data-access/src/lib/inject-animal-status.ts
export function injectAnimalStatus(animalId: Signal<string>): Signal<AnimalStatus | undefined> {
  assertInInjectionContext(injectAnimalStatus);
  const store = inject(animalStore);
  return computed(() => store.entities().find((a) => a.id === animalId())?.status);
}
```

Every page that needs the status calls it in one line. The lookup lives once, in `data-access`, and the page's job is reduced to deciding what to load and binding the results:

```ts
@Component({
  selector: 'keeper-animal-detail',
  imports: [AnimalProfileCardComponent],
  template: `
    @if (store.selected(); as animal) {
      <zoo-animal-profile-card [animal]="animal" [status]="status()" />
    }
  `,
})
export class AnimalDetailComponent {
  protected readonly store = inject(animalStore);
  private readonly route = inject(ActivatedRoute);

  private readonly id = signal(this.route.snapshot.paramMap.get('id')!);
  protected readonly status = injectAnimalStatus(this.id);

  constructor() {
    this.store.load(this.id());
  }
}
```

**Presentational components** are everything the page is built from. They receive data through inputs, report events through outputs, and inject nothing. Give one the same inputs twice and it renders the same thing twice. They live in your `ui` libraries, and I organize them the way atomic design does, because the vocabulary matters below:

- **Atoms** are indivisible: a button, a badge, an input.
- **Molecules** are small groups of atoms with one purpose: a labeled field, a card header.
- **Organisms** are larger sections assembled from molecules: an animal profile card, an enclosure panel, a form.

A page composes whatever it needs, usually organisms but just as often a molecule or a lone atom placed directly on it. Organisms compose molecules, molecules compose atoms, and the levels only go downward. Data enters at the page and flows down through however many levels sit between it and the component that needs it; events flow back up the same way.

```ts
@Component({
  selector: 'zoo-status-badge',
  template: `<span class="badge" [class]="tone()">{{ label() }}</span>`,
})
export class StatusBadgeComponent {
  readonly status = input.required<AnimalStatus>();

  protected readonly label = computed(() => STATUS_LABELS[this.status()]);
  protected readonly tone = computed(() => STATUS_TONES[this.status()]);
}
```

That badge is an atom. It is trivially testable and renders anywhere there is a status. If you are building one application with a dozen screens, this will serve you for years, and I would not change it.

The trouble is not with the split, and it is not with the lookups. It is with what happens to the levels in between when a component three layers down needs something the page has.

## Where it starts to hurt

The badge should show *live* status: an animal in surgery, recently moved, or with a feeding overdue. The page has that, from `injectAnimalStatus`, in one line. The badge needs it. Between them sit the organism and the molecule that make up the card.

Under the split, nothing between the page and the badge may inject anything, so the page passes the value down:

```html
<!-- page -->
<zoo-animal-profile-card [animal]="animal" [status]="status()" />

<!-- organism: zoo-animal-profile-card -->
<zoo-card-header [name]="animal().name" [status]="status()" />

<!-- molecule: zoo-card-header -->
<h2>{{ name() }}</h2>
<zoo-status-badge [status]="status()" />
```

Three components carry `status`. One uses it. The card and the header each gained an input purely so the badge can have one. The lookup was one line; the wiring is three inputs across three components. That is prop drilling, and the wiring is the whole problem.

It spreads. The feeding row needs the next feeding, the header needs the enclosure name, the footer needs the last sighting. Each is one value the page obtains in one line and then carries through the same organism and molecule to reach a leaf. The organism that started with an `animal` input now has five and uses one of them. Nobody designed it that way. It happened one leaf at a time.

It repeats. Every page that renders the card calls the same four inject functions and writes the same four bindings: the detail page, the keeper list with thirty cards, the signage screens, the map popover. The lookups live once; the plumbing that carries their results is rewritten on every page.

You might collapse the four calls into one `injectAnimalProfileCardData()`. The four values come from four domains, though: status from animals, the next feeding from feeding, the enclosure from enclosures, the sighting from the keeper log. A function that reads all four cannot live in any of them, because a domain may not import another domain. It can only live in an application. So the composite exists, per application, and it does nothing for the bindings underneath. I will come back to where it belongs.

And reuse is only half real. The card is in `libs/animals/ui` and any page may render it. Rendering it *correctly* means supplying four live values and threading them through two levels, and that part is rebuilt by every new screen and copied into every new application. The reusable part is the component. The part that keeps getting rewritten is everything that connects it to its data.

Module boundaries make the shape explicit. `type:ui` may not depend on `type:data-access`, so neither the card, the header nor the badge may call `injectAnimalStatus`; the wiring is forced into the page. And `type:feature` may not depend on `type:feature`, so one page cannot reuse another page's template. The only legal place for "a card that knows how to find its own live status" is a page, and pages are not reusable by rule. When code has no legal home it ends up somewhere illegal: a `ui` library that quietly imports a store, or a shared library that imports a domain. Both are boundary violations with a good excuse, and good excuses are how boundaries die.

## The thing the model has no word for

Every one of those symptoms comes from the same assumption: **data enters at the page and flows down through every level.** That assumption is right for a screen. It is wrong for a widget.

A widget is a self-contained piece of UI that is meaningful on its own. An animal's status. An animal's feeding schedule. A ticket's validity. These are not pages, and they are not pure presentation. They are small units that know how to find their own data for one entity and get dropped into many screens across many applications. The two-category model has no word for them, so it either forces them to be presentational, with the drilling that follows, or forces them to be pages, which puts them in features where nothing else can reach them.

Before naming the third category, it is fair to ask whether an existing technique already solves this. Teams usually try three.

## The usual answers

### Content projection

Keep the layout components dumb and let the page project the wired element into them. The list leaves a slot; the page fills it with what it has the data for:

```html
<zoo-list>
  @for (animal of store.entities(); track animal.id) {
    <zoo-list-row [title]="animal.name">
      <zoo-status-badge badge [status]="statusById()[animal.id]" />
    </zoo-list-row>
  }
</zoo-list>
```

`zoo-list-row` has `<ng-content select="[badge]" />` and knows nothing about animals. This works well under two conditions: the component rendering the slot owns the data, and the slot is one level deep.

Both fail as soon as the widget sits inside something shared. Put the row inside a shared card, inside a shared panel, and the slot has to be threaded through both. Each intermediate component gains an `<ng-content>` it does not use, and a consumer of the panel that does not want a badge still has the hole. That is the threading problem from the photo picker in [my previous article](https://www.heckerssoftware.com/blog/shared-component-different-behavior-per-app/): projection does not solve it, it is the mechanism that causes it. And a slot is filled once; if the dumb component loops internally, you reach for `ng-template` and a context object, and you have reinvented drilling one level more abstractly.

Projection is the right tool for layout: cards with header and footer slots, dialogs, panels where the consumer genuinely owns the content. It is the wrong tool for a widget that needs to appear inside components the consumer does not own.

### Everything smart

The opposite instinct: let every component inject what it needs. The badge injects the animal store. So does the row. So does the card. There is no drilling, because nothing is passed down.

For a small application with one team and no shared libraries, this is fine. The problems arrive with size, and they arrive together.

**Every component needs a store to render**, so none of them can be shown in a test, a story or a docs page with plain data, and `<zoo-status-badge />` with no inputs reads as if it needs nothing while needing a store and an API client.

**The `ui` to `data-access` boundary is gone**, so `libs/shared/ui` imports domain stores and every application that uses a shared button carries whatever store the button reads.

**The dependency graph turns into a mesh.** Nx records dependencies per *project*. If one component in `libs/animals/ui` injects `animalStore`, the entire `animals-ui` project now depends on `animals-data-access`, though the other twenty-nine components inject nothing. The convenience was one file's; the edge is the library's. Across a workspace, every `ui` library with one smart component points at every store any of its components touch, `nx graph` shows a mesh, and `nx affected` follows every edge: change one store and every `ui` library with a single reader rebuilds, and every application using any of them retests. The narrow affected set that Nx exists to give you is gone.

**Cycles become possible.** In a layered graph a cycle between `ui` and `data-access` cannot happen, because `ui` never imports `data-access`. Everything-smart removes that guarantee, and stores acquire reverse imports easily: a store that shows an error toast or injects a dialog service. The transitive version is the common one. `zoo-dialog` in `shared/ui` injects the notification store; the notification store imports `zoo-toast` from `shared/ui` to render notifications. Dialog and toast never mention each other, but they share a project and a barrel, so `shared-ui` and `shared-data-access` depend on each other. Lint reports it if boundaries are on; otherwise you meet it at runtime as `Cannot access 'X' before initialization`. The layered rule is what makes a whole class of cycles impossible rather than merely discouraged.

**And it cannot render what is not in the store.** A form for registering a new animal wants to show the status badge for the draft. The draft has no id and is not in the store, so a badge that looks itself up cannot render it. The team writes a second badge with a status input, which is the presentational component they deleted. Now there are two badges and they drift.

Everything-smart removes drilling by removing the one thing that made components reusable in a different context: that their inputs fully describe them.

### Smart with an abstract dependency

The careful version. The badge injects an abstraction, and the host decides what it resolves to:

```ts
export abstract class AnimalStatusSource {
  abstract statusOf(animalId: Signal<string>): Signal<AnimalStatus | undefined>;
}

@Component({ selector: 'zoo-status-badge', /* ... */ })
export class StatusBadgeComponent {
  private readonly source = inject(AnimalStatusSource);
  readonly animalId = input.required<string>();
  protected readonly status = this.source.statusOf(this.animalId);
}
```

The detail page provides a store-backed source, the register form a draft-backed one, a test a stub. One badge, three sources. This is the same dependency inversion as the photo picker, and when the source genuinely varies per host it is the right design.

The pain comes when it does not. Every host must provide it, and a missing provider is a `NullInjectorError` at runtime rather than a compile error. The provider has to sit above every consumer, so two badges on one screen with different sources need an intermediate host whose only job is a `providers` array. And in most screens the source is the store, full stop; paying the abstraction on every badge so that one form can supply a draft puts the abstraction everywhere instead of where the variation is.

It is a precision tool. It solves the draft problem, and nothing else in this article does. It is not a default.

## The slice

A **slice** is a component that owns its own data wiring for one concern and is reusable across screens and applications. Its public surface is fixed by rule: it may take one input naming which entity it is about, and it has no outputs.

Here is the animal status as a slice, wrapping the badge:

```ts
// libs/animals/slices/animal-status/src/lib/animal-status.component.ts
@Component({
  selector: 'zoo-animal-status',
  imports: [StatusBadgeComponent],
  template: `
    @if (status(); as s) {
      <zoo-status-badge [status]="s" />
    }
  `,
})
export class AnimalStatusComponent {
  readonly animalId = input.required<string>();

  protected readonly status = injectAnimalStatus(this.animalId);
}
```

Where `injectAnimalStatus` now also ensures the animal is present, so that the slice works whether or not the page loaded it:

```ts
export function injectAnimalStatus(animalId: Signal<string>): Signal<AnimalStatus | undefined> {
  assertInInjectionContext(injectAnimalStatus);
  const store = inject(animalStore);
  effect(() => store.ensure(animalId()));
  return computed(() => store.entities().find((a) => a.id === animalId())?.status);
}
```

The **presentational badge is untouched.** The slice uses it; it does not replace it.

The **slice injects its data**, which is the line a presentational component may not cross. It calls the same `injectAnimalStatus` the pages use, so the lookup stays written once; the difference is that it is called next to the component that needs it instead of three levels above.

The **surface is one input and no outputs.** A screen writes `<zoo-animal-status [animalId]="id" />` and is done. Nothing between it and the badge carries an input it does not use, and because there are no outputs, nothing has to react to it either: if the slice's actions have consequences, it writes them to the store, and whatever cares reads the store.

The **slice is named for, and tied to, the data it fetches.** It is `zoo-animal-status`, not `zoo-status`, because it is bound to the animal store. A badge that could show the status of anything is an atom with a `status` input, which `zoo-status-badge` already is. The slice is the thing that commits to one source, decided when it is written and never varied by the page.

The **slice ensures its own data.** It does not assume the page loaded the animal first; that would be a hidden precondition, and a component with a hidden precondition is not self-contained. Instead it asks the store to make sure the entity is present, through something like `store.ensure(animalId)`, and the store makes that cheap: an entity already in the store costs nothing, and thirty requests for thirty missing ids are deduplicated or batched by the store, not by the slice. The page may still bulk-load a list for efficiency, and when it does, every slice on it finds its data present and nothing fires. When it does not, the slices still work. This is the property people get wrong most, in both directions, and I will come back to it.

### Applied to the card

The status slice is the smallest possible example, and on its own it does not fix the card. The badge sits inside `zoo-card-header`, a molecule in `libs/animals/ui`, and a `ui` library may not import a slice. The page cannot drop `<zoo-animal-status>` into a header it does not render.

So the unit that becomes the slice is the card. It is the thing dropped onto pages, the thing that knows which animal it is about, and the thing whose wiring was being repeated. Make *it* the slice, and let it own the one level of drilling that remains:

```ts
// apps/keeper-mobile/slices/animal-profile-card/src/lib/animal-profile-card.component.ts
@Component({
  selector: 'keeper-animal-profile-card',
  imports: [CardHeaderComponent, FeedingRowComponent, EnclosureChipComponent],
  template: `
    @if (data(); as d) {
      <zoo-card-header [name]="d.name" [status]="d.status" />
      <zoo-enclosure-chip [name]="d.enclosureName" />
      <zoo-feeding-row [next]="d.nextFeeding" [lastSeen]="d.lastSeenAt" />
    }
  `,
})
export class AnimalProfileCardComponent {
  readonly animalId = input.required<string>();

  protected readonly data = injectAnimalProfileCardData(this.animalId);
}
```

The header, chip and row are the same presentational molecules as before. The drilling is now one level, from the slice to its molecules, and the slice owns it. Every page writes `<keeper-animal-profile-card [animalId]="id" />`.

And the composite inject function has a home:

```ts
// apps/keeper-mobile/data-access/src/lib/inject-animal-profile-card-data.ts
export function injectAnimalProfileCardData(animalId: Signal<string>) {
  assertInInjectionContext(injectAnimalProfileCardData);

  const animal = injectAnimal(animalId);                   // libs/animals/data-access
  const status = injectAnimalStatus(animalId);             // libs/animals/data-access
  const nextFeeding = injectNextFeeding(animalId);         // libs/feeding/data-access
  const enclosure = injectEnclosureOf(animalId);           // libs/enclosures/data-access
  const lastSeenAt = injectLastSighting(animalId);         // apps/keeper-mobile/data-access

  return computed(() => animal() && ({
    name: animal()!.name,
    status: status(),
    nextFeeding: nextFeeding(),
    enclosureName: enclosure()?.name,
    lastSeenAt: lastSeenAt(),
  }));
}
```

It is in the application because it reads four domains, and the application is the only place allowed to. The domain inject functions it calls each live in their own domain and know nothing of each other. Five lines of composition on top of four lookups that are each written once; that is the whole duplication cost of the rule.

Note that `apps/keeper-mobile/data-access` is not the application project. It is a library in the application's folder, tagged `app:keeper-mobile` and `type:data-access`, like `apps/keeper-mobile/slices` beside it. The shell is the only application project, and nothing imports from it. The keeper's features import the composite under both the app rule and the type rule; no other application and no domain can see it.

That also settles what kind of slice the card is. It reads four domains, so it cannot be a domain slice. It is a feature slice. If several applications need the same card, there are three honest answers: a feature slice and a five-line composite per application; a split into domain slices, `zoo-animal-status`, `zoo-next-feeding`, `zoo-enclosure-chip`, that the page arranges side by side; or composition moved to the API as a read model, so one domain owns the card's data and a domain slice can render it. What is not an option is a library that reaches into four domains.

### A type and a rule

In the [four-axis tagging scheme](https://www.heckerssoftware.com/blog/four-dimensions-of-nx-tags/) I add a fifth value to the `type` axis, `type:slice`, between `feature` and `ui`, with one constraint:

```js
{
  sourceTag: 'type:slice',
  onlyDependOnLibsWithTags: ['type:ui', 'type:data-access', 'type:util'],
}
```

A slice may use presentational components, stores and utilities. It may not use features, shells, or other slices. Features need no change: their rule already allows `type:*`.

```
feature  ──►  slice  ──►  ui
                    └──►  data-access
```

A feature composes slices and presentational components. A slice composes presentational components and reads stores. A presentational component composes nothing. The old rule that `ui` never reaches `data-access` still holds, the thing that had no legal home now has one, and because the slice sits above both layers and neither may reach up, the cycle risk from everything-smart does not return.

## Domain slices and feature slices

There are two places a slice can live, and the difference is what it is allowed to know.

A **domain slice** lives in `libs/<domain>/slices` and knows one domain. `animal-status` reads the animal store and renders a badge. It does not know which application it is in or anything about tickets or enclosures. Tagged `domain:animals` and `type:slice`, every application may use it. The test: **could this component be dropped into an application that does not exist yet, with no changes?**

A **feature slice** lives in `apps/<app>/slices` and may know things a domain slice may not. `shift-summary` shows the zoo keeper how many animals are fed, how many are overdue, and which enclosure to go to next. It reads the animals, feeding and enclosures stores, and it applies a rule only the keeper app has: feedings are overdue relative to the keeper's shift start. That combination is not allowed in a domain, because `libs/animals` may not import `libs/feeding`. The application may import both, so a slice in the application can compose them. Tagged `app:keeper-mobile` and `type:slice`, it is reusable within that application, across its screens, and not beyond. The test: **is this reusable within one application, but either combines domains or applies a rule only that application has?** If it could live in a domain with no loss, move it there.

| | Domain slice | Feature slice |
| --- | --- | --- |
| Lives in | `libs/<domain>/slices` | `apps/<app>/slices` |
| May inject | that domain's stores | any store, including app-specific ones |
| May know | one domain | several domains, and the application |
| Reusable across | all applications | one application |

Note what is absent: there is no `libs/shared/slices`. A shared slice would need a domain store, and shared may not reach into any domain. If something looks like a shared slice, it is either a domain slice used everywhere, or a presentational component that should not be injecting anything.

## One more place a component can live

Everything so far assumes the presentational components are shared, in a `ui` library, where one injected store would follow the component onto every page in every application.

Some organisms exist for exactly one page: the three-column layout of the shift overview, the filter bar only the keeper list has. If you build them properly they live in the feature library next to the page, because nothing else would ever import them. For those, the rule that they must not inject changes nothing and costs something. It changes nothing because the page already injects the store and the organism is only rendered inside that page, so injecting one level down puts the store in the scope it was already in. It costs something because it forces the page to drill values through an organism that exists only to hold the page's own layout.

So: **a component that lives in a feature library and is specific to that page may inject what it needs, at whichever level is cleanest.** It is a slice with exactly one consumer, and the self-containment comes free from never being reused. The same holds for a page-specific molecule inside it. The graph confirms it is safe: a component inside the feature project adds no new edge, because the feature already depends on `data-access`.

Two caveats. Keep the split when the tree is one level deep; the exception earns its place when the page-specific tree is deep enough that drilling hurts. And the distinction is where the component lives, not what it looks like: the moment a page-specific organism is promoted to a `ui` library because a second page wants it, it must become presentational again or be split into a slice and a presentational part.

That completes the set of places a component can live:

| Lives in | May inject | Reused by |
| --- | --- | --- |
| `libs/<domain>/ui`, `libs/shared/ui` | nothing | anything |
| `libs/<domain>/slices` | that domain's stores | any application |
| `apps/<app>/slices` | any store, app-specific too | screens in that application |
| the feature library, page-specific | whatever the page may | that page only |

The folder tells you which rules apply, which is the principle the [folder structure article](https://www.heckerssoftware.com/blog/your-tooling-should-not-dictate-your-folder-structure/) rests on, applied one level down.

## The options side by side

| | Container + presentational | Content projection | Everything smart | Abstract dependency | Slice |
| --- | --- | --- | --- | --- | --- |
| Drilling | high | low at one level | none | none | none |
| Hidden dependencies | none | none | everywhere | per host | one store, declared by type |
| Graph and `affected` | narrow | narrow | mesh; one smart component couples its library | narrow, if the source is in `data-access` | narrow; one edge per slice |
| Cycles between `ui` and `data-access` | impossible | impossible | possible | possible if the source is in `ui` | impossible |
| Testable with plain data | yes | yes | no | with a stub | the inner `ui` yes |
| Reusable across apps | wiring is not | no | yes, with bundle cost | yes | domain slices yes |
| Handles nesting inside shared components | no | no | yes | yes | yes |
| Handles a varying data source | no | no | no | **yes** | with a token |
| Ceremony | low | low | lowest | highest | moderate |

No row is a clean sweep. **Container and presentational** wins for anything describable by its inputs and stays the default; slices sit beside it, not in place of it. **Projection** wins for layout. **Everything smart** wins only while testability, bundles and boundaries cost nothing. **The abstract dependency** wins when the source genuinely varies, and is overkill elsewhere. **The slice** wins the widget case: a self-contained unit for one entity, used in several places, with a source that does not vary.

And they compose. A slice whose source does need to vary injects an abstract source instead of a concrete store; the slice decides *where the wiring lives*, and the token decides *what it wires to*. The register form's draft badge is a slice that injects `AnimalStatusSource`, provided once at the form, while every other screen uses the same slice with the store-backed source provided at the root.

In one sentence: **drilling, projection and everything-smart remove the symptom by moving the cost somewhere else; slices and tokens remove it by giving the wiring a home.**

## When a slice is the right call

Not every component with a store injected is a slice. I check five things.

**It is used in more than one place.** A component used once belongs in the feature that uses it. The moment a second screen needs the same wiring, it becomes a slice.

**It is about one entity, or one tightly coupled concept.** The profile card reads four stores, but every one is about the same animal; it is the subject that must be singular, not the store. A dashboard that reads animals, enclosures and staff is a feature that forgot to be one.

**Its surface is one identity input and nothing else.** The input says *which*, never *what* or *how*, and there are no outputs. A data input means the source is still in the page. An output means the slice is handing its consequences back up, which is drilling in the other direction.

**It ensures its data through the store, and the store dedupes.** A slice that calls an unconditional `store.load(id)` turns thirty rows into thirty requests. A slice that calls `store.ensure(id)`, against a store that skips what it has and batches what it does not, costs nothing on a page that already loaded the list and still works on a page that did not. The deduplication belongs in the store, once, not in every slice.

**It does not route.** A slice that calls `router.navigate` is coupled to a route structure, which means to an application, which means it is a feature at best.

## When it is not, and what goes wrong

Once a team has the pattern, they use it for everything. Here is what that looks like, in the order I usually find it.

**Slices that fetch unconditionally.** A slice calls `load(id)` on init rather than `ensure(id)`. The thirty-row keeper list renders thirty slices and thirty requests go out, every one redundant, because the page already loaded all thirty animals in one call. Thirty rows show thirty spinners for data that was already there. The fix is not to forbid loading, which would make the slice depend on the page again. It is to put the deduplication in the store: `ensure` skips entities it already has and batches the ones it does not, so thirty calls produce zero or one request, and the slice stays self-contained either way.

**Slices in slices.** The feeding schedule renders the animal status; the enclosure summary renders the feeding schedule. Rendering an enclosure summary now reaches three levels down into the animal store, and nothing in its signature says so. The constraint forbids it: `type:slice` may not depend on `type:slice`. If a slice needs what another slice shows, it composes the same presentational component and reads the same store. The graph stays one level deep.

**Everything becomes a slice.** A team that has felt the drilling over-corrects and injects stores into components that were fine as presentational. Every component now needs a store in its test setup and is coupled to the store's shape. If a component can be fully described by its inputs, it is presentational. Keep it that way.

**Domain slices that learn the application.** A domain slice acquires an `isKiosk` input. It still lives in `libs/animals`, still passes lint, and is now coupled to one application in a folder every application uses. If the behavior differs per application, the difference is a feature slice in that application, or the domain slice takes the varying piece through a token.

**Shared slices.** Someone creates `libs/shared/slices`. Lint refuses it, because the slice injects a domain store. So they move the store to shared, and now `libs/shared` owns animal data and the domain is hollow. The slice was a domain slice used everywhere. The folder was wrong, not the rule.

## What this does to the graph

Before slices, a workspace with enforced boundaries has features at the top, `ui` and `data-access` below, and everything that needs both has to be a feature. The feature layer gets fat, because that is where all the wiring lives, and features cannot share with each other, so the fat is duplicated.

After slices, there is a middle layer. Features get thin, because their job returns to routing, loading and composition. Slices hold the wiring, once. The `ui` layer stays pure, because the pressure to inject into it is gone. And the edges tell the truth: a feature depends on the slices it composes, a slice depends on the stores it reads, and nothing reaches sideways.

This is also why a slice should be its own Nx project, not a folder inside a `ui` library. The edge from a slice to its store is real and belongs in the graph, on a project that contains only the slice. `animals-slices-animal-status` depends on `animals-data-access` and nothing else does. `affected` on a store change reaches the slices that read it and the features that compose them, and stops. The coupling is recorded exactly where it exists, at exactly the size it is.

Run `nx graph` on a workspace that has adopted this and you can see the three bands. Run it on one that has not and you see a wide feature layer with suspiciously similar nodes, which is what duplicated wiring looks like from above.

If you are looking at a feature layer that has grown fat with wiring, or a `ui` folder where things have started injecting stores, the slice pattern is a few days of work per domain, and it tends to reveal a lot about where your real boundaries are. That is usually the point at which teams ask me for a second opinion.

I run Angular and Nx architecture reviews and workshops for teams working in large workspaces. If you would like one, [get in touch](https://www.heckerssoftware.com/#contactForm).
