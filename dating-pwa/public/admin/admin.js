// =====================================================
// ADMIN.JS - Moderation Panel Logic
// =====================================================

// WICHTIG: Gleiche Supabase Credentials wie in app.js!
const SUPABASE_URL = 'DEINE_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'DEIN_SUPABASE_ANON_KEY';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentView = 'dashboard';
let selectedUser = null;
let selectedReport = null;
let selectedChat = null;

// =====================================================
// INITIALIZATION
// =====================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🛡️ Admin Panel Loading...');
    
    // Check Auth
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
        window.location.href = '/index.html';
        return;
    }
    
    // Load Admin User
    await loadAdminUser(session.user.id);
    
    // Setup Navigation
    setupNavigation();
    
    // Load Dashboard
    loadDashboard();
    
    // Setup Event Listeners
    document.getElementById('back-to-app')?.addEventListener('click', () => {
        window.location.href = '/index.html';
    });
    
    document.getElementById('logout-admin')?.addEventListener('click', async () => {
        await supabase.auth.signOut();
        window.location.href = '/index.html';
    });
});

// =====================================================
// LOAD ADMIN USER
// =====================================================

async function loadAdminUser(userId) {
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();
        
        if (error) throw error;
        
        // Check if user is Moderator/Admin/Owner
        if (!['moderator', 'admin', 'owner'].includes(user.role)) {
            alert('❌ Du hast keine Berechtigung für das Admin-Panel!');
            window.location.href = '/index.html';
            return;
        }
        
        currentUser = user;
        
        // Update UI
        document.getElementById('admin-username').textContent = user.username;
        document.getElementById('user-role').querySelector('.role-text').textContent = user.role.toUpperCase();
        
        // Show admin section if admin/owner
        if (['admin', 'owner'].includes(user.role)) {
            document.getElementById('admin-section').style.display = 'block';
        }
        
        console.log('✅ Admin loaded:', user.username, '-', user.role);
        
    } catch (error) {
        console.error('Error loading admin user:', error);
        alert('Fehler beim Laden des Benutzers');
        window.location.href = '/index.html';
    }
}

// =====================================================
// NAVIGATION
// =====================================================

function setupNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            switchView(view);
        });
    });
}

function switchView(viewName) {
    // Update active nav button
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-view="${viewName}"]`)?.classList.add('active');
    
    // Update views
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });
    document.getElementById(`${viewName}-view`)?.classList.add('active');
    
    // Update header
    const titles = {
        dashboard: 'Dashboard',
        reports: 'Reports',
        users: 'Users',
        chats: 'Chats',
        calls: 'Calls',
        vpn: 'VPN Detection',
        logs: 'Activity Logs',
        settings: 'Settings'
    };
    
    document.getElementById('view-title').textContent = titles[viewName];
    document.getElementById('breadcrumb-current').textContent = titles[viewName];
    
    currentView = viewName;
    
    // Load view data
    loadViewData(viewName);
}

function loadViewData(viewName) {
    switch(viewName) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'reports':
            loadReports();
            break;
        case 'users':
            loadUsers();
            break;
        case 'chats':
            loadChats();
            break;
        case 'calls':
            loadCalls();
            break;
        case 'vpn':
            loadVPNDetections();
            break;
        case 'logs':
            loadLogs();
            break;
        case 'settings':
            loadSettings();
            break;
    }
}

// =====================================================
// DASHBOARD
// =====================================================

async function loadDashboard() {
    try {
        // Total Users
        const { count: totalUsers } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true });
        
        // Online Users
        const { count: onlineUsers } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('is_online', true);
        
        // Pending Reports
        const { count: pendingReports } = await supabase
            .from('reports')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');
        
        // Banned Users
        const { count: bannedUsers } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('account_status', 'banned');
        
        // Update UI
        document.getElementById('total-users').textContent = totalUsers || 0;
        document.getElementById('online-users').textContent = onlineUsers || 0;
        document.getElementById('pending-reports').textContent = pendingReports || 0;
        document.getElementById('banned-users').textContent = bannedUsers || 0;
        
        // Header stats
        document.getElementById('header-online').textContent = onlineUsers || 0;
        document.getElementById('header-pending').textContent = pendingReports || 0;
        document.getElementById('reports-badge').textContent = pendingReports || 0;
        
        // Load recent activity
        await loadRecentActivity();
        
        // Load recent users
        await loadRecentUsers();
        
    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

async function loadRecentActivity() {
    try {
        const { data: logs, error } = await supabase
            .from('moderation_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10);
        
        if (error) throw error;
        
        const container = document.getElementById('recent-activities');
        
        if (!logs || logs.length === 0) {
            container.innerHTML = '<p class="empty-state">Keine Aktivitäten</p>';
            return;
        }
        
        container.innerHTML = logs.map(log => `
            <div class="activity-item">
                <div class="activity-icon">${getActionIcon(log.action)}</div>
                <div class="activity-content">
                    <p class="activity-text">${log.action}</p>
                    <span class="activity-time">${formatDate(log.created_at)}</span>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error loading activity:', error);
    }
}

