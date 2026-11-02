---
title: "Compound Components: Building Angular Components From Definition Directives"
description: "Some components should not be configured, they should be put together: a parent plus small definition directives that only make sense inside it. This article explains how that works in Angular, looks at how Angular Material, PrimeNG and Angular Aria do it, and builds the same table four ways to show where each approach stops working."
pubDate: "2026-11-02"
heroImage: "../../assets/blog-images/compound-components-definition-directives.png"
categories: ["Angular", "Architecture"]
---

Almost every shared table component I have reviewed started the same way: a `rows` input, a `columns` input where each column has a key and a header, and a `@for` loop. Then someone needed a number aligned to the right, so the column config got `align`. Someone needed a formatted date, so it got `format`. Someone needed a coloured status badge, so it got `type: 'badge'`. A year later the config had nineteen optional properties, the table's template was a long list of `@switch` cases, and every new need meant a change to a component every team depended on.

Angular Material's table has almost no inputs. You do not configure it; you build it out of small pieces:

```html
<table mat-table [dataSource]="orders">
  <ng-container matColumnDef="customer">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Customer</th>
    <td mat-cell *matCellDef="let order">{{ order.customer }}</td>
  </ng-container>

  <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
  <tr mat-row *matRowDef="let row; columns: displayedColumns"></tr>
</table>
```

This design pattern is called **compound components**: a parent component plus a set of smaller pieces that only make sense inside it, working together through shared context. The name comes from React, where `<Tabs>` with `<Tab>` children and `<Select>` with `<Option>` children are the usual examples. In Angular, the shared context is dependency injection, and the pieces are usually what I will call **definition directives**, a name borrowed from Angular's CDK, which has `CdkColumnDef`, `CdkCellDef` and `CdkRowDef`. These directives do not render anything themselves. They *define* something, and the parent renders it.

I read the table source of Angular Material and PrimeNG to see how they do it, then built the same table four ways in an Angular 22 project: with inputs, with content projection, with template references, and as a compound component. I tested each version to see where it stops working. At the end I compare it with Angular Aria, which uses the same pattern in a different way.

> Everything below is checked against the source code of `@angular/cdk`, `@angular/material` and `@angular/aria` 22.2.5 and `primeng` 22.1.4. Every claim about behaviour comes from a test in an Angular 22.2 CLI project, compiled ahead of time and run with the default Vitest test runner.

## The example

An orders table with these columns:

- a checkbox to select rows, with a "select all" checkbox in the header
- the order number
- the customer, which can be sorted
- the total, as an amount in euros
- the status, shown as a `StatusBadge` component
- a *Send reminder* button, only enabled for overdue orders

Every approach can show plain values like the order number and the customer name. The differences show up in the rest.

## A. Everything through inputs

Each column is described by a config object:

```ts
export interface ColumnConfig<T> {
  key: keyof T & string;
  header: string;
  align?: 'start' | 'end';
  format?: (value: T[keyof T], row: T) => string;
}
```

The table loops over the rows and, inside each row, over the columns:

```html
@for (row of rows(); track $index) {
  <tr>
    @for (col of columns(); track col.key) {
      <td [style.text-align]="col.align ?? 'start'">
        {{ col.format ? col.format(row[col.key], row) : row[col.key] }}
      </td>
    }
  </tr>
}
```

For columns of text this works well, and for an internal admin screen it is often all you need. The status column is where it starts to creak. `{{ }}` renders text, so a `format` function that returns `<b>paid</b>` shows exactly that, angle brackets included.

`[innerHTML]` turns a string into real HTML instead. I do not recommend it, but I tested it with a string containing a `<b>`, an `<app-status-badge>` tag and a `<button>`. The page ended up with `<b>paid</b>Remind`. The bold tag survived; the badge tag and the button were removed, leaving only the button's text, and Angular logged a warning that it had removed content. That is Angular's sanitizer, which strips anything that could be used to attack your users. Even with the sanitizer turned off, a string is plain HTML to Angular: it never turns a tag into a component and never connects a `(click)` to your code. And turning the sanitizer off opens exactly the hole it exists to close.

