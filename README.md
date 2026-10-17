# India Job Tracker: dashboard

The dashboard for the India Job Tracker: new job openings in India for Data Analyst, Data Science, Data Engineering and Production Support roles, collected daily from LinkedIn, Naukri, Indeed and Glassdoor.

Built with Next.js and TypeScript. All data comes from the tracker's Express API under `/api`; this repository is the frontend only.

## Pages

- **Dashboard** (`/`): new jobs per course and platform, daily trend, top companies, cities, skills, placement progress, and the skills that would open up more jobs for each course.
- **Course pages** (`/course/data-analyst`, …): one course in detail, with its job list. Each job can have an HR phone, email, remarks and placement status.
- **Weekly report** (`/report`): the last 7 days as a PNG image for Instagram or LinkedIn and as text for WhatsApp.
- **Hiring partners** (`/partners`): companies that keep hiring for the courses, with HR contacts and a CSV download.

## Run it

Requires Node.js 20 or later, and the tracker's API server running on port 3000.

```
npm install
npm run dev        # http://localhost:3001; /api calls are forwarded to http://localhost:3000
npm run build      # static files in out/, served by the API server
npm run typecheck
```
