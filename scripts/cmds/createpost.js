const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');

module.exports = {
  config: {
    name: "createpost",
    version: "3.0.0",
    author: "Renz",
    role: 2,
    usePrefix: true,
    description: "Create a new post on your Facebook timeline",
    guide: "{pn} [content]",
    category: "operator",
    cooldowns: 5,
    aliases: ["bot_post", "post", "poststatus"]
  },

  onStart: async function ({ api, event, args, message }) {
    const { threadID, messageID, senderID } = event;
    
    if (args && args.length > 0) {
      const content = args.join(' ');
      try {
        const result = await postStatus(api, content);
        if (result.success) {
          return message.reply(
            `✅ Post created successfully!\n\n📌 Post ID: ${result.postID}\n🔗 Link: ${result.url}`
          );
        } else {
          return message.reply(`❌ ${result.error}`);
        }
      } catch (err) {
        return message.reply(`❌ Error: ${err.message}`);
      }
    }

    // Start interactive flow
    const postData = {
      audience: "FRIENDS",
      caption: "",
    };

    if (!global.GoatBot) global.GoatBot = {};
    if (!global.GoatBot.onReply) global.GoatBot.onReply = new Map();

    const msg = await api.sendMessage(
      `📝 Choose who can see this post:\n\n1️⃣ Everyone\n2️⃣ Friends\n3️⃣ Only Me`,
      threadID
    );

    global.GoatBot.onReply.set(msg.messageID, {
      commandName: this.config.name,
      author: senderID,
      postData: postData,
      type: "whoSee"
    });

    return;
  },

  onReply: async function ({ api, event, Reply, getLang }) {
    const { author, postData, type } = Reply;
    const { threadID, messageID, senderID, body } = event;

    if (!Reply || event.senderID != author) return;

    function showOverview(data) {
      const privacyMap = {
        "EVERYONE": "🌍 Everyone",
        "FRIENDS": "👥 Friends",
        "SELF": "🔒 Only Me"
      };
      
      return `📋 **POST OVERVIEW**

👁️ Audience: ${privacyMap[data.audience] || data.audience}
📝 Caption: ${data.caption || "(Empty)"}

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
          `✏️ What do you want to edit?\n\n1️⃣ Audience\n2️⃣ Caption`,
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
        
        try {
          const result = await postStatus(api, postData.caption || "", postData.audience);
          
          if (result.success) {
            api.unsendMessage(creatingMsg.messageID);
            return api.sendMessage(
              `✅ **POST CREATED SUCCESSFULLY!**\n\n` +
              `👁️ Audience: ${postData.audience}\n` +
              `📝 Caption: ${postData.caption || "(Empty)"}\n\n` +
              `📌 Post ID: ${result.postID}\n` +
              `🔗 Link: ${result.url}`,
              threadID,
              messageID
            );
          } else {
            api.unsendMessage(creatingMsg.messageID);
            return api.sendMessage(`❌ ${result.error}`, threadID, messageID);
          }
        } catch (err) {
          api.unsendMessage(creatingMsg.messageID);
          return api.sendMessage(`❌ Error: ${err.message}`, threadID, messageID);
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
      else {
        return api.sendMessage('❌ Invalid choice. Please choose 1 or 2', threadID, messageID);
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
  }
};

// Simple status post using the working method from FCA
async function postStatus(api, message, privacy = "EVERYONE") {
  return new Promise((resolve, reject) => {
    try {
      // Try using the FCA's internal method if available
      if (typeof api.createPost === 'function') {
        api.createPost({ body: message, baseState: privacy === "EVERYONE" ? 1 : privacy === "FRIENDS" ? 2 : 3 }, (err, url) => {
          if (err) {
            console.log('api.createPost error:', err);
            // Fall back to manual method
            manualPost(api, message, privacy, resolve, reject);
          } else {
            const postID = url.split('/').pop() || url;
            resolve({ success: true, postID: postID, url: url });
          }
        });
      } else {
        manualPost(api, message, privacy, resolve, reject);
      }
    } catch (err) {
      reject(err);
    }
  });
}

// Manual post using Graph API
async function manualPost(api, message, privacy, resolve, reject) {
  try {
    const form = {
      message: message || "",
      privacy: privacy || "EVERYONE",
      profile_id: api.getCurrentUserID()
    };
    
    // Try the simple feed publish endpoint
    api.httpPost('https://www.facebook.com/feed/publish.php', form, (err, res) => {
      if (err) {
        reject(err);
        return;
      }
      
      try {
        let data = res;
        if (typeof data === 'string') {
          // Try to extract post ID from HTML response
          const postIdMatch = data.match(/story_fbid=([^&"]+)/);
          if (postIdMatch) {
            resolve({ 
              success: true, 
              postID: postIdMatch[1], 
              url: `https://www.facebook.com/${postIdMatch[1]}` 
            });
            return;
          }
          
          // Try to parse as JSON
          try {
            data = JSON.parse(data.replace('for (;;);', ''));
          } catch (e) {
            // Not JSON
          }
        }
        
        if (data && data.payload && data.payload.post_id) {
          resolve({ 
            success: true, 
            postID: data.payload.post_id, 
            url: `https://www.facebook.com/${data.payload.post_id}` 
          });
        } else {
          // Try alternative endpoint
          const altForm = {
            message: message || "",
            privacy: privacy || "EVERYONE",
            profile_id: api.getCurrentUserID(),
            source: "www"
          };
          
          api.httpPost('https://www.facebook.com/ajax/feed/publish.php', altForm, (err2, res2) => {
            if (err2) {
              reject(new Error('All post methods failed. Account may be restricted.'));
              return;
            }
            
            try {
              let data2 = res2;
              if (typeof data2 === 'string') {
                data2 = JSON.parse(data2.replace('for (;;);', ''));
              }
              
              if (data2 && data2.payload && data2.payload.post_id) {
                resolve({ 
                  success: true, 
                  postID: data2.payload.post_id, 
                  url: `https://www.facebook.com/${data2.payload.post_id}` 
                });
              } else {
                // One last try - use the Graph API directly via axios
                const token = api.getAccessToken ? api.getAccessToken() : '';
                if (token) {
                  axios.post(`https://graph.facebook.com/me/feed?access_token=${token}`, {
                    message: message || "",
                    privacy: `{"value":"${privacy.toLowerCase()}"}`
                  }).then(response => {
                    if (response.data && response.data.id) {
                      resolve({ 
                        success: true, 
                        postID: response.data.id, 
                        url: `https://www.facebook.com/${response.data.id}` 
                      });
                    } else {
                      reject(new Error('Unable to create post. Account may be restricted or API is down.'));
                    }
                  }).catch(() => {
                    reject(new Error('Unable to create post. Account may be restricted or API is down.'));
                  });
                } else {
                  reject(new Error('Unable to create post. Account may be restricted or API is down.'));
                }
              }
            } catch (e) {
              reject(new Error('Unable to create post. Account may be restricted or API is down.'));
            }
          });
        }
      } catch (e) {
        reject(e);
      }
    });
  } catch (err) {
    reject(err);
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
