// =====================================================
// MODERATION.JS - Content Moderation System
// =====================================================

// Moderation wird LOKAL ausgeführt - keine Kosten!

// =====================================================
// WORTLISTEN
// =====================================================

const MODERATION_PATTERNS = {
    // KRITISCH - Sofort blockieren
    critical: {
        patterns: [
            /(?:nackt|nude|nudes|nacktbild|nacktfoto)/gi,
            /(?:sex|ficken|bumsen|vögeln)/gi,
            /(?:schwanz|pussy|muschi|titten)/gi,
            /(?:porno|porn|xxx)/gi,
            /(?:sextreffen|sexdate)/gi,
            /(?:treffen\s+uns\s+alleine|treffen\s+dich|wo\s+wohnst)/gi,
            /(?:adresse|wo\s+wohnst|welche\s+schule)/gi,
            /(?:telefonnummer|handynummer|tel\.|tel:)/gi,
            /(?:instagram|snapchat|whatsapp)\s*[:=@]/gi,
            /(?:geld|€|euro|bitcoin|paypal)/gi,
            /(?:drogen|koks|kokain|heroin|crystal)/gi,
            /(?:suizid|selbstmord|umbringen|töten)/gi,
            /(?:missbrauch|vergewaltigung|gewalt)/gi
        ],
        score: 100,
        classification: 'kritisch'
    },
    
    // REGELVERSTOSSE - Blockieren + Warnung
    violation: {
        patterns: [
            /(?:hure|schlampe|nutte|bitch)/gi,
            /(?:arschloch|wichser|bastard)/gi,
            /(?:du\s+bist\s+(?:hässlich|fett|dumm))/gi,
            /(?:kill\s+yourself|stirb|verrecke)/gi,
            /(?:ritz|ritze|ritzen|selbstverletzung)/gi,
            /(?:anaorexie|bulimie|pro-ana)/gi,
            /(?:schwuchtel|faggot|transe)/gi,
            /(?:kanacke|neger|n-word)/gi
        ],
        score: 80,
        classification: 'regelverstoß'
    },
    
    // GRENZWERTIG - Warnung anzeigen
    borderline: {
        patterns: [
            /(?:sexy|heiß|geil|scharf)/gi,
            /(?:tinder|lovoo|badoo)/gi,
            /(?:treffen|date|meeting)/gi,
            /(?:alleine|zu\s+zweit|ohne\s+andere)/gi,
            /(?:heimlich|geheim|nicht\s+sagen)/gi,
            /(?:instagram|snapchat|tiktok)\s/gi,
            /(?:nummer|kontakt|schreib\s+mir)/gi,
            /(?:bild|foto|pic)\s+von\s+dir/gi
        ],
        score: 50,
        classification: 'grenzwertig'
    },
    
    // SPAM
    spam: {
        patterns: [
            /(?:http|https|www\.|\.com|\.de|\.net)/gi,
            /(?:klick|click|link|url)/gi,
            /(?:gewinn|preis|gratis|kostenlos|geschenk)/gi,
            /(?:verdien|geld\s+machen|reich\s+werden)/gi
        ],
        score: 40,
        classification: 'grenzwertig'
    }
};

// =====================================================
// HEURISTICS - Pattern Recognition
// =====================================================

