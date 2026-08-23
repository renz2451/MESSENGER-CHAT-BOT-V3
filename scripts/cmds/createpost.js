const fs = require('fs-extra');
const path = require('path');

module.exports = {
  config: {
    name: "createpost",
    version: "2.0.0",
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
    
    // Initialize handleReply if it doesn't exist
    if (!global.client) global.client = {};
    if (!global.client.handleReply) global.client.handleReply = [];
    
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
    // Store post data
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

    // Store the reply handler
    if (!global.client.handleReply) global.client.handleReply = [];
    global.client.handleReply.push({
      name: this.config.name,
      messageID: msg.messageID,
      author: senderID,
      postData: postData,
      type: "whoSee"
    });

    return;
  },

  onReply: async function ({ event, api, handleReply }) {
    console.log('onReply triggered:', event.body);
    
    const { type, author, postData } = handleReply || {};
    const { threadID, messageID, senderID, attachments, body } = event;
    const botID = api.getCurrentUserID();

    if (!handleReply) {
      console.log('No handleReply found');
      return;
    }

    if (event.senderID != author) {
      console.log('Not the author');
      return;
    }

    async function uploadAttachments(attachments) {
      let uploads = [];
      for (const attachment of attachments) {
        const form = {
          file: attachment
        };
        uploads.push(api.httpPostFormData(
          `https://www.facebook.com/profile/picture/upload/?profile_id=${botID}&photo_source=57&av=${botID}`,
          form
        ));
      }
      uploads = await Promise.all(uploads);
      return uploads;
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
      await api.unsendMessage(handleReply.messageID);
      
      const msg = await api.sendMessage(
        `👥 Audience: ${postData.audience}\n\n📝 Enter your caption (or reply "skip" to ignore)`,
        threadID
      );

      // Store the next reply handler
      if (!global.client.handleReply) global.client.handleReply = [];
      global.client.handleReply.push({
        name: this.config.name,
        messageID: msg.messageID,
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
      await api.unsendMessage(handleReply.messageID);
      
      const msg = await api.sendMessage(
        `📝 Caption: ${postData.caption || "(Empty)"}\n\n🖼️ Send image(s) or reply "skip" to ignore`,
        threadID
      );

      // Store the next reply handler
      if (!global.client.handleReply) global.client.handleReply = [];
      global.client.handleReply.push({
        name: this.config.name,
        messageID: msg.messageID,
        author: senderID,
        postData: postData,
        type: "images"
      });
    }
    else if (type == "images") {
      // Process images if any
      if (body.trim().toLowerCase() != "skip" && attachments && attachments.length > 0) {
        const allStreamFile = [];
        const cacheDir = path.join(__dirname, 'cache');
        const pathImage = path.join(cacheDir, 'imagePost.png');
        
        if (!fs.existsSync(cacheDir)) {
          fs.mkdirSync(cacheDir, { recursive: true });
        }

        for (const attach of attachments) {
          if (attach.type != "photo") continue;
          try {
            const axios = require('axios');
            const getFile = (await axios.get(attach.url, { responseType: "arraybuffer" })).data;
            fs.writeFileSync(pathImage, Buffer.from(getFile));
            allStreamFile.push(fs.createReadStream(pathImage));
          } catch (err) {
            console.error('Error downloading image:', err);
          }
        }

        if (allStreamFile.length > 0) {
          const uploadFiles = await uploadAttachments(allStreamFile);
          
          for (let result of uploadFiles) {
            if (typeof result == "string") {
              result = JSON.parse(result.replace("for (;;);", ""));
            }
            if (result && result.payload && result.payload.fbid) {
              const imageId = result.payload.fbid.toString();
              postData.imageIds.push(imageId);
              postData.formData.input.attachments.push({
                "photo": {
                  "id": imageId,
                }
              });
            }
          }
        }
      }

      // Unsend the previous message
      await api.unsendMessage(handleReply.messageID);
      
      // Show overview
      const overview = showOverview(postData);
      const msg = await api.sendMessage(overview, threadID);

      // Store the next reply handler
      if (!global.client.handleReply) global.client.handleReply = [];
      global.client.handleReply.push({
        name: this.config.name,
        messageID: msg.messageID,
        author: senderID,
        postData: postData,
        type: "overview"
      });
    }
    else if (type == "overview") {
      const choice = body.trim();
      
      if (choice === "1") {
        // Edit
        await api.unsendMessage(handleReply.messageID);
        
        const msg = await api.sendMessage(
          `✏️ What do you want to edit?\n\n1️⃣ Audience\n2️⃣ Caption\n3️⃣ Attached File`,
          threadID
        );
        
        if (!global.client.handleReply) global.client.handleReply = [];
        global.client.handleReply.push({
          name: this.config.name,
          messageID: msg.messageID,
          author: senderID,
          postData: postData,
          type: "editChoice"
        });
      }
      else if (choice === "2") {
        // Confirm - Create the post
        await api.unsendMessage(handleReply.messageID);
        
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
                  if (file.includes('imagePost') || file.includes('videoPost')) {
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
        await api.unsendMessage(handleReply.messageID);
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
        await api.unsendMessage(handleReply.messageID);
        
        const msg = await api.sendMessage(
          `📝 Choose who can see this post:\n\n1️⃣ Everyone\n2️⃣ Friends\n3️⃣ Only Me`,
          threadID
        );
        
        if (!global.client.handleReply) global.client.handleReply = [];
        global.client.handleReply.push({
          name: this.config.name,
          messageID: msg.messageID,
          author: senderID,
          postData: postData,
          type: "editAudience"
        });
      }
      else if (choice === "2") {
        // Edit Caption
        await api.unsendMessage(handleReply.messageID);
        
        const msg = await api.sendMessage(
          `📝 Enter new caption (or reply "skip" to keep current)`,
          threadID
        );
        
        if (!global.client.handleReply) global.client.handleReply = [];
        global.client.handleReply.push({
          name: this.config.name,
          messageID: msg.messageID,
          author: senderID,
          postData: postData,
          type: "editCaption"
        });
      }
      else if (choice === "3") {
        // Edit Attached File
        await api.unsendMessage(handleReply.messageID);
        
        // Clear existing images
        postData.imageIds = [];
        postData.formData.input.attachments = [];
        
        const msg = await api.sendMessage(
          `🖼️ Send new image(s) or reply "skip" to keep none`,
          threadID
        );
        
        if (!global.client.handleReply) global.client.handleReply = [];
        global.client.handleReply.push({
          name: this.config.name,
          messageID: msg.messageID,
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
      
      await api.unsendMessage(handleReply.messageID);
      
      const overview = showOverview(postData);
      const msg = await api.sendMessage(overview, threadID);
      
      if (!global.client.handleReply) global.client.handleReply = [];
      global.client.handleReply.push({
        name: this.config.name,
        messageID: msg.messageID,
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
      
      await api.unsendMessage(handleReply.messageID);
      
      const overview = showOverview(postData);
      const msg = await api.sendMessage(overview, threadID);
      
      if (!global.client.handleReply) global.client.handleReply = [];
      global.client.handleReply.push({
        name: this.config.name,
        messageID: msg.messageID,
        author: senderID,
        postData: postData,
        type: "overview"
      });
    }
    else if (type == "editImages") {
      // Clear existing images first
      postData.imageIds = [];
      postData.formData.input.attachments = [];
      
      if (body.trim().toLowerCase() !== "skip" && attachments && attachments.length > 0) {
        const allStreamFile = [];
        const cacheDir = path.join(__dirname, 'cache');
        const pathImage = path.join(cacheDir, 'imagePost.png');
        
        if (!fs.existsSync(cacheDir)) {
          fs.mkdirSync(cacheDir, { recursive: true });
        }

        for (const attach of attachments) {
          if (attach.type != "photo") continue;
          try {
            const axios = require('axios');
            const getFile = (await axios.get(attach.url, { responseType: "arraybuffer" })).data;
            fs.writeFileSync(pathImage, Buffer.from(getFile));
            allStreamFile.push(fs.createReadStream(pathImage));
          } catch (err) {
            console.error('Error downloading image:', err);
          }
        }

        if (allStreamFile.length > 0) {
          const uploadFiles = await uploadAttachments(allStreamFile);
          
          for (let result of uploadFiles) {
            if (typeof result == "string") {
              result = JSON.parse(result.replace("for (;;);", ""));
            }
            if (result && result.payload && result.payload.fbid) {
              const imageId = result.payload.fbid.toString();
              postData.imageIds.push(imageId);
              postData.formData.input.attachments.push({
                "photo": {
                  "id": imageId,
                }
              });
            }
          }
        }
      }
      
      await api.unsendMessage(handleReply.messageID);
      
      const overview = showOverview(postData);
      const msg = await api.sendMessage(overview, threadID);
      
      if (!global.client.handleReply) global.client.handleReply = [];
      global.client.handleReply.push({
        name: this.config.name,
        messageID: msg.messageID,
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
