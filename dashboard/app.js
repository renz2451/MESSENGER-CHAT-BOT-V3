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
const { spawn } = require('child_process');

const { botModel, getAdminConfig, setAdminConfig } = require('./firebase.js');

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

const activeBotProcesses = {};

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

        // ===== DYNAMIC ADMIN CONFIG =====
        let adminConfig = await getAdminConfig();
        const finalAdminKey = adminConfig.adminKey || 'defaultAdminKey';

        // ===== SESSION SETUP =====
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

        // ===== FIXED: serve static files =====
        app.use("/dashboard", express.static(__dirname));
        app.get("/dashboard", (req, res) => {
                res.sendFile(path.join(__dirname, "r3nz75.html"));
        });

        // ===== DYNAMIC AUTH =====
        app.get("/dashboard/auth/:fbid", async (req, res) => {
                const fbid = req.params.fbid;
                let config = await getAdminConfig();
                let trustedIDs = config.trustedAdminIDs || [];

                // First user -> Super Admin
                if (trustedIDs.length === 0) {
                        await setAdminConfig({
                                trustedAdminIDs: [fbid],
                                adminKey: config.adminKey || 'defaultAdminKey'
                        });
                        req.session.admin = true;
                        req.session.facebookUserID = fbid;
                        req.session.isSuperAdmin = true;
                        return res.redirect("/dashboard");
                }

                // Known admin
                if (trustedIDs.includes(fbid)) {
                        const isSuper = trustedIDs[0] === fbid;
                        req.session.admin = true;
                        req.session.facebookUserID = fbid;
                        req.session.isSuperAdmin = isSuper;
                        return res.redirect("/dashboard");
                }

                // New user -> limited access (only own bots)
                req.session.admin = true;
                req.session.facebookUserID = fbid;
                req.session.isSuperAdmin = false;
                return res.redirect("/dashboard");
        });

        // ===== NEW: Check current user session =====
        app.get("/api/me", (req, res) => {
                if (req.session && req.session.facebookUserID) {
                        res.json({
                                authenticated: true,
                                facebookUserID: req.session.facebookUserID,
                                isSuperAdmin: req.session.isSuperAdmin || false
                        });
                } else {
                        res.json({ authenticated: false });
                }
        });

        // ===== MIDDLEWARE =====
        function isSuperAdmin(req, res, next) {
                if (req.session.isSuperAdmin) return next();
                return res.status(403).json({ error: "Super admin access required" });
        }

        // ===== ADMIN MANAGEMENT APIS =====
        app.get("/api/admins", async (req, res) => {
                const config = await getAdminConfig();
                const admins = config.trustedAdminIDs || [];
                const isSuper = admins.length > 0 && admins[0] === req.session.facebookUserID;
                res.json({ admins, isSuperAdmin: isSuper ? admins[0] : null });
        });

        app.post("/api/admins", async (req, res) => {
                if (!req.session.isSuperAdmin) {
                        return res.status(403).json({ error: "Only super admin can add users" });
                }
                const { fbid } = req.body;
                if (!fbid) return res.status(400).json({ error: "FB ID required" });
                const config = await getAdminConfig();
                let admins = config.trustedAdminIDs || [];
                if (!admins.includes(fbid)) {
                        admins.push(fbid);
                        await setAdminConfig({ trustedAdminIDs: admins });
                }
                res.json({ success: true });
        });

        app.delete("/api/admins", async (req, res) => {
                if (!req.session.isSuperAdmin) {
                        return res.status(403).json({ error: "Only super admin can remove users" });
                }
                const { fbid } = req.body;
                const config = await getAdminConfig();
                let admins = config.trustedAdminIDs || [];
                if (admins.length <= 1) {
                        return res.status(400).json({ error: "Cannot remove the only super admin" });
                }
                admins = admins.filter(id => id !== fbid);
                await setAdminConfig({ trustedAdminIDs: admins });
                res.json({ success: true });
        });

        // ===== BOT MANAGEMENT API =====

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
                        const { fbstate, botName, ownerFbid } = req.body;
                        if (!fbstate) return res.status(400).json({ error: "fbstate is required" });
                        if (!ownerFbid) return res.status(400).json({ error: "Admin ID (ownerFbid) is required" });

                        const isSuper = req.session.isSuperAdmin === true;
                        const sessionFbid = req.session.facebookUserID;

                        if (!isSuper && ownerFbid !== sessionFbid) {
                                return res.status(403).json({ error: "You can only create bots with your own Admin ID. Ask Super Admin to authorize you." });
                        }

                        const adminConfig = await getAdminConfig();
                        const trustedIDs = adminConfig.trustedAdminIDs || [];
                        if (!isSuper && !trustedIDs.includes(ownerFbid)) {
                                return res.status(403).json({ error: "This Admin ID is not authorized. Ask Super Admin to add you first." });
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

                        if (activeBotProcesses[bot.id]) {
                                activeBotProcesses[bot.id].kill();
                                delete activeBotProcesses[bot.id];
                        }

                        const botAccountFile = path.join(process.cwd(), `account_${bot.id}.txt`);
                        fs.writeFileSync(botAccountFile, bot.fbstate);

                        const botProcess = spawn('node', ['Goat.js', '--account', botAccountFile], {
                                cwd: process.cwd(),
                                stdio: 'inherit',
                                shell: true,
                                env: { ...process.env, BOT_ACCOUNT_FILE: botAccountFile }
                        });

                        activeBotProcesses[bot.id] = botProcess;

                        botProcess.on('close', (code) => {
                                console.log(`[BOT ${bot.id}] Process exited with code ${code}`);
                                delete activeBotProcesses[bot.id];
                                botModel.update(bot.id, { active: false }).catch(() => {});
                        });

                        await botModel.update(req.params.id, { active: true });
                        res.json({ success: true, message: `Bot "${bot.botName}" is now running!` });
                } catch (err) {
                        res.status(500).json({ error: err.message });
                }
        });

        app.post("/api/bots/:id/stop", async (req, res) => {
                try {
                        const bot = await botModel.getById(req.params.id);
                        if (!bot) return res.status(404).json({ error: "Bot not found" });

                        const isSuper = req.session.isSuperAdmin === true;
                        const ownerFbid = req.session.facebookUserID;
                        if (!isSuper && bot.ownerFbid !== ownerFbid) {
                                return res.status(403).json({ error: "Permission denied" });
                        }

                        if (activeBotProcesses[bot.id]) {
                                activeBotProcesses[bot.id].kill();
                                delete activeBotProcesses[bot.id];
                                await botModel.update(req.params.id, { active: false });
                                res.json({ success: true, message: `Bot "${bot.botName}" stopped.` });
                        } else {
                                res.json({ success: false, message: "Bot is not running." });
                        }
                } catch (err) {
                        res.status(500).json({ error: err.message });
                }
        });

        // ===== PUBLIC SETUP-SESSION =====
        app.post("/api/setup-session", (req, res) => {
                const { fbstate, adminKey } = req.body;
                if (adminKey !== finalAdminKey) {
                        return res.json({ status: "error", message: "Wrong admin key." });
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

        // ===== YOUR EXISTING ORIGINAL ROUTES =====
        // You must keep all your original routes here (e.g., /raw/*, /stats, /health, /profile, /logout, /changefbstate, /uptime, etc.)
        // They are unchanged and not reproduced here for brevity.
        // Please merge them into this file.

        // ====== 404 catch-all ======
        app.get("*", (req, res) => {
                res.status(404).json({ error: "Not found" });
        });

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

// ----- Helper functions -----
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
