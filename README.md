# InizioMail

A lightweight desktop app that sends **premium, template-based HTML emails** through your own Gmail account. Pick a template → fill structured fields → preview the exact rendering → send via the Gmail API. Not an editor, not a CRM — just fast, branded sending.

## What's inside

```
Email builder/
├── package.json
├── README.md
└── src/
    ├── main.js            Electron main: Gmail OAuth (loopback), MIME send, IPC
    ├── preload.js         Safe bridge to the renderer
    ├── templates.json     The 5 email templates + fields + HTML
    └── renderer/
        ├── index.html     One-flow UI (template grid → editor → preview → send)
        ├── styles.css     InizioWeb dark-luxury design system
        └── renderer.js    Dynamic form, placeholder replacement, live preview, send
```

## One-time setup

### 1. Install dependencies
```bash
cd "Email builder"
npm install
```

### 2. Create a Gmail OAuth client
The app sends through **your** Gmail using OAuth (no external server, token stored locally).

1. Go to <https://console.cloud.google.com/> → create/select a project.
2. **APIs & Services → Library →** enable **Gmail API**.
3. **APIs & Services → OAuth consent screen:** choose *External*, add yourself as a **Test user**. (Only the `gmail.send` scope is used.)
4. **APIs & Services → Credentials → Create credentials → OAuth client ID → Application type: Desktop app.**
5. **Download JSON.** Rename it to `credentials.json`.

### 3. Drop the credentials file in the app's data folder
When you first launch the app, if `credentials.json` is missing it tells you the exact path. Place the file there. Typical locations:

- **Windows:** `%APPDATA%\iniziomail\credentials.json`
- **macOS:** `~/Library/Application Support/iniziomail/credentials.json`
- **Linux:** `~/.config/iniziomail/credentials.json`

The login token is saved next to it as `token.json` after your first connect.

## Run
```bash
npm start
```

## Using it
1. Click **Connect Gmail** (top right) → a browser window opens for consent → returns to the app.
2. Pick a template from the grid.
3. Fill the fields — the **live preview** updates as you type.
4. **Send Preview to Me** sends a test to your own inbox. **Send Email** sends to the recipient address.
5. Toggle *Skip preview, send instantly* to go straight to send.

## Adding / editing templates
Edit `src/templates.json`. Each template:

```json
{
  "id": "unique_id",
  "name": "Display Name",
  "desc": "Short card description",
  "icon": "◈",
  "subject": "Subject with {{placeholder}}",
  "fields": [
    { "key": "recipient_name", "label": "Recipient Name", "placeholder": "John" },
    { "key": "message", "label": "Your Message", "type": "textarea" }
  ],
  "html": "<div>Hello {{recipient_name}} ... {{message}}</div>"
}
```

`{{key}}` placeholders in `subject` and `html` are replaced with field values automatically. Use `"type": "textarea"` for multi-line fields.

## Notes
- Uses the minimal `gmail.send` scope — the app can send, not read, your mail.
- Everything runs locally; tokens never leave your machine.
- Emails are sent as `text/html`, base64 MIME, so they render cleanly in Gmail.
