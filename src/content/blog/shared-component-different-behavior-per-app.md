---
title: "One Shared Component, Different Behavior in Every App, and Nothing in the Wrong Bundle"
description: "A shared Angular component needs a camera on mobile and a file dialog on desktop. Here is why a flag, an input, and content projection all fail, and how dependency injection solves it without shipping both implementations to both applications."
pubDate: "2026-10-03"
heroImage: "../../assets/blog-images/shared-component-per-app.png"
categories: ["Angular", "Nx", "Architecture"]
---

In the [error handler article](https://www.heckerssoftware.com/blog/angular-global-error-handler-nx-monorepo/) I showed how a shared service can let each application contribute its own behavior through a multi-provider token, without the shared code knowing which applications exist. That pattern works well for services. The question I get most often afterwards is whether the same thing can be done for a component.

It can, and in a large Nx workspace you will need it sooner than you expect. This article walks through the problem, the three solutions most teams try first, why each of them fails in a way that is not immediately visible, and the approach I use instead. At the end we will check the production bundle, because the whole point is what ends up in it.

> This article uses the zoo workspace from my talk at Angular Zürich: a `visitor` web application, a `keeper-mobile` Capacitor application, a `ticket-kiosk`, and a set of shared libraries they all use. It assumes Angular's `application` builder with esbuild.

## The requirement

The workspace has a shared photo picker. It is a small component with a button, and when the user picks one or more photos it emits them as `File[]`. Several shared components use it: an incident report form, a profile editor, a message composer. None of these belongs to a single application. They live in `libs/shared/ui`, and every application renders at least one of them.

The picker needs to do different things in different applications.

On `keeper-mobile`, it should open the device camera through Capacitor, let the keeper take several photos, show them in a strip, and let them remove the bad ones before confirming. On `visitor`, running in a desktop browser, it should open the operating system's file dialog. There is no camera to speak of and no Capacitor plugin available.

These two behaviors share nothing. Not the UI, not the state, not the interaction model. The only thing they have in common is the contract: a button goes in, `File[]` comes out.

There are three more things I want from this picker, and they shape everything that follows.

**It has to be usable from a shared template, with inputs.** The incident report form is a shared component. Its template should be able to write this and nothing more:

```html
<zoo-photo-picker [maxCount]="3" (selected)="attach($event)" />
```

A shared component should not have to know or care which application it is rendering in. It binds the inputs it needs and listens to the outputs it needs, exactly as it would for any other component.

**The molecules around it must not be duplicated.** The picker sits inside a media row, inside an evidence block, inside the form. If the only way to get a camera on mobile is a `mobile-media-row` and a `mobile-evidence-block` and a `mobile-incident-report`, we have doubled a chunk of the design system to vary one leaf. That is not an option.

**The inputs and outputs must not drift.** Two implementations written by two teams in two applications will not stay aligned on their own. If the camera picker calls its limit `maxPhotos` and the file picker calls it `maxFiles`, then no shared template can bind it, and the picker has quietly stopped being one component. Whatever we build has to make the shared surface a single, enforced definition.

That shared contract is the whole design. Everything below is about honoring it without letting either implementation leak into the other application's bundle.

## Three things that look like solutions

Before showing the approach I use, it is worth going through the three things most teams reach for first. Each of them is reasonable on its face, and each fails for a reason that does not show up in the development build.

### A flag

The first instinct is a boolean. Give the component an `isMobile` input, or inject a config service that knows the platform, and branch in the template:

```ts
@Component({
  selector: 'zoo-photo-picker',
  imports: [CameraCaptureComponent],
  template: `
    <button type="button" (click)="open()">Add photo</button>

    @if (isMobile() && showCamera()) {
      <zoo-camera-capture (captured)="onCaptured($event)" />
    }

    @if (!isMobile()) {
      <input #fileInput hidden type="file" (change)="onSelect($event)" />
    }
  `,
})
export class PhotoPickerComponent {
  readonly isMobile = input(false);
  // ...
}
```

This works. It does what it says in both applications. The problem is in the line that reads `imports: [CameraCaptureComponent]`.

`isMobile` is a runtime value. The `imports` array is resolved at compile time. The bundler has no way of knowing that `isMobile` is never true in the `visitor` application, because it cannot evaluate your templates. It sees that `PhotoPickerComponent` references `CameraCaptureComponent`, so `CameraCaptureComponent` is reachable, so it ships. Along with everything the camera component imports: the Capacitor camera plugin, the gallery strip, the image preview component, and anything else behind it.

In other words, **both implementations ship to both applications, and the flag decides which one runs.** The visitor application carries a camera it can never open.

This is the same mechanism I described in the [barrel article](https://www.heckerssoftware.com/blog/nx-monorepo-barrel-issues/), from a different angle. There, a top-level call kept a module alive. Here, a compile-time reference keeps a component alive. In both cases the bundler is doing exactly what it is supposed to do with the information it has.

I will show the measurement at the end, but the short version is that the reduced reproduction comes out roughly three times larger with both branches than with one.

### An input

The second instinct is to move the decision up. Instead of branching inside the shared component, let the consumer tell it what to render, usually by passing a component class as an input:

```ts
readonly implementation = input.required<Type<unknown>>();
```

This at least removes the import from the shared component, which fixes the bundle problem. But now every consumer of the picker has to supply the implementation, and the consumers of the picker are themselves shared components. The incident report form is in `libs/shared/ui`. It does not know which application it is rendering in any more than the picker does.

So the input has to come from somewhere higher up. The form gets an `implementation` input too, and passes it down. The organism that renders the form gets one as well. You end up threading a value from the application shell through three or four shared components to reach a button at the bottom.

That is prop drilling, and it has the usual cost: every intermediate component acquires an input it does not use, purely to pass it along. But in a shared design system there is a second cost that is worse, and it shows up the moment you decide whether the input is required.

Suppose you make it required, because a picker without an implementation is useless:

```ts
// libs/shared/ui/media-row
@Component({
  selector: 'zoo-media-row',
  template: `
    @for (photo of photos(); track photo.id) { <zoo-thumb [photo]="photo" /> }
    <zoo-photo-picker [implementation]="picker()" (selected)="add($event)" />
  `,
})
export class MediaRowComponent {
  readonly photos = input.required<Photo[]>();
  readonly picker = input.required<Type<unknown>>();
}
```

The media row is not only used in the incident form. It is also the component behind a read-only photo timeline, which shows thumbnails and never offers a picker at all. That timeline now fails to compile, because it renders `<zoo-media-row>` without binding `picker`, and `picker` is required.

So the timeline has to pass something. There is nothing sensible for it to pass, because it has no picker and never will, so it ends up with a dummy value or a conditional in the media row to skip the picker when the input is unused. Either way, a component that never needed a picker has acquired a required input purely so that two other components can have one.

Now suppose you make it optional instead:

```ts
readonly picker = input<Type<unknown>>();
```

The timeline compiles again. But the incident form, the evidence block, and the media row are three separate components, each passing `picker` to the next, and the binding is optional at every step. Forget it in one place and nothing complains. The template compiles, the application starts, and the picker renders nothing, or `createComponent` throws when it receives `undefined`, depending on how the placeholder is written. Either way the failure is at runtime, in whichever application happens to render that organism, and the error is three components away from the line that caused it.

That is the dilemma. Required breaks the components that do not want a picker. Optional breaks the components that do, but silently, and only sometimes. There is no setting for this input that is correct in both places, because the input is trying to carry application-level knowledge through components that have no business holding it.

### Content projection

The third instinct is to use the mechanism Angular provides for exactly this kind of thing. Give the picker an `ng-content` slot, and let the consumer project whatever it wants:

```html
<zoo-photo-picker>
  <zoo-camera-capture (captured)="..." />
</zoo-photo-picker>
```

Projection is the right tool when the component rendering the slot owns the content. A card component with a header slot works well because whoever writes `<app-card>` also writes what goes in the header.

Here, the component rendering the picker does not own the content. The picker sits inside a media row, which sits inside an evidence block, which sits inside the incident report form, and all three of those are shared. For the application to project a camera component into the picker, the slot would have to be threaded through every one of those molecules.

Then there is the second cost, which is less obvious. Those molecules are reused. The media row that holds the picker inside the incident form is the same media row that shows a read-only photo timeline elsewhere, with no picker at all. If the media row gains a slot so that two organisms can inject a picker, the timeline inherits a slot it will never fill.

Projection fits when the consumer owns the content. Here the consumer is shared code, and shared code cannot own something that is different in every application.

### What about @defer?

A reasonable follow-up question: can `@defer` solve the first problem by moving the camera into its own chunk?

Partly. With a deferred block, the camera component lands in a separate JavaScript file that the `visitor` application never requests at runtime. That is a real saving over the network.

But the file still exists in `dist`. The dependency edge from the picker to the camera still exists in the project graph, which means `nx affected` still links them, and your module boundary rules still see shared importing a mobile-only library. For a Capacitor or Electron application, the whole `dist` folder is packaged into the binary regardless of which chunks are fetched.

`@defer` changes when code is loaded. It does not change what code exists. The problem here is the latter.

## What all three have in common

Each of the three attempts puts the knowledge of which implementation to use in the wrong place.

The flag puts it in the shared component, which then has to import both. The input puts it in the consumer, which is also shared and has to pass it along. Projection puts it in the template of the consumer, same problem.

The only place that actually knows which implementation is correct is the application. `keeper-mobile` knows it wants a camera. `visitor` knows it wants a file dialog. Nobody in `libs/shared` has that information, and every attempt to make them have it either costs bundle size or costs an input on every component between the application and the button.

So the application has to be the one that decides, and it has to decide somewhere the shared component can reach without importing anything from the application. In Angular that place is the injector.

## What drift looks like

Before building the contract it is worth seeing what happens without one, because this is the problem the two-interface design below is for.

Picture the two pickers written independently. The mobile team writes theirs first:

```ts
export class CameraPhotoPickerComponent {
  readonly maxPhotos = input(1);
  readonly captured = output<File[]>();
}
```

A month later the web team writes theirs, from the same verbal description:

```ts
export class FilePhotoPickerComponent {
  readonly maxFiles = input(1);
  readonly accept = input('image/*');
  readonly selected = output<File[]>();
}
```

Both are perfectly good components. Neither is wrong. But the incident form cannot bind `[maxPhotos]` in one application and `[maxFiles]` in the other, because it is one template. It cannot listen to `(captured)` on mobile and `(selected)` on web. The moment the names diverge, the shared component has to know which implementation it is talking to, and we are back to the flag.

The names will diverge. Not through carelessness, but because two people writing two components in two folders with no shared definition between them have nothing to keep them aligned except memory. The fix is to give them a definition, and to make the compiler check it.

## The contract

There are two kinds of input and output on a component like this, and conflating them is the mistake that makes the contract either too strict or too loose.

Some members **every implementation must have**. A picker that cannot emit files is not a picker, and a picker that cannot be told how many files to accept is not usable from the shared template above.

Other members **only some implementations have**. A file input can take an `accept` filter; a camera has no use for one. A camera can be cancelled mid-capture and might want to say so; a file dialog's cancel is invisible to the page.

So there are two interfaces. In `libs/shared/ui/photo-picker`:

```ts
// libs/shared/ui/photo-picker/src/lib/photo-picker.contract.ts
import { InjectionToken, InputSignal, OutputEmitterRef, Type } from '@angular/core';

/** Every implementation must provide these. */
export interface PhotoPickerContract {
  readonly maxCount: InputSignal<number>;
  readonly selected: OutputEmitterRef<File[]>;
}

/** An implementation may provide these. The placeholder always exposes them. */
export interface PhotoPickerOptions {
  readonly accept?: InputSignal<string>;
  readonly cancelled?: OutputEmitterRef<void>;
}

export type PhotoPickerImplementation = PhotoPickerContract & PhotoPickerOptions;

/** What a template may bind on <zoo-photo-picker>: everything, and none of it optional. */
export type PhotoPicker = Required<PhotoPickerImplementation>;

export const PHOTO_PICKER = new InjectionToken<Type<PhotoPickerImplementation>>(
  'PHOTO_PICKER',
);

export function providePhotoPicker(implementation: Type<PhotoPickerImplementation>) {
  return { provide: PHOTO_PICKER, useValue: implementation };
}
```

Three things here, and each one matters.

The **two interfaces** split the surface by obligation. `PhotoPickerContract` is what every implementation must have, and it is what the shared template is allowed to rely on. `PhotoPickerOptions` is what an implementation may have, with every member optional. The intersection type is what the token carries, so an implementation declares the required members and whichever optional ones it supports, and TypeScript holds it to both.

The reason for the split is what each side can promise. A template binding `[maxCount]` on the placeholder needs that input to exist on every implementation, so it lives in the required contract. A template binding `[accept]` is making a request that some implementations will ignore, which is fine as long as the placeholder exposes the input and forwards it only where it lands. Keeping those two categories in separate types means the required surface stays fully required, and the compiler refuses an implementation that drops `selected`, while the optional surface stays genuinely optional.

The **third type**, `PhotoPicker`, is `Required<PhotoPickerImplementation>`: the same members with every `?` removed. This is not for implementations. It is the type of the placeholder, and it exists because the placeholder has a different obligation from the implementations behind it. An implementation may leave out `accept`. The placeholder may not, because the shared template that binds `[accept]` has no way of knowing which implementation is on the other side. From the template's point of view, every input and output of `<zoo-photo-picker>` always exists, and the type should say so. I will come back to this when we write the placeholder.

Notice that all three types use `InputSignal` and `OutputEmitterRef`, which are the types Angular gives you for signal inputs and the `output()` function. That is what lets us wire the implementation up later without knowing its concrete class.

The **token** is an `InjectionToken` whose value is a *component class*, not a component instance. `Type<PhotoPickerImplementation>` means "a constructor for something that satisfies the contract". We are not injecting a picker. We are injecting the knowledge of which picker to create.

The **provider function** is a small convenience that I recommend for every token like this. `providePhotoPicker(CameraPhotoPicker)` reads better in an application config than a raw provider object, and the parameter type means TypeScript refuses a class that does not implement the contract. That check is the main reason to write the helper rather than letting people write `{ provide: PHOTO_PICKER, useValue: ... }` by hand.

Nothing in this file imports from any application. It defines a shape and a token, and that is all a shared library should know.

## The placeholder

Now the shared component. It is the thing the incident form and the profile editor render, and its only job is to find the real picker and put it on the page:

```ts
// libs/shared/ui/photo-picker/src/lib/photo-picker.component.ts
import {
  Component,
  DestroyRef,
  ViewContainerRef,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import { PHOTO_PICKER, PhotoPicker } from './photo-picker.contract';

@Component({
  selector: 'zoo-photo-picker',
  template: '',
})
export class PhotoPickerComponent implements PhotoPicker {
  private readonly viewContainer = inject(ViewContainerRef);
  private readonly implementation = inject(PHOTO_PICKER);

  // the full surface, required and optional, so any template can bind it
  readonly maxCount = input(1);
  readonly accept = input('image/*');
  readonly selected = output<File[]>();
  readonly cancelled = output<void>();

  constructor() {
    const ref = this.viewContainer.createComponent(this.implementation);
    const picker = ref.instance;

    // required: always forwarded
    effect(() => ref.setInput('maxCount', this.maxCount()));
    picker.selected.subscribe((files) => this.selected.emit(files));

    // optional: forwarded only if this implementation has them
    if (picker.accept) {
      effect(() => ref.setInput('accept', this.accept()));
    }
    picker.cancelled?.subscribe(() => this.cancelled.emit());

    inject(DestroyRef).onDestroy(() => ref.destroy());
  }
}
```

Walk through it from the top.

The component has an **empty template**. It renders nothing of its own. Injecting `ViewContainerRef` on a component gives you a container anchored at that component's host element, so anything created in it appears as a sibling in the DOM right after `<zoo-photo-picker>`. For a placeholder that is exactly what we want.

The component **implements `PhotoPicker`**, the fully required version of the type. This is the one line in the file I would argue with you about if you tried to remove it, so it is worth being precise about what it buys.

The placeholder is the only thing shared templates ever see. When the incident form writes `<zoo-photo-picker [accept]="'image/*'" (cancelled)="reset()" />`, the template compiler checks those bindings against `PhotoPickerComponent`, not against whichever implementation an application happens to provide. So the placeholder has to declare every input and output a template might use, and it has to declare them unconditionally. There is no such thing as an optional input from a template's point of view: either `[accept]` compiles or it does not.

`implements PhotoPicker` turns that requirement into a compiler check. If someone adds a new optional member to `PhotoPickerOptions` and forgets to add the matching input or output to the placeholder, the placeholder stops compiling. Without the `implements` clause, that mistake is silent: the contract grows, the placeholder does not, and the first template to bind the new member fails with an unknown-property error that points at the wrong file.

It also pins the placeholder to the contract in the other direction. The placeholder cannot invent an input that no implementation has a counterpart for, because `PhotoPicker` is derived from the same two interfaces the implementations are held to. The three things, template surface, placeholder, and implementations, are all checked against one definition.

The **inputs and outputs** are therefore the full surface, required and optional together. The consumer binds `[maxCount]`, `[accept]`, `(selected)` and `(cancelled)` on `<zoo-photo-picker>` exactly as if it were the real thing, and never finds out that it is not. This is the piece that lets a shared template be written once: whatever the application provides, the placeholder's API is the same.

`createComponent(this.implementation)` is where the two meet. `this.implementation` is whatever class the application registered, and `createComponent` instantiates it inside the container. The returned `ComponentRef` gives us a handle on the instance.

The **effects** forward the inputs. `ref.setInput` is the correct way to set an input on a dynamically created component, because it marks the component for check and works with signal inputs. Wrapping it in `effect` means that whenever the placeholder's `maxCount` changes, the implementation's `maxCount` follows.

The **subscriptions** forward the outputs. `OutputEmitterRef` exposes `subscribe`, so the placeholder can listen to the implementation's `selected` and re-emit it from its own. This is the line that makes the contract's output type matter: because the contract says `selected` is an `OutputEmitterRef<File[]>`, we know `subscribe` exists and we know what it emits.

The **guards on the optional members** are not optional. In development mode, `setInput` throws if you set an input the component does not declare, so forwarding `accept` to a camera that has no `accept` input would crash. Checking `picker.accept` before wiring it is what lets the placeholder stay generic across implementations that support different subsets. The optional chaining on `cancelled` does the same for the output.

This is where the three types work together. The placeholder declares everything, because `PhotoPicker` makes it. The required members are forwarded unconditionally, because `PhotoPickerContract` guarantees every implementation has them. The optional ones are forwarded conditionally, because `PhotoPickerOptions` says an implementation might not. The placeholder never has to know which implementation it holds; it only has to know which members the types promise, and the three types promise three different things.

Finally, **cleanup**. The created component is destroyed when the placeholder is.

### Why not NgComponentOutlet?

Angular ships `NgComponentOutlet` for rendering a component from a class reference, and it is the first thing most people reach for. It also supports `ngComponentOutletInputs` for passing inputs.

It does not support outputs. There is no `ngComponentOutletOutputs`, and no way to subscribe to an event from the dynamically created component through the directive. For a picker whose only purpose is to emit files, that is disqualifying.

`ViewContainerRef.createComponent` is slightly more code and it gives you the `ComponentRef`, which is the thing you need to wire outputs. In my experience, once you need one output, the outlet directive is the wrong tool, and most real components need at least one.

## The implementations

Each application now writes its own picker and keeps it in its own folder.

On `keeper-mobile`:

```ts
// apps/keeper-mobile/ui/camera-photo-picker/src/lib/camera-photo-picker.component.ts
import { Component, input, output, signal } from '@angular/core';
import { Camera, CameraResultType } from '@capacitor/camera';
import { PhotoPickerImplementation } from '@zoo/shared/ui/photo-picker';

@Component({
  selector: 'keeper-camera-photo-picker',
  template: `
    <button type="button" (click)="take()">Take photo</button>

    @if (taken().length) {
      <ul class="strip">
        @for (photo of taken(); track photo.name) {
          <li>
            <img [src]="photo.preview" alt="" />
            <button type="button" (click)="remove(photo)">×</button>
          </li>
        }
      </ul>
      <button type="button" (click)="done()">Done</button>
    }
  `,
})
export class CameraPhotoPickerComponent implements PhotoPickerImplementation {
  readonly maxCount = input(1);
  readonly selected = output<File[]>();
  readonly cancelled = output<void>();          // optional, and this one has it

  protected readonly taken = signal<TakenPhoto[]>([]);

  protected async take() {
    const photo = await Camera.getPhoto({ resultType: CameraResultType.Uri });
    // convert, append to taken(), and emit as soon as maxCount() is reached
  }

  protected remove(photo: TakenPhoto) { /* ... */ }

  protected done() {
    this.selected.emit(this.taken().map((p) => p.file));
  }
}
```

On `visitor`:

```ts
// apps/visitor/ui/file-photo-picker/src/lib/file-photo-picker.component.ts
import { Component, input, output } from '@angular/core';
import { PhotoPickerImplementation } from '@zoo/shared/ui/photo-picker';

@Component({
  selector: 'visitor-file-photo-picker',
  template: `
    <button type="button" (click)="fileInput.click()">Add photo</button>
    <input
      #fileInput
      hidden
      type="file"
      [accept]="accept()"
      [multiple]="maxCount() > 1"
      (change)="onChange(fileInput.files)"
    />
  `,
})
export class FilePhotoPickerComponent implements PhotoPickerImplementation {
  readonly maxCount = input(1);
  readonly accept = input('image/*');           // optional, and this one has it
  readonly selected = output<File[]>();

  protected onChange(files: FileList | null) {
    if (files?.length) {
      this.selected.emit(Array.from(files).slice(0, this.maxCount()));
    }
  }
}
```

Two components with nothing in common except the two members the contract demands. The camera version has state, a strip, a confirm step, and a Capacitor dependency. The file version is a hidden input and a click. There is no shared base class and no shared template, because there is nothing to share.

Look at the optional members. The camera declares `cancelled` and not `accept`, because a camera can be backed out of but has no file type filter. The file picker declares `accept` and not `cancelled`, for the opposite reasons. Each implementation picks the subset of `PhotoPickerOptions` that makes sense for it, and the placeholder handles whichever subset it finds.

Both say `implements PhotoPickerImplementation`, which is what makes TypeScript verify the shape at the point where each is written rather than at the point where it is registered. That is a small thing that saves real time: if someone renames `selected` to `picked` in the camera picker, the error appears on the camera picker, not three files away in an application config. And it is exactly the drift from earlier, caught at compile time instead of in a template that stopped working.

## Registration

Each application registers its implementation once, in its application config:

```ts
// apps/keeper-mobile/shell/src/app/app.config.ts
import { providePhotoPicker } from '@zoo/shared/ui/photo-picker';
import { CameraPhotoPickerComponent } from '@zoo/keeper-mobile/ui/camera-photo-picker';

export const appConfig: ApplicationConfig = {
  providers: [
    // ...
    providePhotoPicker(CameraPhotoPickerComponent),
  ],
};
```

```ts
// apps/visitor/shell/src/app/app.config.ts
import { providePhotoPicker } from '@zoo/shared/ui/photo-picker';
import { FilePhotoPickerComponent } from '@zoo/visitor/ui/file-photo-picker';

export const appConfig: ApplicationConfig = {
  providers: [
    // ...
    providePhotoPicker(FilePhotoPickerComponent),
  ],
};
```

Look at where the imports are. The `keeper-mobile` shell imports the camera picker. The `visitor` shell imports the file picker. Neither imports the other, and `libs/shared/ui/photo-picker` imports neither.

That is the entire reason the bundle works out. The only compile-time reference to `CameraPhotoPickerComponent` in the whole workspace is in the `keeper-mobile` shell, so it is only reachable from the `keeper-mobile` entry point, so it only ships there. The bundler is not doing anything clever. It is following references, and we have arranged the references so that there is nothing to follow.

## What happens when an application forgets

The `ticket-kiosk` application renders the incident report form too, but in this story nobody has written a kiosk picker yet. What happens?

The placeholder calls `inject(PHOTO_PICKER)`, there is no provider, and Angular throws a `NullInjectorError` naming the token. The application fails immediately and loudly, with the token name in the message.

I consider this correct behavior and I would not soften it by default. A shared component that silently renders nothing when it is misconfigured is worse than one that crashes, because the crash tells you exactly what to add and the silence tells you nothing.

If you genuinely want a fallback, make it explicit. Give the token a `providedIn: 'root'` factory that returns the file picker, so that any application which does not override it gets the browser default. That is a reasonable choice for a workspace where most applications are web applications, and it is a choice you should make deliberately rather than inherit by accident.

## How this fits the boundaries

If you have read the [tags article](https://www.heckerssoftware.com/blog/four-dimensions-of-nx-tags/), you will have noticed that this design is not only compatible with module boundaries but is shaped by them.

The camera picker lives in `apps/keeper-mobile/ui/camera-photo-picker`, tagged `app:keeper-mobile`, `type:ui`, and `platform:mobile`. The shared placeholder lives in `libs/shared/ui/photo-picker`, tagged `domain:shared` and `type:ui`.

Under the rules from that article, `libs/shared` may not import from any `app:` tagged project, and nothing may import from a `platform:mobile` project unless it is also mobile. So the flag-based version from earlier does not just cost bundle size. It fails lint, because the shared picker would have to import the camera component across a boundary it is not allowed to cross.

The DI version crosses no boundary. Shared defines a token. The application provides a value for it. Those are both allowed, because neither one is an import of the other.

This is the useful thing about enforcing boundaries early: a design that would have shipped both implementations to both applications is refused before anyone measures a bundle.

## Testing

A side effect of this design is that the shared placeholder and its consumers become easy to test. The incident report form does not need a camera or a file dialog in its tests. It needs something that satisfies the contract:

```ts
@Component({
  selector: 'test-photo-picker',
  template: '<button (click)="emit()">pick</button>',
})
class StubPhotoPicker implements PhotoPickerImplementation {
  readonly maxCount = input(1);
  readonly selected = output<File[]>();

  emit() {
    this.selected.emit([new File([''], 'test.jpg')]);
  }
}

TestBed.configureTestingModule({
  providers: [providePhotoPicker(StubPhotoPicker)],
});
```

No Capacitor mock, no file input to click, and the test exercises the same code path the application does. The real implementations get their own tests in their own libraries, against their own concerns.

## Checking the bundle

Everything above would be a nice theory if the bundle did not actually change, so let's check it. I use a reduced reproduction here because it keeps the numbers readable; the shape is the same in the real workspace.

Three modules: a camera component that imports a deliberately large mobile-only dependency, a file input component, and a picker that references both and branches on a flag. The entry point renders the picker with the flag set to `false`, always. Then the same entry point written to import only the file input component.

Built with esbuild, minified, measured by grepping the output for a marker that only the camera module contains:

| | bytes | camera code in output |
| --- | --- | --- |
| picker with `@if` on both branches | 252 | yes |
| file input imported directly | 74 | no |

The flag was `false` in every build, and the camera shipped anyway. That is what "the flag is runtime, the import is compile time" means in practice.

In the real workspace the difference is not 178 bytes. It is the Capacitor camera plugin, its native bridge, the gallery strip, the image preview, and the dependencies of all of those. I would encourage you to run this check against your own `visitor`-equivalent and grep the production output for a string that only appears in your mobile-only code. If it is there, you are shipping it.

## Two things this is not for

It is worth being precise about the boundary of this pattern, because it is easy to over-apply.

**It is not for whether something appears.** If the question is "should the picker show at all on this screen", that is a boolean, and a boolean input is the right answer. The question DI answers is *which* implementation, not *whether*. A read-only timeline that never shows a picker does not need a token; it needs to not render the placeholder.

**It is not for small variations.** If two applications want the same picker with a different button label, that is an input. If they want the same picker with a different color, that is a CSS custom property. Reach for a token when the implementations genuinely share nothing but the contract, which is the case here and is rarer than it looks.

The test I use: if I can describe the difference between the two implementations as a value, it is an input. If I can only describe it as a different component, it is a token.

## Summary

A shared component that needs to behave differently per application has exactly one correct owner for that decision, and it is the application. Every attempt to put the decision in shared code either ships every implementation to every application, or threads an input through every component between the shell and the button.

The approach that works is the same one Angular uses for its own `ErrorHandler` and `TitleStrategy`: shared code names a contract and a token, each application provides its own implementation, and a small placeholder in shared resolves the token and renders whatever it finds.

The details that make it hold up are the ones that are easy to skip. The contract is split into a required interface every implementation must satisfy and an optional one each may partly satisfy, and the placeholder implements the fully required union of both, so the shared template's surface is complete and compiler-checked while implementations keep their differences. Both are typed with `InputSignal` and `OutputEmitterRef`, so the placeholder can wire inputs and outputs without knowing the concrete class, and it guards the optional members because `setInput` on an undeclared input throws. The placeholder uses `ViewContainerRef.createComponent` rather than `NgComponentOutlet`, because the outlet cannot forward outputs. The provider helper takes a `Type<PhotoPickerImplementation>`, so a non-conforming class is refused at registration. A missing provider fails loudly, by design.

And it costs nothing in the bundle, because the only compile-time reference to each implementation is in the one application that uses it.

This is the third article in a series about keeping a large Nx workspace honest. The [folder structure](https://www.heckerssoftware.com/blog/your-tooling-should-not-dictate-your-folder-structure/) decides where code lives, the [tags](https://www.heckerssoftware.com/blog/four-dimensions-of-nx-tags/) decide who may import whom, and the [barrel article](https://www.heckerssoftware.com/blog/nx-monorepo-barrel-issues/) explains what reaches your bundle. This one is about what to do once a piece of shared code turns out not to be shared after all.

If you recognize the flag-based picker from your own workspace, it is worth a build and a grep. And if the grep finds something, that is usually the first of several, which is the kind of thing I help teams work through.

I run architecture reviews and workshops for teams working in large Angular and Nx workspaces. If you would like a second opinion on yours, [get in touch](https://www.heckerssoftware.com/#contactForm).
