/**
 * Fixed prices for the bounded parts of each service, in euro excluding VAT.
 *
 * PLACEHOLDER VALUES. Set the real numbers before publishing. Everything on
 * the service pages that shows a price reads from here, so this is the only
 * file to change.
 *
 * Ongoing or project-sized work (execution sprints, a quarter of
 * enablement, application development) is never priced here; those tiers
 * say "on quote" on the page.
 */
export const PRICING = {
  assessment: {
    /** One week: structural scan and top-ten findings. */
    minimum: 4900,
    /** Two to three weeks: full assessment with interviews and roadmap. */
    standard: 12900,
  },
  workshops: {
    /** One day, twelve seats included. */
    oneDay: 2499,
    /** Two days, twelve seats included. */
    twoDays: 3749,
    /** Each seat above twelve, per workshop day. */
    extraSeatPerDay: 100,
  },
  /* Application development is quoted per project and has no fixed
     prices, so nothing for it lives here. */
} as const;

const formatter = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

/** "€4,900" */
export function euro(amount: number): string {
  return formatter.format(amount);
}

export const VAT_NOTE = "excl. VAT";
