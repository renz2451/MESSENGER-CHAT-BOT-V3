const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');

module.exports = {
  config: {
    name: "checkbotallpost",
    version: "1.0.0",
    author: "Renz",
    role: 2,
    usePrefix: true,
    description: "View and delete all posts from your timeline",
    guide: "{pn} [page]",
    category: "operator",
    cooldowns: 10,
    aliases: ["myposts", "listposts", "deleteposts"]
  },

  onStart: async function ({ api, event, args, message }) {
    const { threadID, messageID, senderID } = event;
    const botID = api.getCurrentUserID();
    
    // Initialize onReply if it doesn't exist
    if (!global.GoatBot) global.GoatBot = {};
    if (!global.GoatBot.onReply) global.GoatBot.onReply = new Map();
    
    // Parse page number
    let page = parseInt(args[0]) || 1;
    if (page < 1) page = 1;
    
    const loadingMsg = await message.reply('📥 Fetching your posts...');
    
    try {
      // Fetch posts using GraphQL
      const posts = await getBotPosts(api, botID, page);
      
      if (!posts || posts.length === 0) {
        await api.unsendMessage(loadingMsg.messageID);
        return message.reply('📭 No posts found on your timeline.');
      }
      
      // Build the post list message
      let postList = `📋 **YOUR POSTS (Page ${page})**\n\n`;
      postList += `Total: ${posts.length} posts\n`;
      postList += `Reply with numbers to delete (e.g., "1,2,3" or "1 2 3")\n`;
      postList += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      
      const postMap = {};
      
      for (let i = 0; i < posts.length; i++) {
        const post = posts[i];
        const num = i + 1;
        postMap[num] = post.id;
        
        const date = post.created_time ? new Date(post.created_time).toLocaleString() : 'Unknown date';
        const messagePreview = post.message ? post.message.substring(0, 50) : '(No caption)';
        const attachments = post.attachments ? post.attachments.data.length : 0;
        
        postList += `**${num}.** ${messagePreview}\n`;
        postList += `   📅 ${date}\n`;
        postList += `   🖼️ ${attachments} attachments\n`;
        postList += `   🔗 ${post.permalink_url || 'No link'}\n\n`;
      }
      
      postList += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      postList += `Reply with numbers to delete (e.g., "1,2,3" or "1 2 3")\n`;
      postList += `Or type "cancel" to cancel.`;
      
      await api.unsendMessage(loadingMsg.messageID);
      
      const msg = await api.sendMessage(postList, threadID);
      
      // Store the reply handler
      if (!global.GoatBot.onReply) global.GoatBot.onReply = new Map();
      global.GoatBot.onReply.set(msg.messageID, {
        commandName: this.config.name,
        author: senderID,
        postMap: postMap,
        posts: posts,
        page: page,
        type: "deletePosts"
      });
      
    } catch (error) {
      console.error('Error fetching posts:', error);
      await api.unsendMessage(loadingMsg.messageID);
      return message.reply(`❌ Failed to fetch posts: ${error.message || 'Unknown error'}`);
    }
  },

  onReply: async function ({ api, event, Reply, getLang }) {
    console.log('onReply triggered:', event.body);
    
    const { author, postMap, posts, page, type } = Reply;
    const { threadID, messageID, senderID, body } = event;

    if (!Reply || event.senderID != author) return;
    
    if (type === "deletePosts") {
      const input = body.trim().toLowerCase();
      
      if (input === 'cancel') {
        await api.unsendMessage(Reply.messageID);
        return api.sendMessage('❌ Post deletion cancelled.', threadID, messageID);
      }
      
      // Parse the numbers
      const numbers = input.split(/[, ]+/).map(n => parseInt(n.trim())).filter(n => !isNaN(n) && n > 0);
      
      if (numbers.length === 0) {
        return api.sendMessage('❌ Invalid input. Please enter valid numbers (e.g., "1,2,3" or "1 2 3")', threadID, messageID);
      }
      
      // Get the post IDs to delete
      const postsToDelete = [];
      const invalidNumbers = [];
      
      for (const num of numbers) {
        if (postMap[num]) {
          postsToDelete.push({
            id: postMap[num],
            number: num,
            preview: posts[num - 1]?.message?.substring(0, 30) || '(No caption)'
          });
        } else {
          invalidNumbers.push(num);
        }
      }
      
      if (postsToDelete.length === 0) {
        return api.sendMessage('❌ No valid post numbers found. Please check the numbers and try again.', threadID, messageID);
      }
      
      // Show confirmation
      let confirmMsg = `⚠️ **CONFIRM DELETION**\n\n`;
      confirmMsg += `Are you sure you want to delete these ${postsToDelete.length} post(s)?\n\n`;
      
      for (const post of postsToDelete) {
        confirmMsg += `**${post.number}.** ${post.preview}\n`;
      }
      
      confirmMsg += `\nReply with:\n`;
      confirmMsg += `✅ "yes" to confirm\n`;
      confirmMsg += `❌ "no" to cancel`;
      
      await api.unsendMessage(Reply.messageID);
      
      const msg = await api.sendMessage(confirmMsg, threadID);
      
      // Store the confirmation handler
      if (!global.GoatBot.onReply) global.GoatBot.onReply = new Map();
      global.GoatBot.onReply.set(msg.messageID, {
        commandName: this.config.name,
        author: senderID,
        postsToDelete: postsToDelete,
        type: "confirmDelete"
      });
    }
    else if (type === "confirmDelete") {
      const { postsToDelete } = Reply;
      const input = body.trim().toLowerCase();
      
      if (input === 'yes' || input === 'y') {
        await api.unsendMessage(Reply.messageID);
        
        const deletingMsg = await api.sendMessage(`🗑️ Deleting ${postsToDelete.length} post(s)...`, threadID);
        
        let successCount = 0;
        let failCount = 0;
        const failedPosts = [];
        
        for (const post of postsToDelete) {
          try {
            await deletePost(api, post.id);
            successCount++;
            console.log(`Deleted post: ${post.id}`);
          } catch (error) {
            failCount++;
            failedPosts.push(post);
            console.error(`Failed to delete post ${post.id}:`, error);
          }
        }
        
        await api.unsendMessage(deletingMsg.messageID);
        
        let resultMsg = `✅ **DELETION COMPLETE**\n\n`;
        resultMsg += `✓ Successfully deleted: ${successCount} post(s)\n`;
        
        if (failCount > 0) {
          resultMsg += `✗ Failed to delete: ${failCount} post(s)\n\n`;
          resultMsg += `Failed posts:\n`;
          for (const post of failedPosts) {
            resultMsg += `• ${post.preview}\n`;
          }
        }
        
        // Ask if they want to refresh the list
        resultMsg += `\nReply with:\n`;
        resultMsg += `🔄 "refresh" to see updated post list\n`;
        resultMsg += `✅ "done" to finish`;
        
        const msg = await api.sendMessage(resultMsg, threadID);
        
        // Store the refresh handler
        if (!global.GoatBot.onReply) global.GoatBot.onReply = new Map();
        global.GoatBot.onReply.set(msg.messageID, {
          commandName: this.config.name,
          author: senderID,
          page: Reply.page || 1,
          type: "refresh"
        });
        
      } else if (input === 'no' || input === 'n') {
        await api.unsendMessage(Reply.messageID);
        return api.sendMessage('❌ Post deletion cancelled.', threadID, messageID);
      } else {
        return api.sendMessage('❌ Invalid input. Please reply with "yes" or "no".', threadID, messageID);
      }
    }
    else if (type === "refresh") {
      const input = body.trim().toLowerCase();
      
      if (input === 'refresh') {
        await api.unsendMessage(Reply.messageID);
        
        // Re-run the command with the same page
        const botID = api.getCurrentUserID();
        const page = Reply.page || 1;
        
        const loadingMsg = await api.sendMessage('📥 Refreshing post list...', threadID);
        
        try {
          const posts = await getBotPosts(api, botID, page);
          
          if (!posts || posts.length === 0) {
            await api.unsendMessage(loadingMsg.messageID);
            return api.sendMessage('📭 No posts found on your timeline.', threadID, messageID);
          }
          
          let postList = `📋 **YOUR POSTS (Page ${page})**\n\n`;
          postList += `Total: ${posts.length} posts\n`;
          postList += `Reply with numbers to delete (e.g., "1,2,3" or "1 2 3")\n`;
          postList += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
          
          const postMap = {};
          
          for (let i = 0; i < posts.length; i++) {
            const post = posts[i];
            const num = i + 1;
            postMap[num] = post.id;
            
            const date = post.created_time ? new Date(post.created_time).toLocaleString() : 'Unknown date';
            const messagePreview = post.message ? post.message.substring(0, 50) : '(No caption)';
            const attachments = post.attachments ? post.attachments.data.length : 0;
            
            postList += `**${num}.** ${messagePreview}\n`;
            postList += `   📅 ${date}\n`;
            postList += `   🖼️ ${attachments} attachments\n`;
            postList += `   🔗 ${post.permalink_url || 'No link'}\n\n`;
          }
          
          postList += `━━━━━━━━━━━━━━━━━━━━━━\n`;
          postList += `Reply with numbers to delete (e.g., "1,2,3" or "1 2 3")\n`;
          postList += `Or type "cancel" to cancel.`;
          
          await api.unsendMessage(loadingMsg.messageID);
          
          const msg = await api.sendMessage(postList, threadID);
          
          if (!global.GoatBot.onReply) global.GoatBot.onReply = new Map();
          global.GoatBot.onReply.set(msg.messageID, {
            commandName: this.config.name,
            author: senderID,
            postMap: postMap,
            posts: posts,
            page: page,
            type: "deletePosts"
          });
          
        } catch (error) {
          await api.unsendMessage(loadingMsg.messageID);
          return api.sendMessage(`❌ Failed to refresh posts: ${error.message}`, threadID, messageID);
        }
      } else if (input === 'done') {
        await api.unsendMessage(Reply.messageID);
        return api.sendMessage('✅ Done!', threadID, messageID);
      } else {
        return api.sendMessage('❌ Invalid input. Reply with "refresh" or "done".', threadID, messageID);
      }
    }
  }
};