Selection and actions can go on the config too:

```ts
columns: ColumnConfig<Order>[] = [
  {
    key: 'select',
    type: 'checkbox',
    isChecked: (order) => this.selected().has(order.id),
    onToggle: (order) => this.toggle(order),
    onToggleAll: () => this.toggleAll(),
  },
  // …
  {
    key: 'actions',
    actions: [
      { label: 'Send reminder', onClick: (order) => this.remind(order), disabled: (order) => order.status !== 'overdue' },
    ],
  },
];
```

With callbacks in the config, the table needs no outputs. But the table now has to know that checkbox columns exist, that their header needs a "select all" box that can be half-checked, and that actions are buttons. Then one screen wants an icon button, the next a link, a menu, a confirmation step, or a different label for screen readers on each row. Each of those is another config property and another branch in the table's template.

Reducing every action to a single `onClick(row)` only simplifies the behaviour. The table still has to draw the thing being clicked, with its label, disabled state, keyboard support and accessible name, and that is the part that keeps growing. The config turns into a second template language, written in object literals, that only the table understands, and every screen that needs something new waits until the table learns it.

## B. Content projection

Whatever a consumer writes between a component's tags is called its *content*. With content projection, the component puts `<ng-content select="[statusCell]" />` in its template, and Angular moves the matching elements from the content to that spot. So let the consumer project the status cell:

```html
<!-- inside the table -->
@for (row of rows(); track row.id) {
  <tr>
    <td>{{ row.id }}</td>
    <td class="projected"><ng-content select="[statusCell]" /></td>
  </tr>
}

<!-- the consumer -->
<app-projection-table [rows]="orders()">
  <app-status-badge statusCell status="paid" />
</app-projection-table>
```

With three orders, the test counts the badges per row: 0, 0, 1. Projection moves elements; it does not copy them. The consumer creates one badge, so it can only appear in one place, and in my test that was the last row. Even if it did repeat, the badge was created outside the loop, so it could not know which order it belongs to.

Projection answers "put this thing here", not "here is how to show each item". For fixed spots it is the right tool: a caption, a toolbar, an empty-state message. The test projects a caption and an empty message, including one inside the `@empty` block that only appears when there are no rows, and both work. The final table uses projection for exactly those two.

## C. Template references on the column config

Projection gives you a finished element. What a table needs is a recipe, and in Angular that is a `TemplateRef`.

Everything in a template is normally rendered straight away. An `<ng-template>` is not: Angular turns its content into a `TemplateRef`, which can be rendered later, as often as you like, wherever you like. When you render it, you can pass in data, called its *context*, and the template reads that data with `let-` variables. `let-order` without a value means "give me the default value of the context, `$implicit`, and call it `order`". Angular's `ngTemplateOutlet` directive renders a `TemplateRef` at a spot, with a given context.

The obvious place for a cell's template is its column, so the column config gets two optional templates:

```ts
export interface TemplateColumnConfig<T> extends Omit<ColumnConfig<T>, 'key'> {
  key: (keyof T & string) | (string & {});
  headerTemplate?: TemplateRef<void>;
  cellTemplate?: TemplateRef<CellContext<T>>;
}
```

If a column has a `cellTemplate`, the table renders it for every row with the row as context. Otherwise it shows the plain value:

```html
@for (col of columns(); track col.key) {
  <td>
    @if (col.cellTemplate; as tpl) {
      <ng-container *ngTemplateOutlet="tpl; context: { $implicit: row, index: i }" />
    } @else {
      {{ value(row, col.key) }}
    }
  </td>
}
```

The consumer writes the templates and points each column to one through a template reference variable, the `#name`:

