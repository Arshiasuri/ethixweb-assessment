# Ethixweb



## Live links

- [Open the live website](https://arshiasuri.github.io/ethixweb-assessment/)
- [Send an enquiry](https://arshiasuri.github.io/ethixweb-assessment/contact.html)
- [Open the admin sign-in page](https://arshiasuri.github.io/ethixweb-assessment/admin.html)

The website is public. The admin page is accessible, but viewing or managing leads requires an authorized Supabase admin account.
Ethixweb is a static website with a Supabase-backed enquiry form and a protected admin dashboard. The admin uses Supabase Auth for sign-in, an explicit `public.admin_users` allowlist, and PostgreSQL row-level security (RLS) to protect lead data.

## Admin dashboard

- Local URL: `http://127.0.0.1:8000/admin.html` (or `http://localhost:8000/admin.html`)
- Live URL: `https://arshiasuri.github.io/ethixweb-assessment/admin.html`
- Short `/admin/` URL: redirects to `admin.html`.

The admin page files are static, so someone may be able to load the sign-in page itself. That does **not** grant access to enquiries: the database only returns or updates leads for a signed-in user whose UUID is in `public.admin_users`. Never rely on hiding a static page URL as security.

## Configuration: local and deployed site

The website needs a Supabase project URL and a **public** publishable/anon key. Those values are meant to be sent to the browser; they are not passwords. The website must never receive a Supabase secret key, service-role key, database password, or contact rate-limit secret.

1. Copy `.env.example` to `.env`:

   ```powershell
   Copy-Item .env.example .env
   ```
2. Set `ETHIXWEB_SUPABASE_URL` and `ETHIXWEB_SUPABASE_ANON_KEY` in `.env` to the Supabase project URL and its publishable key. `ETHIXWEB_CONTACT_FUNCTION_URL` can be left empty; the setup script derives it from the project URL.
3. Generate the browser config:

   ```powershell
   .\.venv\Scripts\python.exe scripts\generate_site_config.py
   ```

   If you do not have this virtual environment, use `py scripts\generate_site_config.py` or `python scripts\generate_site_config.py`.
4. Serve the site locally, for example:

   ```powershell
   py -m http.server 8000
   ```

   Then open `http://127.0.0.1:8000/contact.html` or `http://127.0.0.1:8000/admin.html`.

`site-config.js` is generated and git-ignored. The generator stops with a clear error when the required public settings are missing, and refuses secret/service-role keys. Keep `.env` out of source control.

For a static hosting provider, add the same `ETHIXWEB_*` values as **build environment variables**, set the build command to `python scripts/generate_site_config.py`, and publish the project root (`.`). The host must run the generator for every deployment so the generated `site-config.js` is included. The values in this browser config are public; all server secrets belong in Supabase Edge Function secrets only.

## Supabase setup

### 1. Database and enquiry function

The migration `supabase/migrations/20261014000000_initial.sql` creates the `leads` table, the admin allowlist, and the policies/functions used for lead security and spam throttling. It has already been applied to the Supabase project used by this assessment.

Deploy or update the contact Edge Function from the project root:

```powershell
supabase functions deploy contact
```

The checked-in `supabase/config.toml` disables legacy JWT verification for this function because the browser sends a publishable key rather than a legacy JWT anon key. The function independently validates enquiry fields, rejects unapproved origins and honeypot submissions, applies rate limits, and saves rows using the server-side service role.

In the Supabase dashboard, open **Edge Functions → Secrets** and set:

- `CONTACT_RATE_LIMIT_SECRET`: a randomly generated value with at least 32 characters.
- `ALLOWED_ORIGINS`: comma-separated site origins, without trailing slashes. For local development include the origin you actually use, such as `http://localhost:8000`. For production also include `https://arshiasuri.github.io`.

Supabase injects `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for the function. Do not copy the service-role key into `.env`, website JavaScript, hosting build variables, or this README. The contact endpoint must be deployed and `ALLOWED_ORIGINS` must include the exact deployed site origin or browser submissions will fail.

### 2. Set Supabase Auth URLs

In **Authentication → URL Configuration**:

- Set **Site URL** to the deployed website origin, such as `https://arshiasuri.github.io`.
- Add redirect URLs for the deployed admin page and each local development address you use, for example:
  - `https://arshiasuri.github.io/ethixweb-assessment/admin.html`
  - `http://localhost:8000/admin.html`
  - `http://127.0.0.1:8000/admin.html`

Use the actual domain and port; do not leave the example domain in place. These URLs allow Supabase invitation and sign-in links to return to the website.

### 3. Create and authorize your initial admin

Create/invite the admin user in **Authentication → Users**. Use your own email address; never share your personal Supabase account or its password with evaluators. After the user exists, open **SQL Editor** and run this query after replacing the email:

```sql
insert into public.admin_users (user_id)
select id
from auth.users
where lower(email) = lower('YOUR_ADMIN_EMAIL')
on conflict (user_id) do nothing;
```

Check the result in SQL Editor:

```sql
select u.email, a.user_id is not null as is_admin
from auth.users as u
left join public.admin_users as a on a.user_id = u.id
where lower(u.email) = lower('YOUR_ADMIN_EMAIL');
```

Only continue when `is_admin` is `true`. If no row is returned, first create or invite that user in this **Supabase project**, then run the insert again. Signing into the Supabase dashboard is separate from signing into the Ethixweb admin.

Open the admin URL and sign in with that Supabase Auth user's email and password. An invited admin can use the invitation link to sign in, then choose **Set/change password** in the dashboard to set a private password. The dashboard checks both the Auth session and the allowlist; PostgreSQL RLS enforces access even if someone bypasses the page.

### 4. Create a separate evaluator/demo admin

Use a dedicated company/evaluator email address or test inbox, not your personal account:

1. In **Authentication → URL Configuration**, set **Site URL** to the deployed site origin and add `https://arshiasuri.github.io/ethixweb-assessment/admin.html` to **Redirect URLs**. Then in **Authentication → Users**, choose **Add user → Send invitation** and enter the evaluator's email. Supabase may return the invite link to the site root; after accepting, the evaluator opens `/admin.html`.
2. After Supabase creates the user, run the same allowlist insert in SQL Editor, replacing `YOUR_ADMIN_EMAIL` with the evaluator's email. Verify that the query returns `is_admin = true`.
3. Supabase sends the invitation to the evaluator's email. They follow the link, open the live admin URL, and set their own password in the dashboard. The dashboard URL, account email, and permission setup are configurable; no demo password is stored in this project or published here.
4. To remove access later, run this in SQL Editor after replacing the email. Their Auth account can remain, but without the allowlist row it cannot read or update leads:

   ```sql
   delete from public.admin_users
   where user_id = (
     select id from auth.users where lower(email) = lower('EVALUATOR_EMAIL')
   );
   ```

Do not insert every Auth user into `admin_users`, and do not give evaluators your personal admin credentials. Each allowlisted user can view enquiries and change their status; there is no public admin-registration page.

## How the enquiry manager works

Visitors submit enquiries on `contact.html`. The browser does basic form validation, and the Edge Function validates again before writing to `public.leads`. The admin dashboard provides search, service/status filters, pagination, lead details, and status updates (`new`, `contacted`, `qualified`, `closed`). Lead reads and updates are controlled by RLS and the admin allowlist.

## Troubleshooting

- **“Admin is not configured yet”**: set `ETHIXWEB_SUPABASE_URL` and `ETHIXWEB_SUPABASE_ANON_KEY`, then run the config generator and redeploy.
- **Sign-in fails**: confirm the user exists in this project's **Authentication → Users**, the password is correct, the deployed URL is in Auth's redirect allowlist, and the user has an `admin_users` row.
- **“This account is not authorized”**: run the allowlist insert and verify `is_admin = true`.
- **Enquiries do not submit on the live site**: check that the `contact` function is deployed, its required secrets are set, and the exact production origin is in `ALLOWED_ORIGINS`.
- **Invitation email doesn't arrive**: check spam and the project's Auth email/SMTP configuration and delivery limits.
- **Live admin URL**: `https://arshiasuri.github.io/ethixweb-assessment/admin.html`.


For GitHub Pages, the Supabase Edge Function secret `ALLOWED_ORIGINS` must include `https://arshiasuri.github.io` (without a trailing slash) or browser enquiry submissions will fail CORS. Add your local development origin as well when testing locally.
