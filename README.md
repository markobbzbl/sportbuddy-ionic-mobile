# SportBuddy – Train Together

**SportBuddy** ist eine mobile App (Ionic + Angular), mit der Sportler Trainings anbieten und an bestehenden Sessions teilnehmen können. Ziel ist es, Sportpartner in der Nähe schnell und unkompliziert zu finden – egal ob Tennis, Fitness, Laufen oder Teamsport.

## Features

- **Trainings erstellen:** Ort, Zeit, Sportart und Teilnehmerlimit festlegen  
- **An Trainings teilnehmen:** Offene Trainings in der Nähe entdecken und direkt beitreten  
- **Benutzerprofil:** Eigene Sportarten, Level und Interessen verwalten  
- **Mobile & PWA:** Läuft als Android-App und Progressive Web App  
- **Supabase Backend:** Authentifizierung, Datenbank & Realtime

## Tech Stack

- **Frontend:** Angular + Ionic  
- **Backend:** Supabase (Postgres, Auth, Realtime)  
- **Build:** Capacitor für iOS/Android

## Ziel

Sportler schneller verbinden, spontane Trainings ermöglichen und den organisatorischen Aufwand minimieren.

---

## Start

```bash
npm install
ionic serve

## Start --> Emulator & APK

**Emulator**: 
```bash
npm install
ionic build
ionic cap sync android

--> Dann in Android Studio Emulator starten und runnen

**APK**:
--> Emulator öffnen oder pysisches Devie anbinden, und APK File per drag'n'drop installieren


