const path = require("path");
const dirConfig = path.join(`${__dirname}/../${process.env.NODE_ENV === 'development' ? 'config.dev.json' : 'config.json'}`);
const dirConfigCommands = path.join(`${__dirname}/../${process.env.NODE_ENV === 'development' ? 'configCommands.dev.json' : 'configCommands.json'}`);

global.GoatBot = {
    config: require(dirConfig),
    configCommands: require(dirConfigCommands)
};
global.utils = require("../utils.js");
global.client = {
    database: {
        creatingThreadData: [],
        creatingUserData: [],
        creatingDashBoardData: []
    }
};
global.db = {
    allThreadData: [],
    allUserData: [],
    globalData: []
};

module.exports = async function () {
    const controller = await require(path.join(__dirname, "..", "database/controller/index.js"))(null);
    // data is loaded here
    const {
        threadModel,
        userModel,
        dashBoardModel,
        globalModel,
        threadsData,
        usersData,
        dashBoardData,
        globalData
    } = controller;

    // ====== NEW: Add botModel for multi-bot management ======
    // We need to create a new model for bots.
    // This assumes your database controller supports adding new models.
    // If not, you may need to define the schema here or in your main database file.
    // For simplicity, we'll try to get it from the controller if it exists.
    let botModel = null;
    let botData = null;
    try {
        // Attempt to get botModel from controller (if you've added it there)
        botModel = controller.botModel;
        botData = controller.botData;
    } catch (e) {
        // If not, we'll define it here using mongoose if available
        const mongoose = require('mongoose');
        const botSchema = new mongoose.Schema({
            ownerFbid: { type: String, required: true },
            fbstate: { type: String, required: true },
            botName: { type: String, default: 'My Bot' },
            active: { type: Boolean, default: false },
            createdAt: { type: Date, default: Date.now }
        });
        botModel = mongoose.model('Bot', botSchema);
        // We don't have a botData equivalent; we'll just use botModel directly
        botData = botModel;
    }

    return {
        threadModel,
        userModel,
        dashBoardModel,
        globalModel,
        threadsData,
        usersData,
        dashBoardData,
        globalData,
        botModel,    // 👈 new
        botData      // 👈 new (if needed)
    };
};
