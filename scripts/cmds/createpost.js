const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');
const { Readable } = require('stream');

module.exports = {
  config: {
    name: "createpost",
    version: "2.3.0",
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
      
      const formData = {
        input: {
          composer_entry_point: "inline_composer",
          composer_source_surface: "timeline",
          idempotence_token: uuid + "_FEED",
          source: "WWW",
          attachments: [],
          audience: {
            privacy: {
              allow: [],
              base_state: "EVERYONE",
              deny: [],
              tag_expansion_state: "UNSPECIFIED"
            }
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
            composer_session_id: uuid
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

      const botID = api.getCurrentUserID();
      
      const form = {
        av: botID,
        fb_api_req_friendly_name: "ComposerStoryCreateMutation",
        fb_api_caller_class: "RelayModern",
        doc_id: "7711610262190099",
        variables: JSON.stringify(formData)
      };

      const creatingMsg = await message.reply('📝 Creating your post...');

      api.httpPost('https://www.facebook.com/api/graphql/', form, (e, info) => {
        try {
          if (e) throw e;
          if (typeof info == "string") {
            info = JSON.parse(info.replace("for (;;);", ""));
          }
          
          const postID = info.data?.story_create?.story?.legacy_story_hideable_id;
          const urlPost = info.data?.story_create?.story?.url;
          
          if (!postID) throw info.errors || new Error('Failed to create post');
          
          api.unsendMessage(creatingMsg.messageID);
          
          return api.sendMessage(
            `✅ Post created successfully!\n\n📌 Post ID: ${postID}\n🔗 Link: ${urlPost}`,
            threadID,
            messageID
          );
        } catch (err) {
          console.error('Post creation error:', err);
          api.unsendMessage(creatingMsg.messageID);
          return api.sendMessage(
            `❌ Failed to create post. Please try again later.`,
            threadID,
            messageID
          );
        }
      });
      
      return;
    }

    const postData = {
      formData: {
        input: {
          composer_entry_point: "inline_composer",
          composer_source_surface: "timeline",
          idempotence_token: uuid + "_FEED",
          source: "WWW",
          attachments: [],
          audience: {
            privacy: {
              allow: [],
              base_state: "FRIENDS",
              deny: [],
              tag_expansion_state: "UNSPECIFIED"
            }
          },
          message: {
            ranges: [],
            text: ""
          },
          with_tags_ids: [],
          inline_activities: [],
          explicit_place_id: "0",
          text_format_preset_id: "0",
          logging: {
            composer_session_id: uuid
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
      },
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
      
      console.log('Uploading images:', attachments.length);

      for (const attachment of attachments) {
        if (attachment.type !== "photo") {
          console.log('Skipping non-photo attachment:', attachment.type);
          continue;
        }
        
        try {
          console.log('Downloading image from:', attachment.url);
          
          // Download image as buffer
          const response = await axios.get(attachment.url, { 
            responseType: 'arraybuffer',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
          
          let imageBuffer = Buffer.from(response.data);
          console.log(`Original size: ${(imageBuffer.length / 1024 / 1024).toFixed(2)} MB`);
          
          // Compress image if needed (under 4MB)
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
          
          // Convert buffer to readable stream for FormData
          const stream = Readable.from(imageBuffer);
          
          // Try multiple upload methods
          let uploaded = false;
          
          // Method 1: Using api.httpPost with FormData
          try {
            console.log('Method 1: Using api.httpPost with FormData...');
            const form = new FormData();
            form.append('file', stream, {
              filename: 'image.jpg',
              contentType: 'image/jpeg'
            });
            form.append('profile_id', botID);
            form.append('photo_source', '57');
            form.append('av', botID);
            
            const uploadResult = await new Promise((resolve, reject) => {
              api.httpPost(
                'https://www.facebook.com/messages/upload_photo.php',
                form,
                (err, res) => {
                  if (err) reject(err);
                  else resolve(res);
                }
              );
            });
            
            let result = uploadResult;
            if (typeof result === 'string') {
              try {
                result = JSON.parse(result.replace('for (;;);', ''));
              } catch (e) {}
            }
            
            if (result && result.payload && result.payload.fbid) {
              uploadedIds.push(result.payload.fbid.toString());
              uploaded = true;
              console.log('Method 1 success! ID:', result.payload.fbid);
            }
          } catch (err) {
            console.log('Method 1 failed:', err.message);
          }
          
          // Method 2: Using axios directly to Facebook
          if (!uploaded) {
            try {
              console.log('Method 2: Using axios to Facebook...');
              const form = new FormData();
              form.append('source', stream, {
                filename: 'image.jpg',
                contentType: 'image/jpeg'
              });
              form.append('type', '3');
              form.append('__user', botID);
              
              const uploadResult = await axios.post(
                'https://www.facebook.com/ajax/mercury/upload_photo.php',
                form,
                {
                  headers: {
                    ...form.getHeaders(),
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                  }
                }
              );
              
              let result = uploadResult.data;
              if (typeof result === 'string') {
                try {
                  result = JSON.parse(result.replace('for (;;);', ''));
                } catch (e) {}
              }
              
              if (result && result.payload && result.payload.fbid) {
                uploadedIds.push(result.payload.fbid.toString());
                uploaded = true;
                console.log('Method 2 success! ID:', result.payload.fbid);
              }
            } catch (err) {
              console.log('Method 2 failed:', err.message);
            }
          }
          
          // Method 3: Using direct Graph API
          if (!uploaded) {
            try {
              console.log('Method 3: Using Graph API...');
              const form = new FormData();
              form.append('source', stream, {
                filename: 'image.jpg',
                contentType: 'image/jpeg'
              });
              form.append('published', 'false');
              
              const accessToken = api.getAccessToken ? api.getAccessToken() : '';
              const uploadResult = await axios.post(
                `https://graph.facebook.com/v18.0/${botID}/photos?access_token=${accessToken}`,
                form,
                {
                  headers: form.getHeaders()
                }
              );
              
              if (uploadResult.data && uploadResult.data.id) {
                uploadedIds.push(uploadResult.data.id);
                uploaded = true;
                console.log('Method 3 success! ID:', uploadResult.data.id);
              }
            } catch (err) {
              console.log('Method 3 failed:', err.message);
            }
          }
          
          if (!uploaded) {
            console.log('All upload methods failed for this image');
          }
          
        } catch (err) {
          console.error('Upload error for image:', err.message);
        }
      }
      
      console.log('Uploaded IDs:', uploadedIds);
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
      postData.formData.input.audience.privacy.base_state = postData.audience;
      
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
        postData.formData.input.message.text = body;
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
            for (const id of imageIds) {
              postData.formData.input.attachments.push({
                "photo": { "id": id }
              });
            }
          }
        } else {
          console.log('No attachments found in event');
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
        
        const form = {
          av: botID,
          fb_api_req_friendly_name: "ComposerStoryCreateMutation",
          fb_api_caller_class: "RelayModern",
          doc_id: "7711610262190099",
          variables: JSON.stringify(postData.formData)
        };
        
        api.httpPost('https://www.facebook.com/api/graphql/', form, (e, info) => {
          try {
            if (e) throw e;
            if (typeof info == "string") {
              info = JSON.parse(info.replace("for (;;);", ""));
            }
            
            const postID = info.data?.story_create?.story?.legacy_story_hideable_id;
            const urlPost = info.data?.story_create?.story?.url;
            
            if (!postID) throw info.errors || new Error('Failed to create post');
            
            api.unsendMessage(creatingMsg.messageID);
            
            const privacyMap = {
              "EVERYONE": "🌍 Everyone",
              "FRIENDS": "👥 Friends",
              "SELF": "🔒 Only Me"
            };
            
            return api.sendMessage(
              `✅ **POST CREATED SUCCESSFULLY!**\n\n` +
              `👁️ Audience: ${privacyMap[postData.audience]}\n` +
              `📝 Caption: ${postData.caption || "(Empty)"}\n` +
              `🖼️ Images: ${postData.imageIds.length > 0 ? postData.imageIds.length + " image(s)" : "None"}\n\n` +
              `📌 Post ID: ${postID}\n` +
              `🔗 Link: ${urlPost}`,
              threadID,
              messageID
            );
          } catch (err) {
            console.error('Post creation error:', err);
            api.unsendMessage(creatingMsg.messageID);
            return api.sendMessage(
              `❌ Failed to create post. Error: ${err.message || 'Unknown error'}`,
              threadID,
              messageID
            );
          }
        });
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
        postData.formData.input.attachments = [];
        
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
      postData.formData.input.audience.privacy.base_state = postData.audience;
      
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
        postData.formData.input.message.text = body;
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
      postData.formData.input.attachments = [];
      
      if (body.trim().toLowerCase() !== "skip" && event.attachments && event.attachments.length > 0) {
        const imageIds = await uploadImages(event.attachments);
        if (imageIds.length > 0) {
          postData.imageIds = imageIds;
          for (const id of imageIds) {
            postData.formData.input.attachments.push({
              "photo": { "id": id }
            });
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
