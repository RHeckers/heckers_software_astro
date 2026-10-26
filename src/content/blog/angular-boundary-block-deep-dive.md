---
title: "Angular's @boundary Block: What It Catches, What It Does Not, and How It Works Underneath"
description: "Angular 22.2 added error boundaries to templates. The docs show the syntax. This article goes into the compiler and the runtime to explain exactly which errors reach a boundary, what happens to the view when one does, how $reset really works, and the handful of behaviors you only find out about from the source."
pubDate: "2026-10-20"
heroImage: "../../assets/blog-images/angular-boundary-block.png"
categories: ["Angular"]
---

For most of Angular's life, a rendering error had one destination: the global `ErrorHandler`, and from there usually the console and a blank screen. If a component three levels deep threw during change detection, there was no way to contain it to that component. Either you caught it yourself inside the component, or the whole application stopped updating.

Angular 22.2 adds `@boundary`, a template block that catches rendering errors for the subtree it wraps and renders a fallback instead. It shipped in developer preview on 23 September 2026, and the official guide covers the syntax well. What it does not cover is the mechanics, and with a feature like this the mechanics decide whether you can trust it: which errors reach a boundary and which quietly bypass it, what state the failed view is in when the fallback renders, what `$reset` actually does, and how the boundary interacts with the `ErrorHandler` you already have.

This article answers those questions from the source. I have read `@boundary` end to end, from the parser through the type checker to the runtime instruction and the catch site in change detection, and I will name the files as I go so you can verify anything you doubt.

> Everything here is based on the Angular repository at `22.3.0-next.2`, read directly. The feature is in developer preview, so details may still change before it is stable. Where I describe behavior the docs do not mention, I have confirmed it against the framework's own tests in `packages/core/test/render3/error_boundary_spec.ts`.

## The syntax, briefly

If you have not seen it yet, here is the whole surface:

```html
@boundary {
<app-chart-dashboard />
} @error (let err; retry = $reset; when isNetworkError(err)) {
<p>Network issue. Check your connection.</p>
<button (click)="retry()">Retry</button>
} @error {
<p>Something went wrong: {{ $error.message }}</p>
<button (click)="$reset()">Try again</button>
}
```

A `@boundary` block wraps some content. If anything inside it throws during rendering, the content is replaced by the first `@error` block whose `when` clause is true, or by the unconditional `@error` block if none match. Inside an `@error` block you get two implicit variables, `$error` and `$reset`, and you may alias either one with `let` or `name = `.

That is the documentation's version, and it is accurate. Now the parts underneath it.

## What the parser accepts

The block is parsed in `packages/compiler/src/render3/r3_boundaries.ts`, and the parser is stricter than the docs let on. Every rule below produces a compile error, not a runtime surprise.

**`@boundary` takes no parameters.** `@boundary (something)` is rejected with "`@boundary` block cannot have parameters". There is no condition, no name, no option.

**Only `@error` may follow it.** Any other connected block, `@boundary { } @else { }` for instance, fails with "Unrecognized `@boundary` connected block".

**An `@error` block accepts exactly three kinds of parameter.** A `let` binding of `$error` or `$reset`, an alias of the form `name = $error` or `name = $reset`, and at most one `when` expression. Anything else, including a `let` of a variable other than those two, is a parse error. The error message is specific: "Only `$error` and `$reset` are allowed".

**At most one unconditional `@error` block, and it must be last.** Two blocks without `when` is an error. A block without `when` followed by one with `when` is an error, because the unconditional block would shadow everything after it.

**`when` is a plain binding expression.** It is parsed with the same binding parser as an `@if` condition, so anything you can write in `@if` you can write here, and it is type-checked the same way.

One detail that matters for the type checker: both `$error` and `$reset` are always declared as context variables on every `@error` block, whether or not you alias them. Aliasing gives you a second name; it does not replace the first. `@error (let err)` leaves `$error` available too.

## What the compiler emits

The block is lowered in `packages/compiler/src/template/pipeline/src/ingest.ts`, in `ingestBoundaryBlock`. Reading it tells you something the syntax hides: **a boundary is a conditional with an unusual condition.**

The compiler allocates one embedded view for the primary content and one for each `@error` block. It then emits a `BoundaryCreateOp`, which becomes an `ɵɵboundaryCreate` instruction and allocates a small state object in the component's view, and a `BoundaryOp` in the update pass, which becomes `ɵɵboundaryUpdate`. The update op carries the primary branch plus a list of `ConditionalCaseExpr`s, one per `@error` block, each with its `when` expression and its `$error` alias. That is the same data structure `@switch` and `@if` use.

