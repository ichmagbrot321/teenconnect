// =====================================================
// WEBRTC.JS - Audio & Video Calls (Peer-to-Peer)
// =====================================================

let localStream = null;
let remoteStream = null;
let peerConnection = null;
let callType = null; // 'audio' or 'video'
let currentCall = null;
let signalingChannel = null;

// ICE Servers (STUN servers - kostenlos)
const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
    ]
};

// =====================================================
// INITIALIZE WEBRTC LISTENERS
// =====================================================

document.addEventListener('DOMContentLoaded', () => {
    // Call Buttons im Chat
    document.getElementById('chat-call-btn')?.addEventListener('click', () => {
        initiateCall('audio');
    });
    
    document.getElementById('chat-video-btn')?.addEventListener('click', () => {
        initiateCall('video');
    });
    
    // Incoming Call Actions
    document.getElementById('accept-call-btn')?.addEventListener('click', acceptCall);
    document.getElementById('reject-call-btn')?.addEventListener('click', rejectCall);
    
    // Active Call Controls
    document.getElementById('mute-btn')?.addEventListener('click', toggleMute);
    document.getElementById('video-toggle-btn')?.addEventListener('click', toggleVideo);
    document.getElementById('end-call-btn')?.addEventListener('click', endCall);
});

// =====================================================
// INITIATE CALL
// =====================================================

async function initiateCall(type) {
    if (!currentChatUser) {
        showToast('❌ Kein Chat ausgewählt', 'error');
        return;
    }
    
    callType = type;
    
    try {
        // Request media permissions
        const constraints = {
            audio: true,
            video: type === 'video'
        };
        
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Setup peer connection
        await setupPeerConnection();
        
        // Add local stream
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        // Create offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        // Send call signal via Supabase Realtime
        await sendCallSignal({
            type: 'offer',
            callType: type,
            from: appState.currentUser.id,
            to: currentChatUser.id,
            offer: offer
        });
        
        // Log call attempt
        currentCall = await logCallAttempt(currentChatUser.id, type);
        
        showToast(`📞 Rufe ${currentChatUser.username} an...`, 'info');
        
        // Play ringing sound
        playRingtone();
        
    } catch (error) {
        console.error('Error initiating call:', error);
        
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
            showToast('❌ Zugriff auf Kamera/Mikrofon verweigert. Bitte erlaube den Zugriff in deinen Browser-Einstellungen.', 'error', 8000);
        } else {
            showToast('❌ Fehler beim Starten des Anrufs', 'error');
        }
        
        cleanupCall();
    }
}

// =====================================================
// SETUP PEER CONNECTION
// =====================================================

async function setupPeerConnection() {
    peerConnection = new RTCPeerConnection(iceServers);
    
    // ICE candidate event
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            sendCallSignal({
                type: 'ice-candidate',
                candidate: event.candidate,
                from: appState.currentUser.id,
                to: currentChatUser.id
            });
        }
    };
    
    // Track event (receive remote stream)
    peerConnection.ontrack = (event) => {
        remoteStream = event.streams[0];
        const remoteVideo = document.getElementById('remote-video');
        if (remoteVideo) {
            remoteVideo.srcObject = remoteStream;
        }
    };
    
    // Connection state change
    peerConnection.onconnectionstatechange = () => {
        console.log('Connection state:', peerConnection.connectionState);
        
        if (peerConnection.connectionState === 'connected') {
            showToast('✅ Verbunden!', 'success');
            stopRingtone();
        }
        
        if (peerConnection.connectionState === 'disconnected' || 
            peerConnection.connectionState === 'failed') {
            endCall();
        }
    };
    
    // Setup signaling channel
    setupSignalingChannel();
}

// =====================================================
// SIGNALING CHANNEL (Supabase Realtime)
// =====================================================

function setupSignalingChannel() {
    const channelName = `call:${appState.currentUser.id}`;
    
    signalingChannel = supabase
        .channel(channelName)
        .on(
            'broadcast',
            { event: 'call-signal' },
            async (payload) => {
                await handleCallSignal(payload.payload);
            }
        )
        .subscribe();
}

// =====================================================
// SEND CALL SIGNAL
// =====================================================

async function sendCallSignal(signal) {
    const channelName = `call:${signal.to}`;
    
    await supabase.channel(channelName).send({
        type: 'broadcast',
        event: 'call-signal',
        payload: signal
    });
}