// Function to fetch bot posts using GraphQL
async function getBotPosts(api, botID, page) {
  try {
    const limit = 10;
    const offset = (page - 1) * limit;
    
    // Try different GraphQL queries to get posts
    const docIds = [
      "3036465344905296", // Profile timeline query
      "6125913748951066",  // Alternative
      "4832685473425817"   // Another
    ];
    
    for (const docId of docIds) {
      try {
        const form = {
          doc_id: docId,
          variables: JSON.stringify({
            id: botID,
            first: limit,
            after: offset > 0 ? offset.toString() : null,
            scale: 3
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
          console.log(`GraphQL doc_id ${docId} failed:`, data.errors[0]?.message);
          continue;
        }
        
        // Extract posts from different possible response structures
        let posts = [];
        
        // Try different paths
        if (data.data?.node?.timeline_feed_units?.edges) {
          posts = data.data.node.timeline_feed_units.edges.map(edge => {
            const node = edge.node;
            return {
              id: node.id || node.legacy_story_hideable_id,
              message: node.message?.text || node.message || '',
              created_time: node.creation_time || node.created_time,
              permalink_url: node.permalink_url || '',
              attachments: node.attachments || { data: [] }
            };
          });
        } else if (data.data?.viewer?.timeline_feed_units?.edges) {
          posts = data.data.viewer.timeline_feed_units.edges.map(edge => {
            const node = edge.node;
            return {
              id: node.id || node.legacy_story_hideable_id,
              message: node.message?.text || node.message || '',
              created_time: node.creation_time || node.created_time,
              permalink_url: node.permalink_url || '',
              attachments: node.attachments || { data: [] }
            };
          });
        } else if (data.data?.node?.posts?.edges) {
          posts = data.data.node.posts.edges.map(edge => {
            const node = edge.node;
            return {
              id: node.id,
              message: node.message || '',
              created_time: node.created_time,
              permalink_url: node.permalink_url || '',
              attachments: node.attachments || { data: [] }
            };
          });
        }
        
        if (posts && posts.length > 0) {
          console.log(`Found ${posts.length} posts using doc_id ${docId}`);
          return posts;
        }
        
      } catch (error) {
        console.log(`Error with doc_id ${docId}:`, error.message);
      }
    }
    
    // Fallback: Try using the simpler feed endpoint
    try {
      const form = {
        profile_id: botID,
        limit: limit,
        offset: offset
      };
      
      const result = await new Promise((resolve, reject) => {
        api.httpPost('https://www.facebook.com/feed/get_feed.php', form, (err, res) => {
          if (err) reject(err);
          else resolve(res);
        });
      });
      
      let data = result;
      if (typeof data === 'string') {
        data = JSON.parse(data.replace('for (;;);', ''));
      }
      
      if (data && data.payload && data.payload.actions) {
        const posts = data.payload.actions.map(action => ({
          id: action.post_id || action.id,
          message: action.text || action.message || '',
          created_time: action.time || action.created_time,
          permalink_url: action.permalink_url || '',
          attachments: action.attachments || { data: [] }
        }));
        
        if (posts.length > 0) {
          return posts;
        }
      }
    } catch (error) {
      console.log('Fallback feed method failed:', error.message);
    }
    
    return [];
    
  } catch (error) {
    console.error('Error fetching posts:', error);
    throw error;
  }
}

// Function to delete a post
async function deletePost(api, postID) {
  try {
    const form = {
      doc_id: "2050025868351916", // Delete post mutation
      variables: JSON.stringify({
        input: {
          client_mutation_id: Math.floor(Math.random() * 17).toString(),
          actor_id: api.getCurrentUserID(),
          story_id: postID
        }
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
      throw new Error(data.errors[0]?.message || 'GraphQL error');
    }
    
    // Alternative: Try using the delete endpoint
    if (!data.data?.story_delete) {
      try {
        const deleteForm = {
          story_id: postID,
          actor_id: api.getCurrentUserID()
        };
        
        await new Promise((resolve, reject) => {
          api.httpPost('https://www.facebook.com/ajax/feed/delete.php', deleteForm, (err, res) => {
            if (err) reject(err);
            else resolve(res);
          });
        });
      } catch (error) {
        console.log('Delete endpoint fallback failed:', error.message);
        // If both methods fail, throw the original error
        throw new Error('Failed to delete post');
      }
    }
    
    return true;
    
  } catch (error) {
    console.error('Error deleting post:', error);
    throw error;
  }
}
