// =====================================================
// CHAT.JS - Real-time Chat System
// =====================================================

let currentChatId = null;
let currentChatUser = null;
let messageSubscription = null;
let typingTimeout = null;

// =====================================================
// START CHAT
// =====================================================

async function startChat(targetUserId) {
    try {
        // Check if blocked
        const isBlocked = await checkIfBlocked(appState.currentUser.id, targetUserId);
        if (isBlocked) {
            showToast('❌ Dieser Benutzer ist blockiert oder hat dich blockiert', 'error');
            return;
        }
        
        // Get or create chat
        const chatId = await getOrCreateChat(appState.currentUser.id, targetUserId);
        
        // Get target user data
        const { data: targetUser, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', targetUserId)
            .single();
        
        if (error) throw error;
        
        // Check Eltern-Verifizierung für unter 16
        if (appState.currentUser.age < 16 && !appState.currentUser.verified_parent) {
            showToast('⚠️ Du kannst erst chatten, wenn deine Eltern zugestimmt haben', 'warning', 5000);
            return;
        }
        
        // Open chat
        await openChat(chatId, targetUser);
        
    } catch (error) {
        console.error('Error starting chat:', error);
        showToast('❌ Fehler beim Starten des Chats', 'error');
    }
}

// =====================================================
// GET OR CREATE CHAT
// =====================================================

async function getOrCreateChat(user1Id, user2Id) {
    try {
        // Ensure consistent ordering (user1 < user2)
        const [minId, maxId] = [user1Id, user2Id].sort();
        
        // Check if chat exists
        const { data: existingChat, error: checkError } = await supabase
            .from('chats')
            .select('id')
            .eq('user1_id', minId)
            .eq('user2_id', maxId)
            .single();
        
        if (existingChat) {
            return existingChat.id;
        }
        
        // Create new chat
        const { data: newChat, error: createError } = await supabase
            .from('chats')
            .insert({
                user1_id: minId,
                user2_id: maxId
            })
            .select()
            .single();
        
        if (createError) throw createError;
        
        return newChat.id;
        
    } catch (error) {
        console.error('Error getting/creating chat:', error);
        throw error;
    }
}

// =====================================================
// OPEN CHAT
// =====================================================

async function openChat(chatId, targetUser) {
    currentChatId = chatId;
    currentChatUser = targetUser;
    
    // Hide other screens
    document.getElementById('chats-screen').classList.remove('active');
    document.getElementById('discover-screen').classList.remove('active');
    
    // Show chat detail
    document.getElementById('chat-detail-screen').classList.add('active');
    
    // Set header info
    document.getElementById('chat-user-avatar').src = targetUser.profilbild_url || '/public/icons/icon-192.png';
    document.getElementById('chat-user-name').textContent = targetUser.username;
    updateChatUserStatus(targetUser);
    
    // Load messages
    await loadMessages(chatId);
    
    // Subscribe to new messages
    subscribeToMessages(chatId);
    
    // Mark messages as read
    await markMessagesAsRead(chatId);
    
    // Setup message input
    setupMessageInput();
}

// =====================================================
// LOAD MESSAGES
// =====================================================

async function loadMessages(chatId) {
    const container = document.getElementById('messages-container');
    container.innerHTML = '<div class="loading">Lade Nachrichten...</div>';
    
    try {
        const { data: messages, error } = await supabase
            .from('messages')
            .select('*')
            .eq('chat_id', chatId)
            .eq('is_deleted', false)
            .order('created_at', { ascending: true });
        
        if (error) throw error;
        
        if (messages.length === 0) {
            container.innerHTML = '<p class="empty-state">Noch keine Nachrichten. Schreib die erste! 👋</p>';
            return;
        }
        
        displayMessages(messages);
        
        // Scroll to bottom
        scrollToBottom();
        
    } catch (error) {
        console.error('Error loading messages:', error);
        container.innerHTML = '<p class="error">Fehler beim Laden der Nachrichten</p>';
    }
}

// =====================================================
// DISPLAY MESSAGES
// =====================================================

function displayMessages(messages) {
    const container = document.getElementById('messages-container');
    
    container.innerHTML = messages.map(msg => {
        const isSent = msg.sender_id === appState.currentUser.id;
        const time = formatTime(msg.created_at);
        
        // Check if message was blocked by moderation
        if (msg.is_blocked) {
            return `
                <div class="message ${isSent ? 'sent' : 'received'} blocked">
                    <div class="message-content">
                        ⚠️ Diese Nachricht wurde von der Moderation blockiert
                    </div>
                    <div class="message-time">${time}</div>
                </div>
            `;
        }
        
        return `
            <div class="message ${isSent ? 'sent' : 'received'}" data-message-id="${msg.id}">
                <div class="message-content">${escapeHtml(msg.content)}</div>
                <div class="message-time">
                    ${time}
                    ${isSent && msg.is_read ? ' ✓✓' : ''}
                </div>
                ${isSent ? `
                    <button class="message-delete" onclick="deleteMessage('${msg.id}')" title="Nachricht löschen">
                        🗑️
                    </button>
                ` : `
                    <button class="message-report" onclick="reportMessage('${msg.id}')" title="Melden">
                        ⚠️
                    </button>
                `}
            </div>
        `;
    }).join('');
}

// =====================================================
// SUBSCRIBE TO NEW MESSAGES (REALTIME)
// =====================================================

function subscribeToMessages(chatId) {
    // Unsubscribe from previous
    if (messageSubscription) {
        messageSubscription.unsubscribe();
    }
    
    // Subscribe to new messages
    messageSubscription = supabase
        .channel(`chat:${chatId}`)
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `chat_id=eq.${chatId}`
            },
            (payload) => {
                const newMessage = payload.new;
                
                // Don't add if it's our own message (already added)
                if (newMessage.sender_id === appState.currentUser.id) {
                    return;
                }
                
                // Add message to DOM
                appendMessage(newMessage);
                
                // Mark as read
                markMessageAsRead(newMessage.id);
                
                // Play notification sound
                playNotificationSound();
                
                // Show notification if app is in background
                if (document.hidden) {
                    showPushNotification(currentChatUser.username, newMessage.content);
                }
            }
        )
        .subscribe();
}

