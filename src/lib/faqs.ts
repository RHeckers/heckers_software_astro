/**
 * The questions and answers on the three service pages, in one place: the
 * Faq component renders them (and marks them up as FAQPage data), and
 * llms-full.txt prints them as plain text for AI crawlers. The wording
 * assumes the reader is on the service page the entry belongs to.
 */
import { CAPACITY_STATEMENT } from "../consts";
import { PRICING, VAT_NOTE, euro } from "./pricing";
import type { ServiceSlug } from "./services";

export interface FaqItem {
  question: string;
  answer: string;
}

const assessmentPrice = PRICING.assessment;
const workshopPrice = PRICING.workshops;

export const FAQS: Record<ServiceSlug, readonly FaqItem[]> = {
  "forward-deployed-engineering": [
      {
        question:
          "What is a forward-deployed engineer, and why an engagement rather than hiring one?",
        answer:
          "A forward-deployed engineer is the role the AI labs and Palantir use for an engineer who goes to the customer, works inside their company and builds until the product delivers. The good ones are rare, expensive and in demand, and most companies will not find one in a six-month search. I offer the same way of working as an engagement: one senior engineer who owns the outcome, with AI as one of the tools, at a fixed price per outcome instead of a salary, with everything written into your repositories so nothing leaves in one head, and with senior engineers from my network when an assignment needs more hands. You get the outcome ownership of the role without the hiring, the payroll or the search.",
      },
      {
        question:
          "We already know what we want built. Do we still need discovery?",
        answer:
          "Not the full two weeks. I spend a few days scoping what you hand me: the integrations it touches, the people who will use it, what done looks like in production. Then you get a fixed price and a timeline. If scoping turns up something more valuable than the original ask, I tell you and let you decide.",
      },
      {
        question:
          "We do not know where AI fits in our company. Is that a problem?",
        answer:
          "That is the normal starting point, and it is what discovery is for. I sit with the people who do the work and find the steps that are slow or expensive. Some of those are AI shaped: reading documents, classifying requests, drafting answers. Many are not, and need ordinary software or an integration. I rank by return, not by technology, and I say when a model does not earn its place.",
      },
      {
        question: "Fixed price or time and materials?",
        answer:
          "Fixed price per outcome, in every tier. For an outcome you hand me, a few days of scoping set the price; for work I find, the two-week discovery does. Both are short and priced separately, so you never pay for a build you have not scoped. In the Advanced tier the outcomes are planned a quarter at a time, each with its own price.",
      },
      {
        question: "Who owns the code, the models and the data?",
        answer:
          "You do, from the first commit. Everything lives in your repositories, your pipelines and your cloud account, including the prompts, evaluation sets and configuration behind any AI feature. Your data never trains anyone's model. If we part ways tomorrow, you lose nothing but me.",
      },
      {
        question: "What happens when you leave?",
        answer:
          "Your developers get a working session, not just documentation, and the decisions we made are written down with the lint rules that enforce them. After that you choose: run it yourself, keep me on call, or take the next outcome from the list together. There is no maintenance contract you did not plan for, and the workshops exist for teams that want to keep the pace on their own.",
      },
      {
        question: "How does this fit with our security and compliance teams?",
        answer:
          "I involve them in discovery, not at sign-off. Your guidelines, review process and release gates apply to me as they apply to your own developers, and that includes how any AI feature handles data. I have worked under the requirements of utilities, healthcare, defence and government. If you have no such requirements yet, I set up the sensible defaults so you are not the company that adds security after the breach.",
      },
      {
        question: "Can you work inside our existing Angular or Nx workspace?",
        answer:
          "That is the most common case. I build inside your workspace, respect its module boundaries and, where they are missing, help put them in. If the codebase itself is the problem, the architecture assessment is the place to start: a fixed-scope outside read that becomes the first part of discovery.",
      },
      {
        question: "Do you work on site or remote?",
        answer:
          "Remote, mostly. I build on my own where that is possible, and I join your team when the work needs it.",
      },
      {
        question: "Who actually does the work?",
        answer:
          `I do: Roberto Heckers, the person you talk to first. One senior engineer who knows the whole stack, with coding agents handling the typing, keeps communication direct and the decisions consistent. ${CAPACITY_STATEMENT}`,
      },
      {
        question:
          "We are a startup with an idea and no developers yet. Is that too early?",
        answer:
          "No. That is the moment where the most money is saved or wasted. Discovery cuts the idea down to a first version real users can try, and I set up the repositories, pipeline and cloud account in your name from day one, so whoever you hire later walks into a working project instead of a supplier's black box.",
      },
  ],
  "architecture-assessment": [
      {
        question: "We already have senior developers. Why an outside look?",
        answer:
          "Because they built it, and nobody can proofread their own writing. Your seniors know the history behind every decision, which is exactly what makes the decision invisible. An outside reader has no history, only the code and the cost. The best assessments I have done were for teams with strong seniors: the report gave them the mandate to fix what they already suspected.",
      },
      {
        question: "Will this disrupt the team?",
        answer:
          "I need read access to the repository, a kickoff session, and about an hour per interviewed person. In total, three to five hours of your team's time across the whole assessment, plus the roadmap session at the end. No feature freeze, no branch I block.",
      },
      {
        question:
          "Our codebase is not on Nx, or runs an older Angular version.",
        answer:
          "That is common and not a problem. I assess plain Angular workspaces as often as Nx ones, and older versions usually make the upgrade path one of the most valuable parts of the report.",
      },
      {
        question: "Is this a way to sell us the execution tier?",
        answer:
          "No. The roadmap is written so your own team can run it, and most teams do. The Advanced tier, where I execute the top findings myself, exists for teams who have no capacity to do it themselves, not as the intended next step.",
      },
      {
        question: "What about confidentiality?",
        answer:
          "I sign your NDA before I see a line of code. Access is revoked at the end, and the report is yours alone.",
      },
      {
        question: "What does it cost?",
        answer: `The Minimum assessment is ${euro(assessmentPrice.minimum)} and the Standard assessment is ${euro(assessmentPrice.standard)}, both ${VAT_NOTE} and fixed for workspaces up to roughly fifty projects. Larger workspaces get a fixed quote after a thirty-minute call. Either way you know the number before I start, and it does not change during the assessment. Execution in the Advanced tier is quoted after the roadmap, when the size of the work is known.`,
      },
  ],
  "workshops": [
      {
        question: "Our developers are senior. Is this too basic for them?",
        answer:
          "The workshops are for teams that already ship Angular in production; that is the assumption behind every exercise. Senior teams get the most out of them, because the work happens on their own code and the discussion is about their own decisions, not about the basics.",
      },
      {
        question: "On site or remote?",
        answer:
          "Both work. On site is better for the whole-team discussions, remote is easier to schedule across locations. For two-day workshops I prefer on site for at least one of the days.",
      },
      {
        question: "How many people?",
        answer: `As many as you have. Twelve seats are included in every tier; each extra seat is ${euro(workshopPrice.extraSeatPerDay)} per workshop day, ${VAT_NOTE}. Above roughly fifteen people I split the room into parallel groups, so the exercises stay hands-on and each group can work on its own part of the codebase. Bringing a whole department onto the same rules is what the Advanced tier is for.`,
      },
      {
        question: "Do we need to prepare anything?",
        answer:
          "Read access to the repository two weeks before, an intake call, and a room or a video link. I do the rest. Attendees should bring a laptop that can run the project.",
      },
      {
        question: "Can we combine topics?",
        answer:
          "Yes, and most two-day workshops do. AI-Native Development and Building AI-Driven Front-End Systems are the most common pair; so are the Nx and Enterprise Angular Architecture workshops. I will say honestly what fits in the time.",
      },
      {
        question: "Which language?",
        answer:
          "English or Dutch, whichever the team prefers. The material is in English.",
      },
  ],
};
