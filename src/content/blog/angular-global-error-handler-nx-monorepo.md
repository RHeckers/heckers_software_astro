---
title: "Build a Plugin-Based Global Error Handler for Your Angular Nx Monorepo"
description: "Stop hardcoding error integrations. Learn how to build an extendible, plugin-based ErrorHandler using Angular's dependency injection and multi-providers, designed for scalable Nx workspaces."
pubDate: "2026-03-29"
heroImage: "../../assets/blog-images/Plugin-Based-Global-Error-Handler-for-Your-Angular-Nx-Monorepo.png"
---

Your Angular `ErrorHandler` is the last safety net. When something breaks, whether that's a failed HTTP request, a null reference, or a third-party script blowing up, the `ErrorHandler` catches it. It gives your app a chance to log the error, report it, or tell the user what happened instead of just silently dying.

Most teams start with a single `GlobalErrorHandler` that does everything: log to the console, send the error to Sentry, show a toast notification. That works fine when you have one application. But the moment you scale to an **Nx monorepo** with multiple apps sharing the same core libraries, that approach falls apart fast.

In this post, we'll build a **plugin-based error handling system** using Angular's dependency injection. Each app in your monorepo picks exactly the error-handling behavior it needs. Nothing more, nothing less.

## The problem: one handler, many apps

Let's say your Nx workspace has three applications:

- **Customer Portal:** needs Sentry tracking and toast notifications
- **Admin Dashboard:** needs Sentry tracking and detailed console logging
- **Background Worker:** runs headless, only needs console logging

All three share a `libs/core/error-handling` library. Inside it, you have a single `GlobalErrorHandler`:

```typescript
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly snackBar = inject(MatSnackBar);

  handleError(error: unknown): void {
    console.error("[GlobalErrorHandler]", error);

    // Send to Sentry
    Sentry.captureException(error);

    // Show a toast
    this.snackBar.open("Something went wrong.", "Dismiss", {
      duration: 5000,
    });
  }
}
```

This looks reasonable at first. But watch what happens as your monorepo grows:

1. **The Background Worker doesn't have a DOM.** It can't show `MatSnackBar` toasts. Importing it crashes the worker. Now you need `if` statements or platform checks inside the handler.

2. **The Admin Dashboard wants extra detail.** You add admin-specific logging. Now the handler has logic that only applies to one app.

3. **A new app needs Datadog instead of Sentry.** Do you add yet another `if` branch? A configuration object? A factory function with a growing list of parameters?

Before long, your "shared" error handler looks like this:

```typescript
handleError(error: unknown): void {
  console.error(error);

  if (this.config.enableSentry) {
    Sentry.captureException(error);
  }

  if (this.config.enableDatadog) {
    datadogRum.addError(error);
  }

  if (this.config.showToast && this.platform.isBrowser) {
    this.snackBar.open('Something went wrong.', 'Dismiss');
  }

  if (this.config.enableDetailedLogging) {
    this.logger.logWithStackTrace(error);
  }
}
```

This violates the **Open-Closed Principle**: the class should be open for extension but closed for modification. Every new integration forces you to change the core handler. Every app drags in dependencies it doesn't use, bloating the bundle. And testing becomes painful because you're mocking services that half of your apps don't even need.

We need a better architecture.

## The solution: extension-based error handling

Instead of putting all behavior inside one class, we split it into three parts:

1. **An interface** that defines what an error-handling extension looks like
2. **An InjectionToken** that collects all extensions registered by an app
3. **A GlobalErrorHandler** that loops through whatever extensions are present

Each app then registers only the extensions it needs. The core library doesn't know or care what those extensions are.

Here's the mental model:

```
GlobalErrorHandler (shared library)
  └── loops through extensions
        ├── SentryExtension      (registered by Customer Portal)
        ├── ToastExtension       (registered by Customer Portal)
        ├── SentryExtension      (registered by Admin Dashboard)
        ├── ConsoleExtension     (registered by Admin Dashboard)
        └── ConsoleExtension     (registered by Background Worker)
```

Let's build it step by step.

## Step 1: Define the extension interface

