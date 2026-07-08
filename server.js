const http = require("http");
const fs = require("fs");
const path = require("path");
const tls = require("tls");
const dns = require("dns");

const PORT = Number(process.env.PORT || 4177);
const ROOT = fs.existsSync(path.join(__dirname, "outputs", "index.html"))
  ? path.join(__dirname, "outputs")
  : __dirname;
const MAIL_TO = process.env.MAIL_TO || "calendar.matt.cris@gmail.com";
const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_TIMEOUT_MS = Number(process.env.SMTP_TIMEOUT_MS || 15000);
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM;
const APP_VERSION = "2026-07-07-resend-email-v3";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 100_000) {
        req.destroy();
        reject(new Error("Request body too large."));
      }
    });

    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sanitizeHeader(value) {
  return String(value || "").replace(/[\r\n]/g, " ").trim();
}

function smtpCommand(socket, command, expectedCode) {
  return new Promise((resolve, reject) => {
    let response = "";

    function cleanup() {
      clearTimeout(timeout);
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("timeout", onTimeout);
    }

    function onError(error) {
      cleanup();
      reject(error);
    }

    function onTimeout() {
      cleanup();
      reject(new Error(`SMTP command timed out: ${command || "connect"}`));
    }

    const timeout = setTimeout(onTimeout, SMTP_TIMEOUT_MS);

    function onData(chunk) {
      response += chunk.toString("utf8");

      if (!/\r?\n$/.test(response)) {
        return;
      }

      const lines = response.trimEnd().split(/\r?\n/);
      const lastLine = lines[lines.length - 1] || "";

      if (/^\d{3}-/.test(lastLine)) {
        return;
      }

      cleanup();
      const code = Number(lastLine.slice(0, 3));

      if (code === expectedCode || (Array.isArray(expectedCode) && expectedCode.includes(code))) {
        resolve(response);
        return;
      }

      reject(new Error(`SMTP command failed: ${command || "connect"} -> ${response}`));
    }

    socket.on("data", onData);
    socket.on("error", onError);
    socket.on("timeout", onTimeout);

    if (command) {
      socket.write(`${command}\r\n`);
    }
  });
}

async function sendEmail({ details, formattedEmail }) {
  if (RESEND_API_KEY) {
    await sendEmailWithResend({ details, formattedEmail });
    return;
  }

  await sendEmailWithSmtp({ details, formattedEmail });
}

async function sendEmailWithResend({ details, formattedEmail }) {
  if (!RESEND_FROM) {
    throw new Error("RESEND_FROM must be configured when RESEND_API_KEY is used.");
  }

  const contactName = sanitizeHeader(details["Primary contact name"]);
  const contactEmail = sanitizeHeader(details.Email);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [MAIL_TO],
      reply_to: contactName ? `${contactName} <${contactEmail}>` : contactEmail,
      subject: "Wedding Room Block Request - Cristina & Matthew",
      text: formattedEmail,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Resend email failed: ${response.status} ${errorBody}`);
  }
}

async function sendEmailWithSmtp({ details, formattedEmail }) {
  if (!SMTP_USER || !SMTP_PASS) {
    throw new Error("SMTP_USER and SMTP_PASS must be configured on the server.");
  }

  const contactName = sanitizeHeader(details["Primary contact name"]);
  const contactEmail = sanitizeHeader(details.Email);
  const subject = "Wedding Room Block Request - Cristina & Matthew";
  const message = [
    `From: ${sanitizeHeader(SMTP_USER)}`,
    `To: ${sanitizeHeader(MAIL_TO)}`,
    `Reply-To: ${contactName ? `${contactName} <${contactEmail}>` : contactEmail}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    formattedEmail,
  ].join("\r\n");

  const socket = tls.connect({
    host: SMTP_HOST,
    port: SMTP_PORT,
    servername: SMTP_HOST,
    timeout: SMTP_TIMEOUT_MS,
    lookup: (hostname, options, callback) => {
      dns.lookup(hostname, { ...options, family: 4 }, callback);
    },
  });

  socket.setTimeout(SMTP_TIMEOUT_MS);

  try {
    await smtpCommand(socket, null, 220);
    await smtpCommand(socket, `EHLO ${SMTP_HOST}`, 250);
    await smtpCommand(socket, "AUTH LOGIN", 334);
    await smtpCommand(socket, Buffer.from(SMTP_USER).toString("base64"), 334);
    await smtpCommand(socket, Buffer.from(SMTP_PASS).toString("base64"), 235);
    await smtpCommand(socket, `MAIL FROM:<${sanitizeHeader(SMTP_USER)}>`, 250);
    await smtpCommand(socket, `RCPT TO:<${sanitizeHeader(MAIL_TO)}>`, [250, 251]);
    await smtpCommand(socket, "DATA", 354);
    await smtpCommand(socket, `${message.replace(/\r?\n\./g, "\r\n..")}\r\n.`, 250);
    await smtpCommand(socket, "QUIT", 221);
  } finally {
    socket.end();
  }
}

function formatReservationEmail(details) {
  return `Cristina & Matthew Wedding Room Block Request

Wedding date: April 17, 2027
Resort: Armony Marival Resort & Spa - MGallery Punta de Mita

Primary contact
- Name: ${details["Primary contact name"]}
- Email: ${details.Email}
- Phone: ${details.Phone}

Stay details
- Check-in date: ${details["Check-in date"]}
- Check-out date: ${details["Check-out date"]}
- Number of rooms: ${details["Number of rooms"]}
- Number of adults: ${details["Number of adults"]}
- Number of minors ages 7-12: ${details["Number of minors ages 7-12"]}
- Preferred room category: ${details["Preferred room category"]}

Guest names per room
${details["Guest names per room"]}

Notes
${details.Notes || "None provided"}

Consent
Guest confirmed that this information may be shared with the resort for reservation purposes and understands no reservation is confirmed until the resort confirms availability and the guest completes payment directly with the resort.`;
}

async function handleRoomRequest(req, res) {
  try {
    const body = await readRequestBody(req);
    const payload = JSON.parse(body);
    const details = payload.details || {};
    const formattedEmail = formatReservationEmail(details);

    if (!details["Primary contact name"] || !details.Email || !details.Phone || !details["Guest names per room"]) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Missing required reservation details." }));
      return;
    }

    await sendEmail({ details, formattedEmail });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  } catch (error) {
    console.error(error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "Unable to send request." }));
  }
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestedPath = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
  const filePath = path.join(ROOT, requestedPath);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, buffer) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    res.writeHead(200, { "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream" });
    res.end(buffer);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        version: APP_VERSION,
        emailProvider: RESEND_API_KEY ? "resend" : "smtp",
        resendConfigured: Boolean(RESEND_API_KEY && RESEND_FROM),
        smtpConfigured: Boolean(SMTP_USER && SMTP_PASS),
        mailToConfigured: Boolean(MAIL_TO),
      })
    );
    return;
  }

  if (req.method === "POST" && req.url === "/api/room-request") {
    handleRoomRequest(req, res);
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    serveStatic(req, res);
    return;
  }

  res.writeHead(405);
  res.end("Method not allowed");
});

server.listen(PORT, () => {
  console.log(`Wedding room block site listening at http://127.0.0.1:${PORT}`);
});