So on every change detection pass, the boundary's update instruction evaluates a chain: if there is no stored error, render the primary branch; otherwise evaluate each `when` in order against the stored error and render the first that is true. There is nothing exotic about the selection. The exotic part is how the stored error gets there.

### The type checker sees a try/catch

Angular's template type checker turns templates into TypeScript and lets `tsc` find the mistakes. For `@boundary` the generated code is literal, from `packages/compiler/src/typecheck/ops/boundary.ts`:

```ts
try {
  // primary block
} catch (err) {
  // @error blocks as an if/else chain over `when`
}
```

Two things follow. First, `$error` is typed as `Error` in your template, because the scope declares it as `(err as Error)`. Not `unknown`, not `any`: you can write `{{ $error.message }}` without a cast. Second, `$reset` is typed as `() => void`, so `(click)="$reset()"` type-checks and `$reset(42)` does not.

The `Error` typing is honest, as we will see, because the runtime guarantees it.

## What the runtime does when something throws

Now the part that decides whether the feature is trustworthy. There are two distinct catch sites, and they catch different things.

### Catch site one: creation

`ɵɵboundaryUpdate` in `packages/core/src/render3/instructions/boundary.ts` creates the primary embedded view inside a `try`. If creating that view throws, which is what happens when a component's constructor throws or when a creation-mode instruction fails, the instruction catches it, stores the error on the boundary's state object, notifies the `ErrorHandler`, marks the host view for refresh, and **returns without adding the view to the DOM**.

The source comment is explicit: "If the view threw during creation, we do not add it to the DOM. We swallow the error so that the host can finish its current change detection cycle and later re-evaluate the boundary switch statement to render the `@error` block."

So a constructor error inside `@boundary` is caught, and the failed view never touches the DOM. Keep this in mind for the programmatic API below, because it behaves differently.

### Catch site two: change detection

Once the primary view exists, the instruction attaches a function to it, in a slot called `ON_ERROR`. That function is the boundary. It is invoked from one place: the `catch` block of `refreshView` in `packages/core/src/render3/instructions/change_detection.ts`.

`refreshView` is the function that runs a single view's update pass: template bindings, lifecycle hooks, child component refreshes, and view effects. If anything in that pass throws, the catch walks **up the view tree** from the throwing view, through parents, skipping containers, until it finds a view with an `ON_ERROR` function. It calls that function with the error and a details object. If the function returns normally, the error is handled and change detection continues. If no `ON_ERROR` is found on the way up, the error is rethrown as before and reaches the global handler.

Here is the walk, lightly trimmed:

```ts
let currentLView = lView;
while (currentLView !== null) {
  if (isLContainer(currentLView)) {
    currentLView = currentLView[PARENT];
    continue;
  }
  const onError = currentLView[ON_ERROR];
  if (onError) {
    try {
      onError(encapsulateBoundaryError(errorToHandle), details);
      handled = true;
      break;
    } catch (boundaryError) {
      errorToHandle = boundaryError; // handler threw: keep walking with the new error
    }
  }
  currentLView = currentLView[PARENT];
}
```

Notice the inner `catch`. If a boundary's handler itself throws, the loop does not stop. It replaces the error with the new one and keeps walking up. That is how nested boundaries cascade, and it is how an error in an `@error` block reaches the next boundary out.

### What the boundary's handler does

When the walk reaches a `@boundary`'s `ON_ERROR`, it does four things in order:

1. Stores the error on the boundary's state object, `LBoundary.error`.
2. Looks up the `ErrorHandler` from the host's injector and notifies it, through `onViewError` if that method exists, otherwise through `handleError`.
3. **Immediately destroys the primary view.** `removeLViewFromLContainer` runs right there in the handler, before the fallback has been chosen.
4. Marks the host view for refresh, so that on the next targeted pass the update instruction sees a stored error and renders an `@error` branch.

Step three is worth pausing on. The component that threw is gone the moment the boundary catches. Its `ngOnDestroy` runs, its subscriptions are cleaned up, its DOM is removed. The `@error` block does not render _over_ a broken view; it renders _instead of_ a view that no longer exists. If you were hoping to inspect the failed component from the fallback, you cannot. It has been torn down.

### What `$reset` does

`LBoundary.reset()` is two lines:

```ts
reset() {
  this.error = null;
  markViewForRefresh(this.hostLView);
}
```

It clears the stored error and schedules a refresh of the host. On that refresh the update instruction finds no error, so it tears down the `@error` view and creates the primary view again from scratch, running constructors and `ngOnInit` as if for the first time. There is no retained state, no retry counter, no backoff. If the component throws again, the boundary catches again, and you are back in the `@error` block.

