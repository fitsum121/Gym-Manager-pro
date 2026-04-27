import express, { type Express } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
// In production, only origins listed in ALLOWED_ORIGINS (comma-separated) are
// permitted. In development (NODE_ENV !== "production") all origins are allowed
// so local tooling and the Expo dev client work without extra config.
//
// The React Native mobile app doesn't go through CORS (it's not a browser),
// but the admin panel at /api/admin is browser-based, so this matters.
//
// Example .env entry:
//   ALLOWED_ORIGINS=https://admin.yourdomain.com,https://yourdomain.com
// ---------------------------------------------------------------------------
const isProduction = process.env.NODE_ENV === "production";

const allowedOrigins: Set<string> = new Set(
  (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
);

app.use(
  cors({
    origin: isProduction
      ? (origin, callback) => {
          // Allow requests with no Origin header (e.g. mobile apps, curl, server-to-server).
          if (!origin) return callback(null, true);
          if (allowedOrigins.has(origin)) return callback(null, true);
          callback(new Error(`CORS: origin '${origin}' is not allowed.`));
        }
      : true, // allow all origins in development
    credentials: true,
  }),
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------
// Auth endpoints get a tight limit — 10 attempts per 15 min per IP.
// This makes brute-forcing passwords and PINs impractical.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again in 15 minutes." },
  skipSuccessfulRequests: true, // only count failed attempts toward the limit
});

// General limiter for all other API routes — 200 req per minute per IP.
// Prevents scraping and accidental runaway clients without affecting normal use.
const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 200,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." },
});

app.use("/api/auth/owner/login", authLimiter);
app.use("/api/auth/owner/register", authLimiter);
app.use("/api/auth/owner/verify-identity", authLimiter);
app.use("/api/auth/owner/reset-password", authLimiter);
app.use("/api/staff/login", authLimiter);
app.use("/api", generalLimiter);

app.use("/api", router);

export default app;