// =====================================================
// APPEND MESSAGE TO DOM
// =====================================================

function appendMessage(message) {
    const container = document.getElementById('messages-container');
    
    // Remove empty state if exists
    const emptyState = container.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }
    
    const isSent = message.sender_id === appState.currentUser.id;
    const time = formatTime(message.created_at);
    
    const messageHTML = `
        <div class="message ${isSent ? 'sent' : 'received'}" data-message-id="${message.id}">
            <div class="message-content">${escapeHtml(message.content)}</div>
            <div class="message-time">${time}</div>
            ${!isSent ? `
                <button class="message-report" onclick="reportMessage('${message.id}')" title="Melden">
                    ⚠️
                </button>
            ` : ''}
        </div>
    `;
    
    container.insertAdjacentHTML('beforeend', messageHTML);
    scrollToBottom();
}

// =====================================================
// SETUP MESSAGE INPUT
// =====================================================

function setupMessageInput() {
    const input = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-message-btn');
    
    // Clear previous listeners
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);
    
    const newSendBtn = sendBtn.cloneNode(true);
    sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);
    
    // Send on Enter
    newInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Send on button click
    newSendBtn.addEventListener('click', sendMessage);
    
    // Typing indicator
    newInput.addEventListener('input', () => {
        if (appState.currentUser.schreibstatus_visible) {
            sendTypingIndicator();
        }
    });
}

// =====================================================
// SEND MESSAGE
// =====================================================

async function sendMessage() {
    const input = document.getElementById('message-input');
    const content = input.value.trim();
    
    if (!content) return;
    
    if (content.length > 1000) {
        showToast('❌ Nachricht zu lang (max. 1000 Zeichen)', 'error');
        return;
    }
    
    try {
        // Check Moderation BEFORE sending
        const moderationResult = await moderateContent(content);
        
        if (moderationResult.action === 'block') {
            showToast('⚠️ Deine Nachricht verstößt gegen unsere Richtlinien und wurde blockiert', 'error', 5000);
            
            // Log moderation action
            await logModerationAction(
                appState.currentUser.id,
                'message_blocked',
                moderationResult.classification,
                content
            );
            
            return;
        }
        
        if (moderationResult.action === 'warn') {
            showToast('⚠️ Vorsicht! Diese Nachricht könnte problematisch sein', 'warning');
        }
        
        // Insert message
        const { data: message, error } = await supabase
            .from('messages')
            .insert({
                chat_id: currentChatId,
                sender_id: appState.currentUser.id,
                content: content,
                moderation_checked: true,
                moderation_score: moderationResult.score,
                moderation_classification: moderationResult.classification,
                moderation_reason: moderationResult.reason,
                is_blocked: moderationResult.action === 'block'
            })
            .select()
            .single();
        
        if (error) throw error;
        
        // Clear input
        input.value = '';
        
        // Add to DOM
        appendMessage(message);
        
        // Update chat's last_message_at
        await supabase
            .from('chats')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', currentChatId);
        
    } catch (error) {
        console.error('Error sending message:', error);
        showToast('❌ Fehler beim Senden der Nachricht', 'error');
    }
}

