const fs = require('fs-extra');
const path = require('path');

module.exports = {
  config: {
    name: "createpost",
    version: "1.0.0",
    author: "Renz",
    role: 2, // Admin only
    usePrefix: true,
    description: "Create a new post on your Facebook timeline",
    guide: "{pn}",
    category: "operator",
    cooldowns: 5
  },

  onStart: async function ({ api, event, args, message }) {
    const { threadID, messageID, senderID } = event;
    const uuid = getGUID();
    
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
    };

    return api.sendMessage(
      `📝 Choose who can see this post:\n\n1️⃣ Everyone\n2️⃣ Friends\n3️⃣ Only Me`,
      threadID,
      (e, info) => {
        global.client.handleReply.push({
          name: this.config.name,
          messageID: info.messageID,
          author: senderID,
          formData,
          type: "whoSee"
        });
      },
      messageID
    );
  },

  handleReply: async function ({ event, api, handleReply }) {
    const { type, author, formData } = handleReply;
    const { threadID, messageID, senderID, attachments, body } = event;
    const botID = api.getCurrentUserID();

    if (event.senderID != author) return;

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

    if (type == "whoSee") {
      if (!["1", "2", "3"].includes(body)) {
        return api.sendMessage('❌ Please choose 1, 2, or 3', threadID, messageID);
      }
      
      formData.input.audience.privacy.base_state = 
        body == 1 ? "EVERYONE" : 
        body == 2 ? "FRIENDS" : 
        "SELF";
      
      api.unsendMessage(handleReply.messageID, () => {
        api.sendMessage(
          `📝 Reply with your post content (or reply "0" for empty)`,
          threadID,
          (e, info) => {
            global.client.handleReply.push({
              name: this.config.name,
              messageID: info.messageID,
              author: senderID,
              formData,
              type: "content"
            });
          },
          messageID
        );
      });
    }
    else if (type == "content") {
      if (event.body != "0") {
        formData.input.message.text = event.body;
      }
      
      api.unsendMessage(handleReply.messageID, () => {
        api.sendMessage(
          `🖼️ Reply with photo(s) (or reply "0" for no images)`,
          threadID,
          (e, info) => {
            global.client.handleReply.push({
              name: this.config.name,
              messageID: info.messageID,
              author: senderID,
              formData,
              type: "image"
            });
          },
          messageID
        );
      });
    }
    else if (type == "image") {
      if (event.body != "0") {
        const allStreamFile = [];
        const pathImage = path.join(__dirname, 'cache', 'imagePost.png');
        
        // Ensure cache directory exists
        const cacheDir = path.dirname(pathImage);
        if (!fs.existsSync(cacheDir)) {
          fs.mkdirSync(cacheDir, { recursive: true });
        }

        for (const attach of attachments) {
          if (attach.type != "photo") continue;
          const axios = require('axios');
          const getFile = (await axios.get(attach.url, { responseType: "arraybuffer" })).data;
          fs.writeFileSync(pathImage, Buffer.from(getFile));
          allStreamFile.push(fs.createReadStream(pathImage));
        }

        const uploadFiles = await uploadAttachments(allStreamFile);
        
        for (let result of uploadFiles) {
          if (typeof result == "string") {
            result = JSON.parse(result.replace("for (;;);", ""));
          }
          formData.input.attachments.push({
            "photo": {
              "id": result.payload.fbid.toString(),
            }
          });
        }
      }

      // Create the post
      const form = {
        av: botID,
        fb_api_req_friendly_name: "ComposerStoryCreateMutation",
        fb_api_caller_class: "RelayModern",
        doc_id: "7711610262190099",
        variables: JSON.stringify(formData)
      };

      api.httpPost('https://www.facebook.com/api/graphql/', form, (e, info) => {
        api.unsendMessage(handleReply.messageID);
        try {
          if (e) throw e;
          if (typeof info == "string") {
            info = JSON.parse(info.replace("for (;;);", ""));
          }
          
          const postID = info.data?.story_create?.story?.legacy_story_hideable_id;
          const urlPost = info.data?.story_create?.story?.url;
          
          if (!postID) throw info.errors;
          
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
          } catch(e) {}
          
          return api.sendMessage(
            `✅ Post created successfully!\n\n📌 Post ID: ${postID}\n🔗 Link: ${urlPost}`,
            threadID,
            messageID
          );
        } catch (err) {
          console.error('Post creation error:', err);
          return api.sendMessage(
            `❌ Failed to create post. Please try again later.`,
            threadID,
            messageID
          );
        }
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
