# Greylock: Massachusetts hunting map

A personal web app for your phone: property owners, public land, pins, tracks, wind, legal light and seasons. Installs to your home screen and keeps working with no signal in areas you save.

## Put it online (one time, about 10 minutes)

The app is a folder of static files. It needs an **HTTPS** address, because phones only allow GPS and offline mode on secure sites.

**GitHub Pages (free, easiest)**
1. Create a free account at github.com, then a new public repository named `greylock`.
2. Choose "uploading an existing file" and drag in everything in this folder (keep the `fonts`, `icons` and `vendor` folders).
3. Go to Settings → Pages, set the source to the `main` branch and `/ (root)`, and save.
4. After a minute or two the app is live at `https://YOUR-USERNAME.github.io/greylock/`.

**Your own server instead:** copy the folder to any web server with HTTPS (nginx, Apache, Hostinger). No server code is needed.

## Install on your phone

- **iPhone:** open the address in Safari, tap Share, then "Add to Home Screen". Always open Greylock from that icon.
- **Android:** open it in Chrome and tap "Install app" (or menu → Add to Home screen).

Allow location when asked. For the heading arrow, turn on Compass in the Layers panel.

## Turn on accounts and group sharing (one time, about 15 minutes)

Accounts let your group share pins and see each other on the map. It runs on Google Firebase's free plan; no credit card needed. Skip this section and Greylock works exactly as before, with everything stored on the phone.

1. Go to **console.firebase.google.com**, sign in with a Google account, and click **Create a project**. Name it `greylock`. You can turn Google Analytics off.
2. In the left menu open **Build → Authentication → Get started**. Under **Sign-in method**, choose **Email/Password**, switch it on, and save.
3. Open **Build → Firestore Database → Create database**. Pick a US location and choose **production mode**.
4. In Firestore, open the **Rules** tab, delete what's there, paste the contents of `firestore.rules` from this folder, and click **Publish**. These rules are what keep your group's pins and locations private.
5. Click the gear icon → **Project settings**. Under **Your apps**, click the web icon `</>`, name it `Greylock`, and register it (skip Firebase Hosting). Copy the `apiKey`, `authDomain`, `projectId` and `appId` values into `firebase-config.js`.
6. Back in **Authentication → Settings → Authorized domains**, add your site's domain (for example `your-username.github.io`).
7. Upload the updated `firebase-config.js`. Open Greylock twice so phones pick up the change.

**Starting your group:** tap the people button on the map, create your account, then **Create** a group. Send the 8-character invite code to your family and hunting buddies. They install Greylock, create their own accounts, and enter the code. Once everyone's in, you can switch on **Lock the group** so the code stops working for anyone new.

**How sharing works**
- Pins are shared with the group by default. Turn off "Share with" on any pin to keep it private. Only the person who made a shared pin, or the group owner, can change or delete it.
- **Share my location** is off until you turn it on. It switches itself off an hour after legal light ends (or three hours after you start, if you turn it on after dark).
- A home-screen web app can only send your location while it's open on screen. If your phone is locked, the group sees your last spot and how long ago it was. For safety, keep Find My or Google Maps sharing on as a backup.
- Pin photos are shrunk and stored with the pin, because Firebase's file storage now requires a paid plan.
- The free plan allows 50,000 reads and 20,000 writes a day. A group of 5 sharing all day uses well under half.

## Before every trip

Open **Layers → Save this view for offline** while you still have signal. Frame the area you'll hunt first; the save covers the whole screen. "Detailed" is right for most trips. This saves the map tiles plus owner and public-land details, so tapping a parcel still works with no service.

## How it works

| Feature | Source |
| --- | --- |
| Property lines and owners | MassGIS Level 3 assessor parcels (updated by MassGIS) |
| Public and conservation land | EEA Protected and Recreational Open Space |
| Aerial imagery | MassGIS 2025 statewide imagery |
| Topo and LiDAR hillshade | MassGIS basemap and LiDAR shaded relief; USGS National Map |
| Wildlife Management Zones | MassWildlife |
| Wind and forecast | Open-Meteo (no account needed) |
| Sun, moon, legal light | Calculated on the phone with SunCalc |
| Accounts, shared pins, live locations | Google Firebase (free Spark plan) |

Without an account, pins, photos and tracks are stored **only on your phone**. Use Layers → Back up now and then. With an account they sync to Firebase, and your phone keeps a copy so everything works with no signal. Export GPX if you want your pins in other mapping apps.

## Each new season

1. Open `seasons.js` and add the new dates to each season's `ranges`. Update `checked` and `shotgunWindows`.
2. In `sw.js`, change `VERSION` (for example `greylock-v1.1.0`) so phones pick up the change.
3. Upload both files again. The app updates the next time it's opened twice with signal.

## Known limits

- Assessor parcel lines are approximate and can be off by tens of feet. Owner records lag sales.
- Open space data doesn't say whether hunting is allowed. The app gives general guidance by owner type; confirm with the managing agency.
- The season list is a summary, not the regulations. Check MassWildlife before you hunt.
- Phones pause GPS when the screen locks, so track recording keeps the screen on by default.
- Offline saves are capped at 30,000 tiles at a time. Zoom in or lower the detail for big areas.