// =====================================================
// DELETE MESSAGE
// =====================================================

async function deleteMessage(messageId) {
    if (!confirm('Möchtest du diese Nachricht wirklich löschen?')) return;
    
    try {
        const { error } = await supabase
            .from('messages')
            .update({
                is_deleted: true,
                deleted_by: appState.currentUser.id,
                deleted_at: new Date().toISOString()
            })
            .eq('id', messageId);
        
        if (error) throw error;
        
        // Remove from DOM
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
            messageElement.remove();
        }
        
        showToast('✅ Nachricht gelöscht', 'success');
        
    } catch (error) {
        console.error('Error deleting message:', error);
        showToast('❌ Fehler beim Löschen', 'error');
    }
}

// =====================================================
// REPORT MESSAGE
// =====================================================

async function reportMessage(messageId) {
    const reasons = [
        'Belästigung',
        'Sexuelle Inhalte',
        'Gewalt',
        'Grooming',
        'Spam',
        'Andere'
    ];
    
    const reason = prompt('Warum möchtest du diese Nachricht melden?\n\n' + reasons.map((r, i) => `${i + 1}. ${r}`).join('\n'));
    
    if (!reason) return;
    
    try {
        const { error } = await supabase
            .from('reports')
            .insert({
                reporter_id: appState.currentUser.id,
                reported_user_id: currentChatUser.id,
                message_id: messageId,
                chat_id: currentChatId,
                reason: reason,
                category: 'other',
                priority: 1
            });
        
        if (error) throw error;
        
        showToast('✅ Meldung erfolgreich eingereicht. Unser Team wird das prüfen.', 'success', 5000);
        
    } catch (error) {
        console.error('Error reporting message:', error);
        showToast('❌ Fehler beim Melden', 'error');
    }
}

// =====================================================
// MARK MESSAGES AS READ
// =====================================================

async function markMessagesAsRead(chatId) {
    try {
        await supabase
            .from('messages')
            .update({ 
                is_read: true,
                read_at: new Date().toISOString()
            })
            .eq('chat_id', chatId)
            .eq('is_read', false)
            .neq('sender_id', appState.currentUser.id);
    } catch (error) {
        console.error('Error marking messages as read:', error);
    }
}

// =====================================================
// MARK SINGLE MESSAGE AS READ
// =====================================================

async function markMessageAsRead(messageId) {
    try {
        await supabase
            .from('messages')
            .update({ 
                is_read: true,
                read_at: new Date().toISOString()
            })
            .eq('id', messageId);
    } catch (error) {
        console.error('Error marking message as read:', error);
    }
}

// =====================================================
// LOAD CHATS LIST
// =====================================================

