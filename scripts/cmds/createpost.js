const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');

module.exports = {
  config: {
    name: "createpost",
    version: "2.5.0",
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
      
      const result = await createPost(api, content, "EVERYONE", []);
      
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
      
      console.log('Uploading images:', attachments.length);

      for (const attachment of attachments) {
        if (attachment.type !== "photo") {
          console.log('Skipping non-photo attachment:', attachment.type);
          continue;
        }
        
        try {
          console.log('Downloading image from:', attachment.url);
          
          const response = await axios.get(attachment.url, { 
            responseType: 'arraybuffer',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
          
          let imageBuffer = Buffer.from(response.data);
          console.log(`Original size: ${(imageBuffer.length / 1024 / 1024).toFixed(2)} MB`);
          
          if (imageBuffer.length > 3.5 * 1024 * 1024) {
            console.log('Compressing image...');
            imageBuffer = await sharp(imageBuffer)
              .resize(1080, null, {
                withoutEnlargement: true,
                fit: 'inside'
              })
              .jpeg({ quality: 75, progressive: true })
              .toBuffer();
            console.log(`Compressed size: ${(imageBuffer.length / 1024 / 1024).toFixed(2)} MB`);
          }
          
          const { Readable } = require('stream');
          const stream = Readable.from(imageBuffer);
          stream.name = 'image.jpg';
          
          console.log('Uploading using api.uploadAttachment...');
          
          const uploadResult = await new Promise((resolve, reject) => {
            api.uploadAttachment([stream], (err, info) => {
              if (err) {
                console.log('Upload error:', err);
                reject(err);
              } else {
                console.log('Upload success:', info);
                resolve(info);
              }
            });
          });
          
          if (uploadResult && uploadResult.length > 0) {
            const uploadData = uploadResult[0];
            if (uploadData && uploadData.image_id) {
              uploadedIds.push(uploadData.image_id.toString());
              console.log('Image uploaded! ID:', uploadData.image_id);
            }
          }
          
        } catch (err) {
          console.error('Upload error:', err.message);
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
      if (body.trim().toLowerCase() != "skip") {
        if (event.attachments && event.attachments.length > 0) {
          console.log('Processing images...');
          const imageIds = await uploadImages(event.attachments);
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
        
        const result = await createPost(
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
      
      if (body.trim().toLowerCase() !== "skip" && event.attachments && event.attachments.length > 0) {
        const imageIds = await uploadImages(event.attachments);
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

// Helper function to create a post using different methods
async function createPost(api, caption, privacy, imageIds) {
  try {
    const botID = api.getCurrentUserID();
    
    // Try Method 1: Using the feed publish endpoint
    try {
      console.log('Method 1: Using feed publish...');
      
      const form = {
        message: caption || "",
        profile_id: botID,
        privacy: privacy || "EVERYONE",
        source: "www"
      };
      
      // Add image IDs if present
      if (imageIds && imageIds.length > 0) {
        form.attached_media = imageIds.map(id => `{"media_fbid":"${id}"}`).join(',');
      }
      
      const result = await new Promise((resolve, reject) => {
        api.httpPost('https://www.facebook.com/feed/publish.php', form, (err, res) => {
          if (err) reject(err);
          else resolve(res);
        });
      });
      
      let data = result;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch (e) {
          // If not JSON, try to extract post ID from HTML
          const postIdMatch = data.match(/story_fbid=([^&"]+)/);
          if (postIdMatch) {
            return {
              success: true,
              postID: postIdMatch[1],
              url: `https://www.facebook.com/${postIdMatch[1]}`
            };
          }
        }
      }
      
      if (data && data.payload && data.payload.post_id) {
        return {
          success: true,
          postID: data.payload.post_id,
          url: `https://www.facebook.com/${data.payload.post_id}`
        };
      }
      
      console.log('Method 1 failed, trying Method 2...');
    } catch (err) {
      console.log('Method 1 error:', err.message);
    }
    
    // Try Method 2: Using Graph API with different doc_id
    try {
      console.log('Method 2: Using Graph API...');
      
      const uuid = getGUID();
      const attachments = imageIds.map(id => ({
        "photo": { "id": id }
      }));
      
      const form = {
        av: botID,
        fb_api_req_friendly_name: "ComposerStoryCreateMutation",
        fb_api_caller_class: "RelayModern",
        doc_id: "6255089511280268", // Different doc_id
        variables: JSON.stringify({
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
        })
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
        console.log('Method 2 errors:', data.errors);
        throw new Error(data.errors[0]?.message || 'GraphQL error');
      }
      
      const postID = data.data?.story_create?.story?.legacy_story_hideable_id;
      const url = data.data?.story_create?.story?.url;
      
      if (postID) {
        return {
          success: true,
          postID: postID,
          url: url || `https://www.facebook.com/${postID}`
        };
      }
      
      console.log('Method 2 failed');
    } catch (err) {
      console.log('Method 2 error:', err.message);
    }
    
    // Try Method 3: Using simple status update
    try {
      console.log('Method 3: Simple status update...');
      
      const form = {
        message: caption || "",
        profile_id: botID,
        privacy: privacy || "EVERYONE"
      };
      
      const result = await new Promise((resolve, reject) => {
        api.httpPost('https://www.facebook.com/ajax/feed/publish.php', form, (err, res) => {
          if (err) reject(err);
          else resolve(res);
        });
      });
      
      let data = result;
      if (typeof data === 'string') {
        data = JSON.parse(data.replace('for (;;);', ''));
      }
      
      if (data && data.payload && data.payload.post_id) {
        return {
          success: true,
          postID: data.payload.post_id,
          url: `https://www.facebook.com/${data.payload.post_id}`
        };
      }
    } catch (err) {
      console.log('Method 3 error:', err.message);
    }
    
    return {
      success: false,
      error: 'All post creation methods failed. The bot account may be restricted from posting.'
    };
    
  } catch (error) {
    console.error('Create post error:', error);
    return {
      success: false,
      error: error.message || 'Unknown error'
    };
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