That is exactly as much as a reset should do, but it means a "Retry" button that does nothing else will loop forever on a deterministic failure. If the error depends on something you can change, change it before calling `$reset()`.

The test suite confirms that `$reset` can be captured and called asynchronously, from a `setTimeout` or a resolved promise, outside the template entirely. The function is a stable closure over the boundary's state and does not depend on being called during change detection.

### Why `$error` is always an `Error`

Before the boundary's handler is invoked, the caught value passes through `encapsulateBoundaryError`. If it is an `Error`, or error-like with a `name` and `message`, it is passed through unchanged. Otherwise it is wrapped in an `ErrorBoundaryWrappedError`, whose `cause` is the original value and whose message, in dev mode, tells you to look there. So `throw 'oops'` inside a boundary arrives in `$error` as a proper `Error` with `cause === 'oops'`. The `Error` type in the template is not optimistic; it is guaranteed.

## What a boundary catches, precisely

The docs say "initialization or change detection". Here is the list, each confirmed by a test in the spec file.

| Error thrown in                                                                | Caught by `@boundary`?     |
| ------------------------------------------------------------------------------ | -------------------------- |
| A component or directive **constructor** inside the block                      | yes, at creation           |
| `ngOnInit`, `ngDoCheck`, `ngAfterViewInit` and the other **lifecycle hooks**   | yes                        |
| A **template binding** expression, `{{ foo.bar }}` where `foo` is undefined    | yes                        |
| A **child view created during update**, such as an `@if` branch or `@for` item | yes                        |
| A `@for` **track expression** or iteration                                     | yes                        |
| A component **`effect()`** declared inside the block                           | yes                        |
| A **lazily loaded** component inside `@defer` within the block                 | yes                        |
| A component **inserted dynamically** via `ViewContainerRef` inside the block   | yes                        |
| A **nested boundary's `@error` block**                                         | yes, by the outer boundary |

The `effect()` row deserves a note, because it is not obvious from the docs. Whether an effect is a "view effect" or a "root effect" is decided in one line of `packages/core/src/render3/reactivity/effect.ts`: `effect()` asks its injector for `ViewContext`. If that resolves, the effect is tied to the view and runs inside `refreshView`, via `runEffectsInView`, as part of the view's update pass. An error thrown there propagates out of `refreshView` like any other and hits the same catch. That is why the table says yes.

The rule is about the injector, not about whether the code is a component or a service. A service listed in a component's `providers` is created by that component's node injector, so `ViewContext` resolves and its effects are view effects too, caught by any boundary that contains the component. A service provided in root, in an environment injector, or at route level has no view in reach, so its effects are root effects. The same is true of an effect created inside a component but given an environment injector explicitly through the `injector` option.

Now the other list. These are not edge cases; they are the common ways an error leaves a component, and the boundary does not see any of them.

| Error thrown in                                                                                                                         | Caught by `@boundary`? |
| --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| An **event listener**, `(click)="save()"` where `save` throws                                                                           | **no**                 |
| A **root effect**: an `effect()` created where no component injector is in reach, such as a `providedIn: 'root'` or route-level service | **no**                 |
| An **`afterRender` / `afterNextRender`** callback                                                                                       | **no**                 |
| **Async code**: a promise, a `setTimeout`, an HTTP callback                                                                             | **no**                 |
| **Projected content**, errors in children projected into a component whose own template has the boundary                                | **no**                 |

The first three are structural. Event listeners run through `executeListenerWithErrorHandling` in `packages/core/src/render3/view/listeners.ts`, which catches the error and sends it straight to `handleUncaughtError` and from there to the application `ErrorHandler`. Root effects use `ROOT_EFFECT_NODE`, scheduled outside any view's refresh, which is why it matters which injector created the effect rather than which kind of class it lives in. `afterRender` hooks run in the `AfterRenderManager`, which has its own `try`/`catch` that calls `ErrorHandler.handleError`. None of these pass through `refreshView`, so none can reach `ON_ERROR`.

Async code is not caught because nothing is: an error thrown in a `.then` callback is thrown on a later microtask with no Angular frame on the stack. Zone.js will route it to the `ErrorHandler`, and a zoneless app will see it as an unhandled rejection. A boundary cannot help with either.

Projected content is the subtle one, and the docs do call it out. The boundary is attached to the view that _declares_ the content, and projected content is declared by the parent template, not by the component receiving it. So:

