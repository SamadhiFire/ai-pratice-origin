const { ERROR_CODES } = require("./constants");
const { safeJsonParse } = require("./utils");

const DEFAULT_CORS_MAX_AGE_SECONDS = 86400;
const REQUIRED_CORS_HEADERS = ["Authorization", "Content-Type"];
const DEFAULT_DEV_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

class HttpError extends Error {
  constructor(status, code, message, data = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function appendVary(res, value) {
  const existing = splitCsv(res.getHeader("Vary"));
  if (!existing.includes(value)) {
    res.setHeader("Vary", [...existing, value].join(", "));
  }
}

function getAllowedOrigins() {
  const configuredOrigins = splitCsv(process.env.CORS_ALLOWED_ORIGINS);
  if (configuredOrigins.length > 0) {
    return configuredOrigins;
  }
  if (process.env.NODE_ENV === "production") {
    return ["*"];
  }
  return DEFAULT_DEV_ALLOWED_ORIGINS;
}

function resolveAllowedOrigin(req) {
  const requestOrigin = String(req?.headers?.origin || "").trim();
  const allowedOrigins = getAllowedOrigins();
  if (allowedOrigins.includes("*")) {
    return requestOrigin || "*";
  }
  if (!requestOrigin) {
    return allowedOrigins[0] || "*";
  }
  if (allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }
  return "";
}

function buildAllowedHeaders(req) {
  const requestedHeaders = splitCsv(req?.headers?.["access-control-request-headers"]);
  const canonicalHeaders = new Map();

  for (const header of REQUIRED_CORS_HEADERS) {
    canonicalHeaders.set(header.toLowerCase(), header);
  }
  for (const header of requestedHeaders) {
    canonicalHeaders.set(header.toLowerCase(), header);
  }

  return Array.from(canonicalHeaders.values()).join(", ");
}

function applyCors(res, req = null) {
  const allowedOrigin = resolveAllowedOrigin(req);
  if (allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  }
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS"
  );
  res.setHeader("Access-Control-Allow-Headers", buildAllowedHeaders(req));
  res.setHeader("Access-Control-Max-Age", String(DEFAULT_CORS_MAX_AGE_SECONDS));
  appendVary(res, "Origin");
  appendVary(res, "Access-Control-Request-Headers");
}

function sendJson(res, status, payload) {
  if (!res.hasHeader("Access-Control-Allow-Origin")) {
    applyCors(res);
  }
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function sendOk(res, data = {}, message = "ok", status = 200) {
  sendJson(res, status, {
    code: 0,
    message,
    data,
  });
}

function sendError(
  res,
  status = 500,
  code = ERROR_CODES.INTERNAL_ERROR,
  message = "internal error",
  data = {}
) {
  sendJson(res, status, {
    code,
    message,
    data,
  });
}

async function readBodyBuffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function parseBody(req, bodyType) {
  if (bodyType === "none") {
    return null;
  }

  const buffer = await readBodyBuffer(req);
  if (bodyType === "raw") {
    return buffer;
  }

  if (buffer.length === 0) {
    return {};
  }

  const parsed = safeJsonParse(buffer.toString("utf8"));
  if (!parsed.ok) {
    throw new HttpError(
      400,
      ERROR_CODES.BAD_REQUEST,
      "request body must be valid JSON"
    );
  }

  return parsed.value;
}

function getBearerToken(req) {
  const raw = String(req.headers.authorization || "");
  if (!raw.startsWith("Bearer ")) {
    return "";
  }
  return raw.slice("Bearer ".length).trim();
}

module.exports = {
  HttpError,
  applyCors,
  sendJson,
  sendOk,
  sendError,
  parseBody,
  getBearerToken,
};