const HEURISTIC_CHECKS = {
    // Wiederholte Zeichen (z.B. "heeeeey")
    repeatedChars: (text) => {
        const matches = text.match(/(.)\1{4,}/g);
        return matches ? matches.length * 5 : 0;
    },
    
    // Caps Lock Missbrauch
    excessiveCaps: (text) => {
        const capsCount = (text.match(/[A-Z]/g) || []).length;
        const totalChars = text.replace(/\s/g, '').length;
        return totalChars > 10 && (capsCount / totalChars) > 0.6 ? 20 : 0;
    },
    
    // Zu viele Emojis
    excessiveEmojis: (text) => {
        const emojiCount = (text.match(/[\u{1F300}-\u{1F9FF}]/gu) || []).length;
        return emojiCount > 10 ? 15 : 0;
    },
    
    // Telefonnummer-Muster
    phoneNumber: (text) => {
        const phonePatterns = [
            /\+?\d{2,4}[\s-]?\d{3,4}[\s-]?\d{4,}/g,
            /\d{4,}[\s-]?\d{4,}/g,
            /\(?\d{3,4}\)?[\s-]?\d{3,4}[\s-]?\d{4,}/g
        ];
        return phonePatterns.some(p => p.test(text)) ? 80 : 0;
    },
    
    // E-Mail Adressen
    emailAddress: (text) => {
        const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        return emailPattern.test(text) ? 60 : 0;
    },
    
    // Verdächtige Anfragen nach persönlichen Infos
    personalInfoRequest: (text) => {
        const patterns = [
            /wie\s+alt\s+bist/gi,
            /wo\s+wohnst/gi,
            /welche\s+schule/gi,
            /in\s+welche\s+klasse/gi,
            /wo\s+treffen/gi
        ];
        return patterns.filter(p => p.test(text)).length * 20;
    },
    
    // Grooming-Muster
    groomingPatterns: (text) => {
        const patterns = [
            /(?:bist\s+du\s+alleine|niemand\s+muss\s+wissen)/gi,
            /(?:unser\s+geheimnis|nicht\s+sagen)/gi,
            /(?:vertraue\s+mir|ich\s+zeig\s+dir)/gi,
            /(?:willst\s+du\s+geld|kann\s+dir\s+helfen)/gi,
            /(?:bist\s+du\s+neugierig|zeig\s+mir)/gi
        ];
        return patterns.filter(p => p.test(text)).length * 90;
    }
};

// =====================================================
// MAIN MODERATION FUNCTION
// =====================================================

async function moderateContent(text) {
    let totalScore = 0;
    let matchedPatterns = [];
    let classification = 'harmlos';
    let action = 'allow';
    let reason = '';
    
    // 1. Pattern Matching
    for (const [category, config] of Object.entries(MODERATION_PATTERNS)) {
        for (const pattern of config.patterns) {
            if (pattern.test(text)) {
                totalScore = Math.max(totalScore, config.score);
                classification = config.classification;
                matchedPatterns.push({
                    category: category,
                    pattern: pattern.source
                });
            }
        }
    }
    
    // 2. Heuristic Checks
    for (const [checkName, checkFunction] of Object.entries(HEURISTIC_CHECKS)) {
        const score = checkFunction(text);
        if (score > 0) {
            totalScore += score;
            matchedPatterns.push({
                category: 'heuristic',
                check: checkName,
                score: score
            });
        }
    }
    
    // 3. Determine Action based on Score
    if (totalScore >= 80) {
        action = 'block';
        classification = 'kritisch';
        reason = 'Verstoß gegen Community-Richtlinien';
    } else if (totalScore >= 50) {
        action = 'warn';
        classification = 'regelverstoß';
        reason = 'Potenziell unangemessener Inhalt';
    } else if (totalScore >= 30) {
        action = 'report';
        classification = 'grenzwertig';
        reason = 'Grenzwertiger Inhalt';
    }
    
    // 4. Log für Analyse (nur bei hohem Score)
    if (totalScore >= 30) {
        await logModerationResult(text, totalScore, classification, matchedPatterns);
    }
    
    return {
        score: totalScore,
        classification: classification,
        action: action,
        reason: reason,
        patterns: matchedPatterns
    };
}

// =====================================================
// LOG MODERATION RESULT
// =====================================================

async function logModerationResult(text, score, classification, patterns) {
    try {
        // Log in moderation_logs table
        await supabase
            .from('moderation_logs')
            .insert({
                moderator_id: null, // Automatisch
                action: 'auto_moderation',
                target_type: 'message',
                details: {
                    text_preview: text.substring(0, 100),
                    score: score,
                    classification: classification,
                    patterns: patterns
                }
            });
    } catch (error) {
        console.error('Error logging moderation:', error);
    }
}

// =====================================================
// LOG MODERATION ACTION (für User-Strikes)
// =====================================================

async function logModerationAction(userId, actionType, classification, content) {
    try {
        // Wenn kritisch: Strike hinzufügen
        if (classification === 'kritisch') {
            const { data: user } = await supabase
                .from('users')
                .select('strikes')
                .eq('id', userId)
                .single();
            
            const newStrikes = (user?.strikes || 0) + 1;
            
            // Update User
            await supabase
                .from('users')
                .update({
                    strikes: newStrikes,
                    account_status: newStrikes >= 3 ? 'banned' : 'warned'
                })
                .eq('id', userId);
            
            // Notify User
            showToast(`⚠️ VERWARNUNG: Du hast ${newStrikes}/3 Strikes. Bei 3 Strikes wirst du gebannt!`, 'error', 10000);
            
            // Log Action
            await supabase
                .from('moderation_actions')
                .insert({
                    target_user_id: userId,
                    moderator_id: null,
                    action: 'warn',
                    reason: 'Automatische Moderation: ' + classification
                });
        }
    } catch (error) {
        console.error('Error logging moderation action:', error);
    }
}

