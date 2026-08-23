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
      
      const result = await createPostDirect(api, content, "EVERYONE", []);
      
      if (result.success) {
        return message.reply(
          `✅ Post created successfully!\n\n📌 Post ID: ${result.postID}\n🔗 Link: ${result.url}`
        );
      } else {
        return message.reply(`❌ Failed to create post: ${result.error}`);
      }
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

    async function uploadImages(attachments) {
      const uploadedIds = [];
      const cacheDir = path.join(__dirname, 'cache');
      
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }

      for (const attachment of attachments) {
        if (attachment.type !== "photo") continue;
        
        try {
          const pathImage = path.join(cacheDir, `upload_${Date.now()}.png`);
          
          const response = await axios.get(attachment.url, { responseType: 'arraybuffer' });
          fs.writeFileSync(pathImage, Buffer.from(response.data));
          
          const form = new FormData();
          form.append('file', fs.createReadStream(pathImage));
          form.append('profile_id', botID);
          form.append('photo_source', '57');
          form.append('av', botID);
          
          const uploadResult = await new Promise((resolve, reject) => {
            api.httpPost(
              `https://www.facebook.com/profile/picture/upload/?profile_id=${botID}&photo_source=57&av=${botID}`,
              form,
              (err, res) => {
                if (err) reject(err);
                else resolve(res);
              }
            );
          });
          
          let result = uploadResult;
          if (typeof result === 'string') {
            result = JSON.parse(result.replace('for (;;);', ''));
          }
          
          if (result && result.payload && result.payload.fbid) {
            uploadedIds.push(result.payload.fbid.toString());
          }
          
          try { fs.unlinkSync(pathImage); } catch(e) {}
          
        } catch (err) {
          console.error('Upload error:', err);
        }
      }
      
      return uploadedIds;
    }

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
      if (body.trim().toLowerCase() != "skip" && attachments && attachments.length > 0) {
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
        
        const result = await createPostDirect(
          api,
          postData.caption || "",
          postData.audience || "FRIENDS",
          postData.imageIds || []
        );
        
        api.unsendMessage(creatingMsg.messageID);
        
        if (result.success) {
          return api.sendMessage(
            `✅ **POST CREATED SUCCESSFULLY!**\n\n` +
            `👁️ Audience: ${postData.audience}\n` +
            `📝 Caption: ${postData.caption || "(Empty)"}\n` +
            `🖼️ Images: ${postData.imageIds.length > 0 ? postData.imageIds.length + " image(s)" : "None"}\n\n` +
            `📌 Post ID: ${result.postID}\n` +
            `🔗 Link: ${result.url}`,
            threadID,
            messageID
          );
        } else {
          return api.sendMessage(
            `❌ Failed to create post: ${result.error}`,
            threadID,
            messageID
          );
        }
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

// Direct post creation function with multiple doc_ids
async function createPostDirect(api, caption, privacy, imageIds) {
  const uuid = getGUID();
  const botID = api.getCurrentUserID();
  
  // Try different doc_ids
  const docIds = [
    "7711610262190099",  // Original
    "6255089511280268",  // Alternative
    "962966763528889",   // Newer
    "2991841423402055"   // Another
  ];
  
  // Build attachments
  const attachments = imageIds.map(id => ({
    "photo": { "id": id }
  }));
  
  for (const docId of docIds) {
    try {
      console.log(`Trying doc_id: ${docId}`);
      
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
        doc_id: docId,
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
        console.log(`doc_id ${docId} failed:`, data.errors[0]?.message);
        continue;
      }

      const postID = data.data?.story_create?.story?.legacy_story_hideable_id;
      const url = data.data?.story_create?.story?.url;

      if (postID) {
        console.log(`Success with doc_id: ${docId}`);
        return {
          success: true,
          postID: postID,
          url: url || `https://www.facebook.com/${postID}`
        };
      }
      
    } catch (error) {
      console.log(`doc_id ${docId} error:`, error.message);
    }
  }
  
  return {
    success: false,
    error: "All doc_ids failed. Facebook may have updated their API."
  };
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
