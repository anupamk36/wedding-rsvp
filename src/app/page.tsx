import Link from "next/link";
import { Icon, ICONS } from "@/components/icons";
import { ButtonLink, cx } from "@/components/ui";
import { EVENT_TYPE_META } from "@/domain/event-types";
import type { EventType } from "@/domain/settings";
import { TEMPLATES } from "@/domain/templates";

const TEMPLATE_TITLES: Record<EventType, string> = {
  wedding: "Multi-day wedding",
  birthday: "Birthday party",
  trip: "Weekend trip",
  sports: "Sports meetup",
  dinner: "Dinner or house party",
  custom: "Start from scratch",
};

const FEATURE_LABELS = {
  accommodation: "stays",
  meals: "meals",
  transport: "transport",
  accessibility: "accessibility",
  plusOnes: "plus-ones",
  dietary: "dietary needs",
} as const;

/** "Stays, meals, transport, accessibility", from what the template switches on. */
function includes(type: EventType): string {
  const s = TEMPLATES[type].settings;
  const parts = [
    ...(s.availabilityMode ? ["availability slots"] : []),
    ...(s.minParticipants ? ["minimum players"] : []),
    ...(Object.keys(FEATURE_LABELS) as (keyof typeof FEATURE_LABELS)[]).filter((k) => s.features?.[k]).map((k) => FEATURE_LABELS[k]),
  ];
  if (!parts.length) return "Everything optional";
  const text = parts.join(", ");
  return text[0]!.toUpperCase() + text.slice(1);
}

const steps = [
  {
    title: "Set up the event",
    body: "Start from a template (wedding, birthday, trip, dinner, sports poll) or build your own list of activities and time slots.",
  },
  {
    title: "Send one link per household",
    body: "Paste the links into WhatsApp or send them by email. Each link is private to that guest or household.",
  },
  {
    title: "Watch the plan fill in",
    body: "Headcounts update as replies and changes arrive, with room-nights, meal counts and pickups when you switch them on.",
  },
];

const features = [
  { icon: ICONS.schedule, title: "Every activity, separately", body: "Guests answer per activity, so each ceremony, game or dinner gets its own headcount." },
  { icon: ICONS.guests, title: "Households, counted as people", body: "One person answers for the household, and every person is still counted exactly once." },
  {
    icon: ICONS.accommodation,
    title: "Stays, meals and travel, when you need them",
    body: "Switch on only what your event needs. Room-nights, meal counts with dietary needs and pickups come straight from the replies.",
  },
  { icon: ICONS.star, title: "No app, no account for guests", body: "A private link opens on any phone, and guests can change their answers until the deadline." },
];

const heroTypes: { key: keyof typeof EVENT_TYPE_META; label: string }[] = [
  { key: "wedding", label: "Weddings" },
  { key: "trip", label: "Trips" },
  { key: "birthday", label: "Birthdays" },
  { key: "poll", label: "Sports polls" },
  { key: "dinner", label: "Dinners" },
];

const sectionHeading = "font-display text-[clamp(30px,3.6vw,42px)] leading-[1.12] font-medium tracking-tight text-balance";
const eyebrow = "text-[12.5px] font-bold tracking-[0.1em] text-brand uppercase";
const shell = "mx-auto w-full max-w-[1160px] px-4 sm:px-6";