async function loadRecentUsers() {
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(6);
        
        if (error) throw error;
        
        const container = document.getElementById('recent-users');
        
        if (!users || users.length === 0) {
            container.innerHTML = '<p class="empty-state">Keine Nutzer</p>';
            return;
        }
        
        container.innerHTML = users.map(user => `
            <div class="user-card" onclick="showUserDetail('${user.id}')">
                <img src="${user.profilbild_url || '/public/icons/icon-192.png'}" 
                     alt="${user.username}">
                <h4>${user.username}</h4>
                <p>${user.age} Jahre</p>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error loading recent users:', error);
    }
}

// =====================================================
// REPORTS
// =====================================================

async function loadReports() {
    const container = document.getElementById('reports-list');
    container.innerHTML = '<div class="loading">Loading...</div>';
    
    try {
        let query = supabase
            .from('reports')
            .select(`
                *,
                reporter:users!reports_reporter_id_fkey(username),
                reported_user:users!reports_reported_user_id_fkey(username),
                reviewed_by_user:users!reports_reviewed_by_fkey(username)
            `)
            .order('created_at', { ascending: false });
        
        // Filter by status
        const statusFilter = document.getElementById('report-status-filter')?.value;
        if (statusFilter && statusFilter !== 'all') {
            query = query.eq('status', statusFilter);
        }
        
        // Filter by priority
        const priorityFilter = document.getElementById('report-priority-filter')?.value;
        if (priorityFilter && priorityFilter !== 'all') {
            query = query.eq('priority', parseInt(priorityFilter));
        }
        
        const { data: reports, error } = await query;
        
        if (error) throw error;
        
        if (!reports || reports.length === 0) {
            container.innerHTML = '<p class="empty-state">Keine Meldungen</p>';
            return;
        }
        
        container.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Reporter</th>
                        <th>Reported User</th>
                        <th>Reason</th>
                        <th>Priority</th>
                        <th>Status</th>
                        <th>Date</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${reports.map(report => `
                        <tr>
                            <td>${report.id.substring(0, 8)}</td>
                            <td>${report.reporter?.username || 'Unknown'}</td>
                            <td>${report.reported_user?.username || 'Unknown'}</td>
                            <td>${report.reason.substring(0, 30)}...</td>
                            <td><span class="priority-${report.priority}">${getPriorityText(report.priority)}</span></td>
                            <td><span class="status-${report.status}">${report.status}</span></td>
                            <td>${formatDate(report.created_at)}</td>
                            <td>
                                <button class="btn-action small" onclick="showReportDetail('${report.id}')">View</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        
    } catch (error) {
        console.error('Error loading reports:', error);
        container.innerHTML = '<p class="error">Error loading reports</p>';
    }
}

// =====================================================
// USERS
// =====================================================

