# StatiCrypt Password Protection

## Problem
The current password gate is client-side only. The full app source and stock data are visible to anyone who views the HTML source.

## Solution
Use StatiCrypt (robinmoisson/staticrypt) to AES-256 encrypt `index.html` so content is truly inaccessible without the lab password.

## Changes

1. **Add `package.json`** with `staticrypt` as a dev dependency and an `npm run encrypt` script.
2. **Remove in-app password gate** — remove the `password` mode from `PinLock`. StatiCrypt handles access control. User-select + PIN flow remains.
3. **Encrypted output** — StatiCrypt generates an encrypted file in `dist/` for deployment. Source `index.html` stays unencrypted for development.
4. **Remember me** — StatiCrypt's built-in "remember me" feature so users don't re-enter the password every visit.

## Workflow
Edit `index.html` -> `npm run encrypt` -> deploy `dist/index.html`.
