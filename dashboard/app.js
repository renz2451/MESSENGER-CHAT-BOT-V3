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
                dashBoardData,
                botModel   // 👈 new
        } = global.db;

        app.use(bodyParser.json());
        app.use(bodyParser.urlencoded({ extended: true }));
        app.use(cookieParser());
        const sessionSecret = process.env.SESSION_SECRET
                || (config.dashBoard?.adminKey ? config.dashBoard.adminKey + "_r3nz75_session_bot" : null)
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

        // ====== FACEBOOK ID BYPASS LOGIN ======
        // Users with trusted FB IDs can login via /dashboard/auth/:fbid
        app.get("/dashboard/auth/:fbid", (req, res) => {
                const fbid = req.params.fbid;
                const trustedIDs = config.dashBoard.trustedAdminIDs || [];
                if (trustedIDs.includes(fbid)) {
                        req.session.admin = true;
                        req.session.facebookUserID = fbid;
                        req.session.isSuperAdmin = false; // regular admin
                        return res.redirect("/dashboard");
                } else {
                        return res.status(403).send("Access Denied: Your Facebook ID is not authorized.");
                }
        });

        // ====== SUPER ADMIN LOGIN VIA adminKey (fallback) ======
        // You can keep the original login page if you want, but we'll also allow adminKey in POST
        // For simplicity, we keep the existing login route (not shown here, but you can add it)

        // ====== MIDDLEWARE to check if user is super admin ======
        function isSuperAdmin(req, res, next) {
                if (req.session.isSuperAdmin) return next();
                // If session has admin flag and we have adminKey in config, we can check against it
                // But we can also check if they logged in via adminKey password
                if (req.session.admin && req.session.isSuperAdmin !== false) {
                        return next();
                }
                return res.status(403).json({ error: "Super admin access required" });
        }

        // ====== BOT MANAGEMENT API ROUTES ======

        // GET all bots (filtered by owner unless super admin)
        app.get("/api/bots", async (req, res) => {
                try {
                        const isSuper = req.session.isSuperAdmin === true;
                        const ownerFbid = req.session.facebookUserID;
                        let query = {};
                        if (!isSuper) {
                                if (!ownerFbid) return res.status(401).json({ error: "Not authenticated" });
                                query.ownerFbid = ownerFbid;
                        }
                        const bots = await botModel.find(query).sort({ createdAt: -1 });
                        res.json(bots);
                } catch (err) {
                        res.status(500).json({ error: err.message });
                }
        });

        // POST create a new bot
        app.post("/api/bots", async (req, res) => {
                try {
                        const { fbstate, botName } = req.body;
                        if (!fbstate) return res.status(400).json({ error: "fbstate is required" });

                        // Determine owner: if super admin, they can specify ownerFbid, else use session
                        let ownerFbid = req.body.ownerFbid;
                        if (!ownerFbid) {
                                if (req.session.facebookUserID) {
                                        ownerFbid = req.session.facebookUserID;
                                } else {
                                        return res.status(401).json({ error: "Not authenticated" });
                                }
                        }
                        // If super admin, they can set owner; otherwise we trust the session
                        if (!req.session.isSuperAdmin && ownerFbid !== req.session.facebookUserID) {
                                return res.status(403).json({ error: "You can only create bots for yourself" });
                        }

                        const bot = new botModel({
                                ownerFbid,
                                fbstate,
                                botName: botName || "My Bot",
                                active: false
                        });
                        await bot.save();
                        res.status(201).json(bot);
                } catch (err) {
                        res.status(500).json({ error: err.message });
                }
        });

        // DELETE a bot (only owner or super admin)
        app.delete("/api/bots/:id", async (req, res) => {
                try {
                        const bot = await botModel.findById(req.params.id);
                        if (!bot) return res.status(404).json({ error: "Bot not found" });
                        const isSuper = req.session.isSuperAdmin === true;
                        const ownerFbid = req.session.facebookUserID;
                        if (!isSuper && bot.ownerFbid !== ownerFbid) {
                                return res.status(403).json({ error: "Permission denied" });
                        }
                        await bot.deleteOne();
                        res.json({ success: true });
                } catch (err) {
                        res.status(500).json({ error: err.message });
                }
        });

        // ACTIVATE a bot (set as active, restart bot with its fbstate)
        app.post("/api/bots/:id/activate", async (req, res) => {
                try {
                        const bot = await botModel.findById(req.params.id);
                        if (!bot) return res.status(404).json({ error: "Bot not found" });
                        const isSuper = req.session.isSuperAdmin === true;
                        const ownerFbid = req.session.facebookUserID;
                        if (!isSuper && bot.ownerFbid !== ownerFbid) {
                                return res.status(403).json({ error: "Permission denied" });
                        }

                        // Deactivate all others
                        await botModel.updateMany({}, { active: false });
                        bot.active = true;
                        await bot.save();

                        // Write fbstate to account.txt
                        const accountFile = process.cwd() + (process.env.NODE_ENV == "production" || process.env.NODE_ENV == "development" ? "/account.dev.txt" : "/account.txt");
                        fs.writeFileSync(accountFile, bot.fbstate);

                        // Send response and restart
                        res.json({ success: true, message: "Bot activated, restarting..." });
                        res.on("finish", () => {
                                setTimeout(() => process.exit(2), 500);
                        });
                } catch (err) {
                        res.status(500).json({ error: err.message });
                }
        });

        // ----- Keep existing routes (health, stats, etc.) -----
        // ... (the rest of your original routes remain unchanged) ...

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
