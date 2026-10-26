---
title: "The Effect That Always Bothered Me: Fetching by Id with resource() and a Store That Stays Global"
description: "Every detail page has one: the subscription or effect that watches a route parameter and kicks off a load. It works, mostly, and it has bothered me for years. Angular's resource() removes it, but naively it also removes your data from the global store and leaves you with component-scoped state. This article shows the problem, the half-solution, and the combination that gives you both."
pubDate: "2026-10-23"
heroImage: "../../assets/blog-images/fetch-without-effect.png"
categories: ["Angular"]
---

Every application with a detail page has the same five lines somewhere. The page gets an id from the route, and something has to turn _the id changed_ into _go fetch the thing_. For most of Angular's life that something was a subscription; since signals it has mostly been an `effect`. Both work. Both have bothered me, for the same reason, and it took `resource()` arriving for me to put a finger on what that reason was.

This article is about replacing that effect. The replacement is not quite as simple as "use `resource()`", because the obvious way to use it quietly takes your data out of the global store and hands you component-scoped state instead, which is half of what you want and half of what you do not. The interesting part is combining the two.

> Examples use a zoo application and NgRx Signal Store. Angular 20 or later, where `resource` takes `params` rather than `request`. Nothing depends on the store library beyond "a store that can patch state".

## The usual two ways

The first version, from before signals, subscribes to the router:

```ts
export class AnimalDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly store = inject(AnimalStore);

  protected readonly animal = toSignal(
    this.route.paramMap.pipe(
      map((p) => p.get("id")!),
      tap((id) => this.store.load(id)),
      switchMap((id) =>
        toObservable(this.store.animals).pipe(
          map((animals) => animals.find((a) => a.id === id)),
        ),
      ),
    ),
  );
}
```

Or, more commonly, a `subscribe` in `ngOnInit` with a `takeUntilDestroyed` and a separate `computed` for the read. Either way the shape is the same: a stream of ids, and a side effect hanging off it that loads.

The second version arrived with signals and `withComponentInputBinding()`. The router writes the `:id` parameter straight into an input, and the input is a signal:

```ts
export class AnimalDetailComponent {
  readonly id = input.required<string>(); // bound from the :id route parameter
  private readonly store = inject(AnimalStore);

  protected readonly animal = computed(() =>
    this.store.animals().find((a) => a.id === this.id()),
  );

  constructor() {
    effect(() => {
      this.store.load(this.id());
    });
  }
}
```

Cleaner. No `ActivatedRoute`, no `paramMap`, no subscription to clean up. And then that effect, which is the subscription with a shorter name.

## What bothers me about both

On the surface it is three lines, and it is hard to argue with three lines. Underneath, it is the one piece of imperative glue left in an otherwise declarative component: a stream of ids with a side effect hanging off it, whether the stream is an observable or a signal. It has four habits that have cost me real debugging hours, and the subscription version had every one of them first.

**It tracks more than the id.** An effect reruns when _anything_ it reads changes, not just the id. The day someone adds `this.store.filter()` or a query-parameter signal to the body, to pass it along to `load`, the animal reloads every time the filter changes. The subscription version grows the same way, one `combineLatest` at a time, until the load fires for reasons nobody can name without reading the whole pipe.

**It cannot cancel.** Tap through three animals quickly and three loads are in flight. Neither the effect nor the `tap` has any idea the first two are stale. Whichever response lands last writes to the store last, and if the network reorders them, the page shows the wrong animal with the right URL.

**It is invisible from where the data is read.** `animal` is a `computed` over the store. Nothing on that line says what fills the store. The next developer finds the effect in the constructor, or the `tap` buried in a pipe, if they think to look there, and has to piece together that the read and the load are two halves of one thing.

**It is a side effect pretending to be data flow.** With the subscription that was at least visible: `tap` is where side effects go. With the effect it is worse only in that it looks tidier, and the Angular team has said, repeatedly and in the docs, that effects should not be used to propagate state or trigger data loading. Every time I wrote either version I knew I was reaching for the wrong tool because the right one did not exist yet.

The right one exists now.

## `resource()`, and the first attempt

`resource()` is Angular's primitive for _a value that depends on a signal and arrives asynchronously_. It takes a `params` function that reads signals, and a `loader` that runs whenever those signals change:

```ts
export class AnimalDetailComponent {
  readonly id = input.required<string>();
  private readonly api = inject(ANIMAL_API);

  private readonly request = resource({
    params: () => this.id(),
    loader: ({ params: id, abortSignal }) =>
      this.api.getAnimal(id, { signal: abortSignal }),
  });

  protected readonly animal = this.request.value;
  protected readonly isLoading = this.request.isLoading;
  protected readonly error = this.request.error;
}
```

Look at what this fixes. It runs the loader once per distinct id, not once-plus-once-per-change. When the id changes mid-flight it marks the previous load as abandoned and hands the loader an `abortSignal`, so the late response from the previous animal never reaches `value`. The data flow sits in a field initializer, on the same lines as the data, where the next developer will actually see it. And it goes idle when `params` returns `undefined`, so an optional parameter needs no guard. Per-request `isLoading` and `error` come for free.

The effect is gone. I was very happy with this for about a day.

## The problem: the store is gone too

Read that component again and notice what it no longer touches. `AnimalStore` is not injected. The animal lives in `request.value`, a signal that belongs to this component instance and nowhere else.

That is component-scoped state. For a lot of screens it is perfectly fine, and the obvious objections to it are easier to answer than they look. Every widget fetching its own copy, the detail page refetching an animal the list already had, a fresh request every time you navigate back: those are all the same problem, repeated GET requests, and caching at the HTTP level solves them. A decorator like `ts-cacheable` on the API method, or an `HttpInterceptor` with a short-lived cache, and the twelve components asking for animal `a1` cost one request between them.

