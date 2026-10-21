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

Pins, photos and tracks are stored **only on your phone**. Use Layers → Back up now and then, and keep the file somewhere safe. Export GPX if you want your pins in other mapping apps.

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
