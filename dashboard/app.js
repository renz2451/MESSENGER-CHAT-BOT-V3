const express = require("express");
const app = express();
const fileUpload = require("express-fileupload");
const rateLimit = require("express-rate-limit");
const fs = require("fs-extra");
const session = require("express-session");
const bodyParser = require("body-parser");
const { google } = require("googleapis");
const nodemailer = require("nodemailer");
const cookieParser = require("cookie-parser");
const flash = require("connect-flash");
const Passport = require("passport");
const bcrypt = require("bcrypt");
const axios = require("axios");
const mimeDB = require("mime-db");
const http = require("http");
const server = http.createServer(app);
const path = require("path");

// ===== Import Firebase botModel and getAdminConfig =====
const { botModel, getAdminConfig } = require('./firebase.js');

const imageExt = ["png", "gif", "webp", "jpeg", "jpg"];
const videoExt = ["webm", "mkv", "flv", "vob", "ogv", "ogg", "rrc", "gifv",
        "mng", "mov", "avi", "qt", "wmv", "yuv", "rm", "asf", "amv", "mp4",
        "m4p", "m4v", "mpg", "mp2", "mpeg", "mpe", "mpv", "m4v", "svi", "3gp",
        "3g2", "mxf", "roq", "nsv", "flv", "f4v", "f4p", "f4a", "f4b", "mod"
];
const audioExt = ["3gp", "aa", "aac", "aax", "act", "aiff", "alac", "amr",
        "ape", "au", "awb", "dss", "dvf", "flac", "gsm", "iklax", "ivs",
        "m4a", "m4b", "m4p", "mmf", "mp3", "mpc", "msv", "nmf",
        "ogg", "oga", "mogg", "opus", "ra", "rm", "raw", "rf64", "sln", "tta",
        "voc", "vox", "wav", "wma", "wv", "webm", "8svx", "cd"
];

