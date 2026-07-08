# Cristina & Matthew Wedding Room Block

This site now submits room requests directly from the page to a small server endpoint. Guests do not need to open their email app.

## Email Setup

Recommended for Render: use an HTTPS email provider such as Resend. This avoids SMTP ports, which may time out on hosted services.

```text
RESEND_API_KEY=<Resend API key>
RESEND_FROM=Room Block <your verified sender address>
MAIL_TO=calendar.matt.cris@gmail.com
PORT=4177
```

Fallback SMTP settings are also supported:

Create a server environment with these variables:

```text
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=calendar.matt.cris@gmail.com
SMTP_PASS=<Gmail app password>
MAIL_TO=calendar.matt.cris@gmail.com
PORT=4177
```

Use a Gmail app password for `SMTP_PASS`; do not put the password into any file that will be shared publicly.

## Run

```bash
npm start
```

Then open:

```text
http://127.0.0.1:4177/
```

## Deploy Publicly on Render

1. Push this folder to a GitHub repository.
2. In Render, create a new Web Service and connect the GitHub repository.
3. Use these settings:
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Add these environment variables in Render:
   - `RESEND_API_KEY`: your Resend API key
   - `RESEND_FROM`: your verified Resend sender address
   - `MAIL_TO`: `calendar.matt.cris@gmail.com`
5. Deploy. Render will give you a public `onrender.com` URL.