```html
<!-- inside app-wrapper's template: does NOT catch errors from projected children -->
@boundary {
<ng-content />
} @error { ... }

<!-- in the parent: catches errors from app-risky-component -->
@boundary {
<app-wrapper>
  <app-risky-component />
</app-wrapper>
} @error { ... }
```

The rule of thumb: **a boundary catches errors from views whose declaration is inside the block.** Where a component ends up rendered is irrelevant; where its template was written is what counts.

## The `ErrorHandler` relationship

The docs say a boundary "can still notify the global `ErrorHandler`". The source is more precise than "can still", and the precision matters for anyone who already has a custom handler.

The handler lookup in the boundary is this, verbatim:

```ts
if (errorHandler.onViewError) {
  errorHandler.onViewError(error, details);
} else {
  errorHandler.handleError(error);
}
```

**It is either/or.** If your `ErrorHandler` implements the new optional `onViewError` method, boundary-caught errors go there and _do not_ reach `handleError`. If it does not, they go to `handleError` exactly as unhandled errors do, and your existing logging sees them with no way to tell them apart.

That second case is the default, and it has a consequence worth stating plainly: **out of the box, a caught boundary error looks identical to a crash in your error tracking.** You will see it in Sentry or wherever your `handleError` forwards, with no indication that the user saw a fallback and the application kept running. If you want to distinguish them, implement `onViewError`:

```ts
@Injectable()
export class AppErrorHandler implements ErrorHandler {
  handleError(error: unknown): void {
    this.tracker.captureCrash(error);
  }

  onViewError(error: Error, details: ErrorDetails): void {
    this.tracker.captureHandled(error, {
      where: details.declarationType?.name,
      boundaryIn: details.boundary?.type.name,
    });
  }
}
```

And once you do, remember that `handleError` no longer sees those errors at all. If you had logic in `handleError` that should apply to every error, caught or not, you now need to call it from both methods.

### What `ErrorDetails` contains

The details object has four fields, and they mean slightly different things depending on which catch site fired.

- `declarationType` and `declarationInstance`: the component or directive whose view was being refreshed when the error was thrown. For an error during change detection, this is the throwing component. For an error during creation, the source sets this to the component that _declares the boundary_, because the failed view never finished being created and has no instance of its own.
- `boundary`: present only when a `@boundary` caught it. `type` is the component class whose template contains the boundary, and `reset` is the same function as `$reset`. So an `ErrorHandler` can retry a boundary on the user's behalf, which is a strange power to have at the global level but occasionally useful for a "something went wrong, retrying…" pattern.
- `caughtBy`: the `ON_ERROR` function that handled it. Set on the change detection path, absent on the creation path. Mostly useful for distinguishing a template boundary from a programmatic `onError` callback.

One more behavior that is only visible in the tests: the handler is invoked with the reactive consumer cleared, so **signal writes inside `onViewError` are allowed** and do not trigger the "signal write in reactive context" error. You can push the error onto a signal-based error log from inside the handler. The same holds for the `@error` block's rendering, which runs under `setActiveConsumer(null)` as well.

## The programmatic cousin: `onError`

The same `ON_ERROR` slot that `@boundary` uses is exposed as an option on three APIs: `createComponent()`, `ViewContainerRef.createComponent()`, and `ViewContainerRef.createEmbeddedView()`. Each takes `onError?: (error: Error, details: ErrorDetails) => void`, and the implementation is one line: write the function into the new view's `ON_ERROR` slot.

Because it is the same slot and the same walk, a programmatic `onError` participates in the same cascade. A dynamically created component inside a `@boundary` is caught by the boundary; a `@boundary` inside a dynamically created component with `onError` propagates to the `onError` if its own `@error` block throws.

There is one difference, and it is the kind you only find out about by reading the test file. **A constructor error is not caught by `createComponent`'s `onError`.** The test is named exactly that: "should NOT intercept errors thrown during component constructor via createComponent". The reason is ordering. `createComponent` calls the factory first, which runs the constructor, and only _then_ assigns `onError` to the resulting view. If the constructor throws, there is no view to assign to, and the error leaves `createComponent` as a thrown exception for you to catch yourself.

The template block does not have this gap, because `ɵɵboundaryUpdate` wraps the entire view creation in a `try`. So the capability table is:

|                                    | `@boundary` | `createComponent({ onError })` |
| ---------------------------------- | ----------- | ------------------------------ |
| Constructor errors                 | caught      | **thrown to caller**           |
| Lifecycle hooks, bindings, effects | caught      | caught                         |
| Nested cascade                     | yes         | yes                            |
| Declarative fallback               | yes         | no, you render it yourself     |

