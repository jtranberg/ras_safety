# RAS Site Safety Forms

Built for the Ron Anderson & Sons Junior Software Developer technical assessment.

Framers complete daily safety forms with photos. Administrators review submissions, authorize forms, and manage workers and job sites.

## Demo

- [Live application](https://ras-safety-authorization.netlify.app/)
- [GitHub repository](https://github.com/jtranberg/ras_safety)
- [Entity-Relationship Diagram](docs/RAS_ERD.png)

### Test Credentials

The demo uses fictional demonstration data.

| Role | Email | Password |
|---|---|---|
| Admin | admin@example.com | Adminpassword |
| Framer | framer@example.com | DemoFramer |

Worker accounts and passwords are explicitly created and set by an administrator in the Admin workspace. Worker passwords are not supplied by a seed script. To test the Framer workspace, use the Framer credentials above. Administrators can also create additional workers and set their passwords in the Admin workspace.

## Tech Stack

- Frontend: React, TypeScript, Vite, CSS
- Backend: Node.js, Express
- Database: MongoDB, Mongoose
- Authentication: express-session, connect-mongo, bcryptjs
- Photo processing: Multer, Sharp
- Photo storage: Cloudflare R2 using the AWS S3 SDK
- Hosting: Netlify frontend, Render API

## Features

### Framer Workspace

- Sign in with individual credentials.
- Select an active job site and work date.
- Complete the safety checklist and add notes.
- Attach up to five photos per submission.
- View their own submissions and photos.

Worker identity comes from the authenticated account. The backend restricts workers to their own submissions and photo access.

### Admin Workspace

- View submissions across workers and sites.
- Filter by site, worker, and an inclusive work-date range.
- View matching submission totals and authorization counts.
- View submissions per site.
- Open form details and attached photos.
- Authorize forms or revoke authorization.
- Add workers and explicitly set initial passwords.
- Change passwords, revoke access, or delete worker accounts.
- Add job sites with an optional address.

### User Experience

- RAS branding and responsive layouts.
- Introductory splash displayed once per browser tab.
- Session restoration after refresh.
- Loading states and success/error messages.

## Local Setup

### Prerequisites

- Node.js 22 or later; hosted deployment currently uses Node.js 24
- npm
- MongoDB
- A Cloudflare R2 bucket with credentials that permit object reads, writes, and deletion

### Backend

From the repository root:

```bash
cd server
npm ci
```

Create `server/.env`:

```env
PORT=3000
NODE_ENV=development
CLIENT_ORIGIN=http://localhost:5173
MONGODB_URI=YOUR_MONGODB_CONNECTION_STRING
SESSION_SECRET=YOUR_RANDOM_SECRET_AT_LEAST_64_CHARACTERS

R2_ENDPOINT=https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=YOUR_R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY=YOUR_R2_SECRET_ACCESS_KEY
R2_BUCKET=YOUR_BUCKET_NAME
```

Generate a session secret with:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Start the API:

```bash
npm run dev
```

The API runs at `http://localhost:3000`.

### Frontend

In a second terminal, from the repository root:

```bash
cd client
npm ci
```

Create `client/.env`:

```env
VITE_API_URL=http://localhost:3000/api
```

Start the frontend:

```bash
npm run dev
```

Open `http://localhost:5173`.

### First Admin Account

For a fresh database, temporarily set `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` in `server/.env`, then run from the server directory:

```bash
node src/create-admin.js
```

The script creates an Admin account and leaves existing accounts unchanged. Remove the bootstrap variables afterward.

Sign in as Admin to create workers, explicitly set their passwords, and add job sites. Include a site named Kestrel Ridge in the demonstration data.

### Demo Data and Account Setup

The deployed demo includes an Admin account, Framer accounts, and fictional job sites, including Kestrel Ridge.

Worker accounts and passwords are managed through the Admin workspace. Administrators set each worker's initial password when creating the account and can change it afterward. No seed command is required for worker account setup or to test the deployed application.

A fresh database requires an initial Admin account before the admin management features can be used.

### Frontend Build

From `client`:

```bash
npm run build
```

Vite generates the deployment files in `client/dist`.

## Deployment

### Netlify

- Base directory: `client`
- Build command: `npm run build`
- Publish directory: `dist`
- Environment variable: `VITE_API_URL=https://ras-safety.onrender.com/api`

### Render

- Root directory: `server`
- Build command: `npm ci`
- Start command: `node src/index.js`
- Environment: `NODE_ENV=production`
- Client origin: `https://ras-safety-authorization.netlify.app`

Configure the MongoDB, session secret, and R2 variables on Render. Render supplies the service port.

Production sessions use secure, HTTP-only cookies with `SameSite=None` for the separate frontend and API domains. Express trusts Render's proxy. Browsers that block cross-site cookies may prevent session persistence.

## Authentication and Access Control

Passwords are stored as bcrypt hashes and excluded from normal User queries.

Sessions are stored in MongoDB, with an eight-hour cookie lifetime.

Backend authorization enforces:

- Framers can create submissions only for their authenticated account.
- Framers can read only their own submissions and request their own photo URLs.
- Admins can view all submissions and manage workers and sites.
- Password changes and access revocation invalidate older sessions on their next protected request.
- Deleted accounts cannot authenticate or use protected routes.

Photo uploads are limited to the worker's own forms with SUBMITTED status.

## Photo Handling

- Maximum five photos per submission.
- Maximum 5 MB per uploaded file.
- Accepts valid, non-animated JPEG, PNG, and WebP images.
- Sharp decodes image content rather than trusting filenames.
- Images are rotated using orientation metadata, resized to fit within 2000 × 2000 pixels, and converted to WebP.
- Image bytes are stored in R2.
- Photo metadata is embedded in the MongoDB submission.
- Read URLs are generated when requested and expire after five minutes.

## Entity-Relationship Diagram

![RAS database ERD](docs/RAS_ERD.png)

### Data Model

- **User:** credentials, role, account status, and session version.
- **Site:** name, optional address, and active status.
- **Submission:** worker/site references, work date, checklist, notes, status, authorization details, and embedded photo metadata.
- **Checklist:** required embedded Boolean answers.
- **Photo:** embedded identifier, R2 object key, original filename, content type, size, and timestamps.

One worker and one site can each have many submissions. Each submission contains one checklist and up to five photos through the upload API.

Photos are embedded documents, not a separate MongoDB collection. User and site references are application relationships, not database-enforced foreign keys.

## Crew Notes

### Assumptions and Decisions

- The application uses fictional demonstration data.
- Workers can select any active site; there are no crew-to-site assignments.
- Work dates are stored as YYYY-MM-DD strings, separately from UTC timestamps.
- A checklist answer of “No” is valid and remains visible to administrators.
- Site addresses are optional.
- Saving a new worker password also restores access.
- Deleting a worker retains their submissions, but the dashboard displays “Unavailable worker” when the referenced account no longer exists.
- The list displays up to 100 matching submissions.
- Summary totals include all matching submissions, beyond the list limit.
- Filters take effect when Apply filters is selected.
- Refresh dashboard reloads submissions and filter options.
- AI tools assisted development; code understanding is part of the assessment.

## Configuration

Do not commit `.env` files or infrastructure credentials.

Provide `server/.env.example` and `client/.env.example` with variable names and placeholder values. Demo login credentials are separate from database, R2, and session secrets.