async function loadUsers() {
    const container = document.getElementById('users-list');
    container.innerHTML = '<div class="loading">Loading...</div>';
    
    try {
        let query = supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });
        
        // Filter by status
        const statusFilter = document.getElementById('user-status-filter')?.value;
        if (statusFilter && statusFilter !== 'all') {
            query = query.eq('account_status', statusFilter);
        }
        
        // Search
        const searchTerm = document.getElementById('user-search')?.value;
        if (searchTerm) {
            query = query.or(`username.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`);
        }
        
        const { data: users, error } = await query.limit(100);
        
        if (error) throw error;
        
        if (!users || users.length === 0) {
            container.innerHTML = '<p class="empty-state">Keine Benutzer gefunden</p>';
            return;
        }
        
        container.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Username</th>
                        <th>Email</th>
                        <th>Age</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Strikes</th>
                        <th>Created</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${users.map(user => `
                        <tr>
                            <td>${user.username}</td>
                            <td>${user.email}</td>
                            <td>${user.age}</td>
                            <td><span class="role-${user.role}">${user.role}</span></td>
                            <td><span class="status-${user.account_status}">${user.account_status}</span></td>
                            <td>${user.strikes}</td>
                            <td>${formatDate(user.created_at)}</td>
                            <td>
                                <button class="btn-action small" onclick="showUserDetail('${user.id}')">View</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        
    } catch (error) {
        console.error('Error loading users:', error);
        container.innerHTML = '<p class="error">Error loading users</p>';
    }
}

// =====================================================
// CHATS
// =====================================================

async function loadChats() {
    const container = document.getElementById('chats-list');
    container.innerHTML = '<div class="loading">Loading...</div>';
    
    try {
        const { data: chats, error } = await supabase
            .from('chats')
            .select(`
                *,
                user1:users!chats_user1_id_fkey(username),
                user2:users!chats_user2_id_fkey(username),
                messages(count)
            `)
            .order('last_message_at', { ascending: false })
            .limit(50);
        
        if (error) throw error;
        
        if (!chats || chats.length === 0) {
            container.innerHTML = '<p class="empty-state">Keine Chats</p>';
            return;
        }
        
        container.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Chat ID</th>
                        <th>User 1</th>
                        <th>User 2</th>
                        <th>Messages</th>
                        <th>Last Activity</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${chats.map(chat => `
                        <tr>
                            <td>${chat.id.substring(0, 8)}</td>
                            <td>${chat.user1?.username || 'Unknown'}</td>
                            <td>${chat.user2?.username || 'Unknown'}</td>
                            <td>${chat.messages?.length || 0}</td>
                            <td>${formatDate(chat.last_message_at)}</td>
                            <td>
                                <button class="btn-action small" onclick="showChatDetail('${chat.id}')">View</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        
    } catch (error) {
        console.error('Error loading chats:', error);
        container.innerHTML = '<p class="error">Error loading chats</p>';
    }
}

// =====================================================
// CALLS
// =====================================================