If you need constructor coverage from the programmatic API, wrap the `createComponent` call in your own `try`.

## Nesting, falling through, and the `BoundaryError`

Boundaries nest, and the inner one wins. An error inside an inner `@boundary` is caught there; the outer boundary never hears about it unless the inner one fails to handle it. The test "should support nested boundaries and fallback cascading" covers this.

Failing to handle happens in two ways.

The first is an `@error` block that throws. The error propagates up the view tree to the next `ON_ERROR`, with the inner boundary's state left as it was. The docs mention this.

The second is less obvious: **no `@error` block matches.** Suppose you write only conditional blocks and the error satisfies none of the `when` clauses. The update instruction evaluates the chain, finds no branch, and the source does this:

```ts
throw new BoundaryError("Unhandled error in @boundary fell through.", {
  cause: boundary.error,
});
```

A `BoundaryError` is a new error, thrown from the host component's update pass, whose `cause` is the original. It propagates like any other rendering error, so an outer boundary can catch it, and an `ErrorHandler` will receive it with `cause` intact. If nothing catches it, the host component's change detection fails, which is the pre-22.2 outcome.

The practical rule: **always end with an unconditional `@error` block** unless you specifically want unmatched errors to escalate. The parser enforces that it is last; it does not enforce that it exists.

## Hydration and the `when` clause

Two short notes on behavior the docs do not address.

`@boundary` participates in hydration. The update instruction calls `findAndReconcileMatchingDehydratedViews` when switching branches, the same way `@if` does. A server-rendered primary view is claimed and hydrated rather than recreated. A server-rendered `@error` view, if the error occurred on the server, is likewise claimed. I have not seen documentation of the server-side behavior and would not rely on it until the feature leaves preview, but the client-side plumbing is there.

The `when` clause is evaluated during the host's update pass, on every refresh while an error is stored, not once at catch time. In practice the stored error does not change, so the result is stable, but a `when` expression that reads other component state can change which fallback renders if that state changes. And if a `when` expression itself throws, that is a rendering error in the host's view, and it propagates outward like one.

## How I would use it

The feature is well built. The two catch sites cover creation and update completely, the type checker does the right thing, the cascade is principled, and the `ErrorHandler` integration gives you a clean place to tell handled from unhandled. Here is how I would put it to work.

**Wrap at the widget level, not the page level.** A boundary around a whole page turns every error into a blank page with a message, which is barely better than a crash. A boundary around a chart, a comments panel, a recommendations strip, lets the rest of the page survive and gives the user something to retry. The granularity should follow what can fail independently.

**Implement `onViewError`.** Without it your error tracking cannot tell a recovered error from a fatal one, and your dashboards will lie to you. With it you get the component, the boundary, and a reset function.

**Do not use `$reset` as a bare retry.** It recreates the failed view with no changes. Pair it with the thing that might fix the problem: a refetch, a token refresh, a cleared cache. If there is nothing to change, offer navigation instead of retry.

**Know what it does not cover.** Event handlers, async code, root effects created by environment-level services, and `afterRender` go straight to the `ErrorHandler`. A boundary protects rendering, not behavior. If `save()` throws when the user clicks, the component stays on screen and the boundary never fires. That is the correct behavior, because a failed click should not destroy the form, but it means the boundary is not a general error strategy. You still need the global handler.

**Put the boundary where the content is declared.** The projected-content rule bites every team once. If a shared layout component wraps `<ng-content>` in a boundary, it is protecting nothing. The boundary goes in the template that wrote the risky component.

It is also clearly a first step rather than the whole story. The same `ON_ERROR` mechanism that powers the template block and the programmatic `onError` option is general enough to sit underneath other layers of the framework, and the router is the obvious next candidate: a failed route rendering a fallback instead of a failed component. The Angular team has hinted that router-level boundaries may arrive in a coming minor release, which would give you a natural place to put the coarse, page-level boundary that I argued against wrapping by hand above.

Used that way, `@boundary` closes a gap that Angular has had since the beginning: a way to say "this part of the screen may fail, and here is what to show when it does," in the template, type-checked, with the failed view cleanly torn down. The mechanics underneath are small and readable, which is usually the sign of a feature that will stay stable once it leaves preview.

If your team is deciding where boundaries belong in a large Angular codebase, or how to fit `onViewError` into an existing error pipeline, that is the kind of question I help with. I run Angular architecture reviews and workshops for teams building large applications; if you would like a second opinion, [get in touch](https://heckerssoftware.com/#contactForm).
