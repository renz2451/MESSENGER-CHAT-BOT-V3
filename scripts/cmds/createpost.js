const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

module.exports = {
  config: {
    name: "createpost",
    version: "2.7.0",
    author: "Renz",
    role: 2,
    usePrefix: true,
    description: "Create a new post on your Facebook timeline with full control",
    guide: "{pn} [content]",
    category: "operator",
    cooldowns: 5,
    aliases: ["bot_post", "post"]
  },

  onStart: async function ({ api, event, args, message }) {
    const { threadID, messageID, senderID } = event;
    const uuid = getGUID();
    
    if (!global.GoatBot) global.GoatBot = {};
    if (!global.GoatBot.onReply) global.GoatBot.onReply = new Map();
    
    if (args && args.length > 0) {
      const content = args.join(' ');
      await createPostDirect(api, content, "EVERYONE", [], threadID, messageID, message);
      return;
    }

    const postData = {
      audience: "FRIENDS",
      caption: "",
      images: [],
      imageIds: []
    };

    const msg = await api.sendMessage(
      `📝 Choose who can see this post:\n\n1️⃣ Everyone\n2️⃣ Friends\n3️⃣ Only Me`,
      threadID
    );

    if (!global.GoatBot.onReply) global.GoatBot.onReply = new Map();
    global.GoatBot.onReply.set(msg.messageID, {
      commandName: this.config.name,
      author: senderID,
      postData: postData,
      type: "whoSee"
    });

    return;
  },

  onReply: async function ({ api, event, Reply, getLang }) {
    console.log('onReply triggered:', event.body);
    
    const { author, postData, type } = Reply;
    const { threadID, messageID, senderID, attachments, body } = event;
    const botID = api.getCurrentUserID();

    if (!Reply || event.senderID != author) return;

    // Helper to upload images
    async function uploadImages(attachments) {
      const uploadedIds = [];
      
      for (const attachment of attachments) {
        if (attachment.type !== "photo") continue;
        
        try {
          const cacheDir = path.join(__dirname, 'cache');
          if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
          
          const pathImage = path.join(cacheDir, `upload_${Date.now()}.jpg`);
          const response = await axios.get(attachment.url, { responseType: 'arraybuffer' });
          fs.writeFileSync(pathImage, Buffer.from(response.data));
          
          // Use api.uploadAttachment
          const uploadResult = await new Promise((resolve, reject) => {
            api.uploadAttachment([fs.createReadStream(pathImage)], (err, info) => {
              if (err) reject(err);
              else resolve(info);
            });
          });
          
          if (uploadResult && uploadResult.length > 0) {
            const uploadData = uploadResult[0];
            if (uploadData && uploadData.image_id) {
              uploadedIds.push(uploadData.image_id.toString());
            } else if (uploadData && uploadData.fbid) {
              uploadedIds.push(uploadData.fbid.toString());
            }
          }
          
          try { fs.unlinkSync(pathImage); } catch(e) {}
        } catch (err) {
          console.error('Upload error:', err.message);
        }
      }
      
      return uploadedIds;
    }

    // Helper to show overview
    function showOverview(data) {
      const privacyMap = {
        "EVERYONE": "🌍 Everyone",
        "FRIENDS": "👥 Friends",
        "SELF": "🔒 Only Me"
      };
      
      return `📋 **POST OVERVIEW**

👁️ Audience: ${privacyMap[data.audience] || data.audience}
📝 Caption: ${data.caption || "(Empty)"}
🖼️ Attached File: ${data.imageIds.length > 0 ? `${data.imageIds.length} image(s) attached` : "❌ Ignored"}

1️⃣ Edit
2️⃣ Confirm
3️⃣ Cancel`;
    }

    if (type == "whoSee") {
      if (!["1", "2", "3"].includes(body.trim())) {
        return api.sendMessage('❌ Please choose 1, 2, or 3', threadID, messageID);
      }
      
      const privacyMap = {
        "1": "EVERYONE",
        "2": "FRIENDS",
        "3": "SELF"
      };
      
      postData.audience = privacyMap[body.trim()];
      
      await api.unsendMessage(Reply.messageID);
      
      const msg = await api.sendMessage(
        `👥 Audience: ${postData.audience}\n\n📝 Enter your caption (or reply "skip" to ignore)`,
        threadID
      );

      if (!global.GoatBot.onReply) global.GoatBot.onReply = new Map();
      global.GoatBot.onReply.set(msg.messageID, {
        commandName: this.config.name,
        author: senderID,
        postData: postData,
        type: "caption"
      });
    }
    else if (type == "caption") {
      if (body.trim().toLowerCase() != "skip" && body.trim() != "") {
        postData.caption = body;
      }
      
      await api.unsendMessage(Reply.messageID);
      
      const msg = await api.sendMessage(
        `📝 Caption: ${postData.caption || "(Empty)"}\n\n🖼️ Send image(s) or reply "skip" to ignore`,
        threadID
      );

      if (!global.GoatBot.onReply) global.GoatBot.onReply = new Map();
      global.GoatBot.onReply.set(msg.messageID, {
        commandName: this.config.name,
        author: senderID,
        postData: postData,
        type: "images"
      });
    }
    else if (type == "images") {
      if (body.trim().toLowerCase() != "skip") {
        if (attachments && attachments.length > 0) {
          const imageIds = await uploadImages(attachments);
          if (imageIds.length > 0) {
            postData.imageIds = imageIds;
          }
        }
      }

      await api.unsendMessage(Reply.messageID);
      
      const overview = showOverview(postData);
      const msg = await api.sendMessage(overview, threadID);

      if (!global.GoatBot.onReply) global.GoatBot.onReply = new Map();
      global.GoatBot.onReply.set(msg.messageID, {
        commandName: this.config.name,
        author: senderID,
        postData: postData,
        type: "overview"
      });
    }
    else if (type == "overview") {
      const choice = body.trim();
      
      if (choice === "1") {
        await api.unsendMessage(Reply.messageID);
        
        const msg = await api.sendMessage(
          `✏️ What do you want to edit?\n\n1️⃣ Audience\n2️⃣ Caption\n3️⃣ Attached File`,
          threadID
        );
        
        if (!global.GoatBot.onReply) global.GoatBot.onReply = new Map();
        global.GoatBot.onReply.set(msg.messageID, {
          commandName: this.config.name,
          author: senderID,
          postData: postData,
          type: "editChoice"
        });
      }
      else if (choice === "2") {
        await api.unsendMessage(Reply.messageID);
        
        const creatingMsg = await api.sendMessage('⏳ Creating your post...', threadID);
        
        await createPostDirect(
          api,
          postData.caption || "",
          postData.audience || "FRIENDS",
          postData.imageIds || [],
          threadID,
          messageID,
          null,
          creatingMsg
        );
      }
      else if (choice === "3") {
        await api.unsendMessage(Reply.messageID);
        return api.sendMessage('❌ Post creation cancelled.', threadID, messageID);
      }
      else {
        return api.sendMessage('❌ Invalid choice. Please choose 1, 2, or 3', threadID, messageID);
      }
    }
    else if (type == "editChoice") {
      const choice = body.trim();
      
      if (choice === "1") {
        await api.unsendMessage(Reply.messageID);
        
        const msg = await api.sendMessage(
          `📝 Choose who can see this post:\n\n1️⃣ Everyone\n2️⃣ Friends\n3️⃣ Only Me`,
          threadID
        );
        
        if (!global.GoatBot.onReply) global.GoatBot.onReply = new Map();
        global.GoatBot.onReply.set(msg.messageID, {
          commandName: this.config.name,
          author: senderID,
          postData: postData,
          type: "editAudience"
        });
      }
      else if (choice === "2") {
        await api.unsendMessage(Reply.messageID);
        
        const msg = await api.sendMessage(
          `📝 Enter new caption (or reply "skip" to keep current)`,
          threadID
        );
        
        if (!global.GoatBot.onReply) global.GoatBot.onReply = new Map();
        global.GoatBot.onReply.set(msg.messageID, {
          commandName: this.config.name,
          author: senderID,
          postData: postData,
          type: "editCaption"
        });
      }
      else if (choice === "3") {
        await api.unsendMessage(Reply.messageID);
        
        postData.imageIds = [];
        
        const msg = await api.sendMessage(
          `🖼️ Send new image(s) or reply "skip" to keep none`,
          threadID
        );
        
        if (!global.GoatBot.onReply) global.GoatBot.onReply = new Map();
        global.GoatBot.onReply.set(msg.messageID, {
          commandName: this.config.name,
          author: senderID,
          postData: postData,
          type: "editImages"
        });
      }
      else {
        return api.sendMessage('❌ Invalid choice. Please choose 1, 2, or 3', threadID, messageID);
      }
    }
    else if (type == "editAudience") {
      if (!["1", "2", "3"].includes(body.trim())) {
        return api.sendMessage('❌ Please choose 1, 2, or 3', threadID, messageID);
      }
      
      const privacyMap = {
        "1": "EVERYONE",
        "2": "FRIENDS",
        "3": "SELF"
      };
      
      postData.audience = privacyMap[body.trim()];
      
      await api.unsendMessage(Reply.messageID);
      
      const overview = showOverview(postData);
      const msg = await api.sendMessage(overview, threadID);
      
      if (!global.GoatBot.onReply) global.GoatBot.onReply = new Map();
      global.GoatBot.onReply.set(msg.messageID, {
        commandName: this.config.name,
        author: senderID,
        postData: postData,
        type: "overview"
      });
    }
    else if (type == "editCaption") {
      if (body.trim().toLowerCase() !== "skip" && body.trim() !== "") {
        postData.caption = body;
      }
      
      await api.unsendMessage(Reply.messageID);
      
      const overview = showOverview(postData);
      const msg = await api.sendMessage(overview, threadID);
      
      if (!global.GoatBot.onReply) global.GoatBot.onReply = new Map();
      global.GoatBot.onReply.set(msg.messageID, {
        commandName: this.config.name,
        author: senderID,
        postData: postData,
        type: "overview"
      });
    }
    else if (type == "editImages") {
      postData.imageIds = [];
      
      if (body.trim().toLowerCase() !== "skip" && attachments && attachments.length > 0) {
        const imageIds = await uploadImages(attachments);
        if (imageIds.length > 0) {
          postData.imageIds = imageIds;
        }
      }
      
      await api.unsendMessage(Reply.messageID);
      
      const overview = showOverview(postData);
      const msg = await api.sendMessage(overview, threadID);
      
      if (!global.GoatBot.onReply) global.GoatBot.onReply = new Map();
      global.GoatBot.onReply.set(msg.messageID, {
        commandName: this.config.name,
        author: senderID,
        postData: postData,
        type: "overview"
      });
    }
  }
};

