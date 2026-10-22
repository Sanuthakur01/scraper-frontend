# India Job Tracker: dashboard

The dashboard for the India Job Tracker: new job openings in India for Data Analyst, Data Science, Data Engineering and Production Support roles, collected daily from LinkedIn, Naukri, Indeed and Glassdoor.

Built with Next.js and TypeScript. All data comes from the tracker's Express API under `/api`; this repository is the frontend only.

## Pages

- **Dashboard** (`/`): new jobs per course and platform for the latest day, the last 7 or 30 days, or chosen dates (Custom: one day or a range), daily trend, top companies, cities, skills, and the skills that would open up more jobs for each course.
- **Course pages** (`/course/data-analyst`, …): one course in detail, with its job list. Each job's details window holds the HR person's name and profile link, phone numbers and emails (up to 10 of each), students and notes the team fills in; Expand shows more columns.
- **Performance report** (`/performance`): how many HR phone numbers and emails each person added, drilling down person → course → company → job → each number and email.
- **Hiring partners** (`/partners`): companies that keep hiring for the courses, with HR contacts and a CSV download.
- **Activity** (`/activity`): who added, changed or removed which job's HR phone numbers, emails, students and notes, and when, with their email from their sign-in. Filter by person, kind of change, job or company; click a job to open it.

Everything is behind a Clerk sign-in. Only people whose Clerk public metadata has an allowed role (`SUPER_ADMIN`, `ADMIN`, `PLACEMENT_STAFF`, `RESEARCH_TEAM`) get in; what each role may do is in [lib/access.ts](lib/access.ts).

## Run it

Requires Node.js 20 or later, and the tracker's API server running on port 3000.

```
npm install
npm run dev        # http://localhost:3001; /api calls are forwarded to http://localhost:3000
npm run build      # static files in out/, served by the API server
npm run typecheck
npm test           # the role rules (lib/access.ts) and the period helpers (lib/format.ts)
```

## Settings

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (required): the Clerk publishable key (`pk_…`). Set it before building; without it the dashboard shows "Sign-in isn't set up". Never put the Clerk secret key here: the backend has it.
- `NEXT_PUBLIC_API_URL`: only when the dashboard is hosted on its own (e.g. Vercel): the backend's address. Add the dashboard's address to the backend's `CORS_ORIGINS` too.

See [.env.example](.env.example).
