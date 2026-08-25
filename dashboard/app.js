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

const { botModel, userModel, getAdminConfig, setAdminConfig } = require('./firebase.js');
const { startBotProcess, stopBotProcess, getRunningBots, restoreRunningBots } = require('./botManager.js');

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

// ===== LOAD CONFIG =====
const configPath = path.join(__dirname, '..', process.env.NODE_ENV === 'development' ? 'config.dev.json' : 'config.json');
let config = {};
try {
    config = require(configPath);
} catch (err) {
    console.error('[DASHBOARD] Failed to load config:', err.message);
    config = { dashBoard: { port: 5000 }, serverUptime: { socket: { enable: false } } };
}

// ===== SETUP GLOBAL =====
global.GoatBot = {
    config: config,
    startTime: Date.now()
};

// ===== LOAD UTILITIES =====
try {
    const utils = require("../utils.js");
    global.utils = utils;
} catch (err) {
    console.warn('[DASHBOARD] utils.js not found, using fallback');
    global.utils = {
        log: {
            info: console.log,
            warn: console.warn,
            error: console.error
        }
    };
}

// ================================================================
// ===== DATABASE CONNECTION =====
// ================================================================

let threadsData = null;
let usersData = null;

async function connectDatabase() {
    try {
        const dbModule = require("./connectDB.js");
        const result = await dbModule();
        threadsData = result.threadsData;
        usersData = result.usersData;
        console.log('[DASHBOARD] Database connected');
    } catch (err) {
        console.warn('[DASHBOARD] Database not available:', err.message);
        threadsData = { getAll: async () => [] };
        usersData = { getAll: async () => [] };
    }
}

// ================================================================
// ===== DYNAMIC ADMIN CONFIG =====
// ================================================================

let finalAdminKey = 'defaultAdminKey';
let finalTrustedIDs = [];

async function loadAdminConfig() {
    try {
        const adminConfig = await getAdminConfig();
        finalAdminKey = adminConfig.adminKey || 'defaultAdminKey';
        finalTrustedIDs = adminConfig.trustedAdminIDs || [];
        console.log('[DASHBOARD] Admin config loaded');
    } catch (err) {
        console.warn('[DASHBOARD] Failed to load admin config:', err.message);
    }
}

// ================================================================
// ===== MIDDLEWARE =====
// ================================================================

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

const sessionSecret = process.env.SESSION_SECRET || randomStringApikey(32);
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

// ================================================================
// ===== STATIC FILES =====
// ================================================================

app.use("/css", express.static(`${__dirname}/css`));
app.use("/js", express.static(`${__dirname}/js`));
app.use("/images", express.static(`${__dirname}/images`));
app.use("/dashboard", express.static(__dirname));

// ================================================================
// ===== ROUTES =====
// ================================================================

// Serve login page
app.get("/login", (req, res) => {
    res.sendFile(path.join(__dirname, "login.html"));
});

// Redirect root to login
app.get("/", (req, res) => {
    res.redirect("/login");
});

// Serve dashboard
app.get("/dashboard", (req, res) => {
    res.sendFile(path.join(__dirname, "r3nz75.html"));
});

// Health check
app.get(["/health", "/ping", "/alive"], (req, res) => {
    res.status(200).json({
        status: "ok",
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
    });
});

// ================================================================
// ===== AUTH ROUTES =====
// ================================================================

