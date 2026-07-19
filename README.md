# Inventory Scanner

A phone-based inventory tool for a small repair shop. Scan a part's barcode
or QR label with the phone camera and add or remove one unit of stock with a
single tap. Everything lives in a Google Sheet you already own — there is no
server to run, no app store, no account system.

```
Phone browser  ──HTTPS──▶  Google Apps Script Web App  ──▶  Google Sheet
(this page on              (runs inside YOUR Google         (tabs: Inventory,
 GitHub Pages)              account; the only part            Audit)
                            with any authority)
```

The web page holds **no credentials of any kind** — the only thing it stores
is the Web App URL you give it during setup.

---

## One-time setup (about 10 minutes)

> **First time doing anything like this?** Follow the
> **[step-by-step Setup Guide](SETUP.md)** instead — it walks through every
> click with a checkpoint after each step, including the scary-looking
> Google authorization screen and a first-scan test at the end. The short
> version below covers the same ground for people comfortable with Google
> Sheets.

### Part 1 — The Google Sheet backend

1. Create a new Google Sheet (or open the one you want to use). Any name is
   fine. The two tabs the app needs — **Inventory** and **Audit** — are
   created automatically with the right headers the first time the app talks
   to the sheet, so you don't have to make them yourself.
2. In the sheet, open **Extensions → Apps Script**.
3. Delete whatever is in the editor and paste the full contents of
   [`apps-script/Code.js`](apps-script/Code.js) from this repository. Save
   (💾 or Ctrl/Cmd-S) and give the project a name like *Inventory Scanner*.
4. Click **Deploy → New deployment**. Choose type **Web app** and set:
   - **Execute as:** Me
   - **Who has access:** Anyone
5. Click **Deploy**, then **Authorize access** and approve with your Google
   account. (Google shows a "this app isn't verified" warning for personal
   scripts — click *Advanced → Go to … (unsafe)*. It is your own script
   running in your own account.)
6. Copy the **Web app URL** (it starts with
   `https://script.google.com/macros/s/…/exec`). That URL is the only thing
   the phone app needs.

### Part 2 — The phone app

1. On your phone, open **`https://smarkovik.github.io/inventory-manager/`**.
   (It must be this `https://` address — browsers only allow camera access on
   secure pages.)
2. Paste the Web app URL into the setup screen and tap **Test & save**. The
   app checks it is really talking to your backend before saving.
3. Add it to your home screen so it opens like an app:
   - **iPhone (Safari):** Share button → *Add to Home Screen*
   - **Android (Chrome):** ⋮ menu → *Add to Home screen*

## Everyday use

- Tap **Scan a part** and point the camera at the label. UPC/EAN retail
  barcodes, Code 128/39 labels, and QR codes all work.
- A known part shows its name and current stock with two big buttons:
  **− Remove one** and **+ Add one**. Each tap writes to the Sheet
  immediately, then the camera reopens for the next part.
- An unknown code is not an error — the app offers to add it as a new part
  with a name and starting quantity.
- The stock can never go below zero; the app tells you if there is nothing
  left to remove.
- Every change is also appended to the **Audit** tab: when, which part,
  add/remove, by how much, and the resulting quantity. The app never edits or
  deletes audit rows.

## Pointing the app at a different spreadsheet

By default the script uses the spreadsheet it is bound to. To use another
one instead:

1. In the Apps Script editor, find `const SHEET_ID = '';` near the top of the
   file and paste the target spreadsheet's ID between the quotes (the long
   token in the sheet's URL, between `/d/` and `/edit`).
2. Save, then publish the change: **Deploy → Manage deployments → ✏️ Edit →
   Version: New version → Deploy**.

That last step matters for *any* script edit: **the deployment serves a
frozen version, not the editor's code**. Editing without deploying a new
version changes nothing for the app. Redeploying an existing deployment
keeps the same URL, so the phones don't need reconfiguring.

## Optional: require a shop PIN

Out of the box, anyone who opens the app page *and* has the Web App URL can
scan and change stock. To require a PIN first:

1. Open the Sheet's script editor (**Extensions → Apps Script**).
2. Click **⚙️ Project Settings** (left sidebar) → scroll to
   **Script properties** → **Add script property**.
3. Property: `APP_PIN` — Value: your PIN (e.g. `2468`). Click
   **Save script properties**.

That's all — no redeployment needed, it takes effect immediately. Each phone
now asks for the PIN once (a lock screen before scanning) and remembers it.
Every lookup and stock write is checked by the backend, not just the app, so
the PIN can't be skipped by calling the URL directly.

To **change** the PIN, edit the property's value; phones holding the old PIN
are locked out on their next action and asked for the new one. To **remove**
the PIN requirement, delete the property.

*Honest security note:* this is one shared PIN sent over HTTPS and remembered
on each phone — right-sized for keeping a shared-workshop phone or a curious
visitor from tapping buttons, not for defending against a determined
attacker. Keeping the Web App URL private is still the main gate.

## If the Web App URL leaks

The URL is unguessable but it is the only gate, so if it ever gets out:

1. **Deploy → Manage deployments → Archive** the deployment — this kills the
   old URL immediately.
2. Create a **New deployment** (same settings) — you get a fresh URL.
3. Enter the new URL on each phone via **Backend settings**.

The Web App only exposes three operations (ping / lookup / stock write). It
cannot be used to read other tabs, formulas, files, or anything else in the
Google account.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "…deployment must be Execute as Me / access Anyone" | The URL is answering with a Google sign-in page. Redeploy the Web app with **Execute as: Me** and **Who has access: Anyone**, and use the new URL. |
| Camera never opens / no permission prompt | Make sure you opened the `https://…github.io…` address, then allow Camera in the browser's site settings. |
| "scanner library failed to load" | The phone couldn't reach either CDN — check WiFi and tap Scan again. |
| "Backend took too long" / "Could not reach the backend" | Check WiFi, then verify the URL under **Backend settings** with Test & save. |
| "Wrong PIN" / PIN screen keeps coming back | The `APP_PIN` script property was changed — enter the current PIN. If nobody set one on purpose, delete the property (see the PIN section above). |

## For developers

| Path | Purpose |
|---|---|
| `index.html` | Entire frontend: single file, no build step, hand-rolled Material Design 3 CSS, light/dark. |
| `apps-script/Code.js` | Entire backend. The same file runs in Apps Script and under Node — pure logic is exported behind a `typeof module` guard. |
| `test/backend.test.js` | Unit tests for the pure backend logic. Zero dependencies. |
| `.github/workflows/pages.yml` | Runs the tests on Node 22, then deploys the repo root to GitHub Pages (Pages is enabled automatically by the workflow). |

Run the tests with Node 18+:

```sh
npm test
```

Smoke-test a deployed backend end-to-end (expects a fresh sheet; afterwards
`TEST-001` has qty 1 and the Audit tab has exactly two rows):

```sh
URL='https://script.google.com/macros/s/…/exec'
curl -sL "$URL?action=ping"
curl -sL "$URL?action=lookup&barcode=TEST-001"
curl -sL -H 'Content-Type: text/plain;charset=utf-8' \
     -d '{"action":"create","barcode":"TEST-001","name":"Test part","startQty":0}' "$URL"
curl -sL -H 'Content-Type: text/plain;charset=utf-8' \
     -d '{"action":"adjust","barcode":"TEST-001","delta":1}' "$URL"
```

API details (GET lookup/ping, POST adjust/create, error codes, concurrency
locking, audit semantics) are documented in the comments of
[`apps-script/Code.js`](apps-script/Code.js).

## License

[MIT](LICENSE)
