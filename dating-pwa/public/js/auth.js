// =====================================================
// AUTH.JS - Authentication & Registration
// =====================================================

// =====================================================
// EVENT LISTENERS FOR AUTH FORMS
// =====================================================

document.addEventListener('DOMContentLoaded', () => {
    // Toggle zwischen Login und Register
    document.getElementById('show-register')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('login-form').classList.add('hidden');
        document.getElementById('register-form').classList.remove('hidden');
    });
    
    document.getElementById('show-login')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('register-form').classList.add('hidden');
        document.getElementById('login-form').classList.remove('hidden');
    });
    
    // Login Form Submit
    document.getElementById('login-form-element')?.addEventListener('submit', handleLogin);
    
    // Register Form Submit
    document.getElementById('register-form-element')?.addEventListener('submit', handleRegister);
    
    // Geburtsdatum Änderung - zeige Eltern-E-Mail Feld
    document.getElementById('register-birthdate')?.addEventListener('change', (e) => {
        const birthdate = new Date(e.target.value);
        const age = calculateAge(birthdate);
        const parentEmailGroup = document.getElementById('parent-email-group');
        const parentEmailInput = document.getElementById('register-parent-email');
        
        if (age < 16) {
            parentEmailGroup.style.display = 'block';
            parentEmailInput.required = true;
        } else {
            parentEmailGroup.style.display = 'none';
            parentEmailInput.required = false;
        }
    });
});

// =====================================================
// CALCULATE AGE
// =====================================================

function calculateAge(birthdate) {
    const today = new Date();
    let age = today.getFullYear() - birthdate.getFullYear();
    const monthDiff = today.getMonth() - birthdate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthdate.getDate())) {
        age--;
    }
    
    return age;
}

// =====================================================
// LOGIN HANDLER
// =====================================================

async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    
    if (!email || !password) {
        showToast('❌ Bitte alle Felder ausfüllen', 'error');
        return;
    }
    
    try {
        // VPN Check VOR dem Login
        const vpnCheck = await checkVPNBeforeAuth(email);
        if (!vpnCheck.allowed) {
            showToast('🚫 VPN/Proxy erkannt! Bitte deaktiviere dein VPN und versuche es erneut.', 'error', 8000);
            return;
        }
        
        // Supabase Login
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });
        
        if (error) {
            if (error.message.includes('Invalid login credentials')) {
                showToast('❌ Falsche E-Mail oder Passwort', 'error');
            } else {
                showToast('❌ Login fehlgeschlagen: ' + error.message, 'error');
            }
            return;
        }
        
        // Login erfolgreich
        showToast('✅ Erfolgreich eingeloggt!', 'success');
        
        // User Daten laden
        await loadUserData(data.user.id);
        
        // IP Logging
        await logIPAddress(data.user.id, vpnCheck.ip, vpnCheck.isVPN);
        
        // Safety Disclaimer zeigen (WICHTIG!)
        showSafetyDisclaimer();
        
    } catch (error) {
        console.error('Login error:', error);
        showToast('❌ Ein Fehler ist aufgetreten', 'error');
    }
}

// =====================================================
// REGISTER HANDLER
// =====================================================