// =====================================================
// PROFILE IMAGE MODERATION
// =====================================================

async function moderateImage(imageFile) {
    try {
        // 1. Calculate Image Hash
        const hash = await calculateImageHash(imageFile);
        
        // 2. Check if hash exists (Stock image / duplicate)
        const { data: existingHash, error } = await supabase
            .from('image_hashes')
            .select('*')
            .eq('hash', hash)
            .single();
        
        if (existingHash) {
            if (existingHash.is_stock_image || existingHash.usage_count > 5) {
                return {
                    allowed: false,
                    reason: 'Dieses Bild wurde bereits zu oft verwendet oder ist ein Stock-Bild'
                };
            }
            
            // Update usage count
            await supabase
                .from('image_hashes')
                .update({ usage_count: existingHash.usage_count + 1 })
                .eq('hash', hash);
        } else {
            // Create new hash entry
            await supabase
                .from('image_hashes')
                .insert({
                    hash: hash,
                    first_used_by: appState.currentUser.id,
                    usage_count: 1
                });
        }
        
        // 3. Basic NSFW Check (client-side heuristics)
        const nsfwScore = await checkNSFWHeuristics(imageFile);
        
        if (nsfwScore > 70) {
            return {
                allowed: false,
                reason: 'Das Bild scheint unangemessen zu sein'
            };
        }
        
        return {
            allowed: true,
            hash: hash
        };
        
    } catch (error) {
        console.error('Error moderating image:', error);
        return {
            allowed: true,
            hash: null
        };
    }
}

// =====================================================
// CALCULATE IMAGE HASH (perceptual hash approximation)
// =====================================================

async function calculateImageHash(imageFile) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                // Create canvas
                const canvas = document.createElement('canvas');
                canvas.width = 8;
                canvas.height = 8;
                const ctx = canvas.getContext('2d');
                
                // Draw resized image
                ctx.drawImage(img, 0, 0, 8, 8);
                
                // Get image data
                const imageData = ctx.getImageData(0, 0, 8, 8);
                const data = imageData.data;
                
                // Calculate average brightness
                let sum = 0;
                for (let i = 0; i < data.length; i += 4) {
                    sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
                }
                const avg = sum / 64;
                
                // Generate hash
                let hash = '';
                for (let i = 0; i < data.length; i += 4) {
                    const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
                    hash += brightness > avg ? '1' : '0';
                }
                
                resolve(hash);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(imageFile);
    });
}

// =====================================================
// BASIC NSFW CHECK (Heuristics)
// =====================================================

async function checkNSFWHeuristics(imageFile) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;
                
                // Count skin-tone pixels (very basic)
                let skinPixels = 0;
                const totalPixels = data.length / 4;
                
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    
                    // Basic skin tone detection
                    if (r > 95 && g > 40 && b > 20 &&
                        r > g && r > b &&
                        Math.abs(r - g) > 15) {
                        skinPixels++;
                    }
                }
                
                const skinPercentage = (skinPixels / totalPixels) * 100;
                
                // If more than 40% skin tone, flag as potentially NSFW
                const score = skinPercentage > 40 ? 80 : 20;
                
                resolve(score);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(imageFile);
    });
}

// =====================================================
// TEST MODERATION (für Debugging)
// =====================================================

async function testModeration() {
    const testCases = [
        "Hey, wie geht's?",
        "Du bist echt hübsch",
        "Schick mir mal deine Nummer",
        "Wo wohnst du? Können wir uns treffen?",
        "Schick mir nacktbilder",
        "Ich kann dir Geld geben"
    ];
    
    console.log('🧪 Testing Moderation System:');
    
    for (const text of testCases) {
        const result = await moderateContent(text);
        console.log(`\nText: "${text}"`);
        console.log(`Score: ${result.score}`);
        console.log(`Classification: ${result.classification}`);
        console.log(`Action: ${result.action}`);
        console.log(`Reason: ${result.reason}`);
    }
}

// Uncomment to test:
// testModeration();

console.log('✅ Moderation.js loaded');