```html
<app-template-table [rows]="orders" [columns]="[
  { key: 'select', header: '', headerTemplate: selectAll, cellTemplate: selectCell },
  { key: 'id', header: '#' },
  { key: 'customer', header: 'Customer' },
  { key: 'status', header: 'Status', cellTemplate: statusCell },
  { key: 'actions', header: 'Actions', cellTemplate: actionsCell }
]" />

<ng-template #selectAll>
  <input type="checkbox" aria-label="Select all orders"
         [checked]="allSelected()" [indeterminate]="someSelected()" (change)="toggleAll()" />
</ng-template>
<ng-template #selectCell let-order>
  <input type="checkbox" [attr.aria-label]="'Select order ' + order.id"
         [checked]="selected().has(order.id)" (change)="toggle(order)" />
</ng-template>
<ng-template #statusCell let-order>
  <app-status-badge [status]="order.status" />
</ng-template>
<ng-template #actionsCell let-order>
  <button type="button" [disabled]="order.status !== 'overdue'" (click)="remind(order)">
    Send reminder
  </button>
</ng-template>
```

This fixes most of what hurt in approach A. Every row gets its own badge. The checkboxes and the button are normal elements, and their `(change)` and `(click)` handlers call methods on the consumer's component, because that is where the templates were written. The table needs no checkbox type and no actions list. In the tests, ticking a row adds it to the consumer's selection and makes the header checkbox half-checked, and the button calls `remind()` with the overdue order.

You can also build the config in the component class. The templates only exist once Angular has rendered the component's view, so you get them with `viewChild` and build the config as a `computed` that waits for them.

PrimeNG's table works in a similar way. In version 22.1 it looks for more than thirty named templates in its content, like `#header`, `#body`, `#footer` and `#emptymessage`, using content queries such as `@ContentChild('body')`, and also supports an older `pTemplate="body"` directive for the same job. You write the `<tr>` and `<td>` elements yourself inside those templates. PrimeNG's templates describe a whole row rather than one column, but the idea is the same: you hand the component a recipe.

There are four downsides.

The first is the column key. In `ColumnConfig<T>`, `key` is `keyof T`: one of the property names of an order. That is right for data columns and wrong for `select` and `actions`, which are not properties of an order. The compiler refuses them: `Type '"select"' is not assignable to type '"id" | "customer" | "total" | "status"'`. So `TemplateColumnConfig` widens the key to `(keyof T & string) | (string & {})`, which accepts any string while your editor still suggests the real property names. That breaks the table's own template next, because `row[col.key]` no longer type-checks, so the table needs the untyped `value()` helper you saw above. A typo in a data key, like `'custmer'`, now compiles and shows an empty column.

The second is typing inside the templates. A `let-order` on a plain `<ng-template>` has the type `any`, because the compiler cannot know what the table will pass in. `{{ order.statsu }}` compiles without a word. The config says the template should receive an order, but nothing connects that to the `let-` variable.

The third is that each column lives in two places: the config entry and the template it points to, further down the file. Nothing stops you from pointing a column at the wrong template.

The fourth is that column features still live in the config. The template replaced what is inside a cell, but alignment, sorting and widths are still config properties, and the table still owns them.

There is also an effect of dependency injection here. When something calls `inject(Something)`, Angular looks on the element itself, then its parent, then that element's parent, and so on up the tree. So anything written inside a component's tags can inject that component. For a template rendered through a `TemplateRef`, "parent" means *where the `<ng-template>` was written in the source*, not where it ends up on screen. I tested this with a probe component inside a cell template that tries to inject the table. With the templates written next to `<app-template-table>`, as above, the probe gets nothing. With the same template written inside the `<app-template-table>` tags, it gets the table.

PrimeNG relies on this rule. Its features are directives like `pSortableColumn`, `pSelectableRow` and `pEditableColumn`, which you put on your own `<th>` and `<tr>` elements inside the `#header` and `#body` templates. Each of them receives the table in its constructor, which only works because those templates are written inside `<p-table>`.

## D. A compound component with definition directives

Angular Material builds its whole table on that same rule. In plain terms, this is what the CDK table consists of:

