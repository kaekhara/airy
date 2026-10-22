# Upskill accounts and cloud profiles

Upskill uses Firebase Authentication for email/password accounts and Cloud Firestore for per-user profiles and diary entries. A profile contains the user's nickname and progress settings; diary entries live in that user's `proofs` subcollection. The account dialog supports sign-in, sign-up with a nickname, email verification, password reset, sign-out, and explicit import of local data.

The website itself is hosted on Vercel. Firebase App Hosting is not required and would require the paid Blaze plan. Firebase Authentication (email/password) and one default Firestore database can be used on the no-cost Spark plan within its quotas.

## One-time Firebase setup

1. Open the existing Firebase project and its registered **Web app**. Do not create a second project or enable Firebase App Hosting.
2. In **Authentication → Sign-in method**, enable **Email/Password**.
3. In **Authentication → Settings → Authorized domains**, include `localhost` for local development and the public Upskill domain. Extra aliases may be needed for email action links or redirect-based providers.
4. Open **Firestore Database**. If no database exists, create the default database on the Spark plan. In its **Rules** tab, publish the contents of this repository's `firestore.rules` file before users start saving data; the rules restrict each account to its own UID path.
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
7. Local browser data stays on that device unless the signed-in user explicitly selects **Перенести локальные данные**. Import is only offered for a new, empty cloud profile so existing progress is not overwritten.

The app stores profiles at `data/users/{uid}/profile` and diary entries in that profile's `proofs` subcollection. Existing local records remain on the current device until the signed-in user explicitly chooses **Перенести локальные данные**. Import is allowed only into an empty account to avoid overwriting cloud progress.

Firebase's free quotas apply. The free Spark plan does not require a billing account; exceeding the free quota may temporarily pause usage of that Firebase product until the next cycle. Uploaded evidence images currently stay embedded in their individual diary documents, so keep each entry reasonably small; Firestore documents have a 1 MiB limit.
