# Upskill Airy accounts and cloud profiles

Upskill Airy uses Firebase Authentication for email/password accounts and Cloud Firestore for per-user profiles and diary entries. A profile contains the user's nickname and progress settings; diary entries live in that user's `proofs` subcollection. The account dialog supports sign-in, sign-up with a nickname, email verification, password reset, sign-out, and explicit import of local data.

The website itself is hosted on Vercel. Firebase App Hosting is not required and would require the paid Blaze plan. Firebase Authentication (email/password) and one default Firestore database can be used on the no-cost Spark plan within its quotas.

## Server-side RPG writes and Firestore rules

The authenticated Next.js routes `/api/rpg/practice`, `/api/rpg/practice/[eventId]`, `/api/rpg/quests`, `/api/rpg/quests/generate`, `/api/rpg/skills/generate`, and `/api/rpg/share` are the only writers for practice history, calculated RPG summaries, quest mutations, achievement ledgers, and social-share counts. They verify Firebase ID tokens and perform RPG writes with the Admin SDK. Gemini skill-tree and quest generation return suggestions only; skill drafts are schema-checked and quest suggestions go through the quest mutation route, which independently validates them. The browser can read its own proof history and edit ordinary profile preferences, but Firestore rules reject direct practice or server-managed reward writes. `/api/mika-chat` uses the Admin SDK's shared Firestore rate limiter in production; authenticated chats are limited per account and guest chats per hashed proxy IP.

The server routes are enabled only when a private Admin credential is configured:

1. Create a service account for the existing Firebase project. Grant only the Firestore data access required by the route (Cloud Datastore User); do not use a project-owner key.
2. Put the complete service-account JSON in a private environment variable named `FIREBASE_SERVICE_ACCOUNT_JSON` in local `.env.local` and the Vercel Production environment. The production Mika endpoint and AI generation endpoints require this credential for authentication and shared rate limiting; without it, these APIs fail closed. Add `GEMINI_API_KEY` as a separate private environment variable for Mika, skill-tree generation, and AI quest generation. Do not use a `NEXT_PUBLIC_*` name, commit credentials, or paste them into chat.
   Keep the downloaded JSON outside the repository and copy its contents into the environment variable. `.vercelignore` also excludes `.env*` files and common Firebase service-account JSON filenames as a second guard for CLI uploads.
3. Redeploy and confirm signed-in practice creation, edit/delete, local-data import, and sharing work through the server routes.

4. Publish the repository's `firestore.rules`. The checked-in `firebase.json` points the Firebase CLI to that rules file, and `.firebaserc` selects the existing `upskillairy` project. After signing in to Firebase CLI with `firebase login`, run `firebase deploy --only firestore:rules` from the repository root. This replaces the rules currently published in Firestore, so review the file first. Until deployment, the live database continues using its existing rules. Once published, users need the Admin credential configured for practice, import, and share counters; ordinary profile preferences still save directly under owner-only rules.

## One-time Firebase setup

1. Open the existing Firebase project and its registered **Web app**. Do not create a second project or enable Firebase App Hosting.
2. In **Authentication → Sign-in method**, enable **Email/Password**.
3. In **Authentication → Settings → Authorized domains**, include `localhost` for local development and the public Upskill Airy Airy domain. Extra aliases may be needed for email action links or redirect-based providers.
4. Open **Firestore Database**. If no database exists, create the default database on the Spark plan. In its **Rules** tab, publish the contents of this repository's `firestore.rules` file after the server routes and Admin credential are deployed. The rules limit reads and profile edits to the signed-in user's UID, prohibit client proof writes, and reserve reward ledgers for the server.
5. Put the Web app configuration values into the local `.env.local` and Vercel's Production environment using these names:

   ```dotenv
   NEXT_PUBLIC_FIREBASE_API_KEY=...
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
   NEXT_PUBLIC_FIREBASE_APP_ID=...
   NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=...
   ```

   The site exposes only these public Firebase web identifiers through `/api/firebase-config`. Never put a service-account private key or admin credential in a `NEXT_PUBLIC_*` variable or browser code.

6. Redeploy after changing Vercel environment variables. Open `/upskill.html` and create an account with a nickname. The site also offers sign-in, password reset, verification email resend, and sign-out. Nickname changes are available from **Награды → Твой профиль**.
7. Local browser data stays on that device unless the signed-in user explicitly selects **Перенести локальные данные**. Import is only offered for a new, empty cloud profile. Each practice entry is submitted through the server and its XP is recalculated from the current rules; if a server request fails partway through, already accepted entries remain imported and can be retried safely by event ID.

The app stores profiles at `data/users/{uid}/profile` and diary entries in that profile's `proofs` subcollection. Existing local records remain on the current device until the signed-in user explicitly chooses **Перенести локальные данные**. Import is allowed only into an empty account to avoid overwriting cloud progress.

Firebase's free quotas apply. The free Spark plan does not require a billing account; exceeding the free quota may temporarily pause usage of that Firebase product until the next cycle. Uploaded evidence images currently stay embedded in their individual diary documents, so keep each entry reasonably small; Firestore documents have a 1 MiB limit.
