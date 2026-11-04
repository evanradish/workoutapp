# Workout app

A phone-friendly web app for your BetterMe workouts: 411 workouts across 14 libraries, BetterMe's own exercise photos, guided timers, and a history of what you've done.

## Running it

- **On your Mac:** double-click `start.command`. It opens the app at http://localhost:8123. (First time only: if macOS blocks it, right-click it and choose Open.)
- **On your phone:** while `start.command` is running, open the "Phone" address it prints (same Wi-Fi). In Safari, tap Share > Add to Home Screen. After the first load it works offline, so you can use it at the gym.
- You can also just open `index.html` in a browser, but offline mode and the home-screen install need the server.

## How timing works

- **Calisthenics** (28 workouts plus your plan's Day 1) use BetterMe's exact times, rounds and left/right sides, with a 15s rest after each main exercise.
- **All other libraries** only list exercises, so each move runs 40s with 20s rest, and warm-up/cool-down moves run 30s.
- Change any of this in **Settings**. Tai chi sessions have no exercise list, so they run as a single timer.

## Tracking

Finished (or partly finished) workouts are saved in the browser on that device. History shows your streak, this week's count, a 5-week calendar and every session. Use **Settings > Export history** to back it up or move it to another device. Your Mac and phone each keep their own history.

## Files

- `index.html`, `styles.css`, `app.js`: the app
- `data.js`: all workouts and exercises, built from your two BetterMe docs
- `img/`: exercise photos (127 exercises from "Calisthenics with equipment" had no photo in the docs and show a placeholder)
- `sw.js`, `manifest.webmanifest`, `icon-*.png`: offline support and home-screen icon

## Google TV app

The `android` folder wraps this same app as a Google TV (Android TV) app. On the TV it runs in TV mode: big layout, the remote's arrow keys move between buttons, OK presses, Back goes back (and asks before ending a workout), and the play/pause key pauses. The screen stays on and the voice cues use the TV's speech engine.

**Building it.** The GitHub workflow in `.github/workflows/tv-app.yml` builds `workouts-tv.apk` on every push to `main` and publishes it as the "latest" release. To build locally instead, install Android Studio and open the `android` folder, or run `./gradlew assembleRelease` inside `android`.

**Installing it on the TV (one time).**
1. On the TV: Settings > System > About, then press OK on "Android TV OS build" 7 times to turn on developer mode.
2. Install the free **Downloader** app (by AFTVnews) from the Play Store on the TV.
3. Settings > Apps > Security & restrictions > Unknown sources: turn on Downloader.
4. Open Downloader and enter the APK link (`https://github.com/<you>/<repo>/releases/latest/download/workouts-tv.apk`). Install when asked.
5. "Workouts" appears in your apps row. To update later, repeat step 4.

History on the TV is separate from your phone and Mac, the same as any other device. Settings > TV mode turns the big-screen layout on in a regular browser too (for example when casting a Chrome tab).
