# RAS Safety - reviewed corrections

This is a corrected source copy of the project uploaded on October 15, 2026.
It has not been deployed. Existing MongoDB and R2 data are not modified by these changes.

## Use this package

1. Extract into a NEW folder. Do not simply overlay it on the old project: that would retain the obsolete files listed below.
2. Keep your existing Git checkout as a backup. This ZIP does not contain Git history.
3. Copy your existing local `server/.env` and `client/.env` into their corresponding folders, or configure them from the example files. Real environment files and infrastructure credentials are intentionally excluded.
4. From `server`, run `npm ci`, then `npm test`, then `npm run dev` when you want to connect to your configured database.
5. From `client`, run `npm ci`, `npm run lint`, and `npm run build`. Run `npm run dev` for local use.
6. If you transfer changes to your existing Git checkout, review the changed files and delete the obsolete files below before committing. Preserve its `.git` directory and your environment files.

## Corrections

- Public `/api/health` now runs before session handling and protected routers. HTTP 200 means the database is connected; HTTP 503 means it is disconnected.
- Express app construction moved to `server/src/app.js`; `server/src/index.js` retains production startup, MongoDB connection, and the MongoDB session store. This enables isolated HTTP tests without production credentials.
- `npm test` now runs Node's test discovery. The misplaced old test and duplicate helper were removed.
- Submission detail responses now populate both authorizer and revoker names. A duplicate revoker population call was removed.
- Netlify configuration is now `client/public/_redirects` with `/* /index.html 200`.
- Worker date calculations now use America/Vancouver, matching server and admin business dates.
- README date, seed-script, testing, and data-model descriptions now match the implementation. An extra code fence and malformed model labels were corrected.
- The outdated five-field PNG ERD was replaced by a source SVG documenting all eighteen checklist fields and current models.
- Removed an unused preview import comment, the unexplained RAS-7Q comment, and a one-line assessment-label file that contained no actual tests. Their origin or relation to RAS review checks has not been established.
- Removed an unverified assertion about a particular named site being present in the deployed database. No live database inspection was performed.
- Client ignore rules now exclude local environment files while retaining `.env.example`.

## Files to delete from an existing checkout

- `client/public/_redirect`
- `server/src/middleware/tests/adminSubmissionHelpers.test.mjs`
- `server/src/middleware/utils/adminSubmissionHelpers.js`
- `unit-testing/RAS_CHECK.md`
- `docs/RAS_ERD.png`

Empty directories left by these deletions may also be removed.

## Verification

- Fresh dependency installation: completed for server and client using npm ci with lifecycle scripts disabled in the review environment.
- Server `npm test`: 16 passed, 0 failed.
- Client `npm run lint`: passed.
- Client `npm run build`: passed, including TypeScript and the Vite production bundle.
- Build output includes the expected `_redirects` rule.
- HTTP tests verify anonymous healthy/unhealthy readiness, protected endpoint access boundaries, rejection of unapproved write origins, and authorizer/revoker names after reopening a submission.
- HTTP tests use in-memory sessions and stubbed model responses. They do not prove live MongoDB persistence or R2 upload behaviour.
- The final package excludes node_modules, build output, Git internals, and real .env files.

## Remaining practical checks

Before deploying, exercise login, worker submission, photo upload, authorization, revocation, reopened details, filters, and CSV export against your intended environment using fictional data. Verify an anonymous `/api/health` request after deployment. Existing cross-site cookie browser restrictions still apply to separate Netlify and Render domains.

The current authorization fields record the latest stored values; they are not an append-only audit event history. The REVIEWED status is supported in the model but this revision does not introduce a separate review transition.