async function loadChats() {
    const container = document.getElementById('chat-list');
    container.innerHTML = '<div class="loading">Lade Chats...</div>';
    
    try {
        // Get all chats for current user
        const { data: chats, error } = await supabase
            .from('chats')
            .select(`
                *,
                user1:users!chats_user1_id_fkey(*),
                user2:users!chats_user2_id_fkey(*),
                messages(*)
            `)
            .or(`user1_id.eq.${appState.currentUser.id},user2_id.eq.${appState.currentUser.id}`)
            .order('last_message_at', { ascending: false });
        
        if (error) throw error;
        
        if (chats.length === 0) {
            container.innerHTML = '<p class="empty-state">Noch keine Chats. Starte einen auf der Entdecken-Seite! 🔍</p>';
            return;
        }
        
        container.innerHTML = chats.map(chat => {
            // Determine other user
            const otherUser = chat.user1_id === appState.currentUser.id ? chat.user2 : chat.user1;
            
            // Get last message
            const lastMessage = chat.messages && chat.messages.length > 0
                ? chat.messages[chat.messages.length - 1]
                : null;
            
            // Count unread
            const unreadCount = chat.messages
                ? chat.messages.filter(m => 
                    !m.is_read && 
                    m.sender_id !== appState.currentUser.id
                  ).length
                : 0;
            
            return `
                <div class="chat-item" onclick="startChat('${otherUser.id}')">
                    <img src="${otherUser.profilbild_url || '/public/icons/icon-192.png'}" 
                         alt="${otherUser.username}" 
                         class="chat-avatar">
                    <div class="chat-info">
                        <div class="chat-name">${otherUser.username}</div>
                        <div class="chat-last-message">
                            ${lastMessage ? escapeHtml(lastMessage.content.substring(0, 50)) : 'Noch keine Nachrichten'}
                        </div>
                    </div>
                    <div class="chat-meta">
                        <div class="chat-time">${lastMessage ? formatTime(lastMessage.created_at) : ''}</div>
                        ${unreadCount > 0 ? `<div class="chat-unread">${unreadCount}</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');
        
        // Update badge
        const totalUnread = chats.reduce((sum, chat) => {
            return sum + (chat.messages
                ? chat.messages.filter(m => 
                    !m.is_read && 
                    m.sender_id !== appState.currentUser.id
                  ).length
                : 0);
        }, 0);
        
        updateChatBadge(totalUnread);
        
    } catch (error) {
        console.error('Error loading chats:', error);
        container.innerHTML = '<p class="error">Fehler beim Laden der Chats</p>';
    }
}

// =====================================================
// UPDATE CHAT USER STATUS
// =====================================================

function updateChatUserStatus(user) {
    const statusElement = document.getElementById('chat-user-status');
    
    if (!user.online_status_visible) {
        statusElement.textContent = '';
        return;
    }
    
    if (user.is_online) {
        statusElement.textContent = '🟢 Online';
        statusElement.style.color = 'var(--success)';
    } else if (user.zuletzt_online) {
        const lastSeen = formatDate(user.zuletzt_online);
        statusElement.textContent = `Zuletzt online: ${lastSeen}`;
        statusElement.style.color = 'var(--text-secondary)';
    } else {
        statusElement.textContent = '';
    }
}

// =====================================================
// TYPING INDICATOR
// =====================================================

function sendTypingIndicator() {
    clearTimeout(typingTimeout);
    
    // Send typing status to other user
    // (This would use Supabase Realtime Presence)
    
    typingTimeout = setTimeout(() => {
        // Stop typing indicator
    }, 3000);
}

// =====================================================
// CHECK IF BLOCKED
// =====================================================

async function checkIfBlocked(user1Id, user2Id) {
    try {
        const { data, error } = await supabase
            .from('blocked_users')
            .select('*')
            .or(`and(blocker_id.eq.${user1Id},blocked_id.eq.${user2Id}),and(blocker_id.eq.${user2Id},blocked_id.eq.${user1Id})`)
            .single();
        
        return !!data;
    } catch (error) {
        return false;
    }
}

// =====================================================
// UPDATE CHAT BADGE
// =====================================================

function updateChatBadge(count) {
    const badge = document.getElementById('chat-badge');
    if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

function formatTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleTimeString('de-DE', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
}

function scrollToBottom() {
    const container = document.getElementById('messages-container');
    container.scrollTop = container.scrollHeight;
}

function playNotificationSound() {
    try {
        const audio = new Audio('/public/sounds/notification.mp3');
        audio.volume = 0.5;
        audio.play().catch(e => console.log('Could not play sound:', e));
    } catch (error) {
        console.log('Notification sound not available');
    }
}

function showPushNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, {
            body: body.substring(0, 100),
            icon: '/public/icons/icon-192.png',
            badge: '/public/icons/icon-192.png'
        });
    }
}

// =====================================================
// BACK TO CHATS
// =====================================================

document.getElementById('back-to-chats')?.addEventListener('click', () => {
    if (messageSubscription) {
        messageSubscription.unsubscribe();
    }
    
    currentChatId = null;
    currentChatUser = null;
    
    document.getElementById('chat-detail-screen').classList.remove('active');
    document.getElementById('chats-screen').classList.add('active');
    
    loadChats();
});

console.log('✅ Chat.js loaded');