- A cell template is a directive with one line of real code: `CdkCellDef` has `template = inject(TemplateRef)`. Because of the `*` in `*matCellDef`, the directive sits on an `<ng-template>`, so it can grab that template and keep it. The header and footer cell directives are the same.
- A column collects its templates. `CdkColumnDef` has a name and three content queries: for its cell, header and footer templates.
- The table collects the columns. `CdkTable` uses a content query for every `CdkColumnDef` in its content, with `descendants: true`. It also has `addColumnDef()` and `removeColumnDef()` for columns a query cannot find, and it ignores columns that belong to another table nested inside it.
- Rows decide which columns are shown and in what order (`*matRowDef="let row; columns: displayedColumns"`), separately from where the columns are defined.
- Each rendered cell injects `CdkColumnDef` to add the column's CSS classes. That works because the cell's template was written inside the column definition.
- `MatColumnDef` extends `CdkColumnDef` and registers itself under the `CdkColumnDef` token with `providers: [{provide: CdkColumnDef, useExisting: MatColumnDef}]`, so when the CDK table asks for a `CdkColumnDef`, it gets Material's version. You can use the same trick for your own variants.
- Features plug in the same way. `MatSortHeader` injects the column it sits in, if there is one, and uses the column's name as its sort key when you do not give it one. That is why `mat-sort-header` usually needs no value.

That is content queries plus the rule that injection follows where you wrote something. Here is the same idea in a table small enough to read in one go.

### Step 1: the definition directives

The `*` in front of an attribute is shorthand for an `<ng-template>`. These two lines mean the same thing:

```html
<span *appCell="let order">{{ order.id }}</span>

<ng-template appCell let-order><span>{{ order.id }}</span></ng-template>
```

The second form shows that the `appCell` directive sits on the `<ng-template>` itself. A directive on an `<ng-template>` can get that template with `inject(TemplateRef)` and keep it. That is all a cell definition directive is:

```ts
/** Marks the header template of a column: `<span *appHeader>Total</span>`. */
@Directive({ selector: '[appHeader]' })
export class HeaderDef {
  readonly template = inject(TemplateRef);
}

export interface CellContext<T> {
  $implicit: T;
  index: number;
}

/** Marks the cell template: `<span *appCell="let order; of: orders()">`. */
@Directive({ selector: '[appCell]' })
export class CellDef<T> {
  readonly template = inject<TemplateRef<CellContext<T>>>(TemplateRef);
  readonly of = input<readonly T[] | undefined>(undefined, { alias: 'appCellOf' });

  static ngTemplateContextGuard<T>(_dir: CellDef<T>, ctx: unknown): ctx is CellContext<T> {
    return true;
  }
}
```

The `of` input and the static `ngTemplateContextGuard` method only exist for type checking, and they fix the `any` problem from approach C. Inside `*appCell="…"`, you can write `of: orders()` after the `let`, and Angular passes that value to the `appCellOf` input. That tells the compiler which kind of rows this cell is for. `ngTemplateContextGuard` then tells the compiler what the template's context looks like: `$implicit` is one of those rows. Together they make `let order` an `Order` instead of `any`. The method never runs any logic; it is only there for the compiler.

### Step 2: the column

The column finds its header and cell templates with content queries. A content query, `contentChild()` or `contentChildren()`, finds directive instances that the consumer wrote inside a component's or directive's tags. It does not move anything; it just gets a reference. The result is a signal that updates when the content changes, for example when an `@if` adds or removes something:

```ts
/** Opt-in feature: makes a column sortable. Optionally pass an accessor. */
@Directive({ selector: '[appSortable]' })
export class Sortable {
  readonly accessor = input<((row: any) => unknown) | '' | undefined>(undefined, {
    alias: 'appSortable',
  });
}

@Directive({ selector: '[appColumn]' })
export class ColumnDef {
  readonly name = input.required<string>({ alias: 'appColumn' });
  readonly align = input<Align | undefined>(undefined);

  readonly header = contentChild(HeaderDef);
  readonly cell = contentChild(CellDef);

  /** Features are found through DI on the same element, so the table needs no extra inputs. */
  readonly sortable = inject(Sortable, { self: true, optional: true });
  private readonly defaults = inject(COLUMN_DEFAULTS, { self: true, optional: true });

  readonly alignment = computed<Align>(() => this.align() ?? this.defaults?.align ?? 'start');
}
```

