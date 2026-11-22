# Upskill Airy

A personal skills journal that turns learning into a steady, visible habit. Set goals, keep a practice log, build activity streaks, and review progress with Mika, the in-app learning companion.

<p align="center">
  <a href="https://airi-upskill.vercel.app"><img src="public/icons/airy-192.png" alt="Upskill Airy icon" width="104" /></a>
</p>

<p align="center"><a href="https://airi-upskill.vercel.app">Open the live app</a></p>

## Product preview

<p align="center">
  <img src="public/images/airy/mika-hero.webp" alt="Mika, the Upskill Airy learning companion" width="680" />
</p>

## Highlights

- Visual goal tree for organizing skills and milestones
- Practice history, progress streaks, and achievements
- Mika learning companion and daily recommendations
- Responsive interface for desktop and mobile
- Local progress storage with optional Firebase account sync

## Built with

Next.js · React · Firebase · JavaScript

## Run locally

Use a Node.js version compatible with the project, then run:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The main learning interface is also available at `/upskill.html`.

## Firebase setup

Firebase account sync and the Mika chat require environment configuration. Follow [`FIREBASE_SETUP.md`](./FIREBASE_SETUP.md) and keep `.env.local` out of Git. Firebase web config values are client identifiers; secure data access with Firebase Authentication and Firestore rules. Never commit service-account credentials or private keys.

## Production

Create a production build with `npm run build`. The project is configured for deployment on Vercel.

Live app: https://airi-upskill.vercel.app