What an HTTP cache does not give you is one owner. It caches the _response_, and every consumer still holds its own copy of it.

**Each copy is a snapshot.** `request.value` is whatever the loader resolved with, frozen at that moment. If a keeper logs a health check on this screen, the header widget showing the same animal does not change, because it is holding its own copy. Neither does the detail page, unless it reloads. So after every write you bust the cache and call `reload()` on every resource that might be showing that animal, and now the write path has to know who is reading. That is the two-owners problem wearing a new hat.

**Updates from elsewhere have nowhere to land.** A websocket message saying animal `a1` moved enclosure has no single place to go. With a store it is one `patchState`, and every screen reading that animal updates. With component-scoped resources it is a broadcast that every resource has to listen for.

If your data is read-only, or changes rarely and a reload is acceptable, plain `resource()` plus an HTTP cache is a complete answer and you can stop here. For data that gets written to while it is on screen, you want the store back.

Here is the honest part: _some_ of what `resource()` gave us is exactly what you want. Loading and error state should be per consumer; a row in a list should spin on its own, not whenever any animal anywhere is loading. And a resource that dies with its component is correct, because the component owns the id signal and nothing should outlive the thing that drives it. The mistake is letting the resource own the _data_ along with the request.

## The fix: let the resource ask, let the store answer

Split the two responsibilities. The resource decides _when_ to fetch, and tracks how that one fetch is going. The store decides _what is present_, and holds it. The loader is the hand-off between them, and it does not return the data; it returns a promise that the data is in the store.

The store gets one method, `ensure(id)`, with a small contract: resolve immediately if the entity is already present, return the same in-flight promise if a request for that id is already running, and only otherwise fetch and write into the store.

```ts
export const AnimalStore = signalStore(
  { providedIn: "root" },
  withState({ animals: [] as Animal[] }),
  withMethods((store, api = inject(ANIMAL_API)) => {
    const inFlight = new Map<string, Promise<void>>();

    return {
      ensure(id: string): Promise<void> {
        if (store.animals().some((a) => a.id === id)) {
          return Promise.resolve();
        }

        const pending = inFlight.get(id);
        if (pending) {
          return pending;
        }

        const request = api
          .getAnimal(id)
          .then((animal) =>
            patchState(store, (state) => ({
              animals: [...state.animals.filter((a) => a.id !== id), animal],
            })),
          )
          .finally(() => inFlight.delete(id));

        inFlight.set(id, request);
        return request;
      },
    };
  }),
);
```

The `inFlight` map lives in a closure rather than in state because nothing renders from it. `ensure` returns `Promise<void>` deliberately: it means _done_, and nothing more. Returning the animal would invite callers to use it, and a caller that uses the resolved value has a snapshot again.

Now the component points its resource at `ensure` and reads its data from the store:

```ts
export class AnimalDetailComponent {
  readonly id = input.required<string>(); // bound from the :id route parameter
  private readonly store = inject(AnimalStore);

  private readonly request = resource({
    params: () => this.id(),
    loader: ({ params: id }) => this.store.ensure(id),
  });

  protected readonly animal = computed(() =>
    this.store.animals().find((a) => a.id === this.id()),
  );
  protected readonly isLoading = this.request.isLoading;
  protected readonly error = this.request.error;
}
```

Walk through what each line now gives you.

`animal` is a `computed` over `store.animals()`, keyed on the id. It is live: a health check logged on this screen, an update from a websocket, a bulk load from the list page, all show up here with no reload. It reads the id inside the `computed` too, so a navigation switches `animal` the instant the new entity is in the store, without waiting for the resource to notice.

`isLoading` and `error` still come from the resource, so they are per consumer. The detail page spins only while _its_ current id is being ensured. The status slice next to it, asking for the same id, shares the in-flight promise through the store but has its own `isLoading`, which it probably does not even show.

`request.value` is now `undefined` forever, because `ensure` resolves with nothing. That is on purpose; nothing reads it. If it bothers you, type the resource as `resource<void, string>` and the intent is in the signature.

And the effect is still gone. The resource reruns the loader when the id changes, abandons the superseded load, idles on `undefined`, and reports per request. The store is still global and still the one owner of every animal, so a write anywhere shows up everywhere. Twelve slices call `ensure` twelve times on a page that bulk-loaded, and the store turns that into zero requests.

## Two small things

**Reload.** `request.reload()` reruns the loader, but `ensure` will see the entity present and resolve immediately, which refreshes nothing. A real reload is `store.evict(id)` followed by `reload()`, or an `ensure(id, { force: true })` if you prefer one call. Decide which when you add the pull-to-refresh, not after.

**Abort.** The loader receives an `abortSignal`, and if your API client supports it you can forward it into `ensure`. Be careful with a deduplicating store: two consumers share one in-flight promise, and aborting it for one aborts it for both. I let the request finish and let the resource discard the result, which is what the code above does. A few hundred wasted bytes beats a header widget that errors because the detail page navigated away.

## In short

The subscription or effect that fetches on a route parameter was never wrong in a way that showed up in a demo; it was wrong in the ways that show up three weeks later. `resource()` is the primitive that replaces it, but used naively it also replaces your store with component state. The way out is to make the resource responsible only for _when_ and _how it is going_, make the store responsible only for _what is present_, and connect them with an `ensure` method that promises the data is there rather than returning it. Live data from the store, per-consumer loading from the resource, no effect anywhere.

If your codebase has a lot of these subscriptions and effects and you want help deciding where `resource()` fits, that is the kind of question I take on. I run Angular and Nx architecture reviews and workshops; if you would like a second opinion, [get in touch](https://heckerssoftware.com/#contactForm).