`Sortable` is a separate directive. When a consumer writes `appSortable` on the same element as `appColumn`, both directives exist on that element, and the column finds it with `inject(Sortable, { self: true, optional: true })`. `self: true` means "only look on my own element", and `optional: true` means "give me `null` if it is not there instead of throwing an error". So a column is sortable simply because `Sortable` sits next to it. `COLUMN_DEFAULTS` is a way to give a column default settings through dependency injection; it is used in the presets section below.

### Step 3: the table collects the columns

```ts
export class DataTable<T> {
  readonly rows = input.required<readonly T[]>();
  /** Optional: which columns to show, in which order. Defaults to the order they were written in. */
  readonly displayedColumns = input<readonly string[] | undefined>(undefined);

  /** Every column the consumer wrote in the content, however deeply nested. */
  private readonly contentColumns = contentChildren(ColumnDef, { descendants: true });
  /** Columns that live in another component's template register themselves here. */
  private readonly registeredColumns = signal<readonly ColumnDef[]>([]);

  readonly visibleColumns = computed(() => {
    const all = [...this.contentColumns(), ...this.registeredColumns()];
    const order = this.displayedColumns();
    if (!order) return all;
    return order
      .map((name) => all.find((col) => col.name() === name))
      .filter((col): col is ColumnDef => !!col);
  });

  // sort state, sortedRows, addColumn/removeColumn, toggleSort…
}
```

By default, `contentChildren` only finds direct children; `{ descendants: true }` makes it search the whole content. Because the query returns a signal, `visibleColumns` updates whenever the consumer adds or removes a column.

### Step 4: the table renders the templates

For every row and every visible column, the table renders that column's cell template with `ngTemplateOutlet` and passes the row in as the context. The `$implicit: row` is what the consumer reads with `let order`:

```html
@for (row of sortedRows(); track row; let i = $index) {
  <tr>
    @for (col of visibleColumns(); track col) {
      <td [style.text-align]="col.alignment()">
        <ng-container [ngTemplateOutlet]="col.cell()?.template ?? null"
                      [ngTemplateOutletContext]="{ $implicit: row, index: i }" />
      </td>
    }
  </tr>
}
```

### Step 5: the consumer puts it together

```html
<app-table [rows]="orders()">
  <span tableCaption>Orders</span>

  <ng-container appColumn="select">
    <input *appHeader type="checkbox" aria-label="Select all orders"
           [checked]="allSelected()" [indeterminate]="someSelected()" (change)="toggleAll()" />
    <input *appCell="let order; of: orders()" type="checkbox"
           [attr.aria-label]="'Select order ' + order.id"
           [checked]="selected().has(order.id)" (change)="toggle(order)" />
  </ng-container>

  <ng-container appColumn="id">
    <span *appHeader>#</span>
    <span *appCell="let order; of: orders()">{{ order.id }}</span>
  </ng-container>

  @if (showCustomer()) {
    <ng-container appColumn="customer" appSortable>
      <span *appHeader>Customer <app-sort-indicator /></span>
      <span *appCell="let order; of: orders()">{{ order.customer }}</span>
    </ng-container>
  }

  <ng-container appColumn="total" align="end">
    <span *appHeader>Total</span>
    <span *appCell="let order; of: orders()">{{ euro(order.total) }}</span>
  </ng-container>

  <ng-container appColumn="status">
    <span *appHeader>Status</span>
    <app-status-badge *appCell="let order; of: orders()" [status]="order.status" />
  </ng-container>

  <ng-container appColumn="actions">
    <span *appHeader>Actions</span>
    <button *appCell="let order; of: orders()" type="button"
            [disabled]="order.status !== 'overdue'" (click)="remind(order)">
      Send reminder
    </button>
  </ng-container>

  <em tableEmpty>No orders yet</em>
</app-table>
```