// =====================================================
// HANDLE INCOMING CALL SIGNAL
// =====================================================

async function handleCallSignal(signal) {
    try {
        switch (signal.type) {
            case 'offer':
                await handleIncomingCall(signal);
                break;
            
            case 'answer':
                await peerConnection.setRemoteDescription(
                    new RTCSessionDescription(signal.answer)
                );
                break;
            
            case 'ice-candidate':
                await peerConnection.addIceCandidate(
                    new RTCIceCandidate(signal.candidate)
                );
                break;
            
            case 'reject':
                handleCallRejected();
                break;
            
            case 'end':
                handleCallEnded();
                break;
        }
    } catch (error) {
        console.error('Error handling call signal:', error);
    }
}

// =====================================================
// HANDLE INCOMING CALL
// =====================================================

async function handleIncomingCall(signal) {
    callType = signal.callType;
    
    // Get caller info
    const { data: caller, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', signal.from)
        .single();
    
    if (error || !caller) {
        console.error('Error getting caller info:', error);
        return;
    }
    
    currentChatUser = caller;
    
    // Show incoming call modal
    const modal = document.getElementById('incoming-call-modal');
    const callerAvatar = document.getElementById('caller-avatar');
    const callerName = document.getElementById('caller-name');
    const callTypeText = document.getElementById('call-type');
    
    callerAvatar.src = caller.profilbild_url || '/public/icons/icon-192.png';
    callerName.textContent = caller.username;
    callTypeText.textContent = callType === 'video' ? '📹 Video-Anruf' : '📞 Audio-Anruf';
    
    modal.classList.remove('hidden');
    
    // Play ringtone
    playRingtone();
    
    // Store offer for later
    currentCall = {
        offer: signal.offer,
        from: signal.from
    };
}

// =====================================================
// ACCEPT CALL
// =====================================================

async function acceptCall() {
    try {
        // Hide incoming call modal
        document.getElementById('incoming-call-modal').classList.add('hidden');
        stopRingtone();
        
        // Request media permissions
        const constraints = {
            audio: true,
            video: callType === 'video'
        };
        
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Setup peer connection
        await setupPeerConnection();
        
        // Add local stream
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        // Set remote description (offer)
        await peerConnection.setRemoteDescription(
            new RTCSessionDescription(currentCall.offer)
        );
        
        // Create answer
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        // Send answer
        await sendCallSignal({
            type: 'answer',
            from: appState.currentUser.id,
            to: currentCall.from,
            answer: answer
        });
        
        // Show active call UI
        showActiveCallUI();
        
        // Update call log
        await updateCallLog(currentCall.id, 'accepted');
        
    } catch (error) {
        console.error('Error accepting call:', error);
        showToast('❌ Fehler beim Annehmen des Anrufs', 'error');
        cleanupCall();
    }
}

// =====================================================
// REJECT CALL
// =====================================================

async function rejectCall() {
    document.getElementById('incoming-call-modal').classList.add('hidden');
    stopRingtone();
    
    // Send reject signal
    await sendCallSignal({
        type: 'reject',
        from: appState.currentUser.id,
        to: currentCall.from
    });
    
    // Update call log
    await updateCallLog(currentCall.id, 'rejected');
    
    currentCall = null;
}

// =====================================================
// HANDLE CALL REJECTED
// =====================================================

function handleCallRejected() {
    stopRingtone();
    showToast('📵 Anruf wurde abgelehnt', 'info');
    cleanupCall();
}

// =====================================================
// END CALL
// =====================================================

async function endCall() {
    // Send end signal
    if (currentChatUser) {
        await sendCallSignal({
            type: 'end',
            from: appState.currentUser.id,
            to: currentChatUser.id
        });
    }
    
    // Update call log
    if (currentCall) {
        await updateCallLog(currentCall.id, 'ended');
    }
    
    cleanupCall();
    showToast('📞 Anruf beendet', 'info');
}

// =====================================================
// HANDLE CALL ENDED
// =====================================================

function handleCallEnded() {
    showToast('📞 Anruf wurde beendet', 'info');
    cleanupCall();
}

// =====================================================
// CLEANUP CALL
// =====================================================

function cleanupCall() {
    // Stop all tracks
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    if (remoteStream) {
        remoteStream.getTracks().forEach(track => track.stop());
        remoteStream = null;
    }
    
    // Close peer connection
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    // Unsubscribe signaling
    if (signalingChannel) {
        signalingChannel.unsubscribe();
        signalingChannel = null;
    }
    
    // Hide modals
    document.getElementById('incoming-call-modal').classList.add('hidden');
    document.getElementById('active-call-modal').classList.add('hidden');
    
    stopRingtone();
    
    currentCall = null;
}

// =====================================================
// SHOW ACTIVE CALL UI
// =====================================================

function showActiveCallUI() {
    const modal = document.getElementById('active-call-modal');
    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');
    
    // Set video sources
    if (localStream) {
        localVideo.srcObject = localStream;
    }
    
    if (remoteStream) {
        remoteVideo.srcObject = remoteStream;
    }
    
    // Show modal
    modal.classList.remove('hidden');
    
    // Hide local video if audio-only
    if (callType === 'audio') {
        localVideo.style.display = 'none';
        remoteVideo.style.display = 'none';
    }
}

// =====================================================
// TOGGLE MUTE
// =====================================================

function toggleMute() {
    if (!localStream) return;
    
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        
        const btn = document.getElementById('mute-btn');
        btn.textContent = audioTrack.enabled ? '🎤' : '🔇';
        btn.style.background = audioTrack.enabled ? 'var(--bg-tertiary)' : 'var(--danger)';
    }
}