/** Decorative preview of a guest answer and the host's live headcount. */
function HeroComposition() {
  const bars = [
    { name: "Day out", n: 14, c: 70, m: 10, d: 6 },
    { name: "Farewell brunch", n: 11, c: 55, m: 15, d: 5 },
  ];
  return (
    <div aria-hidden="true" className="relative min-h-[440px]">
      <div className={cx("absolute top-0 right-0 h-full w-[min(86%,400px)] rounded-[28px]", EVENT_TYPE_META.trip.badge)} />
      <div className="relative mt-9 flex w-[min(100%,330px)] flex-col gap-3 rounded-[20px] border border-border bg-surface p-[18px] shadow-[0_18px_40px_rgba(60,20,30,0.14)]">
        <div className="flex items-baseline justify-between">
          <span className="font-display text-xl font-semibold">Day out</span>
          <span className="text-[13px] text-muted">Sat 13 Dec · 9 AM</span>
        </div>
        <span className="text-[13px] text-muted">Nisha, Dev and Kabir · everyone</span>
        <div className="flex gap-1.5 text-[13px] font-semibold">
          <span className="flex h-10 flex-1 items-center justify-center rounded-[10px] bg-success text-on-status">✓ Attending</span>
          <span className="flex h-10 flex-1 items-center justify-center rounded-[10px] border-[1.5px] border-border-strong">Maybe</span>
          <span className="flex h-10 flex-1 items-center justify-center rounded-[10px] border-[1.5px] border-border-strong whitespace-nowrap">Not attending</span>
        </div>
      </div>
      <div className="relative -mt-2 ml-auto flex w-[min(100%,340px)] flex-col gap-3.5 rounded-[20px] border border-border bg-surface p-[18px] shadow-[0_18px_40px_rgba(60,20,30,0.18)]">
        <span className="text-[11.5px] font-bold tracking-[0.1em] text-brand uppercase">Live headcount</span>
        <div className="flex flex-col gap-3">
          {bars.map((b) => (
            <div key={b.name} className="flex flex-col gap-1.5">
              <div className="flex justify-between text-sm font-semibold">
                <span>{b.name}</span>
                <span className="text-success">{b.n}</span>
              </div>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-info-soft">
                <span className="bg-success" style={{ width: `${b.c}%` }} />
                <span className="bg-marigold" style={{ width: `${b.m}%` }} />
                <span className="bg-decline-bar" style={{ width: `${b.d}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            [12, "room-nights"],
            [3, "vegetarian"],
            [4, "pickups"],
          ].map(([n, label]) => (
            <div key={label} className="rounded-[10px] bg-surface-2 px-0.5 py-2">
              <div className="text-[19px] font-bold">{n}</div>
              <div className="text-[11.5px] text-muted">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className={cx(shell, "flex items-center justify-between gap-4 py-5")}>
        <Link href="/" className="font-display text-[26px] font-semibold tracking-tight text-brand-ink">
          Gatherly
        </Link>
        <nav aria-label="Account" className="flex items-center gap-2.5">
          <ButtonLink href="/login" variant="secondary" size="sm">
            Sign in
          </ButtonLink>
          <ButtonLink href="/signup" size="sm" className="hidden sm:inline-flex">
            Create an event
          </ButtonLink>
        </nav>
      </header>

      <main className="flex-1">
        <section className={cx(shell, "grid grid-cols-[repeat(auto-fit,minmax(min(440px,100%),1fr))] items-center gap-14 pt-12 pb-[72px]")}>
          <div className="flex flex-col gap-[22px]">
            <p className={eyebrow}>RSVPs that turn into a plan</p>
            <h1 className="font-display text-[clamp(38px,5vw,60px)] leading-[1.06] font-medium tracking-[-0.02em] text-balance">
              Know who&rsquo;s coming to what, and what that means for rooms and meals.
            </h1>
            <p className="max-w-[520px] text-[19px] leading-normal text-muted">
              Every guest or household gets one private link and answers for each activity, person by person. You see headcounts update live, plus stays, meals and pickups
              when your event needs them.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <ButtonLink href="/signup" size="lg">
                Start planning, it&rsquo;s free
              </ButtonLink>
              <ButtonLink href="#how-it-works" variant="secondary" size="lg">
                See how it works
              </ButtonLink>
            </div>
            <ul aria-label="Works for" className="flex flex-wrap gap-2">
              {heroTypes.map((t) => (
                <li key={t.key} className={cx("inline-flex h-8 items-center rounded-full px-3 text-[13.5px] font-semibold", EVENT_TYPE_META[t.key].badge)}>
                  {t.label}
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted">Guests need no app and no account. Links open inside WhatsApp.</p>
          </div>
          <HeroComposition />
        </section>

        <section id="how-it-works" aria-labelledby="how-h" className="scroll-mt-4 border-y border-border bg-surface-2">
          <div className={cx(shell, "flex flex-col gap-9 py-[72px]")}>
            <div className="flex max-w-[640px] flex-col gap-2.5">
              <p className={eyebrow}>How it works</p>
              <h2 id="how-h" className={sectionHeading}>
                Three steps, and the spreadsheet is gone.
              </h2>
            </div>
            <ol className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-5">
              {steps.map((s, i) => (
                <li key={s.title} className="flex flex-col gap-3 rounded-[20px] border border-border bg-surface p-[26px]">
                  <span aria-hidden="true" className="font-display text-[44px] leading-none font-medium text-marigold">
                    {i + 1}
                  </span>
                  <h3 className="text-xl leading-tight font-bold">
                    <span className="sr-only">Step {i + 1}: </span>
                    {s.title}
                  </h3>
                  <p className="text-base leading-normal text-muted">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="tpl-h" className={cx(shell, "flex flex-col gap-9 pt-20")}>
          <div className="flex max-w-[640px] flex-col gap-2.5">
            <p className={eyebrow}>Start from a template</p>
            <h2 id="tpl-h" className={sectionHeading}>
              One tool, shaped to the occasion.
            </h2>
          </div>
          <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(340px,100%),1fr))] gap-4">
            {(Object.keys(TEMPLATE_TITLES) as EventType[]).map((type) => {
              const meta = EVENT_TYPE_META[type];
              return (
                <li key={type} className="flex flex-col gap-4 rounded-[20px] border border-border bg-surface p-6">
                  <span aria-hidden="true" className={cx("flex size-[52px] items-center justify-center rounded-2xl", meta.badge)}>
                    <Icon path={meta.icon} size={26} strokeWidth={1.6} />
                  </span>
                  <div className="flex flex-col gap-1.5">
                    <h3 className="font-display text-[23px] leading-tight font-semibold">{TEMPLATE_TITLES[type]}</h3>
                    <p className="text-[15.5px] leading-normal text-muted">{TEMPLATES[type].description}</p>
                  </div>
                  <p className="mt-auto border-t border-border pt-3.5 text-[13.5px] leading-snug text-muted">
                    <span className="font-bold text-text">Includes</span> · {includes(type)}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="feat-h" className={cx(shell, "flex flex-col gap-9 py-20")}>
          <div className="flex max-w-[640px] flex-col gap-2.5">
            <p className={eyebrow}>Built for real groups</p>
            <h2 id="feat-h" className={sectionHeading}>
              For any gathering where people answer more than yes or no.
            </h2>
          </div>
          <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(460px,100%),1fr))] gap-x-5">
            {features.map((f) => (
              <li key={f.title} className="flex gap-[18px] border-t-[1.5px] border-border-strong py-6">
                <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                  <Icon path={f.icon} size={22} />
                </span>
                <div className="flex flex-col gap-1.5">
                  <h3 className="text-xl leading-tight font-bold">{f.title}</h3>
                  <p className="text-base leading-normal text-muted">{f.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className={cx(shell, "pb-20")}>
          <div className="relative flex flex-col items-center gap-5 overflow-hidden rounded-[28px] bg-ink-deep px-8 py-16 text-center text-[#fbf6ee]">
            {[
              ["size-[520px]", "border-marigold/25"],
              ["size-[420px]", "border-marigold/15"],
            ].map(([size, color]) => (
              <div key={size} aria-hidden="true" className={cx("pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 rounded-full border-[1.5px]", size, color)} />
            ))}
            <h2 className="relative max-w-[620px] font-display text-[clamp(32px,4vw,46px)] leading-[1.1] font-medium text-balance italic">
              Send one link. Get the whole plan back.
            </h2>
            <Link
              href="/signup"
              className="relative inline-flex h-[52px] items-center justify-center rounded-[14px] bg-marigold px-6 text-base font-semibold whitespace-nowrap text-[#2a1600] hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marigold"
            >
              Start planning, it&rsquo;s free
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border p-6 text-center text-sm text-muted">Gatherly · Guests&rsquo; responses are private to the hosts of each event.</footer>
    </div>
  );
}