Following one cell from start to finish: the `*appCell` on the status badge turns it into an `<ng-template>` with a `CellDef` on it, and the `CellDef` keeps that template. The status column finds the `CellDef` with its content query, and the table finds the column with its own. When the table renders a row, it renders the cell template with the order as context, and the badge shows that order's status.

## What a compound component gives you

Each point below is backed by a test in the lab project.

### Cells can contain anything

The status column shows a real `StatusBadge` component in every row. The table knows nothing about badges, links or buttons. Anything you can write in a template, you can put in a cell.

### Selection and actions need nothing from the table

Approach C got this far too, but only by loosening the column key. Here, the checkboxes and the button are normal elements in normal templates, and their handlers run in the consumer's component with the order available and typed. The table has no checkbox column type, no actions list and no idea what a reminder is. If another screen wants an icon button or a menu in that column, it writes one, and the table does not change.

In the tests, ticking a row puts its id in the consumer's `selected` signal and makes the header checkbox half-checked. Ticking the header checkbox selects all three rows. The button is only enabled for the overdue order and calls `remind()` with that order. Sorting the table keeps the ticks with the right orders. The selection lives in the screen that makes decisions about it, not in the shared table.

### Columns are template, so `@if` works on them

The customer column is wrapped in `@if (showCustomer())`. Set that signal to `false` and the column disappears from the header and every row; set it back and it returns. The content query sees the column come and go, and `visibleColumns` follows. No `visible` property or `hiddenColumns` input is needed.

### Defining a column and showing it are separate

With `displayedColumns` set to `['status', 'id']`, the table shows exactly those two columns, in that order, from the same definitions. This is the same idea as Material's `columns: displayedColumns`, and it makes a "choose your columns" menu or saved layouts easy.

### The compiler checks the row type

This is what `of: orders()` and `ngTemplateContextGuard` from step 1 are for. With them, `{{ order.custmer }}` stops the build with `TS2551: Property 'custmer' does not exist on type 'Order'. Did you mean 'customer'?`. Without `of:`, `order` is `any` and the same typo compiles, like the typos that got through approach C. And because a column is named with `appColumn` instead of a key into the order, `select` and `actions` need no special treatment. Material's `*matCellDef` does not check the row type this way, so this is a cheap upgrade for your own tables.

### New features are directives, not new inputs

`appSortable` on the customer column turns its header into a button, adds an `aria-sort` attribute for screen readers, and sorts the rows when you click. The table did not get a `sortable` input; the column finds `Sortable` on its own element, as shown in step 2. The next feature, like filtering, resizing or pinning, can be another directive instead of another property on every column of every table.

### Code inside a template can reach its column and its table

The `<app-sort-indicator>` in the customer header is my own small component, not part of the table. It injects `ColumnDef` and `DataTable` and shows `↕`, which becomes `↑` after you click the header. Neither the column nor the table knows it exists.

This is the injection rule from approach C at work. The header template was written inside the customer column, which is inside the table, so the indicator can find both. Material's `MatSortHeader` finds its column the same way. In approach C, the templates were written next to the table and could not find it.

### A whole column can be one component

Writing four lines for every column that only shows a property gets repetitive. The CDK has `CdkTextColumn` for this, and my table has a `TextColumn`:

```html
<app-text-column name="note" header="Note" [format]="upper" />
```

`TextColumn` puts its `ColumnDef` in its own template, not in the table's content. Content queries only see what the consumer wrote between the table's tags; they cannot look inside another component's template, so the table's query never finds this column. The column has to introduce itself:

```ts
export class TextColumn implements AfterViewInit {
  private readonly table = inject(DataTable);
  private readonly column = viewChild.required(ColumnDef);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.table.removeColumn(this.column()));
  }

  ngAfterViewInit(): void {
    // The table's content query cannot see into this component's template, so register explicitly.
    this.table.addColumn(this.column());
  }
}
```

`viewChild` is a view query: the counterpart of a content query for a component's own template. `TextColumn` uses it to find its `ColumnDef`, injects the table (which works because `<app-text-column>` sits inside `<app-table>`), hands the column over, and takes it back when it is destroyed. `CdkTextColumn` does the same with `addColumnDef()`. In the test, the text column shows its formatted values and disappears when an `@if` around it turns false.

