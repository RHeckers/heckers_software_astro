---
title: "One Store per Entity: Granular Signal Stores for Code You Actually Want to Share"
description: "A store that answers two questions drags both into every application that needs one. Here is why I keep NgRx Signal Stores to a single entity, how composition replaces merging, and how one store method can serve very different callers without branching."
pubDate: "2026-10-05"
heroImage: "../../assets/blog-images/one-store-per-entity.png"
categories: ["Angular", "Nx", "Architecture"]
---

In the [previous article](https://www.heckerssoftware.com/blog/shared-component-different-behavior-per-app/) the problem was a shared component that needed to behave differently in every application. This one is about the problem right next to it, and in my experience the more common of the two: a shared store that does more than any single application wants from it.

The symptom is easy to recognize. A developer on the kiosk team injects a store to read one list, and finds that the store also fetches a second thing, tracks a second loading flag, and exposes methods they will never call. They do not need any of it, but it arrives anyway, and it arrives in their bundle.

None of this is a problem while a store has one consumer. It becomes a problem the moment a second application wants the same domain, and in a monorepo that moment is the whole point. We put several applications in one workspace so that they can share the tickets domain rather than each writing their own. The question is what sharing should look like once the applications want different things from it.

My answer, and the thing this article is really about, is this: **share as much as possible, without imposing code on applications that never use it, and without drifting into near-duplicates that each solve one application's need.** Share what can be shared. Make specific what has to be specific, either in the application's own scope, or as a combined store in the domain when several applications need the same combination and it carries no application-specific logic.

One store per entity is how I keep the first half of that honest. Composition on top is how I keep the second half from turning into copies. The rest of this article is the detail.

> The examples use the zoo workspace from my talk at Angular Zürich, which is on GitHub at [RHeckers/zoopervisor-nx-demo](https://github.com/RHeckers/zoopervisor-nx-demo). It uses NgRx Signal Store with Angular 20. The stores are promise-based rather than RxJS-based throughout, which I chose to keep the examples compact and readable; the design does not depend on it. If the examples are useful to you, a star is appreciated 😄.

## How a store grows two heads

Nobody designs a store that does too much. It happens one reasonable step at a time, and it is worth watching it happen because the first step is almost always correct.

The tickets domain starts with an order store. It loads an order, holds it, exposes a loading flag. A week later the order detail screen needs the tickets belonging to that order, and the developer building that screen has a choice: create a second store, or add a method to the one that exists. The one that exists already has the order id, already has an API client injected, and already has a loading flag. Adding a method is twenty lines. A second store is a new file, a new provider, and a new thing to name.

So they add the method:

```ts
export const orderStore = signalStore(
  withState<OrderState>({
    order: null,
    tickets: [],
    isLoading: false,
    error: null,
  }),

  withMethods((
    store,
    orderApi = inject(ORDER_API),
    ticketApi = inject(TICKET_API),
  ) => ({
    async loadOrder(id: string) {
      patchState(store, { isLoading: true });
      const order = await orderApi.getOrder(id);
      patchState(store, { order, isLoading: false });
    },

    async loadTickets(orderId: string) {
      patchState(store, { isLoading: true });
      const tickets = await ticketApi.getTickets(orderId);
      patchState(store, { tickets, isLoading: false });
    },

    async loadOrderWithTickets(id: string) {
      patchState(store, { isLoading: true });
      const [order, tickets] = await Promise.all([
        orderApi.getOrder(id),
        ticketApi.getTickets(id),
      ]);
      patchState(store, { order, tickets, isLoading: false });
    },
  })),
);
```

Every line of this is sensible on its own. The order detail screen calls `loadOrderWithTickets` and gets everything in one go. The store now injects two API clients, which is the first visible sign that it is answering two questions, but on the day it is written that looks like convenience rather than a problem. The store has one loading flag because that is what the screen wants to show. It is tidy, it is tested, and it ships.

The problem is not visible from the order detail screen. It is visible from everywhere else.

## Who actually needs what

Three screens in three different applications use this domain:

| screen | application | needs |
| --- | --- | --- |
| order detail | `visitor` | orders **and** tickets |
| gate scan | `keeper-mobile` | tickets only |
| order history | `visitor-mobile` | orders only |

Only one of the three wants the pair. The gate scanner needs to validate a ticket; it has no interest in the order the ticket came from, and the zoo keeper holding the phone would not know what to do with it. The order history page lists past orders with dates and totals; it does not render a single ticket.

The merged store gives all three screens the same object, and two of them pay for the half they do not use. With one application this would be a style preference. With three it is a cost, paid by every application except the one the store was written for, and it is worth being precise about what it is.

## What one combined store costs

### Applications drag in both, wanted or not

This is the cost that connects to the [barrel article](https://www.heckerssoftware.com/blog/nx-monorepo-barrel-issues/) and the [shared component article](https://www.heckerssoftware.com/blog/shared-component-different-behavior-per-app/), and it is the one people underestimate.

The gate scanner imports `orderStore` to get tickets. `orderStore` references `ORDER_API`, `orderApi.getOrder`, the `Order` type, and whatever the order half of the state depends on. The bundler cannot know that `keeper-mobile` never calls `loadOrder`, because a method on an object is reachable the moment the object is. So the order code ships to the scanner.

That is the same mechanism as the flag in the shared component: a runtime decision about which method to call cannot remove a compile-time reference. One store with two concerns is two concerns in every bundle that imports the store.

### One `isLoading` for two requests

The order detail screen wanted a single spinner, so the store has a single flag. But that flag is now lying to two of its three consumers.

When the gate scanner calls `loadTickets`, `isLoading` is correct. When the order detail screen calls `loadOrderWithTickets`, the flag clears when both requests finish, which is correct for that screen. But if any screen ever calls `loadOrder` and `loadTickets` separately, the flag clears when the first one finishes, and the second request is still in flight with no indication. The flag describes a merged operation that only one screen performs.

A loading state belongs to a request. A store with two independent requests needs two flags, or it has one that is wrong some of the time.

### One error blanks both screens

The same reasoning applies to `error`, with worse consequences. If the tickets endpoint fails, `error` is set, and any template that does `@if (store.error())` hides its content. On the order detail screen, that includes the order, which loaded perfectly well. The user sees an error for data that arrived.

### One cache, two lifetimes

An order, once paid, barely changes. A ticket changes state every time it is scanned, transferred, or refunded. Holding both in one store means they share an invalidation story, and the one with the shorter lifetime wins. The gate scanner refreshes tickets constantly, and every refresh also refetches an order that has not changed since Tuesday.

This one is not about correctness. It is about every consumer paying the refresh cost of the most volatile thing in the store.

## One store per entity

The alternative is to keep each store to a single entity and a single endpoint.

```
libs/tickets/data-access
├── order.store.ts
├── ticket.store.ts
└── order-with-tickets.store.ts
```

Two root stores, one per entity, and a third file I will come to in a moment.

```ts
// order.store.ts
export const orderStore = signalStore(
  withState<OrderState>({ selected: null, history: [], isLoading: false, error: null }),
  withMethods((store, api = inject(ORDER_API)) => ({
    async getOrder(id: string) { /* ... */ },
    async getOrders() { /* ... */ },
  })),
);
```

```ts
// ticket.store.ts
export const ticketStore = signalStore(
  withState<TicketState>({ tickets: [], isLoading: false, error: null }),
  withMethods((store, api = inject(TICKET_API)) => ({
    async getTickets(orderId: string) { /* ... */ },
    async buyTickets(/* ... */) { /* ... */ },
  })),
);
```

The gate scanner injects `ticketStore`. The order history page injects `orderStore`. Each gets exactly the state and methods it needs, with a loading flag and an error that describe its own requests and nothing else. Each also talks to its own API client, `ORDER_API` and `TICKET_API`, so the one-entity rule holds at the token as well as at the store. And because `keeper-mobile` never references `orderStore` or `ORDER_API`, the order code is not in its bundle. The bundler is following references again, and we have arranged the references so that there is nothing to follow.

This is not a new idea. In the Redux world it is called normalized state: one slice per entity type, flat, keyed by id. `@ngrx/entity` was built around it and `withEntities` in Signal Store is the same idea for signals. In the DDD world the closest term is a repository, with the caveat that ours is a client-side cache rather than a persistence boundary. The underlying principle is the one that matters: **one owner per entity**, so that nothing can desync.

I have kept the examples to plain arrays rather than `withEntities`, because the collection mechanics are not what this article is about. If you prefer `withEntities` for id-keyed lookups and updates, nothing here changes: one entity collection per store, and the rules below apply unchanged.

## What a store may and may not do

Keeping stores to one entity is a rule you can only hold if you are clear about what else a store is for. Here is the list I hold them to.

A store **should**:

- Own one entity, fetched from one endpoint.
- Expose exactly one `isLoading` and one `error`, describing its own requests.
- Derive everything derivable with `computed`, never store it.
- Protect its own invariants, so no caller can put it in an impossible state.
- Talk to its own API through its own injection token, so the client is swappable and one entity never pulls in another's endpoint.

A store **should not**:

- Fetch a second entity. If it needs two endpoints to answer a question, the question belongs to a feature.
- Hold feature UI state. Which tab is open, whether a dialog is showing, what the search box contains: that is the feature's state, not the entity's.
- Toast, navigate, or close dialogs. Those are reactions to what the store did, and they belong to the caller.
- Import another domain's store. The module boundaries from the [tags article](https://www.heckerssoftware.com/blog/four-dimensions-of-nx-tags/) will refuse it, and they are right to.
- Branch on which application is calling. The moment a store checks `isKiosk`, it has stopped being domain code.

The test I use for the first "should not", because it is the one that gets broken most: *if this store needs two endpoints to answer, it is a feature.* A store answers one question about one entity. A feature answers the question a screen is asking, and screens routinely ask about two things.

## Composition, not merging

The order detail screen still needs both. The answer is the third file:

```ts
// order-with-tickets.store.ts
export const orderWithTicketsStore = signalStore(
  withComputed((_, tickets = inject(ticketStore), orders = inject(orderStore)) => ({
    tickets: computed(() => tickets.tickets()),
    order: computed(() => orders.selected()),
    isLoading: computed(() => tickets.isLoading() || orders.isLoading()),
  })),

  withMethods((_, tickets = inject(ticketStore), orders = inject(orderStore)) => ({
    async checkout(order: NewOrder) {
      const bought = await tickets.buyTickets({ order });

      if (bought) {
        await orders.getOrders();
      }
    },
  })),
);
```

Three things about this store are worth dwelling on, because each is a place where composition goes wrong when done carelessly.

### It reads through. It never copies.

Look at the `withComputed` block. It exposes `tickets`, `order` and `isLoading`, but it does not own any of them. Each is a `computed` that reads the root store's signal.

The alternative, which I see often, is `withState` with its own `tickets` array, kept in sync by subscribing to the root store. That is a second source of truth. The kiosk buys through `ticketStore`, the composed store's copy goes stale, and someone writes synchronization code to fix it. Reading through with `computed` means there is still exactly one owner per entity. The composed store is a view, not a copy.

Notice the `isLoading` line specifically. *One `isLoading` for two requests* was listed as a cost of merging. Here it is a **derived** flag over two independent ones. Each root still tracks its own request and fails on its own, and the composed store ORs them for screens that want a single spinner. Same convenience for the order detail screen, none of the coupling for anyone else.

### The roots stay

The gate scanner still injects `ticketStore`. The order history still injects `orderStore`. The composed store is an addition for the one screen that needs the pair; it does not replace anything, and it does not change what the other two screens import.

This is the difference between composition and merging in one sentence. **Merging removes entry points. Composition adds them.** The merged store from the start of the article gave every consumer one object whether they wanted it or not. The composed store gives the order detail screen a convenient object and leaves everyone else alone.

### It can orchestrate, because it can wait

The `checkout` method does something neither root store can do on its own: it buys tickets, and only once that has settled does it refresh the orders. That ordering matters, because refreshing orders while the purchase is still in flight would fetch a list that does not include the new tickets yet.

For this to work, `buyTickets` has to return something awaitable, which is a design decision in the root store that I will come back to below. The composed store is where that decision pays off.

### Where composition lives

Both roots here are in the tickets domain, so the composed store lives beside them in `libs/tickets/data-access`. That is the easy case.

If the two entities were from different domains, say an animal and the enclosure it lives in, the composed store could not live in either domain library. The boundary rules forbid a domain from importing another domain's store, and they are right to, because the moment `libs/animals` imports `libs/enclosures` the two domains are coupled for everyone.

Cross-domain composition has exactly one legal home, and it is the application. A facade in `apps/keeper-mobile/features/enclosure-detail` may inject both stores, because the application is allowed to reach into every domain. That is not a workaround. It is the boundary doing its job: code that knows about two domains is, by definition, application code.

That gives a simple rule for where a combined store goes. If several applications need the combination and it contains no application-specific logic, it lives in the domain, like `orderWithTicketsStore`. If only one application needs it, or it knows something about that application, it lives in that application. Either way the roots are untouched, which is what keeps the combination from becoming a fork.

## One method, many callers

Keeping stores to one entity solves the problem of stores that do too much. It does not solve the next problem, which arrives immediately afterwards: the same entity operation needs to behave slightly differently depending on who calls it.

Buying tickets is the example. The kiosk and the visitor web application both buy tickets through `ticketStore`. But the kiosk accumulates tickets across a session, because a family buys four at once, and marks them for a thermal printer. The web application replaces the list and shows a confirmation dialog. Same endpoint, same entity, different handling of the result.

The tempting answer is a flag on the method, or worse, injecting something that tells the store which application it is in. Both put application knowledge into domain code, which the fifth rule above forbids.

The answer I use is to parameterize the method, with defaults, so that the store owns the sequence and the caller owns the steps:

```ts
export const ticketStoreFeature = signalStoreFeature(
  { state: type<TicketState>() },

  withMethods((store, api = inject(TICKET_API)) => {
    const defaultSource: Source = (order) => api.buy(order);

    return {
      async buyTickets({
        order,
        source = defaultSource,
        updater = appendToList,
        onSuccess,
        onError,
      }: BuyTicketsInput): Promise<Ticket[] | null> {
        patchState(store, { isLoading: true });

        try {
          const tickets = await source(order);

          patchState(store, (s) => updater(tickets, s));
          onSuccess?.(tickets);

          return tickets;
        } catch (error) {
          patchState(store, { isLoading: false });
          onError?.(error);

          return null;
        }
      },
    };
  }),
);
```

The domain exports that feature, and it also exports the store built from it:

```ts
// ticket.store.ts
export const ticketStore = signalStore(
  withState(initialState),
  withComputed(/* ... */),
  ticketStoreFeature,
);
```

Both are public. Most consumers inject `ticketStore` and never think about the feature. But because the behavior is a `signalStoreFeature` rather than something welded into one `signalStore` call, an application is free to assemble its own store from the same parts. The kiosk could build a store from `ticketStoreFeature` and a kiosk-only printing feature, scoped to a single route, without the domain knowing or caring. That is the second half of the sharing goal from the introduction: the domain shares the behavior, and the application decides the composition where it genuinely needs a different one.

This is also how NgRx itself is structured. `withEntities`, `withState` and the rest are features, and a `signalStore` is nothing more than a composition of features. Exporting your own behavior at the same granularity means it composes with theirs.

Four extension points, each with a default, each optional at the call site.

**`source`** is where the tickets come from. The default calls the API client. A caller can substitute a different endpoint, or a mock in a test, without the store knowing.

**`updater`** is how the result lands in state. The default appends to the list. A caller that wants to replace, filter, or annotate can say so.

**`onSuccess`** and **`onError`** are what happens afterwards. The store does not toast, navigate or close dialogs, because those are the third "should not". It hands the result to the caller and lets the caller decide.

The sequence itself, set loading, fetch, patch, notify, clear loading on failure, is owned by the store and is identical for every caller. That is what makes it a store method rather than a utility: the invariants are protected regardless of what the caller plugs in.

### The call site

Here is the kiosk, overriding three of the four:

```ts
// apps/ticket-kiosk/features/checkout
store.buyTickets({
  order,
  updater: (tickets, state) => ({
    tickets: [...state.tickets.filter((t) => t.status !== 'printed'), ...tickets],
    isLoading: false,
  }),
  onSuccess: () => this.printer.queue(),
  onError: (error) => this.attendant.alert(error),
});
```

The kiosk drops tickets that have already been printed and appends the new ones, because the screen shows what is still in the print queue. It queues the printer on success and alerts an attendant on failure, because a kiosk has no dialog to close and nobody watching for a toast.

Nothing about that behavior belongs in the domain. Nothing about it is a flag the domain could have anticipated. And the store did not change to accommodate it.

The web application, meanwhile, calls `store.buyTickets({ order })` and takes every default.

### Why it returns a value

The method returns `Promise<Ticket[] | null>`: the tickets on success, `null` on failure. Two reasons.

The first is the composed store above. `checkout` awaits `buyTickets` and only refreshes orders if the purchase succeeded. Without a return value, the composed store would have to subscribe to a loading flag and guess when the operation finished, which is fragile and ugly.

The second is about *not* throwing. A store method that rethrows will produce an unhandled rejection whenever a caller fires it without awaiting, which the kiosk does. Returning `null` keeps fire-and-forget callers safe, at the cost of making awaiting callers check the result. That is the right trade for a store method, where most calls are fire-and-forget and the few that await know they are awaiting.

## Features and tokens

Two smaller decisions in the code above deserve a sentence each.

The method lives in a `signalStoreFeature`, as shown above. Beyond letting applications compose their own stores, that also means the behavior can be tested in isolation against a minimal state, without constructing the full store.

The API client comes in through `inject(TICKET_API)`, a token, rather than a concrete class, and `orderStore` has its own `ORDER_API` in the same way. That is the fifth "should" from the list. One token per entity means a test can stub exactly the client it needs, a Storybook story can provide fixtures for one store without the other, and if the backend is ever split, neither store changes. It is also what keeps the merged store's tell from reappearing: a store that finds itself injecting two API tokens is a store that has started answering two questions. The same reasoning as the [shared component article](https://www.heckerssoftware.com/blog/shared-component-different-behavior-per-app/), applied one layer down.

## Two words to be careful with

If you discuss this design with other teams, two terms will come up, and one of them will cause trouble.

**Feature store** is the phrase people will assume you mean, and it is the opposite of what you are doing. A feature store is scoped to a screen and holds whatever that screen needs, which is precisely the merged store from the start of this article. If someone describes your `ticketStore` as a feature store, correct it early, or the rest of the conversation will be at cross purposes.

**Facade** is the right word for the composed store and for the application-level objects that orchestrate across domains. It is a facade in the classic sense: one surface over several things, with no logic of its own that the underlying things do not already provide.

What I actually say, if asked for one line: *one store per entity, composed at the edges.*

## What this does and does not solve

Granular stores solve a specific and expensive problem. Every consumer gets exactly the state it asked for, loading and error flags that describe real requests, a cache lifetime that matches the entity, and a bundle without the other half. Composition on top gives the few screens that need two entities a convenient object without taking anything away from the many that need one. And a parameterized method lets one operation serve very different applications without a single branch in domain code.

What they do not solve is where the composition and the orchestration live once it is cross-domain. That is a question about features, facades and the application layer, and it is a bigger subject than a section at the end of this article. It is also where most of the remaining complexity in a mature workspace tends to sit, and where I spend a good part of my time when I work with teams.

If you recognize the two-headed store from your own workspace, the split is usually a day's work per domain and it tends to pay for itself the first time somebody needs only half. If you recognize several of them, that is the kind of thing I help teams work through.

I run architecture reviews and workshops for teams working in large Angular and Nx workspaces. If you would like a second opinion on yours, [get in touch](https://www.heckerssoftware.com/#contactForm).
