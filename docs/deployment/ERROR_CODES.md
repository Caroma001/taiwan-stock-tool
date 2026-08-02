# M7.8.5 Deployment Error Codes

| Code | Meaning | Action |
|---|---|---|
| E101 | `TWSTOCK_PRODUCTION_URL` missing | Add the HTTPS production origin to GitHub Repository Secrets. |
| E102 | Production URL is not HTTPS | Store a value beginning with `https://`. |
| E103 | `MONITORING_SECRET` missing | Add the same secret to GitHub and Vercel Production. |
| E104 | `VERCEL_TOKEN` missing for rollback | Create a Vercel Access Token and add it to GitHub Secrets. |
| E201 | Health or readiness did not become healthy | Open the endpoint response and Vercel Function logs. |
| E202 | Scheduled production monitoring failed | Check `/api/monitoring/check`; rollback runs only when enabled. |
| E301 | Local `.env.local` missing | Copy the previous version's `.env.local`. |
| E302 | Local dependencies missing | Run `npm install`. |