async function handleRegister(e) {
    e.preventDefault();
    
    // Form Daten
    const username = document.getElementById('register-username').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const birthdate = document.getElementById('register-birthdate').value;
    const parentEmail = document.getElementById('register-parent-email').value.trim();
    const password = document.getElementById('register-password').value;
    const region = document.getElementById('register-region').value;
    
    // Checkboxes
    const acceptTerms = document.getElementById('accept-terms').checked;
    const acceptRules = document.getElementById('accept-rules').checked;
    const acceptAge = document.getElementById('accept-age').checked;
    
    // Validierung
    if (!username || !email || !birthdate || !password || !region) {
        showToast('❌ Bitte fülle alle Pflichtfelder aus', 'error');
        return;
    }
    
    if (!acceptTerms || !acceptRules || !acceptAge) {
        showToast('❌ Bitte akzeptiere alle Bedingungen', 'error');
        return;
    }
    
    // Username Validierung
    if (username.length < 3 || username.length > 20) {
        showToast('❌ Benutzername muss 3-20 Zeichen lang sein', 'error');
        return;
    }
    
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        showToast('❌ Benutzername darf nur Buchstaben, Zahlen und _ enthalten', 'error');
        return;
    }
    
    // Passwort Validierung
    if (password.length < 8) {
        showToast('❌ Passwort muss mindestens 8 Zeichen lang sein', 'error');
        return;
    }
    
    // Alter berechnen
    const age = calculateAge(new Date(birthdate));
    
    if (age < 14) {
        showToast('❌ Du musst mindestens 14 Jahre alt sein', 'error');
        return;
    }
    
    // Unter 16 braucht Eltern-E-Mail
    if (age < 16 && !parentEmail) {
        showToast('❌ Du bist unter 16! Eltern-E-Mail ist Pflicht', 'error');
        return;
    }
    
    try {
        // VPN Check VOR Registrierung
        const vpnCheck = await checkVPNBeforeAuth(email);
        if (!vpnCheck.allowed) {
            showToast('🚫 VPN/Proxy erkannt! Bitte deaktiviere dein VPN und versuche es erneut.', 'error', 8000);
            return;
        }
        
        // 1. Username verfügbarkeit prüfen
        const { data: existingUser, error: checkError } = await supabase
            .from('users')
            .select('username')
            .eq('username', username)
            .single();
        
        if (existingUser) {
            showToast('❌ Benutzername bereits vergeben', 'error');
            return;
        }
        
        // 2. Supabase Auth User erstellen
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: email,
            password: password
        });
        
        if (authError) {
            if (authError.message.includes('already registered')) {
                showToast('❌ E-Mail bereits registriert', 'error');
            } else {
                showToast('❌ Registrierung fehlgeschlagen: ' + authError.message, 'error');
            }
            return;
        }
        
        // 3. User in users Table erstellen
        const { data: userData, error: userError } = await supabase
            .from('users')
            .insert({
                id: authData.user.id,
                email: email,
                username: username,
                geburtsdatum: birthdate,
                eltern_email: age < 16 ? parentEmail : null,
                region: region,
                last_ip: vpnCheck.ip,
                vpn_detected: vpnCheck.isVPN
            })
            .select()
            .single();
        
        if (userError) {
            console.error('User creation error:', userError);
            // Rollback: Auth User löschen
            await supabase.auth.admin.deleteUser(authData.user.id);
            showToast('❌ Fehler beim Erstellen des Profils', 'error');
            return;
        }
        
        // 4. Wenn unter 16, Eltern-Verifizierung senden
        if (age < 16 && parentEmail) {
            await sendParentVerificationEmail(userData.id, parentEmail);
            showToast('✅ Registrierung erfolgreich! Deine Eltern müssen noch zustimmen. E-Mail wurde gesendet.', 'success', 8000);
        } else {
            showToast('✅ Registrierung erfolgreich! Du kannst dich jetzt einloggen.', 'success');
        }
        
        // 5. Notification Settings erstellen
        await supabase
            .from('notification_settings')
            .insert({
                user_id: authData.user.id
            });
        
        // Zurück zum Login
        document.getElementById('register-form').classList.add('hidden');
        document.getElementById('login-form').classList.remove('hidden');
        
        // Auto-Login
        await handleAutoLogin(email, password);
        
    } catch (error) {
        console.error('Registration error:', error);
        showToast('❌ Ein Fehler ist aufgetreten', 'error');
    }
}

// =====================================================
// AUTO LOGIN NACH REGISTRIERUNG
// =====================================================

async function handleAutoLogin(email, password) {
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });
        
        if (!error && data.user) {
            await loadUserData(data.user.id);
            showSafetyDisclaimer();
        }
    } catch (error) {
        console.error('Auto-login error:', error);
    }
}

// =====================================================
// ELTERN-VERIFIZIERUNG E-MAIL
// =====================================================

async function sendParentVerificationEmail(userId, parentEmail) {
    try {
        // Token generieren
        const token = generateToken();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 Tage gültig
        
        // In DB speichern
        await supabase
            .from('parent_verifications')
            .insert({
                user_id: userId,
                eltern_email: parentEmail,
                verification_token: token,
                expires_at: expiresAt.toISOString()
            });
        
        // E-Mail über Vercel Serverless Function senden
        // WICHTIG: Du musst später die Vercel Function erstellen!
        const verificationLink = `${window.location.origin}/verify-parent?token=${token}`;
        
        await fetch('/api/send-parent-verification', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                parentEmail: parentEmail,
                verificationLink: verificationLink
            })
        });
        
        console.log('✅ Eltern-Verifizierung E-Mail gesendet an:', parentEmail);
        
    } catch (error) {
        console.error('Error sending parent verification:', error);
    }
}

// =====================================================
// TOKEN GENERATOR
// =====================================================

function generateToken() {
    return Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

// =====================================================
// IP LOGGING
// =====================================================

async function logIPAddress(userId, ip, isVPN) {
    try {
        await supabase
            .from('users')
            .update({
                last_ip: ip,
                vpn_detected: isVPN,
                last_active_at: new Date().toISOString()
            })
            .eq('id', userId);
    } catch (error) {
        console.error('Error logging IP:', error);
    }
}

// =====================================================
// VPN CHECK BEFORE AUTH (wird in vpn-detection.js definiert)
// =====================================================

async function checkVPNBeforeAuth(email) {
    // Diese Funktion wird in vpn-detection.js implementiert
    // Hier nur Fallback
    return {
        allowed: true,
        ip: 'unknown',
        isVPN: false
    };
}

console.log('✅ Auth.js loaded');
