---
title: "FieldTree vs FieldState: The One Distinction That Makes Signal Forms Click"
description: "Most confusion with Angular Signal Forms comes down to one question: am I holding a FieldTree or a FieldState? This article goes into the Angular source to explain exactly what each one is, how a pair of parentheses turns one into the other, and how to never get it wrong again."
pubDate: "2026-10-06"
heroImage: "../../assets/blog-images/fieldtree-vs-fieldstate.png"
categories: ["Angular", "Forms"]
---

In [my introduction to Signal Forms](https://www.heckerssoftware.com/blog/signal-forms-in-angular-v22-one-source-of-truth/) I showed the API from the outside: a signal holds the model, `form()` wraps it, `[formField]` binds inputs, and `submit()` orchestrates the rest. That is enough to build a form. It is not enough to understand why `loginForm.email().touched()` has parentheses in the middle, or why `loginForm.email.touched()` fails with a confusing error, or why a validator receives a third kind of object that is neither of the two.

After helping several teams adopt Signal Forms, I am convinced that nearly every mistake traces back to one confusion: **not knowing whether the thing in your hand is a `FieldTree` or a `FieldState`.** The two look similar in the template, they are produced from each other, and the API deliberately makes the conversion between them cheap. Once you can tell them apart at a glance, Signal Forms become predictable. Until then, they feel like a guessing game.

This article is about that distinction. I am going to go further into the source than usual, because the implementation explains the behavior better than the documentation does, and because after reading it you should be able to answer every "why does this work" question yourself.

> Everything below is based on the `@angular/forms/signals` package in the Angular repository at version 22.3, read directly from source. Where I describe internals I will name the file, so you can verify it. The public API is marked stable as of 22.0.

## Three objects, one shape

Signal Forms give you three different kinds of object, and all three mirror the shape of your data model. That is the root of the confusion, and also the thing to get straight first.

Take a small model:

```ts
interface IncidentReport {
  title: string;
  severity: 'low' | 'medium' | 'high';
  witnesses: { name: string; contact: string }[];
}
```

Here are the three objects you will meet, side by side.

| | `SchemaPath` | `FieldTree` | `FieldState` |
| --- | --- | --- | --- |
| **What it is** | A location in the form, before the form exists | A navigable map of the live form | The state of one field, right now |
| **When it exists** | Inside the schema function passed to `form()` | After `form()` returns | Whenever you call a `FieldTree` |
| **How you get it** | The `p` parameter in `form(model, (p) => …)` | `form(model)` and dotting into the result | `tree()` – calling the tree as a function |
| **What you can do** | Attach rules: `required(p.title)` | Navigate: `tree.witnesses[0].name` | Read and write: `.value()`, `.touched()`, `.errors()` |
| **What you cannot do** | Read any value or state | Read any value or state | Navigate to children |

The last row is the one to memorize. **A `FieldTree` cannot tell you anything about a field. A `FieldState` cannot take you anywhere else.** They are not two views of the same object with overlapping capabilities. They are two different objects with disjoint jobs, and you move between them with a pair of parentheses.

The `SchemaPath` is the odd one out and I will come back to it at the end. For now, the main event.

## FieldTree is a map

`form()` returns a `FieldTree<IncidentReport>`. Here is the type, lightly trimmed from `packages/forms/signals/src/api/types.ts`:

```ts
export type FieldTree<TModel, TKey, TMode> =
  (() => FieldStateByMode<TModel, TKey, TMode>) &
  (TModel extends ReadonlyArray<infer U>
    ? ReadonlyArrayLike<MaybeFieldTree<U, number, TMode>>
    : TModel extends Record<string, any>
      ? Subfields<TModel, TMode>
      : object);
```

Read it as two halves joined by `&`.

The first half says a `FieldTree` is **a function that returns a `FieldState`**. That is what the parentheses do. `report()` calls the tree and hands you the state of the root field.

The second half says a `FieldTree` **also has properties, one per key in the model**, and each property is itself a `FieldTree` of that key's type. So `report.title` is a `FieldTree<string>`, `report.witnesses` is a `FieldTree<Witness[]>`, and `report.witnesses[0].name` is a `FieldTree<string>` three levels down. The structure of the tree is the structure of your data, which is why the compiler can refuse `report.titel` at build time.

There is one subtlety worth knowing. `Subfields` strips function-valued keys, so if your model type has a method on it, no field is created for it. And `MaybeFieldTree` pulls `undefined` outside the tree, so an optional property `details?: Details` gives you `FieldTree<Details> | undefined`, not `FieldTree<Details | undefined>`. You have to check for the field's existence before navigating into it, which is correct, because the field genuinely does not exist while the value is `undefined`.

What a `FieldTree` **does not** have is any of the things you actually want to know. There is no `report.title.value`. There is no `report.title.touched`. The type has exactly two capabilities: be called, or be navigated. If you find yourself writing `report.title.touched()`, the compiler will tell you `touched` does not exist on `FieldTree<string>`, and at runtime, as we will see, the proxy will hand you `undefined` and you will get "undefined is not a function".

## FieldState is the state

Call the tree and you get a `FieldState`. The interface is long, so here it is grouped by purpose rather than in declaration order.

**The value**

```ts
readonly value: WritableSignal<TValue>;
readonly controlValue: WritableSignal<TValue>;
```

`value` is the one you will use. Writing to it writes to your model signal. `controlValue` is the undebounced value of the bound UI control; it differs from `value` only when you have configured `debounce()`, and it is how the typed text is buffered before it lands in the model.

**Interaction state**

```ts
readonly touched: Signal<boolean>;
readonly dirty: Signal<boolean>;
markAsTouched(options?): void;
markAsDirty(): void;
reset(value?: TValue): void;
```

Both flags aggregate. A parent is touched if it was touched itself or if any child is touched. `reset()` clears touched and dirty for the field and all its descendants, and only sets the value if you pass one.

**Validity**

```ts
readonly valid: Signal<boolean>;
readonly invalid: Signal<boolean>;
readonly pending: Signal<boolean>;
readonly errors: Signal<ValidationError.WithFieldTree[]>;
readonly errorSummary: Signal<ValidationError.WithFieldTree[]>;
getError(kind): ValidationError | undefined;
```

Two traps here that catch people on their first day.

First, **`valid()` is not `!invalid()`**. The source comment spells it out: `valid()` is true when there are no errors *and* no pending async validators. `invalid()` is true when there are errors, regardless of pending ones. With one async validator still running and no errors, both are `false`. If you disable a submit button on `!valid()` it stays disabled while validation is pending, which is what you want. If you disable it on `invalid()`, it enables during the pending window, which is not.

Second, **`errors()` is this field's own errors; `errorSummary()` includes descendants.** For a leaf input you want `errors()`. For a form-level error panel you want `report().errorSummary()`. Mixing them up gives you either a field showing its children's errors or a summary that misses everything below the root.

**Logic state**

```ts
readonly disabled: Signal<boolean>;
readonly disabledReasons: Signal<readonly DisabledReason[]>;
readonly readonly: Signal<boolean>;
readonly hidden: Signal<boolean>;
```

`hidden` deserves a sentence. A hidden field is excluded from `valid`, `touched` and `dirty` calculations, so a form with a hidden required field can still be valid. But hidden does **not** remove anything from the template. You still write `@if (!field().hidden())` yourself. The flag changes how the form reasons about the field; it does not change the DOM.

**Metadata, derived from the rules**

```ts
readonly required: Signal<boolean>;
readonly min, max, minLength, maxLength, pattern;
metadata<M>(key: MetadataKey<M>): M | undefined;
```

When you write `required(p.title)` in the schema, the field's `required()` signal becomes true, and the `FormField` directive uses that to set the native `required` attribute. Same for the others. This is how a validator you wrote once ends up in the DOM's accessibility tree.

**Where am I**

```ts
readonly fieldTree: FieldTree<unknown, TKey>;
readonly keyInParent: Signal<TKey>;
readonly name: Signal<string>;
```

`fieldTree` is the way back. From a state you can always get the tree that produced it, which is what lets a function that receives a `FieldState` navigate to a sibling if it must.

There is also a readonly variant, `ReadonlyFieldState`, where `value` is a `Signal` rather than a `WritableSignal` and the mutating methods are gone. That is what validators and `FieldContext` hand you, because logic that runs inside the form should read the form, not write it.

## The parentheses: how a tree becomes a state

Now the part the documentation does not explain, and the part that makes everything else predictable.

In `packages/forms/signals/src/field/node.ts` there is one class, `FieldNode`, declared like this:

```ts
export class FieldNode implements FieldState<unknown> {
  readonly fieldProxy = new Proxy(() => this, FIELD_PROXY_HANDLER) as unknown as FieldTree<any>;
  // ...
}
```

Read that line slowly, because it is the whole trick.

`FieldNode` **implements `FieldState`**. It is the state. All of those signals, `value`, `touched`, `errors` and the rest, are getters on this class that delegate to smaller internal objects.

And `fieldProxy`, the thing you get back from `form()` and from every `.title` or `[0]` you dot into, is a **`Proxy` whose target is the arrow function `() => this`**.

So what happens when you write `report.title()`?

JavaScript sees a call on a Proxy. The handler in `proxy.ts` does not define an `apply` trap, so the call goes straight through to the target. The target is `() => this`. It returns the `FieldNode`. And the `FieldNode` is the `FieldState`.

**Calling a `FieldTree` is calling `() => this`. That is all the parentheses are.**

And what happens when you write `report.title` without the parentheses?

JavaScript sees a property access on a Proxy. This time the handler *does* have a trap, and here is what it does, from `proxy.ts`:

```ts
get(getTgt: () => FieldNode, property: string | symbol) {
  const tgt = getTgt();

  const child = tgt.structure.getChild(property);
  if (child !== undefined) {
    return child.fieldTree;
  }

  // ... array `length` and iteration handling ...

  return undefined;
}
```

It looks up a child node by the property name and, if one exists, returns *that child's* proxy. So `report.title` is the proxy of the `title` node, and `report.title.touched` asks the `title` node for a child called `touched`, finds none, and returns `undefined`. That is the runtime half of the error you get when you forget the parentheses.

This explains two things at once.

It explains why the `FormField` directive accepts a tree. Its input is typed `Field<T>`, and in `types.ts`:

```ts
export type Field<TValue, TKey> = () => FieldState<TValue, TKey>;
```

A `Field` is just "something callable that returns a `FieldState`". Every `FieldTree` satisfies that, because the first half of its type is exactly that function. The directive then does the obvious thing in `form_field.ts`:

```ts
readonly state = computed<FieldState<T>>(() => this.field()());
```

Two sets of parentheses. The first unwraps the input signal, the second calls the tree. You will see `field()()` in your own code too, whenever you take a `Field` as a component input, and now you know it is not a typo.

It also explains why the `FieldState` has a `fieldTree` property pointing back. It is the same `FieldNode`. The getter is one line:

```ts
get fieldTree(): FieldTree<unknown> {
  return this.fieldProxy;
}
```

Tree and state are not two objects. They are two faces of one node, and the Proxy decides which face you see based on whether you called it or dotted into it.

## Why calling is cheap, and what the tree is doing underneath

Once you know that `report.title()` is just a function returning an existing object, two reasonable worries disappear and one new piece of understanding appears.

The first worry is cost. There is no allocation on call. `() => this` returns a node that already exists. You can call a tree in a template a hundred times per change detection cycle and it costs a hundred function returns.

The second worry is identity. Because the node is stable, `report.title()` returns the same `FieldNode` every time, for the life of that field. You can hold onto a state, and it stays valid. The exception is arrays, which I will cover separately, because there the question "the life of that field" has a real answer.

The new understanding is about navigation. `tgt.structure.getChild(property)` in the proxy handler is not a hash lookup into a pre-built tree. Look at `structure.ts`:

```ts
getChild(key: PropertyKey): FieldNode | undefined {
  this.ensureChildrenMap();
  const strKey = key.toString();
  let reader = untracked(this.childrenMap)?.byPropertyKey.get(strKey)?.reader;

  if (!reader) {
    reader = this.createReader(strKey);
  }

  return reader();
}
```

Three things in here are worth knowing.

**Children are created lazily.** `ensureChildrenMap()` only builds the child map when something asks for it. More than that, `computeChildrenMap` has a fast path: if no child of this node has any schema logic attached, and nobody has materialized the children yet, it returns `undefined` and creates nothing. A large model with a sparse schema does not pay for nodes nobody looks at.

**Every child is behind a `computed` reader.** `createReader(key)` returns `computed(() => this.childrenMap()?.byPropertyKey.get(key)?.node)`. Navigating to a child inside a reactive context, such as a template or an `effect`, makes that context depend on the reader, not on the entire children map. If the model changes shape in a way that does not affect this key, consumers of this key are not notified.

**Reading a key that does not exist still creates a dependency.** This is the clever bit, and the source comment is explicit about it. If you ask for `report.details` and `details` is currently `undefined` in the model, `getChild` creates an ephemeral reader for that key, reads it, and returns `undefined`. But if you did that inside a template, the template is now subscribed to that reader. When `details` later becomes an object, the reader notifies, the template re-runs, and this time `getChild` finds a real node. Optional fields appearing and disappearing just work, without you writing anything.

## Where the value actually lives

A `FieldState` has a `value` signal and you can write to it. Where does the write go?

Not into the node. Look at `util/deep_signal.ts`:

```ts
export function deepSignal<S, K extends keyof S>(
  source: WritableSignal<S>,
  prop: Signal<K>,
): WritableSignal<S[K]> {
  const read = computed(() => source()[prop()]) as WritableSignal<S[K]>;

  read.set = (value: S[K]) => {
    if (Object.is(untracked(read), value)) return;
    source.update((current) => valueForWrite(current, value, prop()) as S);
  };
  // ...
}
```

Every child field's `value` is a `deepSignal` over its parent's `value`, keyed by the child's key. Reading `report.title().value()` reads `report().value().title`, which reads your model signal and picks out `.title`. Writing `report.title().value.set('Escaped lemur')` calls `update` on the parent's value, which calls `update` on *its* parent's value, all the way up to the signal you passed to `form()`.

And look at `valueForWrite`:

```ts
function valueForWrite(sourceValue, newPropValue, prop) {
  if (isArray(sourceValue)) {
    const newValue = [...sourceValue];
    newValue[prop as number] = newPropValue;
    return newValue;
  } else {
    return {...(sourceValue as object), [prop]: newPropValue};
  }
}
```

The write is **immutable**. Setting one field's value produces a new object at every level between that field and the root, and the root model signal gets a new value with a new identity.

Three consequences follow, and all three bite people who do not know this.

Your model signal changes identity on every keystroke. An `effect` that reads `model()` runs every time any field changes. That is correct, and it is what "the model is the form" means, but if you expected it to run only when the whole object was replaced, it will surprise you.

Reference equality on the model is meaningless across edits. `model() === previousModel` is always false after any edit anywhere. Compare fields, not the root.

And there is only one source of truth, exactly as advertised. The node holds no copy of the value. `FieldNode.value` is a getter returning `this.structure.value`, which is a `deepSignal`, which is a `computed` over the parent. There is nothing to get out of sync, because there is nothing to sync.

## Arrays and the question of identity

Everything above assumes a field stays where it is. For object properties that is true: the `title` field is at `title` for the life of the form. Arrays break the assumption, because items move, and Signal Forms handle this in a way that is worth understanding before you render a `@for`.

When the parent value is an array and an item is an object, `computeChildrenMap` in `structure.ts` does this:

```ts
if (parentIsArray && isObject(childValue) && !isArray(childValue)) {
  trackingKey = (childValue[this.identitySymbol] as TrackingKey) ??= Symbol(...);
}
```

It stamps a `Symbol` onto the item object itself, as a non-enumerable property, and uses that symbol as the item's identity. On the next recomputation, an item that has moved from index 2 to index 0 is found by its symbol, and the **same `FieldNode`** is reused at the new index. Its `keyInParent()` signal updates to `0`. Its touched and dirty state, its errors, its bound inputs all come along.

So if a user has typed a witness's name, half-finished the contact field, and then the list is sorted, the half-finished field is still half-finished and still marked dirty. That is the behavior you want and the behavior most form libraries get wrong.

Two things to take from this.

**Iterate the tree, not the model.** `report.witnesses` is iterable: the proxy's `Symbol.iterator` trap returns the child trees in order. So `@for (witness of report.witnesses; track witness)` gives you a `FieldTree<Witness>` per row, and tracking by the tree object is correct because the tree is stable per item. If instead you iterate `report().value().witnesses` and index back into the tree, you have two things that can disagree.

**Primitive array items have no identity.** The symbol trick needs an object to stamp. For `string[]`, items are tracked by index, so reordering a list of strings is a value change at every index, not a move. If the order of a primitive array matters in your form, make the items objects.

There is one more concept here: **orphaned fields**. If you hold a `FieldState` for an array item and that item is removed from the array, the node is now orphaned. `structure.isOrphaned()` becomes true, `keyInParent()` throws a `RuntimeError` if read, and `markAsTouched()` becomes a no-op. This is the one case where "the state is stable" has a boundary: it is stable for the life of the field, and removing an item ends that life. Holding a tree is safe; holding a state across a structural change is not, unless you check `isOrphaned` or re-derive it from the tree.

## The third object: SchemaPath

Everything so far was `FieldTree` and `FieldState`. There is one more object, and it is where most people's first real confusion happens, because it looks exactly like a `FieldTree` and is used in the same breath.

```ts
const report = form(model, (p) => {
  required(p.title);
  validate(p.severity, (ctx) => ctx.value() === 'high' && ctx.valueOf(p.witnesses).length === 0
    ? { kind: 'needsWitness', message: 'High severity requires a witness' }
    : null);
});
```

That `p` is a `SchemaPath<IncidentReport>`. It navigates like a tree. It is **not** a tree.

The decisive difference: the schema function runs **before the form exists**. There is no model value to read and no state to inspect, because `form()` has not finished constructing anything. `SchemaPath` is a pure description of a location: "the `severity` key under the root". Rules bind to that location, and later, when the real `FieldNode` for `severity` is created, the rules attached to its path are applied to it.

Under the hood it is another `Proxy`, in `schema/path_node.ts`, with a `get` trap that returns a child path for every property. At the type level, `SchemaPath` has no callable half at all, and its only member is a phantom `ɵɵTYPE` property that exists for the compiler. You cannot call it, and the compiler will tell you so.

So how does a validator read anything? Through the `FieldContext` it is given:

```ts
export interface RootFieldContext<TValue> {
  readonly value: Signal<TValue>;
  readonly state: ReadonlyFieldState<TValue>;
  readonly fieldTree: ReadonlyFieldTree<TValue>;

  valueOf<P>(p: SchemaPath<P>): P;
  stateOf<P>(p: SchemaPath<P>): ReadonlyFieldState<P>;
  fieldTreeOf<M>(p: SchemaPathTree<M>): ReadonlyFieldTree<M>;
}
```

The context is created per field node at runtime. It gives you the current field's value, state and tree directly, and three resolver functions that take a `SchemaPath` and give you back the live equivalent. `ctx.valueOf(p.witnesses)` is how a validator on `severity` reads the current witnesses: it hands the path to the context, and the context resolves it against the live tree.

Notice every return type is readonly. Logic inside the form may read any field but may not write any. If you need to set a value in response to another, that is an `effect` outside the form, or a `linkedSignal` in the model, not a validator.

## Putting the three in one picture

Here is the model of Signal Forms I would ask you to carry away.

```
form(model, schema)
       │
       │  schema runs first, against SchemaPaths
       │  (locations, no values, no state)
       ▼
   FieldTree ◄──────────────────────── .fieldTree
       │                                     ▲
       │  dot into it: navigate              │
       │  call it:     ()                    │
       ▼                                     │
   FieldState ───── implements ───── FieldNode
       │
       │  .value is a deepSignal into the parent
       ▼
   your model signal
```

A `SchemaPath` exists before the form and describes where logic goes. A `FieldTree` exists after, mirrors your model, and is a Proxy over a function. Call it and you get the `FieldState`, which is the `FieldNode` itself. Dot into it and the Proxy hands you a child tree. Write to a state's value and the write walks up through `deepSignal`s to your model, immutably, giving the model a new identity. And the state has a `fieldTree` getter that returns the same Proxy you started from, so you are never more than one property access from where you came.

## What you can now get right

With that model in hand, here are the things that stop being mysterious.

**Component inputs.** When a child component needs to bind to a field, type the input as `Field<T>`, not `FieldState<T>`:

```ts
readonly field = input.required<Field<string>>();
```

Pass the tree: `<app-text-field [field]="report.title" />`. Inside the component, `this.field()()` gives you the state when you need it, and `[formField]="field()"` binds it. The tree is the stable, callable handle; passing a state would work until the first structural change and then it would not.

**Reading in templates.** `report.title().value()`, `report.title().errors()`, `report.title().touched()`. Tree, call, state, call. If you have two sets of parentheses in a row with nothing between, you are unwrapping a signal input and then a tree. If you have one, you are turning a tree into a state. If you have none, you are navigating.

**Form-level state.** `report()` is the state of the root field. `report().valid()` is whole-form validity. `report().errorSummary()` is every error in the form. `report().touched()` is true if anything was touched. The root is a field like any other; it just has no parent.

**Submit buttons.** Disable on `!report().valid()`, not on `report().invalid()`, so that pending async validation keeps the button disabled.

**Validators that need other fields.** Use `ctx.valueOf(p.other)` inside the validator. Do not close over the tree from the outer scope. The tree does not exist yet when the schema function runs, and even if it did, the context is the readonly door you are meant to use.

**Dynamic structure.** Iterate `report.witnesses` directly in `@for` and track by the item tree. Add and remove items by writing to the model (`model.update(m => ({...m, witnesses: [...m.witnesses, blank]}))`) and let the tree follow. Never store a `FieldState` for an array item across a change to that array.

**The error you will still make occasionally.** Writing `report.title.value()`. The compiler catches it in TypeScript; in a template with less strict checking it may reach runtime as "undefined is not a function". When you see that message anywhere near a form, you forgot a pair of parentheses, and you now know exactly which Proxy trap handed you the `undefined`.

## Why the design is this way

It is fair to ask why the API separates these at all. Reactive Forms had one `FormControl` object that you both navigated and read; why not do the same?

The answer is reactivity granularity. If `report.title` returned an object with `value`, `touched` and the rest as properties, then every property read in a template would have to be a signal read, which they are, but every *navigation* would also have to go through something reactive, which it does. Separating navigation from state lets the proxy make navigation reactive per key, through those `computed` readers, while the state object stays a plain class with signal getters. The template depends on exactly the keys and exactly the signals it touched, nothing more. That is what makes Signal Forms fit the zoneless, fine-grained world Angular has been moving toward, and it is why the parentheses are there.

Once you see the `Proxy` around `() => this`, they stop being an inconvenience and start being the most honest part of the API: a tree is something you walk, a state is something you read, and the call is the moment you stop walking.

If your team is adopting Signal Forms and hitting this wall, or you are deciding whether to adopt them at all, this is the kind of thing I help with. I run Angular architecture reviews and workshops for teams building large applications, and forms are usually where the interesting questions are. If you would like a second opinion, [get in touch](https://www.heckerssoftware.com/#contactForm).
