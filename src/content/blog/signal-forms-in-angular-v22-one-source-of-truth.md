---
title: "Signal Forms in Angular v22: One Source of Truth for Your Form State"
description: "Angular v22 ships Signal Forms as a stable API. Learn what problem they solve, how they differ from Reactive Forms, and how to build a clean, validated form step by step."
pubDate: "2026-08-11"
heroImage: "../../assets/blog-images/signal-forms-onme-source-of-truth.png"
categories: ["Angular", "Forms"]
---

If you have built forms in Angular for any length of time, you have felt a particular kind of friction. Your data lives in one place (a model object, maybe fetched from an API) and your form lives in another, a `FormGroup` full of `FormControl` instances. Two versions of the same truth, and it is your job to keep them in sync: patch the form when the model changes, read the value back out when you submit, wire up `valueChanges` when you need to react to edits. It works, but it is a lot of plumbing for something that should feel simple.
 
With Angular v22, that friction has a proper answer. **Signal Forms** are a new, signal-based forms API, stable as of v22, where your data model *is* the form. In this post you will learn what problem they solve, how they compare to the Reactive Forms you already know, and how to build a small validated form together, including how the new `submit()` function handles the whole submission flow for you.
 
## The problem: two ledgers you have to keep in sync
 
Let me give you an analogy. Imagine a shop that keeps two ledgers of its inventory: one in the back office (your data model) and one at the front counter (your `FormGroup`). Every time stock changes, a clerk walks between them to copy the numbers across. Most days it works. But the moment someone forgets a trip, the two ledgers disagree, and you have a bug that is annoying to find because *both* ledgers look plausible on their own.
 
That is essentially what Reactive Forms ask of you. Here is the familiar shape:
 
```typescript
loginForm = new FormGroup({
  email: new FormControl('', [Validators.required, Validators.email]),
  password: new FormControl('', [Validators.required]),
});
 
ngOnInit() {
  // Model arrives from somewhere, now sync it into the form.
  this.loginForm.patchValue(this.user);
}
 
onSubmit() {
  // Read it back out of the form to get the "truth".
  const value = this.loginForm.getRawValue();
  this.auth.login(value);
}
```
 
In the preceding code, `patchValue` and `getRawValue` are the trips the clerk makes between the two ledgers. For a login form it is harmless. For an enterprise form with nested groups, dynamic rows, and cross-field rules (the kind that power apps used by millions of users), those trips add up, and each one is a place where the two ledgers can quietly drift apart.
 
## The fix: one signal, and rules on top of it
 
Signal Forms remove the second ledger entirely. You keep your data in a **signal**, Angular's reactive value container, and you wrap that signal in a form that adds validation and state *on top of the same value*. There is only one truth. The form is a live view of it, not a copy.
 
Let's get our hands dirty. We start with the model as a signal:
 
```typescript
import { Component, signal } from '@angular/core';
import { form, required, email, FormField } from '@angular/forms/signals';
 
interface LoginData {
  email: string;
  password: string;
}
 
@Component({
  selector: 'app-login',
  imports: [FormField],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  loginModel = signal<LoginData>({ email: '', password: '' });
 
  loginForm = form(this.loginModel, (f) => {
    required(f.email, { message: 'Email is required' });
    email(f.email, { message: 'Please enter a valid email' });
    required(f.password, { message: 'Password is required' });
  });
}
```
 
As you can see, `form()` takes two things: the signal holding your data, and a small schema function where you attach validators to individual fields. The `f` passed into that function is a typed path into your model, so `f.email` and `f.password` are checked by the compiler: misspell one and the build fails, not the runtime. The validators like `required` and `email` come straight from `@angular/forms/signals`.
 
Notice what is *not* here. There is no `patchValue`. There is no `getRawValue`. The `loginModel` signal is the value; the form just decorates it with rules.
 
## Wiring it into the template
 
Now that you have a form, let's connect it to the DOM. The `FormField` directive binds an input to a single field:
 
```html
<form (submit)="onSubmit($event)">
  <input type="email" [formField]="loginForm.email" />
  @if (loginForm.email().touched() && loginForm.email().invalid()) {
    @for (err of loginForm.email().errors(); track err.kind) {
      <p class="error">{{ err.message }}</p>
    }
  }
 
  <input type="password" [formField]="loginForm.password" />
 
  <button type="submit" [disabled]="loginForm().submitting()">
    @if (loginForm().submitting()) { Logging in... } @else { Log in }
  </button>
</form>
```
 