app.post("/api/auth/register", async (req, res) => {
    try {
        const { fbid, password } = req.body;
        if (!fbid || !password) {
            return res.status(400).json({ error: "Facebook ID and password required" });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: "Password must be at least 6 characters" });
        }

        const exists = await userModel.exists(fbid);
        if (exists) {
            return res.status(400).json({ error: "User already exists. Please sign in." });
        }

        await userModel.create(fbid, password);
        res.json({ success: true, message: "Account created successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/auth/login", async (req, res) => {
    try {
        const { fbid, password } = req.body;
        if (!fbid || !password) {
            return res.status(400).json({ error: "Facebook ID and password required" });
        }

        const user = await userModel.get(fbid);
        if (!user) {
            return res.status(401).json({ error: "User not found. Please register." });
        }

        if (user.password !== password) {
            return res.status(401).json({ error: "Invalid password" });
        }

        req.session.admin = true;
        req.session.facebookUserID = fbid;
        req.session.isSuperAdmin = false;

        const adminConfig = await getAdminConfig();
        const trustedIDs = adminConfig.trustedAdminIDs || [];
        if (trustedIDs.length === 0) {
            await setAdminConfig({ trustedAdminIDs: [fbid] });
            req.session.isSuperAdmin = true;
        } else if (trustedIDs[0] === fbid) {
            req.session.isSuperAdmin = true;
        }

        res.json({ success: true, fbid });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/api/auth/quick/:fbid", async (req, res) => {
    try {
        const fbid = req.params.fbid;
        if (!fbid) {
            return res.status(400).json({ error: "Facebook ID required" });
        }

        const user = await userModel.get(fbid);
        if (!user) {
            return res.status(401).json({ error: "User not found. Please register." });
        }

        req.session.admin = true;
        req.session.facebookUserID = fbid;
        req.session.isSuperAdmin = false;

        const adminConfig = await getAdminConfig();
        const trustedIDs = adminConfig.trustedAdminIDs || [];
        if (trustedIDs.length === 0) {
            await setAdminConfig({ trustedAdminIDs: [fbid] });
            req.session.isSuperAdmin = true;
        } else if (trustedIDs[0] === fbid) {
            req.session.isSuperAdmin = true;
        }

        res.json({ success: true, fbid });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/api/auth/session", (req, res) => {
    if (req.session && req.session.facebookUserID) {
        res.json({ loggedIn: true, fbid: req.session.facebookUserID });
    } else {
        res.json({ loggedIn: false });
    }
});

app.get("/api/auth/logout", (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get("/dashboard/auth/:fbid", async (req, res) => {
    const fbid = req.params.fbid;
    let config = await getAdminConfig();
    let trustedIDs = config.trustedAdminIDs || [];

    const user = await userModel.get(fbid);
    if (!user) {
        return res.redirect("/login?error=User not found. Please register first.");
    }

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

    if (trustedIDs.includes(fbid)) {
        const isSuper = trustedIDs[0] === fbid;
        req.session.admin = true;
        req.session.facebookUserID = fbid;
        req.session.isSuperAdmin = isSuper;
        return res.redirect("/dashboard");
    }

    req.session.admin = true;
    req.session.facebookUserID = fbid;
    req.session.isSuperAdmin = false;
    return res.redirect("/dashboard");
});

// ================================================================
// ===== ADMIN MANAGEMENT APIS =====
// ================================================================

function isSuperAdmin(req, res, next) {
    if (req.session.isSuperAdmin) return next();
    return res.status(403).json({ error: "Super admin access required" });
}

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

// ================================================================
// ===== BOT MANAGEMENT API =====
// ================================================================

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
        const running = getRunningBots();
        const botsWithStatus = bots.map(bot => {
            const isRunning = running.some(r => r.id === bot.id);
            return { ...bot, running: isRunning };
        });
        res.json(botsWithStatus);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===== CREATE BOT (with fbstate validation) =====
app.post("/api/bots", async (req, res) => {
    try {
        const { fbstate, botName, ownerFbid } = req.body;
        if (!fbstate) return res.status(400).json({ error: "fbstate is required" });
        if (!ownerFbid) return res.status(400).json({ error: "Admin ID (ownerFbid) is required" });

        // ===== FIX: Validate fbstate before saving =====
        const validation = botModel.validateFbstate(fbstate);
        if (!validation.valid) {
            return res.status(400).json({ 
                error: `Invalid fbstate: ${validation.error}`,
                hint: "Make sure fbstate is a valid JSON array like [{'key':'c_user','value':'123'}]"
            });
        }

        // Use the validated/parsed fbstate
        const validatedFbstate = validation.data;

        const isSuper = req.session.isSuperAdmin === true;
        const sessionFbid = req.session.facebookUserID;

        if (!isSuper && ownerFbid !== sessionFbid) {
            return res.status(403).json({
                error: "You can only create bots with your own Admin ID."
            });
        }

        const bot = await botModel.create({
            ownerFbid,
            fbstate: JSON.stringify(validatedFbstate), // Store as string JSON
            botName: botName || "My Bot",
            active: false,
            running: false,
            pid: null
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

        if (bot.running) {
            await stopBotProcess(req.params.id);
        }

        await botModel.delete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/bots/:id/start", async (req, res) => {
    try {
        const bot = await botModel.getById(req.params.id);
        if (!bot) return res.status(404).json({ error: "Bot not found" });
        const isSuper = req.session.isSuperAdmin === true;
        const ownerFbid = req.session.facebookUserID;
        if (!isSuper && bot.ownerFbid !== ownerFbid) {
            return res.status(403).json({ error: "Permission denied" });
        }

        const result = await startBotProcess(req.params.id);
        res.json(result);
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

        const result = await stopBotProcess(req.params.id);
        res.json(result);
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

        const allBots = await botModel.getAll();
        for (const b of allBots) {
            if (b.active) {
                await botModel.update(b.id, { active: false });
            }
        }
        await botModel.update(req.params.id, { active: true });

        if (!bot.running) {
            await startBotProcess(req.params.id);
        }

        res.json({ success: true, message: "Bot activated!" });
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
    
    // Validate fbstate format
    try {
        const parsed = JSON.parse(fbstate);
        if (!Array.isArray(parsed)) {
            return res.json({ status: "error", message: "fbstate must be a JSON array" });
        }
    } catch (e) {
        return res.json({ status: "error", message: "Invalid JSON format" });
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
// ===== ORIGINAL ROUTES =====
// ================================================================

app.get("/stats", async (req, res) => {
    try {
        let fcaVersion;
        try { fcaVersion = require("fca-r3nz75/package.json").version; }
        catch (e) { fcaVersion = "unknown"; }

        let botVersion;
        try { botVersion = require(process.cwd() + "/package.json").version; }
        catch (e) { botVersion = "unknown"; }

        const totalThread = threadsData ? (await threadsData.getAll()).filter(t => t.threadID?.toString().length > 15).length : 0;
        const totalUser = usersData ? (await usersData.getAll()).length : 0;
        const uptime = Math.floor(process.uptime());

        res.json({
            fcaVersion,
            botVersion,
            totalThread,
            totalUser,
            uptime,
            uptimeSecond: process.uptime(),
            commandsCount: 0,
            eventsCount: 0,
            isConnected: false,
            botID: null,
            prefix: "$",
            language: "en",
            nameBot: "RENZ MESSENGER BOT",
            dbType: "Firebase",
            nodeVersion: process.version
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================================================================
// ===== 404 HANDLER =====
// ================================================================

app.get("*", (req, res) => {
    res.status(404).json({ error: "Not found" });
});

app.use((err, req, res, next) => {
    console.error('[DASHBOARD] Error:', err);
    res.status(500).json({ error: err.message });
});

// ================================================================
// ===== START SERVER =====
// ================================================================

async function startServer() {
    try {
        // Connect to database
        await connectDatabase();

        // Load admin config
        await loadAdminConfig();

        // Restore running bots
        try {
            await restoreRunningBots();
            console.log('[DASHBOARD] Bot restoration complete');
        } catch (err) {
            console.error('[DASHBOARD] Failed to restore bots:', err);
        }

        const PORT = process.env.PORT || 5000;

        server.listen(PORT, "0.0.0.0", () => {
            let dashBoardUrl;
            if (process.env.RENDER_EXTERNAL_URL) {
                dashBoardUrl = process.env.RENDER_EXTERNAL_URL;
            } else if (process.env.RAILWAY_PUBLIC_DOMAIN) {
                dashBoardUrl = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
            } else {
                dashBoardUrl = `http://localhost:${PORT}`;
            }
            console.log(`[DASHBOARD] ✅ Dashboard is running: ${dashBoardUrl}`);
            console.log(`[DASHBOARD] 📡 Listening on port ${PORT}`);
        });

        // Start socket.io if enabled
        if (config.serverUptime?.socket?.enable) {
            try {
                require("../bot/login/socketIO.js")(server);
            } catch (err) {
                console.warn('[DASHBOARD] Socket.IO failed:', err.message);
            }
        }

    } catch (err) {
        console.error('[DASHBOARD] Failed to start:', err);
        process.exit(1);
    }
}

// ================================================================
// ===== HELPER FUNCTIONS =====
// ================================================================

function randomStringApikey(max) {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < max; i++)
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
}

// ================================================================
// ===== START =====
// ================================================================

startServer();