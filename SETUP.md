# Setup Guide — every step, every click

This guide sets up the Inventory Scanner from nothing. It takes about
10–15 minutes, you only do it once, and you can't break anything — every
step can be redone.

**What you need:**

- A Google account (a normal free Gmail account is fine).
- A computer with a web browser (for Part 1–3 — it's easier than on a phone).
- Your phone (for Part 4).
- Both on the shop WiFi.

---

## Part 1 — Create the Google Sheet (2 minutes)

The Sheet is where your inventory lives. You'll always be able to open it
and look at your stock like a normal spreadsheet.

1. On the computer, go to **[sheets.google.com](https://sheets.google.com)**
   and sign in with your Google account.
2. Click the big **+ Blank spreadsheet** (top left).
3. Click the name **"Untitled spreadsheet"** in the top-left corner and type
   a name you'll recognize, for example **Shop Inventory**. It saves by
   itself — there is no Save button in Google Sheets.

> ✅ **Checkpoint:** you're looking at an empty spreadsheet named
> *Shop Inventory*.
>
> You do **not** need to create any tabs or column headers. The app creates
> the tabs it needs — **Inventory**, **Audit**, and **Users** — with the
> right headers all by itself the first time it's used.

---

## Part 2 — Add the script to the Sheet (3 minutes)

The script is a small program that lives *inside* your Sheet and does the
reading and writing for the phone app.

1. First, copy the script code. Open this link:
   **[apps-script/Code.js](https://github.com/smarkovik/kiroki/blob/main/apps-script/Code.js)**
2. On that page, click the **copy button** (two overlapping squares 📋, top
   right of the code area). The whole file is now on your clipboard.
3. Go back to your spreadsheet. In the menu bar at the top, click
   **Extensions**, then **Apps Script**.

   A new browser tab opens with a code editor. It already contains a few
   lines that look like:

   ```
   function myFunction() {
   }
   ```

4. Click anywhere inside that code, select all of it
   (**Ctrl+A** on Windows, **⌘A** on Mac), and delete it.
5. Paste the copied code (**Ctrl+V** / **⌘V**).
6. Click the **💾 Save** icon in the toolbar (or press **Ctrl+S** / **⌘S**).
7. At the top left it says **Untitled project** — click it and rename it to
   **Inventory Scanner**, then click **Rename**.

> ✅ **Checkpoint:** the editor shows code whose first lines mention
> *"Inventory Scanner — Google Apps Script backend"*, and the project is
> named *Inventory Scanner*.

---

## Part 3 — Publish the script as a Web App (4 minutes)

This step gives the script a private web address the phone app will talk to.

1. Still in the Apps Script tab, click the blue **Deploy** button
   (top right), then **New deployment**.
2. In the window that opens, click the **⚙️ gear icon** next to
   *"Select type"* and choose **Web app**.
3. Fill in the three fields exactly like this:

   | Field | What to choose |
   |---|---|
   | Description | anything, e.g. `first version` |
   | **Execute as** | **Me (your email)** |
   | **Who has access** | **Anyone** |

   ⚠️ These two settings matter. *Execute as: Me* means the script uses
   **your** permission to edit **your** sheet. *Who has access: Anyone*
   means the phone app can call it without logging in. Nobody can see or
   edit your spreadsheet through it — the script only answers three narrow
   questions about parts and stock.

4. Click **Deploy**.
5. Google now asks for permission — this part looks scary but is normal:
   1. Click **Authorize access**.
   2. Pick your Google account.
   3. You'll likely see a warning screen: **"Google hasn't verified this
      app"**. That warning appears for *every* personal script anyone
      writes — it is your own script, running in your own account.
   4. Click the small **Advanced** link (bottom left), then
      **Go to Inventory Scanner (unsafe)**.
   5. Click **Allow**.
6. You now see **"Deployment successfully updated"** with a **Web app URL**
   that starts with `https://script.google.com/macros/s/…`.
7. Click **Copy** next to that URL, and paste it somewhere you can reach
   from your phone — e.g. email it to yourself or put it in a note.
8. Click **Done**. You can close the Apps Script tab.

> ✅ **Checkpoint:** you have a long link starting with
> `https://script.google.com/macros/s/` saved where your phone can get it.
>
> **Optional proof it works:** paste the link into any browser tab with
> `?action=ping` added to the end. You should see:
> `{"ok":true,"app":"inventory-scanner"}`

---

## Part 4 — Set up the phone (3 minutes)

1. On the phone, open the browser (Safari on iPhone, Chrome on Android) and
   go to:

   **`https://smarkovik.github.io/kiroki/`**

   It must be this address — the camera only works on a secure (`https`)
   page.
2. The app opens on a screen titled **"Connect your Google Sheet"**.
   Paste the Web App URL from Part 3 into the box.
3. Tap **Test & save**. The app calls your script to make sure the link is
   right before saving it. If something's off, it tells you exactly what to
   fix (see [Troubleshooting](README.md#troubleshooting)).
   *(If you set up users & PINs — Part 6 below — the app asks you to sign
   in with your PIN here. Type it once; the phone remembers you.)*
4. You land on the home screen with a big **Scan a part** button. The chip
   in the top corner should say **Connected**.
5. Make it feel like a real app — add it to the home screen:
   - **iPhone (Safari):** tap the **Share** button (square with an arrow),
     scroll down, tap **Add to Home Screen**, then **Add**.
   - **Android (Chrome):** tap the **⋮ menu** (top right), tap
     **Add to Home screen**, then **Add**.

> ✅ **Checkpoint:** a *Kiroki* icon is on the phone's home screen, and
> opening it shows **Scan a part** with a **Connected** chip.

---

## Part 5 — First scan: prove the whole thing works (2 minutes)

1. Grab any item with a barcode (a part, or literally anything — a soda can
   works for testing).
2. Tap **Scan a part**. The first time, the browser asks to use the camera —
   tap **Allow**.
3. Point the camera at the barcode. The phone buzzes when it reads it.
4. The code isn't in your inventory yet, so the app shows **New part**.
   Type a name (e.g. `Test item`), leave the quantity at 1, tap
   **Add part**.
5. The part card shows **1 in stock**. Tap **+ Add one** — it becomes 2 and
   the camera reopens by itself for the next part. Scan the same item
   again and tap **− Remove one**.
6. Now open your **Shop Inventory** spreadsheet on the computer:
   - The **Inventory** tab has your test item with the current quantity.
   - The **Audit** tab lists every single add/remove with date and time.

> ✅ **Checkpoint:** the numbers on the phone and in the spreadsheet match.
> You're done — the shop is running on it from here.

If you used a throwaway test item, just delete its row on the **Inventory**
tab (right-click the row number → *Delete row*). Leave the **Audit** tab
alone — it's the history book.

---

## Part 6 — Optional: users & PINs, so the log shows who did what (2 minutes)

Skip this if it's just you and you don't care who made each change. With
users set up, everyone signs in once with their own PIN, and the **Audit**
tab records the person's name on every single add/remove.

1. Open your spreadsheet. At the bottom you'll see the tabs **Inventory**,
   **Audit**, and **Users** — they appeared when the phone first connected
   in Part 4. Click **Users**.
2. Under the headers, add one row per person: name in the **Name** column,
   their PIN in the **PIN** column. For example:

   | Name | PIN |
   |---|---|
   | Marko | 2468 |
   | Ana | 1357 |

   ⚠️ Give everyone a **different** PIN — signing in is by PIN alone, and
   the app refuses a PIN that belongs to two people.
3. That's it. Nothing to deploy, it works immediately.

From now on each phone shows a **Sign in** screen once, then remembers the
person ("Signed in as Marko" on the home screen — with a *Switch user*
button for shared phones).

Changing someone's PIN: edit the cell — they're asked to sign in again with
the new one. Removing someone: delete their row. Turning the whole thing
off: delete all the rows under the headers.

> ✅ **Checkpoint:** after a scan and a tap of **+ Add one**, the newest row
> on the **Audit** tab ends with the name of the person who did it.

---

## Later on

- **Something not working?** → the [Troubleshooting table](README.md#troubleshooting)
  in the README matches every error message to its fix.
- **Want the app to use a different spreadsheet?** →
  [Pointing the app at a different spreadsheet](README.md#pointing-the-app-at-a-different-spreadsheet).
- **Worried the Web App URL got out?** →
  [If the Web App URL leaks](README.md#if-the-web-app-url-leaks).
