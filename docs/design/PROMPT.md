Read `docs/design/DESIGN-HANDOFF.md` and open the screens in `docs/design/screens/*.dc.html` in a browser (ignore the missing `support.js`).

Implement the redesign in this Next.js app. Start with step 1 (design tokens and fonts) and step 2 (`src/components/ui.tsx` primitives), then do the guest RSVP flow in `src/components/rsvp/`, then host pages, then the landing page. Work one step at a time and stop after each so I can review.

Constraints:
- The screens are a visual spec. Rebuild them with the existing Tailwind setup and components. Do not copy the HTML.
- Keep behaviour, the data model, server actions, REST API and tests unchanged except for the "New behaviour" items in the handoff. Ask before starting any of those.
- Keep dark mode and the per-event `.accent-*` theming.
- `AGENTS.md` says this Next.js version has breaking changes: read the relevant guide in `node_modules/next/dist/docs/` before writing code.
- After each step run `npm run check`. After the guest flow, also run `npm run test:e2e`.