First, we define a contract that every error-handling extension must follow. This goes in your shared library, for example `libs/core/error-handling/src/lib/error-handler-extension.ts`:

```typescript
/**
 * Contract for error-handling plugins.
 *
 * Every extension receives the raw error and decides what to do with it.
 * The optional `priority` field controls execution order (lower = first).
 */
export interface ErrorHandlerExtension {
  readonly priority?: number;
  handle(error: unknown): void;
}
```

That's it. Any class that implements this interface can be plugged into the error handling pipeline.

The `priority` field is optional. We'll use it later to control the order in which extensions run. You might want logging to always happen before a toast notification, so you can see the log even if the toast logic throws.

## Step 2: Create the injection tokens

Angular's dependency injection system has a powerful feature called **multi-providers**. When you register multiple providers for the same token using `multi: true`, Angular collects all of them into an array and injects that array wherever the token is requested.

This is the mechanism that makes our plugin system work. We define a token, and each app can register as many extensions as it wants:

```typescript
import { InjectionToken, Type } from "@angular/core";
import { ErrorHandlerExtension } from "./error-handler-extension";

/**
 * Multi-provider token. Each registered extension is collected into
 * an array and injected into the GlobalErrorHandler.
 */
export const ERROR_HANDLER_EXTENSIONS = new InjectionToken<
  ErrorHandlerExtension[]
>("ERROR_HANDLER_EXTENSIONS");

/**
 * Optional token for disabling specific extensions at a given
 * injector scope. Useful for feature-level overrides.
 */
export const DISABLED_ERROR_HANDLER_EXTENSIONS = new InjectionToken<
  Type<ErrorHandlerExtension>[]
>("DISABLED_ERROR_HANDLER_EXTENSIONS");
```

We'll come back to `DISABLED_ERROR_HANDLER_EXTENSIONS` later. For now, just know that it lets you selectively turn off extensions in specific parts of your app.

## Step 3: Build the GlobalErrorHandler

This is the orchestrator. It doesn't know about Sentry, Datadog, toasts, or console logging. It only knows how to loop through whatever extensions are registered:

```typescript
import { ErrorHandler, inject, Injectable } from "@angular/core";
import { ERROR_HANDLER_EXTENSIONS } from "./error-handler.tokens";
import { DISABLED_ERROR_HANDLER_EXTENSIONS } from "./error-handler.tokens";
import type { ErrorHandlerExtension } from "./error-handler-extension";

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly extensions =
    inject(ERROR_HANDLER_EXTENSIONS, { optional: true }) ?? [];

  private readonly disabled =
    inject(DISABLED_ERROR_HANDLER_EXTENSIONS, { optional: true }) ?? [];

  handleError(error: unknown): void {
    // Sort by priority (lower number = runs first). Extensions
    // without a priority default to 0.
    const sorted = [...this.extensions].sort(
      (a, b) => (a.priority ?? 0) - (b.priority ?? 0),
    );

    for (const ext of sorted) {
      // Skip extensions that have been explicitly disabled
      if (this.disabled.includes(ext.constructor as any)) {
        continue;
      }

      try {
        ext.handle(error);
      } catch (extensionError) {
        // Never let an extension crash the error pipeline.
        // Fall back to basic console output.
        console.error(
          `[GlobalErrorHandler] Extension ${ext.constructor.name} failed:`,
          extensionError,
        );
      }
    }
  }
}
```

Let's break down the key design decisions:

- **`{ optional: true }`:** If no extensions are registered, the handler still works. It won't crash because of a missing provider. This is critical for testing and for apps that haven't configured extensions yet.

- **Sorting by priority:** Extensions with a lower `priority` value run first. This gives you deterministic ordering. Logging (`priority: 0`) runs before toast notifications (`priority: 10`), which run before analytics (`priority: 20`).

- **The try/catch around each extension:** If Sentry's SDK throws because of a network issue, that shouldn't prevent the toast notification from showing. Each extension is isolated. If one fails, the rest still run, and the failure gets logged to the console.

- **The disabled-check:** We check the extension's constructor against the disabled list. This lets you surgically turn off specific extensions without removing their provider registration.

## Step 4: Write some concrete extensions

