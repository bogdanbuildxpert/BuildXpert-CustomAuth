// Load environment variables from .env file
require("dotenv").config();

const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const express = require("express");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const axios = require("axios");
const {
  initSocketServer,
  initPgNotify,
  setupPgNotifyTriggers,
} = require("./lib/pg-notify");
const { Pool } = require("pg");

// Create database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
});

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";
const JWT_EXPIRY = "24h";

// Google OAuth config
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = `${
  process.env.FRONTEND_URL || "http://localhost:3000"
}/api/auth/google/callback`;

// Authentication middleware
const authMiddleware = (req, res, next) => {
  const token =
    req.cookies["auth-token"] || req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    console.error("Token verification error:", error.message);
    return res.status(401).json({ error: "Invalid token" });
  }
};

app.prepare().then(() => {
  // Create Express app
  const server = express();

  // Middleware
  server.use(
    cors({
      origin: process.env.FRONTEND_URL || "http://localhost:3000",
      credentials: true,
    })
  );
  server.use(express.json());
  server.use(cookieParser());

  // Create HTTP server
  const httpServer = createServer(server);

  // Initialize Socket.IO with the HTTP server
  const io = initSocketServer(httpServer);
  console.log("Socket.IO attached to HTTP server");

  // Initialize PostgreSQL LISTEN/NOTIFY
  initPgNotify()
    .then((success) => {
      if (success) {
        // Set up PostgreSQL triggers only if the initial connection was successful
        setupPgNotifyTriggers().catch((err) => {
          console.error("Error setting up PostgreSQL triggers:", err);
          console.log(
            "Continuing without database triggers. Some real-time features may not work."
          );
        });
      }
    })
    .catch((err) => {
      console.error("Error initializing PostgreSQL notifications:", err);
      console.log(
        "Continuing without real-time database updates. Some features may not work."
      );
    });

  // Google OAuth routes
  server.get("/api/auth/google", (req, res) => {
    const redirectUrl = req.query.redirectUrl || "/dashboard";

    // Store the redirect URL in a cookie
    res.cookie("oauth_redirect", redirectUrl, {
      httpOnly: true,
      maxAge: 10 * 60 * 1000, // 10 minutes
      path: "/",
    });

    // Generate Google OAuth URL
    const googleAuthUrl = "https://accounts.google.com/o/oauth2/v2/auth";
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: "email profile",
      access_type: "offline",
      prompt: "consent",
    });

    res.redirect(`${googleAuthUrl}?${params.toString()}`);
  });

  server.get("/api/auth/google/callback", async (req, res) => {
    const { code } = req.query;
    const redirectUrl = req.cookies.oauth_redirect || "/dashboard";

    // Clear the redirect cookie
    res.clearCookie("oauth_redirect", { path: "/" });

    if (!code) {
      return res.redirect("/login?error=OAuth%20failed");
    }

    try {
      // Exchange code for tokens
      const tokenResponse = await axios.post(
        "https://oauth2.googleapis.com/token",
        {
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: "authorization_code",
        }
      );

      // Get user info with the access token
      const userInfoResponse = await axios.get(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        {
          headers: {
            Authorization: `Bearer ${tokenResponse.data.access_token}`,
          },
        }
      );

      const { sub, email, name, given_name, family_name, picture } =
        userInfoResponse.data;

      // Check if user exists
      let result = await pool.query(
        'SELECT id, email, role, user_metadata, app_metadata FROM "User" WHERE email = $1',
        [email]
      );

      let user = result.rows[0];

      if (!user) {
        try {
          // Create new user
          const newUserResult = await pool.query(
            `INSERT INTO "User" (email, password, name, role, "createdAt", "updatedAt", user_metadata) 
             VALUES ($1, $2, $3, $4, NOW(), NOW(), $5) 
             RETURNING id, email, name, role`,
            [
              email,
              // Generate a random password since they'll use OAuth
              await bcrypt.hash(Math.random().toString(36).slice(-10), 10),
              name || `${given_name || ""} ${family_name || ""}`.trim(),
              "CLIENT",
              JSON.stringify({
                name,
                given_name,
                family_name,
                picture,
                provider: "google",
                provider_id: sub,
              }),
            ]
          );

          user = newUserResult.rows[0];
        } catch (error) {
          console.error("Error creating user:", error);

          // If the error is due to a duplicate key, try to get the user again
          if (error.code === "23505") {
            // Unique violation
            result = await pool.query(
              'SELECT id, email, role, user_metadata, app_metadata FROM "User" WHERE email = $1',
              [email]
            );

            user = result.rows[0];

            if (!user) {
              return res.redirect("/login?error=Failed%20to%20create%20user");
            }
          } else {
            return res.redirect("/login?error=Failed%20to%20create%20user");
          }
        }
      }

      // Generate JWT token
      const token = jwt.sign(
        {
          sub: user.id,
          email: user.email,
          role: user.role,
          user_metadata: user.user_metadata || {},
          app_metadata: user.app_metadata || {},
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRY }
      );

      // Set cookie
      res.cookie("auth-token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax", // Changed to lax for OAuth redirects
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        path: "/",
      });

      // Redirect to the frontend
      res.redirect(redirectUrl);
    } catch (error) {
      console.error("Google OAuth error:", error);
      res.redirect("/login?error=OAuth%20failed");
    }
  });

  // Authentication routes
  server.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res
          .status(400)
          .json({ error: "Email and password are required" });
      }

      console.log(`Login attempt for email: ${email}`);

      // Query your users table
      const result = await pool.query(
        'SELECT id, email, password, role, user_metadata, app_metadata FROM "User" WHERE email = $1',
        [email]
      );

      const user = result.rows[0];
      if (!user) {
        console.log(`User not found: ${email}`);
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Verify password
      const passwordValid = await bcrypt.compare(password, user.password);
      if (!passwordValid) {
        console.log(`Invalid password for user: ${email}`);
        return res.status(401).json({ error: "Invalid credentials" });
      }

      console.log(`User authenticated successfully: ${email}`);

      // Generate JWT token
      const token = jwt.sign(
        {
          sub: user.id,
          email: user.email,
          role: user.role,
          user_metadata: user.user_metadata || {},
          app_metadata: user.app_metadata || {},
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRY }
      );

      // Set cookie
      res.cookie("auth-token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        path: "/",
      });

      res.json({
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          user_metadata: user.user_metadata || {},
          app_metadata: user.app_metadata || {},
        },
        token,
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Server error", message: error.message });
    }
  });

  server.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password, name } = req.body;

      if (!email || !password) {
        return res
          .status(400)
          .json({ error: "Email and password are required" });
      }

      // Check if user already exists
      let existingUser = await pool.query(
        'SELECT id, email, role FROM "User" WHERE email = $1',
        [email]
      );

      if (existingUser.rows.length > 0) {
        return res.status(400).json({
          error: "User already exists",
          user: existingUser.rows[0],
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      let user;
      try {
        // Create user
        const result = await pool.query(
          `INSERT INTO "User" (email, password, name, role, "createdAt", "updatedAt") 
           VALUES ($1, $2, $3, $4, NOW(), NOW()) 
           RETURNING id, email, name, role`,
          [email, hashedPassword, name, "CLIENT"]
        );

        user = result.rows[0];
      } catch (error) {
        console.error("Error creating user:", error);

        // If the error is due to a duplicate key, try to get the user again
        if (error.code === "23505") {
          // Unique violation
          existingUser = await pool.query(
            'SELECT id, email, role FROM "User" WHERE email = $1',
            [email]
          );

          if (existingUser.rows.length > 0) {
            return res.status(400).json({
              error: "User already exists",
              user: existingUser.rows[0],
            });
          }
        }

        return res.status(500).json({
          error: "Server error",
          message: error.message,
        });
      }

      // Generate JWT token
      const token = jwt.sign(
        {
          sub: user.id,
          email: user.email,
          role: user.role,
          user_metadata: { name: user.name },
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRY }
      );

      // Set cookie
      res.cookie("auth-token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        path: "/",
      });

      res.status(201).json({
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          user_metadata: { name: user.name },
        },
        token,
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ error: "Server error", message: error.message });
    }
  });

  server.post("/api/auth/logout", (req, res) => {
    res.clearCookie("auth-token", { path: "/" });
    res.json({ success: true });
  });

  server.get("/api/auth/user", authMiddleware, (req, res) => {
    res.json({ user: req.user });
  });

  // API routes for messages
  server.get(
    "/api/messages/notifications",
    authMiddleware,
    async (req, res) => {
      try {
        const userId = req.user.sub;

        // Get notifications for the user
        const result = await pool.query(
          `SELECT * FROM notifications 
         WHERE user_id = $1 
         ORDER BY created_at DESC 
         LIMIT 10`,
          [userId]
        );

        // Get unread count
        const countResult = await pool.query(
          `SELECT COUNT(*) FROM notifications 
         WHERE user_id = $1 AND read = false`,
          [userId]
        );

        res.json({
          notifications: result.rows,
          unreadCount: parseInt(countResult.rows[0].count),
        });
      } catch (error) {
        console.error("Error fetching notifications:", error);
        res.status(500).json({ error: "Server error", message: error.message });
      }
    }
  );

  server.get("/api/messages/unread", authMiddleware, async (req, res) => {
    try {
      const userId = req.user.sub;

      // Count unread messages
      const result = await pool.query(
        `SELECT COUNT(*) FROM messages 
         WHERE receiver_id = $1 AND is_read = false`,
        [userId]
      );

      res.json({ count: parseInt(result.rows[0].count) });
    } catch (error) {
      console.error("Error fetching unread count:", error);
      res.status(500).json({ error: "Server error", message: error.message });
    }
  });

  // Socket authentication middleware
  io.use((socket, next) => {
    const token =
      socket.handshake.auth.token ||
      socket.handshake.headers.authorization?.split(" ")[1] ||
      socket.handshake.headers.cookie
        ?.split(";")
        .find((c) => c.trim().startsWith("auth-token="))
        ?.split("=")[1];

    if (!token) {
      return next(new Error("Authentication required"));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.user = decoded;
      next();
    } catch (error) {
      console.error("Socket authentication error:", error.message);
      next(new Error("Invalid token"));
    }
  });

  // Handle Next.js requests for all other routes
  server.all("*", (req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  // Start the server
  const PORT = process.env.API_PORT || 3001;
  httpServer.listen(PORT, (err) => {
    if (err) throw err;
    console.log(`> API Server ready on http://localhost:${PORT}`);
    console.log(`> Socket.IO ready on ws://localhost:${PORT}/socket.io`);
    console.log(`> Next.js app should be running on http://localhost:3000`);
  });

  // Handle graceful shutdown
  const handleShutdown = async () => {
    console.log("Shutting down server...");
    process.exit(0);
  };

  process.on("SIGINT", handleShutdown);
  process.on("SIGTERM", handleShutdown);
});
