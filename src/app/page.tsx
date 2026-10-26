import Link from "next/link";
import { ButtonLink } from "@/components/ui";

const features = [
  {
    title: "Every ceremony, separately",
    body: "Guests answer per activity, so Haldi, Sangeet and the reception each get their own headcount.",
  },
  {
    title: "Families, counted as people",
    body: "One respondent answers for the household, but every person is counted exactly once.",
  },
  {
    title: "Stays, meals and travel",
    body: "Room-nights, meal counts and pickups are derived from responses and update as plans change.",
  },
  {
    title: "No app, no account for guests",
    body: "A private link opens on any phone, including inside WhatsApp, and can be edited later.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" className="font-display text-xl font-semibold tracking-tight">
          Gatherly
        </Link>
        <nav className="flex items-center gap-2">
          <ButtonLink href="/login" variant="ghost" size="sm">
            Sign in
          </ButtonLink>
          <ButtonLink href="/signup" size="sm">
            Create an event
          </ButtonLink>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6">
        <section className="grid items-center gap-10 py-12 md:grid-cols-2 md:py-20">
          <div>
            <p className="mb-3 text-sm font-medium text-brand">RSVPs that turn into a plan</p>
            <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Know who&rsquo;s coming to what — and what that means for rooms and meals.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">
              Gatherly collects structured responses for multi-day weddings, birthdays, trips and game nights, then keeps
              attendance, stays and catering counts up to date for you.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/signup">Start planning — it&rsquo;s free</ButtonLink>
              <ButtonLink href="/login" variant="secondary">
                I already have an account
              </ButtonLink>
            </div>
          </div>
          <div aria-hidden className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <div className="mb-4 text-sm font-medium text-muted">Live headcount · example</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted">
                  <th className="pb-2 font-medium">Activity</th>
                  <th className="pb-2 text-right font-medium">Confirmed</th>
                  <th className="pb-2 text-right font-medium">Maybe</th>
                  <th className="pb-2 text-right font-medium">Pending</th>
                </tr>
              </thead>
              <tbody className="tabular divide-y divide-border">
                {[
                  ["Welcome dinner", 80, 6, 12],
                  ["Haldi", 95, 4, 10],
                  ["Sangeet", 110, 8, 7],
                  ["Wedding", 140, 3, 5],
                ].map(([name, c, m, p]) => (
                  <tr key={name as string}>
                    <td className="py-2.5">{name}</td>
                    <td className="py-2.5 text-right font-semibold text-success">{c}</td>
                    <td className="py-2.5 text-right text-warning">{m}</td>
                    <td className="py-2.5 text-right text-muted">{p}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-surface-2 p-2">
                <div className="text-lg font-semibold tabular">42</div>room-nights
              </div>
              <div className="rounded-lg bg-surface-2 p-2">
                <div className="text-lg font-semibold tabular">118</div>lunch, day 2
              </div>
              <div className="rounded-lg bg-surface-2 p-2">
                <div className="text-lg font-semibold tabular">23</div>airport pickups
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 pb-20 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-surface p-5">
              <h2 className="font-semibold">{f.title}</h2>
              <p className="mt-1.5 text-sm text-muted">{f.body}</p>
            </div>
          ))}
        </section>
      </main>
      <footer className="border-t border-border py-6 text-center text-xs text-muted">
        Gatherly · Guests&rsquo; responses are private to the hosts of each event.
      </footer>
    </div>
  );
}