Now let's build the actual plugins. Each one is a standalone `@Injectable()` class that implements `ErrorHandlerExtension`.

### Console logging extension

The simplest extension. Logs the error with a timestamp and stack trace:

```typescript
import { Injectable } from "@angular/core";
import type { ErrorHandlerExtension } from "./error-handler-extension";

@Injectable()
export class ConsoleErrorExtension implements ErrorHandlerExtension {
  readonly priority = 0; // Run first, always have a log

  handle(error: unknown): void {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] Unhandled error:`, error);

    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
  }
}
```

### Sentry extension

Reports errors to [Sentry](https://sentry.io) for production monitoring. Notice that this extension manages its own dependency (`Sentry`). The core handler never imports it:

```typescript
import { Injectable } from "@angular/core";
import * as Sentry from "@sentry/angular";
import type { ErrorHandlerExtension } from "./error-handler-extension";

@Injectable()
export class SentryErrorExtension implements ErrorHandlerExtension {
  readonly priority = 10;

  handle(error: unknown): void {
    Sentry.captureException(error);
  }
}
```

### Toast notification extension

Shows a user-facing notification. This extension lives in a UI-specific library (not in the shared core) because it depends on `MatSnackBar`:

```typescript
import { Injectable, inject } from "@angular/core";
import { MatSnackBar } from "@angular/material/snack-bar";
import type { ErrorHandlerExtension } from "./error-handler-extension";

@Injectable()
export class ToastErrorExtension implements ErrorHandlerExtension {
  readonly priority = 20; // Run after logging and reporting

  private readonly snackBar = inject(MatSnackBar);

  handle(error: unknown): void {
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred.";

    this.snackBar.open(message, "Dismiss", {
      duration: 6000,
      panelClass: "error-toast",
    });
  }
}
```

### HTTP error extension

A more advanced extension that specifically handles HTTP errors and gives the user a more helpful message:

```typescript
import { Injectable, inject } from "@angular/core";
import { HttpErrorResponse } from "@angular/common/http";
import { MatSnackBar } from "@angular/material/snack-bar";
import type { ErrorHandlerExtension } from "./error-handler-extension";

@Injectable()
export class HttpErrorExtension implements ErrorHandlerExtension {
  readonly priority = 5;

  private readonly snackBar = inject(MatSnackBar);

  handle(error: unknown): void {
    // Only handle HTTP errors, ignore everything else
    if (!(error instanceof HttpErrorResponse)) {
      return;
    }

    const messages: Record<number, string> = {
      0: "Unable to reach the server. Check your internet connection.",
      401: "Your session has expired. Please sign in again.",
      403: "You don't have permission to perform this action.",
      404: "The requested resource was not found.",
      500: "Something went wrong on our end. Please try again later.",
    };

    const message = messages[error.status] ?? `Server error (${error.status})`;

    this.snackBar.open(message, "Dismiss", {
      duration: 8000,
      panelClass: "error-toast",
    });
  }
}
```

Notice how this extension **returns early** for non-HTTP errors. Extensions don't have to handle every error. They can filter for the types they care about and silently ignore the rest.

## Step 5: Register extensions in each app

Here's where the architecture pays off. Each app in your Nx workspace declares exactly the extensions it needs.

### Customer Portal (`apps/customer-portal/src/main.ts`)

```typescript
import { bootstrapApplication } from "@angular/platform-browser";
import { AppComponent } from "./app/app.component";
import { ErrorHandler } from "@angular/core";
import {
  GlobalErrorHandler,
  ERROR_HANDLER_EXTENSIONS,
} from "@core/error-handling";
import { SentryErrorExtension } from "@core/error-handling-sentry";
import { ConsoleErrorExtension } from "@core/error-handling";
import { ToastErrorExtension } from "@ui/error-toast";
import { HttpErrorExtension } from "@ui/error-toast";