// Direct post creation function using working method
async function createPostDirect(api, caption, privacy, imageIds, threadID, messageID, message, creatingMsg) {
  try {
    const uuid = getGUID();
    const botID = api.getCurrentUserID();
    
    // Build attachments
    const attachments = imageIds.map(id => ({
      "photo": { "id": id }
    }));
    
    const formData = {
      input: {
        composer_entry_point: "inline_composer",
        composer_source_surface: "timeline",
        idempotence_token: uuid + "_FEED",
        source: "WWW",
        attachments: attachments,
        audience: {
          privacy: {
            allow: [],
            base_state: privacy || "EVERYONE",
            deny: [],
            tag_expansion_state: "UNSPECIFIED"
          }
        },
        message: {
          ranges: [],
          text: caption || ""
        },
        with_tags_ids: [],
        inline_activities: [],
        explicit_place_id: "0",
        text_format_preset_id: "0",
        logging: {
          composer_session_id: uuid
        },
        tracking: [null],
        actor_id: botID,
        client_mutation_id: Math.floor(Math.random() * 17)
      },
      displayCommentsFeedbackContext: null,
      displayCommentsContextEnableComment: null,
      displayCommentsContextIsAdPreview: null,
      displayCommentsContextIsAggregatedShare: null,
      displayCommentsContextIsStorySet: null,
      feedLocation: "TIMELINE",
      feedbackSource: 0,
      focusCommentID: null,
      gridMediaWidth: 230,
      groupID: null,
      scale: 3,
      privacySelectorRenderLocation: "COMET_STREAM",
      renderLocation: "timeline",
      useDefaultActor: false,
      inviteShortLinkKey: null,
      isFeed: false,
      isFundraiser: false,
      isFunFactPost: false,
      isGroup: false,
      isTimeline: true,
      isSocialLearning: false,
      isPageNewsFeed: false,
      isProfileReviews: false,
      isWorkSharedDraft: false,
      UFI2CommentsProvider_commentsKey: "ProfileCometTimelineRoute",
      hashtag: null,
      canUserManageOffers: false
    };

    const form = {
      av: botID,
      fb_api_req_friendly_name: "ComposerStoryCreateMutation",
      fb_api_caller_class: "RelayModern",
      doc_id: "7711610262190099", // Working doc_id
      variables: JSON.stringify(formData)
    };

    const result = await new Promise((resolve, reject) => {
      api.httpPost('https://www.facebook.com/api/graphql/', form, (err, res) => {
        if (err) reject(err);
        else resolve(res);
      });
    });

    let data = result;
    if (typeof data === 'string') {
      data = JSON.parse(data.replace('for (;;);', ''));
    }

    if (data.errors) {
      console.error('GraphQL Errors:', data.errors);
      throw new Error(data.errors[0]?.message || 'GraphQL error');
    }

    const postID = data.data?.story_create?.story?.legacy_story_hideable_id;
    const urlPost = data.data?.story_create?.story?.url;

    if (!postID) {
      throw new Error('No post ID returned');
    }

    // Clean up creating message if provided
    if (creatingMsg) {
      api.unsendMessage(creatingMsg.messageID);
    }

    const privacyMap = {
      "EVERYONE": "🌍 Everyone",
      "FRIENDS": "👥 Friends",
      "SELF": "🔒 Only Me"
    };

    const successMsg = `✅ **POST CREATED SUCCESSFULLY!**\n\n` +
      `👁️ Audience: ${privacyMap[privacy] || privacy}\n` +
      `📝 Caption: ${caption || "(Empty)"}\n` +
      `🖼️ Images: ${imageIds.length > 0 ? imageIds.length + " image(s)" : "None"}\n\n` +
      `📌 Post ID: ${postID}\n` +
      `🔗 Link: ${urlPost || `https://www.facebook.com/${postID}`}`;

    if (message) {
      return message.reply(successMsg);
    } else {
      return api.sendMessage(successMsg, threadID, messageID);
    }

  } catch (error) {
    console.error('Post creation error:', error);
    
    // Clean up creating message if provided
    if (creatingMsg) {
      api.unsendMessage(creatingMsg.messageID);
    }

    const errorMsg = `❌ Failed to create post: ${error.message || 'Unknown error'}`;
    
    if (message) {
      return message.reply(errorMsg);
    } else {
      return api.sendMessage(errorMsg, threadID, messageID);
    }
  }
}

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