### Presets with `hostDirectives`

`hostDirectives`, Angular's Directive Composition API, lists directives that Angular attaches automatically whenever your directive is used. A number column is always a column, right-aligned and sortable, so those three can be combined into one attribute:

```ts
@Directive({
  selector: '[appNumericColumn]',
  hostDirectives: [
    { directive: ColumnDef, inputs: ['appColumn: appNumericColumn', 'align'] },
    { directive: Sortable },
  ],
  providers: [{ provide: COLUMN_DEFAULTS, useValue: { align: 'end' } }],
})
export class NumericColumn {}
```

```html
<ng-container appNumericColumn="total">…</ng-container>
```

`appNumericColumn` now also creates a `ColumnDef` and a `Sortable` on the same element. Inputs of host directives are hidden by default, so the `inputs` line exposes the column's name as `appNumericColumn` and passes `align` through. The `providers` line supplies `COLUMN_DEFAULTS`, so the column is right-aligned unless you say otherwise.

A test confirms all of this works together: the table's content query finds the `ColumnDef` that came in through `hostDirectives`, that `ColumnDef` finds its templates and the `Sortable` next to it, and it picks up the alignment from `COLUMN_DEFAULTS`.

The libraries use this feature sparingly. Angular Material uses `hostDirectives` once, on its dialog container, and not in its tables. PrimeNG attaches its `Bind` directive, which passes attributes, classes and event listeners through to an element, with `hostDirectives` on the `p-table` component and several of its directives.

### Projection still has a job

The caption and the "no orders yet" message are plain `<ng-content select>` slots, and the test confirms both work. A compound component does not replace projection; it takes over the one job projection was not designed for.

## Behaviour directives in Angular Aria

`@angular/aria` uses the same pattern differently. It contains *headless* directives for interactive widgets: accordion, combobox, grid, listbox, menu, tabs, toolbar and tree. Headless means no markup or styling. You write the HTML, and the directives add ARIA roles and attributes, keyboard handling, focus and selection.

Its grid is a compound component too, but you write all the markup:

```html
<table ngGrid>
  @for (order of orders; track order.id) {
    <tr ngGridRow>
      <td ngGridCell>{{ order.id }}</td>
      <td ngGridCell>{{ order.customer }}</td>
      <td app-status-cell [order]="order"></td>
    </tr>
  }
</table>
```

No templates are handed over and nothing is rendered for you. In my test, the table got `role="grid"`, and every cell got `role="gridcell"`, its column number in `aria-colindex`, and a `tabindex` that Aria manages for keyboard navigation.

So a compound component can be made of two kinds of pieces. Definition directives, like `appCell` and `matCellDef`, *describe* something the parent renders. Behaviour directives, like `ngGridCell`, are attached to elements you rendered yourself and *add* to them.

The pieces also find each other differently. Angular Aria does not use content queries. Each piece injects its parent through an injection token, such as `GRID_ROW` for a cell or `GRID` for a row, registers itself when it starts and removes itself when it is destroyed:

```js
ngOnInit()    { this._row._collection.register(this); }
ngOnDestroy() { this._row._collection.unregister(this); }
```

The parent keeps the pieces in a collection sorted by their position in the page, using the browser's `compareDocumentPosition()`. A `MutationObserver`, which reports changes to the page structure, re-sorts the list when rows are added, removed or moved.

That solves the problem `TextColumn` ran into. A content query cannot see into another component's template, but dependency injection works across component boundaries. In my test, the status cell is a separate component whose `ngGridCell` comes from `hostDirectives: [GridCell]`, so it lives in that component, not in the grid's content. It registered with its row without extra code and got `aria-colindex="3"` like its neighbours. Our table treats self-registration as the workaround; Angular Aria makes it the default. Our `ColumnDef` could do the same, by injecting the table and registering itself, but then you need your own way to keep the columns in order, which is what Aria's sorted collection provides.

Other differences in the source:

