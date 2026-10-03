import { useState } from "react";
import "./privacy.css";

const NOTICE_KEY = "ras-cookie-notice-seen-v1";

function noticeWasSeen() {
  try {
    return localStorage.getItem(NOTICE_KEY) === "true";
  } catch {
    return false;
  }
}

export function CookieNotice() {
  const [dismissed, setDismissed] = useState(noticeWasSeen);

  function dismiss() {
    try {
      localStorage.setItem(NOTICE_KEY, "true");
    } catch {
      // The notice can still be dismissed when browser storage is unavailable.
    }
    setDismissed(true);
  }

  if (dismissed) return null;

  return (
    <aside className="ras-cookie-notice" aria-label="Cookie notice">
      <div>
        <strong>Cookies and browser storage</strong>
        <p>
          RAS Safety Authorization uses an essential session cookie to keep you
          signed in. Browser storage remembers this notice and the introductory
          splash screen. <a href="#privacy">Privacy Policy</a>
        </p>
      </div>
      <button type="button" onClick={dismiss}>Got it</button>
    </aside>
  );
}

export function PrivacyPolicy() {
  return (
    <article className="card ras-privacy-policy" aria-labelledby="privacy-title">
      <a className="ras-privacy-back" href="#workspace">Back to app</a>
      <p className="eyebrow">RAS SAFETY AUTHORIZATION</p>
      <h1 id="privacy-title" tabIndex={-1}>Privacy Policy</h1>
      <p className="muted">Last updated: October 3, 2026</p>

      <h2>About this demonstration</h2>
      <p>
        RAS Safety Authorization was built by Jay Tranberg for the Ron Anderson
        &amp; Sons Junior Software Developer technical assessment. This policy
        describes this demonstration application, not RAS's own privacy practices.
        Use fictional accounts, site details, notes and photos when testing.
      </p>
      <p>
        The published demonstration accounts are shared with reviewers. Information
        entered using those accounts may be visible to other people using the same
        credentials. Do not submit private workplace records or sensitive personal
        information in this demo.
      </p>

      <h2>Information the app processes</h2>
      <ul>
        <li>Account names, email addresses, password hashes, roles and account status.</li>
        <li>Job-site names and any optional addresses entered by an administrator.</li>
        <li>Safety submissions: worker and site references, work dates, checklist answers, notes and authorization details.</li>
        <li>Uploaded photos and metadata, including original filenames, file sizes and upload timestamps.</li>
        <li>Session records used to authenticate accounts.</li>
      </ul>
      <p>
        Hosting providers may also process technical request information, such as
        IP addresses and request logs, to deliver and operate their services.
      </p>

      <h2>How information is used and accessed</h2>
      <p>
        Information is used to demonstrate account sign-in, safety form submission,
        photo viewing, administrator review and authorization, dashboard summaries,
        and worker and site management.
      </p>
      <p>
        Framers can access their own submissions and photos. Administrators can
        access submissions across workers and sites. The developer may access
        demonstration data to maintain and troubleshoot the application.
      </p>

      <h2>Storage and service providers</h2>
      <p>
        MongoDB stores account records, sites, submissions, photo metadata and
        sessions. Cloudflare R2 stores uploaded image files. Netlify hosts the
        frontend and Render hosts the API. These providers process information
        as part of delivering their services. This demo does not guarantee that
        all information is stored or processed in Canada.
      </p>

      <h2>Cookies and browser storage</h2>
      <p>
        An essential session cookie connects your browser to a server-side session
        so the app can keep you signed in. Its configured lifetime is eight hours.
        In production it is secure and HTTP-only. Blocking cookies may prevent
        sign-in or session restoration.
      </p>
      <p>
        Session storage remembers that the introductory splash has been shown
        within your browser tab. Local storage remembers when you dismiss the
        cookie notice. You can remove these entries through your browser's site
        data settings. Dismissing the notice acknowledges it; it does not disable
        the session cookie or change your account permissions.
      </p>

      <h2>Protection and retention</h2>
      <p>
        Passwords are stored as bcrypt hashes. Access checks restrict worker
        submissions and photos to their authenticated account. Photo read links
        expire after five minutes; link expiry does not delete the stored image.
      </p>
      <p>
        This demo has no published automatic deletion schedule for submissions or
        uploaded photos. Deleting a worker account retains their submissions and
        associated photos. Contact the developer to request removal of information
        you entered. Removing browser data does not remove server-side records.
      </p>

      <h2>Questions and requests</h2>
      <p>
        Contact Jay Tranberg at <a href="mailto:jay@appintelligence.ca">jay@appintelligence.ca</a>
        {" "}with privacy questions or requests to access, correct or delete information
        you entered. Please identify the relevant account and submission without
        sending your password. Verification may be needed before account information
        is disclosed or changed.
      </p>

      <h2>Policy updates</h2>
      <p>
        Changes will be published on this page with an updated date. The policy
        should be reviewed if the demonstration's data handling changes.
      </p>
    </article>
  );
}
