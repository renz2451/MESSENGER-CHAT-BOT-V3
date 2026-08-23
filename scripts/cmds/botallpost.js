const fs = require('fs-extra');
const path = require('path');

module.exports = {
  config: {
    name: "botallpost",
    version: "1.0.0",
    author: "Renz",
    role: 2,
    usePrefix: true,
    description: "Create a post on all groups the bot is in",
    guide: "{pn} [content]",
    category: "operator",
    cooldowns: 10,
    aliases: ["allpost", "globalpost"]
  },

  onStart: async function ({ api, event, args, message }) {
    const { threadID, messageID, senderID } = event;
    
    // Get content from arguments
    let content = args.join(' ');
    
    if (!content) {
      return message.reply('❌ Please provide post content!\nExample: $botallpost Hello everyone!');
    }

    // Get all thread IDs the bot is in
    const threadList = await api.getThreadList(100, null, ["INBOX"]);
    const groupThreads = threadList.filter(thread => thread.isGroup === true);
    
    if (groupThreads.length === 0) {
      return message.reply('❌ Bot is not in any groups.');
    }

    // Send confirmation
    const confirmMsg = await message.reply(
      `📝 **BOT ALL POST**\n\n` +
      `📄 Content: ${content}\n` +
      `📊 Groups: ${groupThreads.length} groups found\n\n` +
      `Reply with "confirm" to post to all groups, or "cancel" to abort.`
    );

    // Store for reply handler
    if (!global.GoatBot) global.GoatBot = {};
    if (!global.GoatBot.onReply) global.GoatBot.onReply = new Map();
    
    global.GoatBot.onReply.set(confirmMsg.messageID, {
      commandName: this.config.name,
      author: senderID,
      content: content,
      threadList: groupThreads,
      type: "confirm"
    });

    return;
  },

  onReply: async function ({ api, event, Reply, getLang }) {
    const { author, content, threadList, type } = Reply;
    const { threadID, messageID, senderID, body } = event;

    if (event.senderID != author) return;

    if (type === "confirm") {
      if (body.toLowerCase() === "cancel") {
        await api.unsendMessage(Reply.messageID);
        return api.sendMessage('❌ Post cancelled.', threadID, messageID);
      }
      
      if (body.toLowerCase() !== "confirm") {
        return api.sendMessage('❌ Please reply with "confirm" or "cancel"', threadID, messageID);
      }

      await api.unsendMessage(Reply.messageID);
      
      const creatingMsg = await api.sendMessage(
        `⏳ Creating post in ${threadList.length} groups...`,
        threadID
      );

      let successCount = 0;
      let failCount = 0;
      let failedGroups = [];

      // Send post to each group
      for (const group of threadList) {
        try {
          // Create post in group
          const formData = {
            input: {
              composer_entry_point: "inline_composer",
              composer_source_surface: "group",
              idempotence_token: getGUID() + "_FEED",
              source: "WWW",
              attachments: [],
              audience: {
                to_id: group.threadID
              },
              message: {
                ranges: [],
                text: content
              },
              with_tags_ids: [],
              inline_activities: [],
              explicit_place_id: "0",
              text_format_preset_id: "0",
              logging: {
                composer_session_id: getGUID()
              },
              tracking: [null],
              actor_id: api.getCurrentUserID(),
              client_mutation_id: Math.floor(Math.random() * 17)
            },
            displayCommentsFeedbackContext: null,
            displayCommentsContextEnableComment: null,
            displayCommentsContextIsAdPreview: null,
            displayCommentsContextIsAggregatedShare: null,
            displayCommentsContextIsStorySet: null,
            feedLocation: "GROUP",
            feedbackSource: 0,
            focusCommentID: null,
            gridMediaWidth: 230,
            groupID: null,
            scale: 3,
            privacySelectorRenderLocation: "COMET_STREAM",
            renderLocation: "group",
            useDefaultActor: false,
            inviteShortLinkKey: null,
            isFeed: false,
            isFundraiser: false,
            isFunFactPost: false,
            isGroup: true,
            isTimeline: false,
            isSocialLearning: false,
            isPageNewsFeed: false,
            isProfileReviews: false,
            isWorkSharedDraft: false,
            UFI2CommentsProvider_commentsKey: "CometGroupDiscussionRootSuccessQuery",
            hashtag: null,
            canUserManageOffers: false
          };

          const botID = api.getCurrentUserID();
          
          const form = {
            av: botID,
            fb_api_req_friendly_name: "ComposerStoryCreateMutation",
            fb_api_caller_class: "RelayModern",
            doc_id: "7711610262190099",
            variables: JSON.stringify(formData)
          };

          await new Promise((resolve, reject) => {
            api.httpPost('https://www.facebook.com/api/graphql/', form, (err, info) => {
              if (err) {
                reject(err);
              } else {
                resolve(info);
              }
            });
          });

          successCount++;
          
          // Add small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (err) {
          console.error(`Failed to post in group ${group.threadID}:`, err);
          failCount++;
          failedGroups.push(group.name || group.threadID);
        }
      }

      // Cleanup
      try {
        const cacheDir = path.join(__dirname, 'cache');
        if (fs.existsSync(cacheDir)) {
          const files = fs.readdirSync(cacheDir);
          for (const file of files) {
            if (file.includes('upload_') || file.includes('imagePost') || file.includes('videoPost')) {
              fs.unlinkSync(path.join(cacheDir, file));
            }
          }
        }
      } catch(cleanupErr) {}

      // Send result
      let resultMsg = `✅ **BOT ALL POST COMPLETED!**\n\n`;
      resultMsg += `📄 Content: ${content}\n`;
      resultMsg += `✅ Success: ${successCount} groups\n`;
      resultMsg += `❌ Failed: ${failCount} groups\n`;

      if (failedGroups.length > 0) {
        resultMsg += `\n⚠️ Failed groups:\n${failedGroups.slice(0, 10).map(g => `- ${g}`).join('\n')}`;
        if (failedGroups.length > 10) {
          resultMsg += `\n... and ${failedGroups.length - 10} more`;
        }
      }

      await api.unsendMessage(creatingMsg.messageID);
      return api.sendMessage(resultMsg, threadID, messageID);
    }
  }
};

function getGUID() {
  var sectionLength = Date.now();
  var id = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    var r = Math.floor((sectionLength + Math.random() * 16) % 16);
    sectionLength = Math.floor(sectionLength / 16);
    var _guid = (c == "x" ? r : (r & 7) | 8).toString(16);
    return _guid;
  });
  return id;
}