async function loadCalls() {
    const container = document.getElementById('calls-list');
    container.innerHTML = '<div class="loading">Loading...</div>';
    
    try {
        const { data: calls, error } = await supabase
            .from('call_logs')
            .select(`
                *,
                caller:users!call_logs_caller_id_fkey(username),
                receiver:users!call_logs_receiver_id_fkey(username)
            `)
            .order('created_at', { ascending: false })
            .limit(100);
        
        if (error) throw error;
        
        if (!calls || calls.length === 0) {
            container.innerHTML = '<p class="empty-state">Keine Anrufe</p>';
            return;
        }
        
        container.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Caller</th>
                        <th>Receiver</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Duration</th>
                        <th>Date</th>
                    </tr>
                </thead>
                <tbody>
                    ${calls.map(call => `
                        <tr>
                            <td>${call.caller?.username || 'Unknown'}</td>
                            <td>${call.receiver?.username || 'Unknown'}</td>
                            <td>${call.call_type}</td>
                            <td><span class="status-${call.status}">${call.status}</span></td>
                            <td>${call.duration ? call.duration + 's' : '-'}</td>
                            <td>${formatDate(call.created_at)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        
    } catch (error) {
        console.error('Error loading calls:', error);
        container.innerHTML = '<p class="error">Error loading calls</p>';
    }
}

// =====================================================
// VPN DETECTIONS
// =====================================================

async function loadVPNDetections() {
    const container = document.getElementById('vpn-list');
    container.innerHTML = '<div class="loading">Loading...</div>';
    
    try {
        const { data: detections, error } = await supabase
            .from('vpn_detections')
            .select(`
                *,
                user:users(username, email)
            `)
            .order('created_at', { ascending: false })
            .limit(100);
        
        if (error) throw error;
        
        if (!detections || detections.length === 0) {
            container.innerHTML = '<p class="empty-state">Keine VPN-Detections</p>';
            return;
        }
        
        container.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>User</th>
                        <th>IP Address</th>
                        <th>VPN?</th>
                        <th>Provider</th>
                        <th>Action</th>
                        <th>Date</th>
                    </tr>
                </thead>
                <tbody>
                    ${detections.map(d => `
                        <tr>
                            <td>${d.user?.username || 'Unknown'}</td>
                            <td>${d.ip_address}</td>
                            <td>${d.is_vpn ? '🔴 Yes' : '🟢 No'}</td>
                            <td>${d.vpn_provider || '-'}</td>
                            <td>${d.action_taken}</td>
                            <td>${formatDate(d.created_at)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        
    } catch (error) {
        console.error('Error loading VPN detections:', error);
        container.innerHTML = '<p class="error">Error loading VPN detections</p>';
    }
}

// =====================================================
// LOGS
// =====================================================

async function loadLogs() {
    const container = document.getElementById('logs-list');
    container.innerHTML = '<div class="loading">Loading...</div>';
    
    try {
        const { data: logs, error } = await supabase
            .from('moderation_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);
        
        if (error) throw error;
        
        if (!logs || logs.length === 0) {
            container.innerHTML = '<p class="empty-state">Keine Logs</p>';
            return;
        }
        
        container.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Action</th>
                        <th>Target Type</th>
                        <th>Details</th>
                        <th>Date</th>
                    </tr>
                </thead>
                <tbody>
                    ${logs.map(log => `
                        <tr>
                            <td>${log.action}</td>
                            <td>${log.target_type || '-'}</td>
                            <td>${JSON.stringify(log.details).substring(0, 50)}...</td>
                            <td>${formatDate(log.created_at)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        
    } catch (error) {
        console.error('Error loading logs:', error);
        container.innerHTML = '<p class="error">Error loading logs</p>';
    }
}

// =====================================================
// USER DETAIL MODAL
// =====================================================

async function showUserDetail(userId) {
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) throw error;
        selectedUser = user;

        document.getElementById('user-detail-content').innerHTML = `
            <div class="detail-row">
                <img src="${user.profilbild_url || '/public/icons/icon-192.png'}" alt="${user.username}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;margin-bottom:1rem;">
                <h3>${user.username}</h3>
                <p style="color:var(--text-secondary);margin-bottom:1rem;">${user.email}</p>
            </div>
            <div class="detail-grid">
                <div class="detail-field"><span class="detail-label">Alter</span><span class="detail-value">${user.age} Jahre</span></div>
                <div class="detail-field"><span class="detail-label">Rolle</span><span class="detail-value role-${user.role}">${user.role.toUpperCase()}</span></div>
                <div class="detail-field"><span class="detail-label">Status</span><span class="detail-value status-${user.account_status}">${user.account_status}</span></div>
                <div class="detail-field"><span class="detail-label">Region</span><span class="detail-value">${user.region}${user.stadt ? ', ' + user.stadt : ''}</span></div>
                <div class="detail-field"><span class="detail-label">Strikes</span><span class="detail-value" style="color:${user.strikes > 0 ? 'var(--warning)' : 'var(--success)'};">${user.strikes} / 3</span></div>
                <div class="detail-field"><span class="detail-label">Eltern verifiziert</span><span class="detail-value">${user.verified_parent ? '✅ Ja' : '❌ Nein'}</span></div>
                <div class="detail-field"><span class="detail-label">VPN erkannt</span><span class="detail-value">${user.vpn_detected ? '🔴 Ja' : '🟢 Nein'}</span></div>
                <div class="detail-field"><span class="detail-label">Erstellt</span><span class="detail-value">${formatDate(user.created_at)}</span></div>
                <div class="detail-field"><span class="detail-label">Zuletzt aktiv</span><span class="detail-value">${user.last_active_at ? formatDate(user.last_active_at) : 'Noch nicht'}</span></div>
                <div class="detail-field"><span class="detail-label">Letzte IP</span><span class="detail-value">${user.last_ip || 'Unbekannt'}</span></div>
                ${user.ban_reason ? `<div class="detail-field"><span class="detail-label">Ban-Grund</span><span class="detail-value" style="color:var(--danger);">${user.ban_reason}</span></div>` : ''}
            </div>
        `;

        // Owner kann nicht gebannt werden
        if (user.role === 'owner') {
            document.querySelectorAll('.modal-actions .btn-action').forEach(btn => btn.style.display = 'none');
        } else {
            document.querySelectorAll('.modal-actions .btn-action').forEach(btn => btn.style.display = 'inline-flex');
        }

        document.getElementById('user-detail-modal').classList.remove('hidden');
    } catch (error) {
        console.error('Error showing user detail:', error);
        alert('Fehler beim Laden der Benutzerdaten');
    }
}

function closeUserDetail() {
    document.getElementById('user-detail-modal').classList.add('hidden');
    selectedUser = null;
}

// =====================================================
// WARN / BAN / UNBAN USER
// =====================================================

async function warnUser() {
    if (!selectedUser || selectedUser.role === 'owner') return;

    const reason = prompt('Grund für die Warnung:');
    if (!reason) return;

    try {
        const newStrikes = selectedUser.strikes + 1;

        await supabase
            .from('users')
            .update({
                strikes: newStrikes,
                account_status: newStrikes >= 3 ? 'banned' : 'warned',
                ban_reason: newStrikes >= 3 ? 'Automatisch gebannt nach 3 Strikes. Letzter: ' + reason : null
            })
            .eq('id', selectedUser.id);

        // Moderation-Aktion loggen
        await supabase
            .from('moderation_actions')
            .insert({
                target_user_id: selectedUser.id,
                moderator_id: currentUser.id,
                action: 'warn',
                reason: reason
            });

        // Log
        await supabase
            .from('moderation_logs')
            .insert({
                moderator_id: currentUser.id,
                action: 'user_warned',
                target_type: 'user',
                target_id: selectedUser.id,
                details: { reason: reason, strikes: newStrikes }
            });

        alert(`✅ ${selectedUser.username} wurde gewarnt. Strikes: ${newStrikes}/3`);
        closeUserDetail();
        loadUsers();
    } catch (error) {
        console.error('Error warning user:', error);
        alert('❌ Fehler beim Verwarnen');
    }
}

async function banUser() {
    if (!selectedUser || selectedUser.role === 'owner') return;

    const reason = prompt('Grund für den Ban:');
    if (!reason) return;

    const permanent = confirm('Permanenter Ban?\n\nOK = Permanent\nAbbrechen = 24 Stunden');

    try {
        const bannedUntil = permanent ? null : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        await supabase
            .from('users')
            .update({
                account_status: 'banned',
                ban_reason: reason,
                banned_until: bannedUntil
            })
            .eq('id', selectedUser.id);

        await supabase
            .from('moderation_actions')
            .insert({
                target_user_id: selectedUser.id,
                moderator_id: currentUser.id,
                action: 'ban',
                reason: reason,
                duration: permanent ? null : 24,
                expires_at: bannedUntil
            });

        await supabase
            .from('moderation_logs')
            .insert({
                moderator_id: currentUser.id,
                action: 'user_banned',
                target_type: 'user',
                target_id: selectedUser.id,
                details: { reason: reason, permanent: permanent }
            });

        alert(`🚫 ${selectedUser.username} wurde gebannt. ${permanent ? 'Permanent.' : '24 Stunden.'}`);
        closeUserDetail();
        loadUsers();
        loadDashboard();
    } catch (error) {
        console.error('Error banning user:', error);
        alert('❌ Fehler beim Bannen');
    }
}

async function unbanUser() {
    if (!selectedUser) return;

    try {
        await supabase
            .from('users')
            .update({
                account_status: 'active',
                ban_reason: null,
                banned_until: null,
                strikes: 0
            })
            .eq('id', selectedUser.id);

        await supabase
            .from('moderation_actions')
            .insert({
                target_user_id: selectedUser.id,
                moderator_id: currentUser.id,
                action: 'warn',
                reason: 'Ban aufgehoben durch Moderator'
            });

        await supabase
            .from('moderation_logs')
            .insert({
                moderator_id: currentUser.id,
                action: 'user_unbanned',
                target_type: 'user',
                target_id: selectedUser.id,
                details: { unban: true }
            });

        alert(`✅ ${selectedUser.username} wurde entsperrt.`);
        closeUserDetail();
        loadUsers();
        loadDashboard();
    } catch (error) {
        console.error('Error unbanning user:', error);
        alert('❌ Fehler beim Entsperren');
    }
}

// =====================================================
// REPORT DETAIL MODAL
// =====================================================

async function showReportDetail(reportId) {
    try {
        const { data: report, error } = await supabase
            .from('reports')
            .select(`
                *,
                reporter:users!reports_reporter_id_fkey(username, email),
                reported_user:users!reports_reported_user_id_fkey(username, email)
            `)
            .eq('id', reportId)
            .single();

        if (error) throw error;
        selectedReport = report;

        document.getElementById('report-detail-content').innerHTML = `
            <div class="detail-grid">
                <div class="detail-field"><span class="detail-label">Report-ID</span><span class="detail-value">${report.id}</span></div>
                <div class="detail-field"><span class="detail-label">Status</span><span class="detail-value status-${report.status}">${report.status.toUpperCase()}</span></div>
                <div class="detail-field"><span class="detail-label">Priorität</span><span class="detail-value priority-${report.priority}">${getPriorityText(report.priority)}</span></div>
                <div class="detail-field"><span class="detail-label">Kategorie</span><span class="detail-value">${report.category}</span></div>
                <div class="detail-field"><span class="detail-label">Meldender</span><span class="detail-value">👤 ${report.reporter?.username || 'Unbekannt'}</span></div>
                <div class="detail-field"><span class="detail-label">Gemeldeter User</span><span class="detail-value">👤 ${report.reported_user?.username || 'Unbekannt'}</span></div>
                <div class="detail-field"><span class="detail-label">Grund</span><span class="detail-value">${report.reason}</span></div>
                ${report.description ? `<div class="detail-field"><span class="detail-label">Beschreibung</span><span class="detail-value">${report.description}</span></div>` : ''}
                <div class="detail-field"><span class="detail-label">Erstellt</span><span class="detail-value">${formatDate(report.created_at)}</span></div>
                ${report.appeal_reason ? `
                    <div class="detail-field" style="border-top:1px solid var(--glass-border);padding-top:1rem;margin-top:0.5rem;">
                        <span class="detail-label" style="color:var(--warning);">⚖️ Widerspruch</span>
                        <span class="detail-value">${report.appeal_reason}</span>
                    </div>
                ` : ''}
            </div>
        `;

        document.getElementById('report-detail-modal').classList.remove('hidden');
    } catch (error) {
        console.error('Error showing report detail:', error);
        alert('Fehler beim Laden der Meldung');
    }
}

function closeReportDetail() {
    document.getElementById('report-detail-modal').classList.add('hidden');
    selectedReport = null;
}

// =====================================================
// RESOLVE / REJECT REPORT
// =====================================================

async function resolveReport() {
    if (!selectedReport) return;

    const notes = prompt('Anmerkungen zur Lösung (optional):') || '';

    try {
        await supabase
            .from('reports')
            .update({
                status: 'resolved',
                reviewed_by: currentUser.id,
                reviewed_at: new Date().toISOString(),
                resolution_notes: notes
            })
            .eq('id', selectedReport.id);

        await supabase
            .from('moderation_logs')
            .insert({
                moderator_id: currentUser.id,
                action: 'report_resolved',
                target_type: 'report',
                target_id: selectedReport.id,
                details: { notes: notes }
            });

        alert('✅ Meldung wurde als gelöst markiert.');
        closeReportDetail();
        loadReports();
        loadDashboard();
    } catch (error) {
        console.error('Error resolving report:', error);
        alert('❌ Fehler');
    }
}

async function rejectReport() {
    if (!selectedReport) return;

    const notes = prompt('Grund für die Ablehnung:');
    if (!notes) return;

    try {
        await supabase
            .from('reports')
            .update({
                status: 'rejected',
                reviewed_by: currentUser.id,
                reviewed_at: new Date().toISOString(),
                resolution_notes: notes
            })
            .eq('id', selectedReport.id);

        await supabase
            .from('moderation_logs')
            .insert({
                moderator_id: currentUser.id,
                action: 'report_rejected',
                target_type: 'report',
                target_id: selectedReport.id,
                details: { notes: notes }
            });

        alert('❌ Meldung wurde abgelehnt.');
        closeReportDetail();
        loadReports();
    } catch (error) {
        console.error('Error rejecting report:', error);
        alert('❌ Fehler');
    }
}

async function escalateReport() {
    if (!selectedReport) return;

    try {
        await supabase
            .from('reports')
            .update({
                status: 'reviewing',
                priority: 2,
                reviewed_by: currentUser.id,
                reviewed_at: new Date().toISOString()
            })
            .eq('id', selectedReport.id);

        alert('⚡ Meldung wurde eskaliert (Priorität: Kritisch).');
        closeReportDetail();
        loadReports();
    } catch (error) {
        console.error('Error escalating:', error);
        alert('❌ Fehler');
    }
}

// =====================================================
// CHAT DETAIL MODAL
// =====================================================

async function showChatDetail(chatId) {
    try {
        const { data: messages, error } = await supabase
            .from('messages')
            .select(`
                *,
                sender:users!messages_sender_id_fkey(username)
            `)
            .eq('chat_id', chatId)
            .order('created_at', { ascending: true })
            .limit(100);

        if (error) throw error;

        selectedChat = chatId;

        document.getElementById('chat-detail-info').innerHTML = `<p style="color:var(--text-secondary);margin-bottom:1rem;">Chat-ID: ${chatId} — ${messages.length} Nachrichten</p>`;

        document.getElementById('chat-messages-list').innerHTML = messages.map(msg => `
            <div class="chat-msg ${msg.is_blocked ? 'blocked' : ''}" style="margin-bottom:0.75rem;">
                <div style="display:flex;justify-content:space-between;margin-bottom:0.25rem;">
                    <strong style="color:var(--primary);">${msg.sender?.username || 'Unbekannt'}</strong>
                    <span style="font-size:0.75rem;color:var(--text-muted);">${formatDate(msg.created_at)}</span>
                </div>
                <div style="background:rgba(255,255,255,0.06);padding:0.6rem 0.9rem;border-radius:10px;color:${msg.is_blocked ? 'var(--danger)' : 'var(--text-primary)'};">
                    ${msg.is_blocked ? '🚫 [Blockiert durch Moderation]' : msg.content}
                </div>
                ${msg.moderation_score > 0 ? `<span style="font-size:0.7rem;color:var(--text-muted);">Mod-Score: ${msg.moderation_score} | ${msg.moderation_classification}</span>` : ''}
            </div>
        `).join('');

        document.getElementById('chat-detail-modal').classList.remove('hidden');
    } catch (error) {
        console.error('Error showing chat detail:', error);
        alert('Fehler beim Laden des Chats');
    }
}

function closeChatDetail() {
    document.getElementById('chat-detail-modal').classList.add('hidden');
    selectedChat = null;
}

// =====================================================
// SETTINGS
// =====================================================

async function loadSettings() {
    if (!['admin', 'owner'].includes(currentUser?.role)) return;
    await loadModerators();
}

async function loadModerators() {
    try {
        const { data: mods, error } = await supabase
            .from('users')
            .select('*')
            .in('role', ['moderator', 'admin', 'owner'])
            .order('role');

        if (error) throw error;

        const container = document.getElementById('moderators-list');
        container.innerHTML = mods.map(mod => `
            <div class="mod-item" style="display:flex;align-items:center;justify-content:space-between;padding:0.75rem;background:rgba(255,255,255,0.04);border-radius:10px;margin-bottom:0.5rem;">
                <div style="display:flex;align-items:center;gap:0.75rem;">
                    <span style="font-size:1.5rem;">👤</span>
                    <div>
                        <div style="font-weight:600;">${mod.username}</div>
                        <div style="font-size:0.8rem;color:var(--text-muted);">${mod.email}</div>
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:0.5rem;">
                    <span class="role-badge-small role-${mod.role}">${mod.role.toUpperCase()}</span>
                    ${mod.role !== 'owner' ? `<button class="btn-action small danger" onclick="removeModerator('${mod.id}')">✕</button>` : ''}
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading moderators:', error);
    }
}

async function showAddModeratorModal() {
    const email = prompt('E-Mail des Benutzers eingeben:');
    if (!email) return;

    const roleChoice = prompt('Rolle:\n1 = Moderator\n2 = Admin');
    const role = roleChoice === '2' ? 'admin' : 'moderator';

    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();

        if (error || !user) {
            alert('❌ Kein Benutzer mit dieser E-Mail gefunden.');
            return;
        }

        if (user.role === 'owner') {
            alert('❌ Der Owner kann nicht geändert werden.');
            return;
        }

        await supabase
            .from('users')
            .update({ role: role })
            .eq('id', user.id);

        await supabase
            .from('moderation_logs')
            .insert({
                moderator_id: currentUser.id,
                action: 'role_changed',
                target_type: 'user',
                target_id: user.id,
                details: { new_role: role, username: user.username }
            });

        alert(`✅ ${user.username} ist jetzt ${role.toUpperCase()}!`);
        loadModerators();
    } catch (error) {
        console.error('Error adding moderator:', error);
        alert('❌ Fehler');
    }
}

async function removeModerator(userId) {
    if (!confirm('Rolle wirklich entfernen?')) return;

    try {
        await supabase
            .from('users')
            .update({ role: 'user' })
            .eq('id', userId);

        await supabase
            .from('moderation_logs')
            .insert({
                moderator_id: currentUser.id,
                action: 'role_removed',
                target_type: 'user',
                target_id: userId
            });

        alert('✅ Rolle entfernt.');
        loadModerators();
    } catch (error) {
        console.error('Error removing moderator:', error);
        alert('❌ Fehler');
    }
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

function formatDate(dateString) {
    if (!dateString) return '–';
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE') + ' ' + date.toLocaleTimeString('de-DE');
}

function getActionIcon(action) {
    const icons = {
        vpn_blocked: '🔒',
        user_banned: '🚫',
        user_warned: '⚠️',
        user_unbanned: '✅',
        report_resolved: '✅',
        report_rejected: '❌',
        message_deleted: '🗑️',
        role_changed: '👑',
        role_removed: '👤',
        auto_moderation: '🤖'
    };
    return icons[action] || '📝';
}

function getPriorityText(priority) {
    const texts = { 0: '🟢 Normal', 1: '🟡 High', 2: '🔴 Critical' };
    return texts[priority] || 'Unknown';
}

console.log('✅ Admin.js loaded');