In our example, `[formField]="loginForm.email"` sets up two-way binding between the input and that field, with no `ngModel` and no separate `formControlName`. Each field exposes its state as signals you call like functions: `loginForm.email().touched()`, `.invalid()`, `.errors()`. Because these are signals, the template updates automatically and precisely when they change, which is exactly the fine-grained reactivity Angular has been moving toward with its zoneless work.
 
## Submitting with the `submit()` function
 
You could read `valid()` yourself and call your service by hand, but Angular v22 gives you a dedicated helper that removes a surprising amount of boilerplate. The **`submit()`** function, imported from `@angular/forms/signals`, takes your form and an async action, and orchestrates everything around that action:
 
```typescript
import { submit } from '@angular/forms/signals';
 
async onSubmit(event: Event) {
  event.preventDefault();
  await submit(this.loginForm, async (form) => {
    const result = await this.auth.login(form().value());
    if (result.ok) return;
    return { kind: 'serverError', message: 'Those credentials did not match.' };
  });
}
```
 
Let me walk you through what `submit()` does, because the value is in the steps you no longer write. First it marks every field as touched, so any validation messages that were politely hidden now show. Then it runs your validators and stops if anything is invalid, which means your action never fires against bad data. Only when the form is valid does it run the async action. While that promise is in flight, the form's `submitting()` signal is `true`, and it flips back the moment the action settles. That single signal is your loading state, for free, which is why the button above could say "Logging in..." without any extra bookkeeping.
 
Now look at what the action returns, because this is the clever part. If everything went well, you return nothing and `submit()` resolves to `true`. If the server rejects the request, you return an error object, and Angular routes it back onto the form as a validation error. No manual error banner, no separate `serverError` signal to juggle. And if you want that error to land on one specific field rather than the form as a whole, you name it:
 
```typescript
return { kind: 'taken', message: 'That email is already registered.', fieldTree: form.email };
```
 
In the preceding code, `fieldTree: form.email` attaches the error to the email field, so it renders right next to the input the user needs to fix. Better still, submission errors clear themselves the instant the user edits that field, which separates a one-off server rejection from your always-on validators. We never read a copied form value anywhere here. We call `form().value()` on the live model. No trip to the front counter; the ledger was never copied in the first place.
 
## It's not only sunshine and roses
 
I want to be honest with you, because a new API is always easier to love in a blog post than in a large codebase. Signal Forms are nice, but there are trade-offs worth naming.
 
First, it is new. Stable does not mean battle-tested across every edge case your enterprise app will throw at it, and the surrounding ecosystem (third-party component libraries, custom controls, testing helpers) is still catching up. Reactive Forms have a decade of Stack Overflow answers behind them; Signal Forms do not, yet.
 
Second, there is a learning curve. If your team is still getting comfortable with signals themselves, a signal-based forms API on top is two new mental models at once. I have a lot of empathy for junior developers here: "everything is a signal you call like a function" is elegant once it clicks, but it is a real adjustment coming from `valueChanges` and observables.
 
My practical recommendation: reach for Signal Forms on new features and greenfield screens, where you get the clean single-source-of-truth design from day one. Don't rush to rewrite a working, well-tested Reactive Form just to be modern. The two can coexist in the same app, and a migration is only worth it when a form is already causing you pain.
 
## What you learned
 
In this post, you learned that Reactive Forms ask you to maintain two copies of your data, the model and the form, and to keep them in sync by hand. Angular v22's **Signal Forms** collapse those two ledgers into one: your data lives in a signal, `form()` layers validation and state on top of that same value, and the `FormField` directive binds it to the template with fine-grained, signal-driven updates. You saw how this removes the `patchValue`/`getRawValue` plumbing and gives you compiler-checked field paths, and you met the `submit()` function that marks fields touched, blocks invalid submissions, drives a `submitting()` loading state, and routes server errors straight back onto the right field. I was also honest that it is a young API with a learning curve worth planning for.
 
Cleaner form state is really a question of architecture: where does the truth live, and how many copies of it are you maintaining? That question scales up fast when a workspace has hundreds of libraries and dozens of teams sharing patterns. If you would like a second pair of eyes on how your Angular and Nx codebase handles state, forms, and reactivity, or a design plan before you commit to a direction, an **architecture review** is exactly the kind of work I do with enterprise teams here in the Netherlands. I also run hands-on **Angular, Nx, and AI coding workshops** if your team wants to level up on signals together.
 
And if you just want more posts like this one, practical and honest walkthroughs of what's new and what actually holds up at scale, join the mailing list below. I share one clear idea at a time, no hype. Let's keep building things that don't break a sweat.