// =====================================================
// TOGGLE VIDEO
// =====================================================

function toggleVideo() {
    if (!localStream) return;
    
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        
        const btn = document.getElementById('video-toggle-btn');
        btn.textContent = videoTrack.enabled ? '📹' : '📵';
        btn.style.background = videoTrack.enabled ? 'var(--bg-tertiary)' : 'var(--danger)';
    }
}

// =====================================================
// CALL LOGGING
// =====================================================

async function logCallAttempt(receiverId, type) {
    try {
        const { data, error } = await supabase
            .from('call_logs')
            .insert({
                caller_id: appState.currentUser.id,
                receiver_id: receiverId,
                call_type: type,
                status: 'missed',
                started_at: new Date().toISOString()
            })
            .select()
            .single();
        
        if (error) throw error;
        
        return data;
    } catch (error) {
        console.error('Error logging call:', error);
        return null;
    }
}

async function updateCallLog(callId, status) {
    if (!callId) return;
    
    try {
        const updates = {
            status: status
        };
        
        if (status === 'accepted') {
            updates.started_at = new Date().toISOString();
        } else if (status === 'ended') {
            updates.ended_at = new Date().toISOString();
            
            // Calculate duration if started
            const { data: call } = await supabase
                .from('call_logs')
                .select('started_at')
                .eq('id', callId)
                .single();
            
            if (call && call.started_at) {
                const duration = Math.floor(
                    (new Date() - new Date(call.started_at)) / 1000
                );
                updates.duration = duration;
            }
        }
        
        await supabase
            .from('call_logs')
            .update(updates)
            .eq('id', callId);
            
    } catch (error) {
        console.error('Error updating call log:', error);
    }
}

// =====================================================
// RINGTONE
// =====================================================

let ringtoneAudio = null;

function playRingtone() {
    try {
        ringtoneAudio = new Audio('/public/sounds/ringtone.mp3');
        ringtoneAudio.loop = true;
        ringtoneAudio.volume = 0.5;
        ringtoneAudio.play().catch(e => console.log('Could not play ringtone:', e));
    } catch (error) {
        console.log('Ringtone not available');
    }
}

function stopRingtone() {
    if (ringtoneAudio) {
        ringtoneAudio.pause();
        ringtoneAudio.currentTime = 0;
        ringtoneAudio = null;
    }
}

// =====================================================
// MODERATOR: END CALL
// =====================================================

async function moderatorEndCall(callId) {
    // Nur für Moderatoren/Admins
    if (!['moderator', 'admin', 'owner'].includes(appState.currentUser.role)) {
        return;
    }
    
    try {
        await supabase
            .from('call_logs')
            .update({
                status: 'ended_by_mod',
                ended_by_moderator: appState.currentUser.id,
                ended_at: new Date().toISOString()
            })
            .eq('id', callId);
        
        showToast('✅ Anruf wurde von Moderator beendet', 'success');
    } catch (error) {
        console.error('Error ending call as moderator:', error);
    }
}

console.log('✅ WebRTC.js loaded');
