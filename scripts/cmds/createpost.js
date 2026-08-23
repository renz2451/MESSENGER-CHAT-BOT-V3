const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const sharp = require('sharp');

module.exports = {
  config: {
    name: "createpost",
    version: "2.1.0",
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
    
    // Initialize onReply if it doesn't exist
    if (!global.GoatBot) global.GoatBot = {};
    if (!global.GoatBot.onReply) global.GoatBot.onReply = new Map();
    
    // If there are arguments, use them as the post content
    if (args && args.length > 0) {
      const content = args.join(' ');
      
      // Create a post directly with the content
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
      
      // Create the post
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

    // If no arguments, start the interactive flow
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

    // Send the initial message
    const msg = await api.sendMessage(
      `📝 Choose who can see this post:\n\n1️⃣ Everyone\n2️⃣ Friends\n3️⃣ Only Me`,
      threadID
    );

    // Store the reply handler in GoatBot.onReply (Map)
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
    console.log('Attachments:', JSON.stringify(event.attachments, null, 2));
    
    // Extract data from Reply object
    const { author, postData, type } = Reply;
    const { threadID, messageID, senderID, attachments, body } = event;
    const botID = api.getCurrentUserID();

    if (!Reply) {
      console.log('No Reply found');
      return;
    }

    if (event.senderID != author) {
      console.log('Not the author');
      return;
    }

    // Helper to compress image
    async function compressImage(inputPath, outputPath) {
      try {
        const image = sharp(inputPath);
        const metadata = await image.metadata();
        
        // Resize if too large (max 1920px)
        let width = metadata.width;
        let height = metadata.height;
        const maxSize = 1920;
        
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = Math.round((height / width) * maxSize);
            width = maxSize;
          } else {
            width = Math.round((width / height) * maxSize);
            height = maxSize;
          }
        }
        
        await image
          .resize(width, height, { fit: 'inside' })
          .jpeg({ quality: 80 })
          .toFile(outputPath);
          
        // Check file size
        const stats = await fs.stat(outputPath);
        if (stats.size > 3.8 * 1024 * 1024) {
          // If still too large, compress more
          await sharp(inputPath)
            .resize(width, height, { fit: 'inside' })
            .jpeg({ quality: 60 })
            .toFile(outputPath);
        }
        
        return true;
      } catch (err) {
        console.error('Compression error:', err);
        // If compression fails, try to just copy the file
        await fs.copy(inputPath, outputPath);
        return false;
      }
    }

    // Helper to upload images using the correct method
    async function uploadImages(attachments) {
      const uploadedIds = [];
      const cacheDir = path.join(__dirname, 'cache');
      
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }

      console.log('Uploading images:', attachments.length);

      for (const attachment of attachments) {
        console.log('Attachment type:', attachment.type);
        console.log('Attachment URL:', attachment.url);
        
        // Check if it's a photo
        if (attachment.type !== "photo" && !attachment.url?.includes('image')) {
          console.log('Skipping non-photo attachment:', attachment.type);
          continue;
        }
        
        try {
          const tempPath = path.join(cacheDir, `temp_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`);
          const compressedPath = path.join(cacheDir, `upload_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`);
          
          // Download image
          console.log('Downloading image from:', attachment.url);
          const response = await axios.get(attachment.url, { 
            responseType: 'arraybuffer',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
          });
          
          // Save temporary file
          fs.writeFileSync(tempPath, Buffer.from(response.data));
          console.log('Image saved to:', tempPath);
          
          // Compress image
          console.log('Compressing image...');
          await compressImage(tempPath, compressedPath);
          console.log('Compressed image saved to:', compressedPath);
          
          // Check compressed file size
          const stats = await fs.stat(compressedPath);
          console.log('Compressed file size:', stats.size / 1024, 'KB');
          
          // Upload using form-data
          const form = new FormData();
          form.append('file', fs.createReadStream(compressedPath));
          form.append('profile_id', botID);
          form.append('photo_source', '57');
          form.append('av', botID);
          
          console.log('Uploading image to Facebook...');
          
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
          
          console.log('Upload result:', result);
          
          if (result && result.payload && result.payload.fbid) {
            const imageId = result.payload.fbid.toString();
            uploadedIds.push(imageId);
            console.log('Image uploaded successfully! ID:', imageId);
          } else {
            console.log('Upload failed or no fbid in response');
            if (result && result.errorDescription) {
              console.log('Error description:', result.errorDescription);
            }
          }
          
          // Cleanup
          try { 
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); 
          } catch(e) {}
          try { 
            if (fs.existsSync(compressedPath)) fs.unlinkSync(compressedPath); 
          } catch(e) {}
          
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
      // Validate the input
      if (!["1", "2", "3"].includes(body.trim())) {
        return api.sendMessage('❌ Please choose 1, 2, or 3', threadID, messageID);
      }
      
      // Set the privacy based on user choice
      const privacyMap = {
        "1": "EVERYONE",
        "2": "FRIENDS",
        "3": "SELF"
      };
      
      postData.audience = privacyMap[body.trim()];
      postData.formData.input.audience.privacy.base_state = postData.audience;
      
      // Unsend the previous message
      await api.unsendMessage(Reply.messageID);
      
      const msg = await api.sendMessage(
        `👥 Audience: ${postData.audience}\n\n📝 Enter your caption (or reply "skip" to ignore)`,
        threadID
      );

      // Store the next reply handler
      if (!global.GoatBot.onReply) global.GoatBot.onReply = new Map();
      global.GoatBot.onReply.set(msg.messageID, {
        commandName: this.config.name,
        author: senderID,
        postData: postData,
        type: "caption"
      });
    }
    else if (type == "caption") {
      // Save the content
      if (body.trim().toLowerCase() != "skip" && body.trim() != "") {
        postData.caption = body;
        postData.formData.input.message.text = body;
      }
      
      // Unsend the previous message
      await api.unsendMessage(Reply.messageID);
      
      const msg = await api.sendMessage(
        `📝 Caption: ${postData.caption || "(Empty)"}\n\n🖼️ Send image(s) or reply "skip" to ignore`,
        threadID
      );

      // Store the next reply handler
      if (!global.GoatBot.onReply) global.GoatBot.onReply = new Map();
      global.GoatBot.onReply.set(msg.messageID, {
        commandName: this.config.name,
        author: senderID,
        postData: postData,
        type: "images"
      });
    }
    else if (type == "images") {
      // Check if user sent images
      if (body.trim().toLowerCase() != "skip") {
        // Check for attachments in the event
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

      // Unsend the previous message
      await api.unsendMessage(Reply.messageID);
      
      // Show overview
      const overview = showOverview(postData);
      const msg = await api.sendMessage(overview, threadID);

      // Store the next reply handler
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
        // Edit
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
        // Confirm - Create the post
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
            
            // Clean up cache
            try {
              const cacheDir = path.join(__dirname, 'cache');
              if (fs.existsSync(cacheDir)) {
                const files = fs.readdirSync(cacheDir);
                for (const file of files) {
                  if (file.includes('upload_') || file.includes('imagePost') || file.includes('videoPost') || file.includes('temp_')) {
                    fs.unlinkSync(path.join(cacheDir, file));
                  }
                }
              }
            } catch(cleanupErr) {
              // Ignore cleanup errors
            }
            
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
        // Cancel
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
        // Edit Audience
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
        // Edit Caption
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
        // Edit Attached File
        await api.unsendMessage(Reply.messageID);
        
        // Clear existing images
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
      // Clear existing images first
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