bootstrapApplication(AppComponent, {
  providers: [
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    {
      provide: ERROR_HANDLER_EXTENSIONS,
      useClass: ConsoleErrorExtension,
      multi: true,
    },
    {
      provide: ERROR_HANDLER_EXTENSIONS,
      useClass: SentryErrorExtension,
      multi: true,
    },
    {
      provide: ERROR_HANDLER_EXTENSIONS,
      useClass: ToastErrorExtension,
      multi: true,
    },
    {
      provide: ERROR_HANDLER_EXTENSIONS,
      useClass: HttpErrorExtension,
      multi: true,
    },
  ],
});
```

### Background Worker (`apps/background-worker/src/main.ts`)

```typescript
import { bootstrapApplication } from "@angular/platform-browser";
import { AppComponent } from "./app/app.component";
import { ErrorHandler } from "@angular/core";
import {
  GlobalErrorHandler,
  ERROR_HANDLER_EXTENSIONS,
} from "@core/error-handling";
import { ConsoleErrorExtension } from "@core/error-handling";

bootstrapApplication(AppComponent, {
  providers: [
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    {
      provide: ERROR_HANDLER_EXTENSIONS,
      useClass: ConsoleErrorExtension,
      multi: true,
    },
  ],
});
```

The Background Worker never imports Sentry, `MatSnackBar`, or any UI dependency. Its bundle stays small. Its tests stay simple.

## Step 6: Disable extensions for specific features

Sometimes you need granular control. Maybe your Admin Dashboard uses the `ToastErrorExtension` globally, but one particular feature module handles errors in its own way and doesn't want the toast to appear.

That's what `DISABLED_ERROR_HANDLER_EXTENSIONS` is for. You can provide it at any injector scope: a route, a component, or a lazy-loaded module:

```typescript
import { DISABLED_ERROR_HANDLER_EXTENSIONS } from "@core/error-handling";
import { ToastErrorExtension } from "@ui/error-toast";

export const fileUploadRoutes: Routes = [
  {
    path: "",
    component: FileUploadComponent,
    providers: [
      {
        provide: DISABLED_ERROR_HANDLER_EXTENSIONS,
        useValue: [ToastErrorExtension],
      },
    ],
  },
];
```

Within the `FileUploadComponent` and its children, the `GlobalErrorHandler` will skip the `ToastErrorExtension`. All other extensions (console logging, Sentry) continue to work normally.

This uses Angular's **hierarchical injector** system. Child injectors can override tokens from parent injectors. Because we provide `DISABLED_ERROR_HANDLER_EXTENSIONS` at the route level, only that route's component tree is affected.

## The recommended library structure in Nx

Here's how these files map to Nx libraries:

```
libs/
├── core/
│   └── error-handling/         # shared library, no UI dependencies
│       └── src/lib/
│           ├── error-handler-extension.ts
│           ├── error-handler.tokens.ts
│           ├── global-error-handler.ts
│           ├── console-error-extension.ts
│           └── index.ts         # public API barrel
│
├── integrations/
│   └── error-handling-sentry/   # Sentry-specific, only apps that need it import this
│       └── src/lib/
│           ├── sentry-error-extension.ts
│           └── index.ts
│
└── ui/
    └── error-toast/             # UI-specific, depends on Angular Material
        └── src/lib/
            ├── toast-error-extension.ts
            ├── http-error-extension.ts
            └── index.ts