- The logic lives in plain signal-based classes like `GridPattern`, `GridRowPattern` and `GridCellPattern`, from `@angular/aria/private`. The directives pass their inputs to those classes and write the results to the element as attributes, which keeps the behaviour testable without templates.
- The grid has no column definitions and knows nothing about your data. Sorting, hiding and ordering columns are up to you. Selection is built in, but per cell, through a `selected` property on `ngGridCell`, rather than row checkboxes.
- A control inside a cell, like a checkbox or button, can be marked with `ngGridCellWidget`, so the grid knows the cell contains a control and can hand keyboard focus to it. In our table, those controls are simply extra Tab stops.
- Definition directives appear in Aria too: its tabs use `ng-template[ngTabContent]`, which brings along a `DeferredContent` directive through `hostDirectives` and holds the tab's content as a template, so the panel can render it later instead of straight away.

The two kinds of directives combine well. Our `DataTable` decides what to render from definition directives; if it rendered `<table ngGrid>`, `<tr ngGridRow>` and `<td ngGridCell>`, Angular Aria could add grid behaviour to that markup. Keep in mind that `role="grid"` is meant for interactive, spreadsheet-like widgets. A table people only read is better off as a plain `<table>`.

## What it costs

Users have more to learn. Before they can show a single cell, they need to know four directives and how they fit together, and autocomplete will not tell them what belongs inside `<app-table>`. Documentation and a one-line shortcut like the text column matter more here than for a component with a few inputs.

Simple tables get long. Four lines per column for a table of plain text is a lot, so offer the shortcut, and do not force a compound component on screens that are happy with a config.

Content queries stop at component boundaries. A component that wraps a column in its own template has to register it, like the text column does, and the table needs a rule for ordering registered columns against queried ones. My table puts registered columns at the end, and `displayedColumns` can override that. Angular Aria's approach, registration plus sorting by page position, avoids the problem altogether.

Nested tables need care. A query with `descendants: true` also finds the columns of a table inside one of your cells. The CDK keeps only the columns that belong to itself; a component that can be nested needs to do the same.

Templates belong to the place where they were written. A cell template is rendered by the table, but its bindings belong to the component that wrote it. The CDK keeps `CdkTextColumn` on eager change detection for this reason, with a comment explaining that the two can otherwise get out of step. My version uses `OnPush` and signals and did not run into it, but it is worth knowing about.

Typing is opt-in. Without the context guard and an `of:` input, the row is `any`.

## Which approach when

- Inputs, for components whose output is fixed: a table of text on an admin screen, a list of labels and values. It is the least work.
- Content projection, for fixed spots: a caption, a toolbar, an empty message, a footer.
- Template references, on a config or in named slots, when a component needs one or two customisable areas, or when the consumer should write a whole row, as in PrimeNG. If something in those templates needs to inject the component, write the templates inside its tags.
- A compound component with definition directives, for shared components where items can look very different and new features keep coming: tables, tabs, steppers, menus, trees, form fields.
- Behaviour directives like Angular Aria's, when you write the markup yourself and need accessible keyboard, focus and selection behaviour: an interactive grid, tabs, a listbox, a menu. They combine with any of the approaches above.
- `hostDirectives`, on top of any of these, to bundle directives you often use together under one name.

## In short

A compound component needs almost no inputs. It defines a few definition directives, a cell that keeps its own template, a column that finds its templates, a table that finds its columns, and lets the template language do the rest: `@if` hides columns, a list of names orders them, components fill the cells, buttons call the consumer's methods, and features are directives that find their column through dependency injection. Inputs make the shared component own every decision, projection gives you an element instead of a recipe, and template references give you a recipe but leave features in the config and typing loose. The price of a compound component is a bigger set of building blocks to learn, and for a component half your application builds on, that is usually worth paying.

If you are designing shared components for a large Angular codebase and want a second opinion on where a compound component is worth it and where a few inputs will do, that is the kind of question I help with. I run Angular and Nx architecture reviews and workshops; [get in touch](https://www.heckerssoftware.com/#contactForm) if that sounds useful.
