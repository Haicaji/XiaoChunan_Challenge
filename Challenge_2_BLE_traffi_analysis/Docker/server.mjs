import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, promises as fs } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { extname, isAbsolute, join, normalize, relative as relativePath, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const VALID_USERNAME = "NISAXIAO";
const VALID_PASSWORD = "ILOVEYOU";
const DEFAULT_TTL_SECONDS = 30 * 60;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".woff2": "font/woff2"
};

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function sign(payload, secret) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createToken(username, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  const payload = base64url(JSON.stringify({ sub: username, exp: nowSeconds + DEFAULT_TTL_SECONDS }));
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyToken(token, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    return false;
  }

  const [payload, signature] = token.split(".");
  const expected = sign(payload, secret);
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
    return false;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return decoded.sub === VALID_USERNAME && Number.isFinite(decoded.exp) && decoded.exp >= nowSeconds;
  } catch {
    return false;
  }
}

function getFlag() {
  return process.env.GZCTF_FLAG || process.env.FLAG || "flag{local_test}";
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body)
  });
  response.end(body);
}

function sendText(response, status, text) {
  response.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(text)
  });
  response.end(text);
}

function readJson(request, limit = 16384) {
  return new Promise((resolveJson, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > limit) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolveJson(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    request.on("error", reject);
  });
}

function safeStaticPath(distDir, pathname) {
  const decoded = decodeURIComponent(pathname);
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const resolved = resolve(distDir, normalize(relative));
  const root = resolve(distDir);
  const diff = relativePath(root, resolved);
  return diff === "" || (!diff.startsWith("..") && !isAbsolute(diff)) ? resolved : null;
}

async function serveStatic(request, response, distDir) {
  const url = new URL(request.url, "http://localhost");
  const pathname = url.pathname;
  let filePath = safeStaticPath(distDir, pathname);

  if (!filePath) {
    sendText(response, 403, "Forbidden");
    return;
  }

  try {
    const stats = await fs.stat(filePath);
    if (stats.isDirectory()) {
      filePath = join(filePath, "index.html");
    }
  } catch {
    filePath = pathname.includes(".") ? filePath : join(distDir, "index.html");
  }

  if (!existsSync(filePath)) {
    sendText(response, 404, "Not found");
    return;
  }

  const type = MIME_TYPES[extname(filePath)] || "application/octet-stream";
  response.writeHead(200, {
    "Content-Type": type,
    "Cache-Control": extname(filePath) === ".html" ? "no-cache" : "public, max-age=31536000, immutable"
  });
  createReadStream(filePath).pipe(response);
}

export function createServer(options = {}) {
  const localDistDir = existsSync(join(__dirname, "dist"))
    ? join(__dirname, "dist")
    : join(__dirname, "..", "Web", "dist");
  const distDir = options.distDir || process.env.STATIC_DIR || localDistDir;
  const sessionSecret = options.sessionSecret || process.env.SESSION_SECRET || randomBytes(32).toString("hex");

  return createHttpServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://localhost");

    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
      });
      response.end();
      return;
    }

    try {
      if (request.method === "GET" && url.pathname === "/healthz") {
        sendJson(response, 200, { ok: true });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/login") {
        const body = await readJson(request);
        const authenticated = body.username === VALID_USERNAME && body.password === VALID_PASSWORD;
        sendJson(response, 200, {
          authenticated,
          token: authenticated ? createToken(VALID_USERNAME, sessionSecret) : null
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/unlock") {
        const auth = request.headers.authorization || "";
        const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
        const authorized = verifyToken(token, sessionSecret);
        sendJson(response, 200, {
          authorized,
          flag: authorized ? getFlag() : null
        });
        return;
      }

      if (url.pathname.startsWith("/api/")) {
        sendJson(response, 404, { error: "not_found" });
        return;
      }

      if (request.method !== "GET" && request.method !== "HEAD") {
        sendText(response, 405, "Method not allowed");
        return;
      }

      await serveStatic(request, response, distDir);
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : "bad_request" });
    }
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const port = Number(process.env.PORT || 3000);
  createServer().listen(port, "0.0.0.0", () => {
    console.log(`BLE Unlock Challenge listening on :${port}`);
  });
}