```

**Why this separation matters:**

- `@core/error-handling` has **zero external dependencies**. It can be imported by any app, including headless workers.
- `@integrations/error-handling-sentry` only adds a dependency on `@sentry/angular`. Only apps that register it pay the bundle cost.
- `@ui/error-toast` depends on `@angular/material`. Headless apps never import it.

Your `tsconfig.base.json` paths tie it all together:

```json
{
  "compilerOptions": {
    "paths": {
      "@core/error-handling": ["libs/core/error-handling/src/index.ts"],
      "@integrations/error-handling-sentry": [
        "libs/integrations/error-handling-sentry/src/index.ts"
      ],
      "@ui/error-toast": ["libs/ui/error-toast/src/index.ts"]
    }
  }
}
```

## Testing each piece in isolation

One of the biggest wins of this architecture is testability. Each extension is a standalone class with a single `handle` method. You can test it without bootstrapping an entire Angular module or mocking unrelated services.

### Testing an extension

```typescript
describe("SentryErrorExtension", () => {
  it("should capture the exception with Sentry", () => {
    const captureExceptionSpy = vi.spyOn(Sentry, "captureException");
    const extension = new SentryErrorExtension();
    const error = new Error("test error");

    extension.handle(error);

    expect(captureExceptionSpy).toHaveBeenCalledWith(error);
  });
});
```

### Testing the GlobalErrorHandler

You can test the orchestration logic with mock extensions:

```typescript
describe("GlobalErrorHandler", () => {
  it("should call all registered extensions", () => {
    const ext1: ErrorHandlerExtension = { handle: vi.fn() };
    const ext2: ErrorHandlerExtension = { handle: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        GlobalErrorHandler,
        { provide: ERROR_HANDLER_EXTENSIONS, useValue: ext1, multi: true },
        { provide: ERROR_HANDLER_EXTENSIONS, useValue: ext2, multi: true },
      ],
    });

    const handler = TestBed.inject(GlobalErrorHandler);
    const error = new Error("test");

    handler.handleError(error);

    expect(ext1.handle).toHaveBeenCalledWith(error);
    expect(ext2.handle).toHaveBeenCalledWith(error);
  });

  it("should skip disabled extensions", () => {
    const ext: ErrorHandlerExtension = { handle: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        GlobalErrorHandler,
        { provide: ERROR_HANDLER_EXTENSIONS, useValue: ext, multi: true },
        {
          provide: DISABLED_ERROR_HANDLER_EXTENSIONS,
          useValue: [ext.constructor],
        },
      ],
    });

    const handler = TestBed.inject(GlobalErrorHandler);
    handler.handleError(new Error("test"));

    expect(ext.handle).not.toHaveBeenCalled();
  });

  it("should not crash if one extension throws", () => {
    const failingExt: ErrorHandlerExtension = {
      handle: () => {
        throw new Error("extension broke");
      },
    };
    const healthyExt: ErrorHandlerExtension = { handle: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        GlobalErrorHandler,
        {
          provide: ERROR_HANDLER_EXTENSIONS,
          useValue: failingExt,
          multi: true,
        },
        {
          provide: ERROR_HANDLER_EXTENSIONS,
          useValue: healthyExt,
          multi: true,
        },
      ],
    });

    const handler = TestBed.inject(GlobalErrorHandler);
    handler.handleError(new Error("test"));

    // The healthy extension still runs despite the first one failing
    expect(healthyExt.handle).toHaveBeenCalled();
  });
});
```

No Sentry SDK mocking. No `MatSnackBar` setup. No platform detection. Each test focuses on one concern.

## Why this pattern works for Nx monorepos

Let's revisit the original problems and see how this architecture solves them:

| Problem                                                   | Solution                                                                   |
| --------------------------------------------------------- | -------------------------------------------------------------------------- |
| Apps import dependencies they don't use                   | Each app only registers (and bundles) the extensions it needs              |
| Adding a new integration means modifying the core handler | You create a new extension class. The core handler is never touched        |
| Hard to test because of tightly coupled services          | Each extension is a standalone class with one method to test               |
| Feature-level overrides require complex configuration     | `DISABLED_ERROR_HANDLER_EXTENSIONS` lets you opt out at any injector scope |
| Execution order is unpredictable                          | The `priority` field gives you deterministic ordering                      |
| One extension crashing breaks all error handling          | The try/catch in the handler isolates each extension                       |

This is the **Open-Closed Principle** applied to error handling: the `GlobalErrorHandler` is closed for modification (you never edit it to add new behavior) but open for extension (you register new plugins through dependency injection).

## Wrapping up

Error handling doesn't have to be a monolith. By using Angular's `multi: true` providers and a simple interface, you can build an error handling system that:

- **Scales across apps:** each application composes its own pipeline
- **Keeps bundles lean:** no unused SDKs or UI libraries
- **Is trivial to test:** one class, one concern, one test
- **Supports granular overrides:** disable extensions at any injector scope
- **Fails gracefully:** isolated extensions can't crash the pipeline

The core library stays small, stable, and dependency-free. New error integrations are just new classes that implement a one-method interface. That's the kind of architecture that holds up as your Nx workspace grows from three apps to thirty.