module.exports = async (api) => {
        if (!api)
                await require("./connectDB.js")();

        const { utils, utils: { drive } } = global;
        const { config } = global.GoatBot;
        const { expireVerifyCode } = config.dashBoard;
        const { gmailAccount, gRecaptcha } = config.credentials;

        const getText = global.utils.getText;

        const {
                email,
                clientId,
                clientSecret,
                refreshToken
        } = gmailAccount;

        const OAuth2 = google.auth.OAuth2;
        const OAuth2_client = new OAuth2(clientId, clientSecret);
        OAuth2_client.setCredentials({ refresh_token: refreshToken });
        let accessToken = "";
        try {
                accessToken = await OAuth2_client.getAccessToken();
        }
        catch (err) {
                utils.log.warn("DASHBOARD", getText("Goat", "googleApiRefreshTokenExpired"));
        }

        const transporter = nodemailer.createTransport({
                host: "smtp.gmail.com",
                service: "Gmail",
                auth: {
                        type: "OAuth2",
                        user: email,
                        clientId,
                        clientSecret,
                        refreshToken,
                        accessToken
                }
        });

        const {
                threadModel,
                userModel,
                dashBoardModel,
                threadsData,
                usersData,
                dashBoardData
        } = global.db;

        // ================================================================
        // 1) FETCH ADMIN CONFIG FROM FIREBASE (with fallback to config.json)
        // ================================================================
        let adminConfig = await getAdminConfig();
        const localAdminKey = config.dashBoard.adminKey;
        const localTrustedIDs = config.dashBoard.trustedAdminIDs || [];
        const finalAdminKey = adminConfig.adminKey || localAdminKey || 'defaultAdminKey';
        const finalTrustedIDs = adminConfig.trustedAdminIDs.length ? adminConfig.trustedAdminIDs : localTrustedIDs;

        // ================================================================
        // 2) SESSION SETUP (using finalAdminKey as secret fallback)
        // ================================================================
        app.use(bodyParser.json());
        app.use(bodyParser.urlencoded({ extended: true }));
        app.use(cookieParser());
        const sessionSecret = process.env.SESSION_SECRET
                || (finalAdminKey ? finalAdminKey + "_r3nz75_session_bot" : null)
                || randomStringApikey(32);
        app.use(session({
                secret: sessionSecret,
                resave: false,
                saveUninitialized: true,
                cookie: {
                        secure: false,
                        httpOnly: true,
                        maxAge: 1000 * 60 * 60 * 24 * 7
                }
        }));

        // public folder 
        app.use("/css", express.static(`${__dirname}/css`));
        app.use("/js", express.static(`${__dirname}/js`));
        app.use("/images", express.static(`${__dirname}/images`));

        // ====== FIXED: serve static files from dashboard folder directly ======
        app.use("/dashboard", express.static(__dirname));

        // ====== FIXED: serve r3nz75.html on /dashboard ======
        app.get("/dashboard", (req, res) => {
                res.sendFile(path.join(__dirname, "r3nz75.html"));
        });

        // ====== FACEBOOK ID BYPASS LOGIN (uses finalTrustedIDs) ======
        app.get("/dashboard/auth/:fbid", (req, res) => {
                const fbid = req.params.fbid;
                if (finalTrustedIDs.includes(fbid)) {
                        req.session.admin = true;
                        req.session.facebookUserID = fbid;
                        req.session.isSuperAdmin = false;
                        return res.redirect("/dashboard");
                } else {
                        return res.status(403).send("Access Denied: Your Facebook ID is not authorized.");
                }
        });

        // ====== MIDDLEWARE for super admin ======
        function isSuperAdmin(req, res, next) {
                if (req.session.isSuperAdmin) return next();
                if (req.session.admin && req.session.isSuperAdmin !== false) {
                        return next();
                }
                return res.status(403).json({ error: "Super admin access required" });
        }

        // =============================================================
        // ===== BOT MANAGEMENT API ROUTES (using Firebase botModel) =====
        // =============================================================

        app.get("/api/bots", async (req, res) => {
                try {
                        const isSuper = req.session.isSuperAdmin === true;
                        const ownerFbid = req.session.facebookUserID;
                        let queryOwner = null;
                        if (!isSuper) {
                                if (!ownerFbid) return res.status(401).json({ error: "Not authenticated" });
                                queryOwner = ownerFbid;
                        }
                        const bots = await botModel.getAll(queryOwner);
                        res.json(bots);
                } catch (err) {
                        res.status(500).json({ error: err.message });
                }
        });

        app.post("/api/bots", async (req, res) => {
                try {
                        const { fbstate, botName } = req.body;
                        if (!fbstate) return res.status(400).json({ error: "fbstate is required" });

                        let ownerFbid = req.body.ownerFbid;
                        if (!ownerFbid) {
                                if (req.session.facebookUserID) {
                                        ownerFbid = req.session.facebookUserID;
                                } else {
                                        return res.status(401).json({ error: "Not authenticated" });
                                }
                        }
                        if (!req.session.isSuperAdmin && ownerFbid !== req.session.facebookUserID) {
                                return res.status(403).json({ error: "You can only create bots for yourself" });
                        }

                        const bot = await botModel.create({
                                ownerFbid,
                                fbstate,
                                botName: botName || "My Bot",
                                active: false
                        });
                        res.status(201).json(bot);
                } catch (err) {
                        res.status(500).json({ error: err.message });
                }
        });

        app.delete("/api/bots/:id", async (req, res) => {
                try {
                        const bot = await botModel.getById(req.params.id);
                        if (!bot) return res.status(404).json({ error: "Bot not found" });
                        const isSuper = req.session.isSuperAdmin === true;
                        const ownerFbid = req.session.facebookUserID;
                        if (!isSuper && bot.ownerFbid !== ownerFbid) {
                                return res.status(403).json({ error: "Permission denied" });
                        }
                        await botModel.delete(req.params.id);
                        res.json({ success: true });
                } catch (err) {
                        res.status(500).json({ error: err.message });
                }
        });

        app.post("/api/bots/:id/activate", async (req, res) => {
                try {
                        const bot = await botModel.getById(req.params.id);
                        if (!bot) return res.status(404).json({ error: "Bot not found" });
                        const isSuper = req.session.isSuperAdmin === true;
                        const ownerFbid = req.session.facebookUserID;
                        if (!isSuper && bot.ownerFbid !== ownerFbid) {
                                return res.status(403).json({ error: "Permission denied" });
                        }

                        // Deactivate all others
                        const allBots = await botModel.getAll();
                        for (const b of allBots) {
                                if (b.active) {
                                        await botModel.update(b.id, { active: false });
                                }
                        }
                        await botModel.update(req.params.id, { active: true });

                        // Write fbstate to account.txt
                        const accountFile = process.cwd() + (process.env.NODE_ENV == "production" || process.env.NODE_ENV == "development" ? "/account.dev.txt" : "/account.txt");
                        fs.writeFileSync(accountFile, bot.fbstate);

                        res.json({ success: true, message: "Bot activated, restarting..." });
                        res.on("finish", () => {
                                setTimeout(() => process.exit(2), 500);
                        });
                } catch (err) {
                        res.status(500).json({ error: err.message });
                }
        });

        // ===== PUBLIC SETUP-SESSION ENDPOINT (uses finalAdminKey) =====
        app.post("/api/setup-session", (req, res) => {
                const { fbstate, adminKey } = req.body;
                if (adminKey !== finalAdminKey) {
                        return res.json({ status: "error", message: "Wrong admin key. Check Firebase adminConfig or config.json" });
                }
                if (!fbstate || !fbstate.trim()) {
                        return res.json({ status: "error", message: "fbstate cannot be empty" });
                }
                const accountFile = process.cwd() + "/account.txt";
                try {
                        fs.writeFileSync(accountFile, fbstate.trim());
                        res.json({ status: "success", message: "Session saved! Bot is restarting now..." });
                        res.on("finish", () => setTimeout(() => process.exit(2), 500));
                } catch (err) {
                        res.json({ status: "error", message: "Failed to write session: " + err.message });
                }
        });

        // ================================================================
        // ===== ORIGINAL ROUTES (health, stats, raw, etc.) — UNCHANGED =====
        // ================================================================

        // Raw file endpoints — admin only
        app.get("/raw/login", isAdmin, (req, res) => {
                res.setHeader("Content-Type", "text/plain; charset=utf-8");
                res.sendFile(path.join(__dirname, "../bot/login/login.js"));
        });

        app.get("/raw/handlerEvent", isAdmin, (req, res) => {
                res.setHeader("Content-Type", "text/plain; charset=utf-8");
                res.sendFile(path.join(__dirname, "../bot/handler/handlerEvent.js"));
        });

        app.get("/raw/database", isAdmin, (req, res) => {
                res.setHeader("Content-Type", "application/octet-stream");
                res.setHeader("Content-Disposition", "attachment; filename=database.sqlite");
                const dbPath = path.join(__dirname, "../Fca_Database/database.sqlite");
                if (!fs.existsSync(dbPath)) return res.status(404).json({ error: "Database file not found" });
                res.sendFile(dbPath);
        });

        // Health check — required for Render, Railway, Koyeb, VPS uptime monitors
        app.get(["/health", "/ping", "/alive"], (req, res) => {
                res.status(200).json({
                        status: "ok",
                        bot: global.GoatBot?.config?.nameBot || "RENZ MESSENGER BOT",
                        uptime: Math.floor(process.uptime()),
                        timestamp: new Date().toISOString()
                });
        });

        // Home route - serve r3nz75 landing page
        app.get(["/", "/home"], (req, res) => {
                res.sendFile(path.join(__dirname, "r3nz75.html"));
        });

        // Stats API - JSON data
        app.get("/stats", async (req, res) => {
                let fcaVersion;
                try { fcaVersion = require("fca-r3nz75/package.json").version; }
                catch (e) { fcaVersion = "unknown"; }

                let botVersion;
                try { botVersion = require(process.cwd() + "/package.json").version; }
                catch (e) { botVersion = "unknown"; }

                const totalThread = (await threadsData.getAll()).filter(t => t.threadID.toString().length > 15).length;
                const totalUser = (await usersData.getAll()).length;
                const uptime = utils.convertTime(process.uptime() * 1000);

                const cfg = global.GoatBot?.config || {};
                const commandsCount = global.GoatBot?.commands?.size || 0;
                const eventsCount = global.GoatBot?.eventCommands?.size || 0;
                const isConnected = !!global.GoatBot?.fcaApi;
                const botID = global.GoatBot?.botID || null;

                const dbType = (() => {
                        try {
                                const uri = process.env.MONGODB_URI || process.env.MONGO_URL || cfg.database?.mongodb?.uri || "";
                                return uri ? "MongoDB" : "SQLite";
                        } catch { return "SQLite"; }
                })();

                res.json({
                        fcaVersion,
                        botVersion,
                        totalThread,
                        totalUser,
                        uptime,
                        uptimeSecond: process.uptime(),
                        commandsCount,
                        eventsCount,
                        isConnected,
                        botID,
                        prefix: cfg.prefix || ")",
                        language: cfg.language || "en",
                        nameBot: cfg.nameBot || "RENZ MESSENGER BOT",
                        dbType,
                        nodeVersion: process.version
                });
        });

        // Profile route
        app.get("/profile", isAuthenticated, async (req, res) => {
                res.json({
                        userData: await usersData.get(req.user.facebookUserID) || {}
                });
        });

        // Donate route
        app.get("/donate", (req, res) => {
                res.json({ message: "Donate endpoint" });
        });

        // Logout
        app.get("/logout", (req, res, next) => {
                req.logout(function (err) {
                        if (err)
                                return next(err);
                        res.redirect("/");
                });
        });

        // Change fbstate
        app.post("/changefbstate", isAuthenticated, isVeryfiUserIDFacebook, (req, res) => {
                if (!global.GoatBot.config.adminBot.includes(req.user.facebookUserID))
                        return res.send({
                                status: "error",
                                message: getText("app", "notPermissionChangeFbstate")
                        });
                const { fbstate } = req.body;
                if (!fbstate)
                        return res.send({
                                status: "error",
                                message: getText("app", "notFoundFbstate")
                        });

                fs.writeFileSync(process.cwd() + (process.env.NODE_ENV == "production" || process.env.NODE_ENV == "development" ? "/account.dev.txt" : "/account.txt"), fbstate);
                res.send({
                        status: "success",
                        message: getText("app", "changedFbstateSuccess")
                });

                res.on("finish", () => {
                        process.exit(2);
                });
        });

        // Uptime
        app.get("/uptime", global.responseUptimeCurrent);

        // Change fbstate page
        app.get("/changefbstate", isAuthenticated, isVeryfiUserIDFacebook, isAdmin, (req, res) => {
                res.json({
                        currentFbstate: fs.readFileSync(process.cwd() + (process.env.NODE_ENV == "production" || process.env.NODE_ENV == "development" ? "/account.dev.txt" : "/account.txt"), "utf8")
                });
        });

        // ====== 404 catch-all ======
        app.get("*", (req, res) => {
                res.status(404).json({ error: "Not found" });
        });

        // error handler
        app.use((err, req, res, next) => {
                if (err.message == "Login sessions require session support. Did you forget to use `express-session` middleware?")
                        return res.status(500).send(getText("app", "serverError"));
        });

        // ====== START SERVER ======
        const PORT = process.env.PORT || config.dashBoard?.port || 5000;
        let dashBoardUrl;
        if (process.env.RENDER_EXTERNAL_URL) {
                dashBoardUrl = process.env.RENDER_EXTERNAL_URL;
        } else if (process.env.RAILWAY_PUBLIC_DOMAIN) {
                dashBoardUrl = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
        } else if (process.env.RAILWAY_STATIC_URL) {
                dashBoardUrl = process.env.RAILWAY_STATIC_URL;
        } else if (process.env.REPL_OWNER) {
                dashBoardUrl = `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
        } else if (process.env.API_SERVER_EXTERNAL == "https://api.glitch.com") {
                dashBoardUrl = `https://${process.env.PROJECT_DOMAIN}.glitch.me`;
        } else if (process.env.KOYEB_APP_URL) {
                dashBoardUrl = process.env.KOYEB_APP_URL;
        } else if (process.env.CYCLIC_URL) {
                dashBoardUrl = process.env.CYCLIC_URL;
        } else if (process.env.BASE_URL) {
                dashBoardUrl = process.env.BASE_URL;
        } else {
                dashBoardUrl = `http://localhost:${PORT}`;
        }
        dashBoardUrl = dashBoardUrl.replace(/\/$/, "");
        await server.listen(PORT, "0.0.0.0");
        utils.log.info("DASHBOARD", `Dashboard is running: ${dashBoardUrl}`);
        if (config.serverUptime.socket.enable == true)
                require("../bot/login/socketIO.js")(server);
};

// ----- Helper functions (unchanged) -----
function randomStringApikey(max) {
        let text = "";
        const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for (let i = 0; i < max; i++)
                text += possible.charAt(Math.floor(Math.random() * possible.length));
        return text;
}
function randomNumberApikey(maxLength) {
        let text = "";
        const possible = "0123456789";
        for (let i = 0; i < maxLength; i++)
                text += possible.charAt(Math.floor(Math.random() * possible.length));
        return text;
}
function validateEmail(email) {
        const re = /^(([^<>()\[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
        return re.test(email);
}
function convertSize(byte) {
        return byte > 1024 ? byte > 1024 * 1024 ? (byte / 1024 / 1024).toFixed(2) + " MB" : (byte / 1024).toFixed(2) + " KB" : byte + " Byte";
}
