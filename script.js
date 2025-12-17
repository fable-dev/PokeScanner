const uploader = document.getElementById('uploader');
const canvas = document.getElementById('processing-canvas');
// Optimized for frequent reading
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const status = document.getElementById('status');
const previewImage = document.getElementById('preview-image');

// UI Fields
const fieldName = document.getElementById('p-name');
const fieldCP = document.getElementById('p-cp');

uploader.addEventListener('change', handleUpload);

function handleUpload() {
    const file = uploader.files[0];
    if (!file) return;

    const img = new Image();
    img.src = URL.createObjectURL(file);

    img.onload = () => {
        previewImage.src = img.src;
        previewImage.style.display = 'block';

        // 1. UPSCALE (3x)
        const scale = 3; 
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // 2. ISOLATE WHITE TEXT
        isolateWhiteText(canvas);

        status.innerText = "⏳ Scanning...";
        fieldName.value = '';
        fieldCP.value = '';

        Tesseract.recognize(
            canvas,
            'eng',
            { 
                logger: m => { 
                    if (m.status === 'recognizing text') {
                        status.innerText = `⏳ Scanning... ${Math.round(m.progress * 100)}%`;
                    }
                } 
            }
        ).then(({ data }) => {
            status.innerText = "✅ Scan Complete";
            parseData(data);
        }).catch(err => {
            status.innerText = "❌ Error: " + err.message;
        });
    };
}

// === IMAGE FILTER ===
function isolateWhiteText(cvs) {
    const imgData = ctx.getImageData(0, 0, cvs.width, cvs.height);
    const data = imgData.data;
    const threshold = 210; 

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // If pixel is super bright (Text) -> Make Black
        // Else -> Make White
        if (r > threshold && g > threshold && b > threshold) {
            data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; 
        } else {
            data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; 
        }
    }
    ctx.putImageData(imgData, 0, 0);
}

// === FUZZY CLEANER ===
function cleanOCRNumbers(str) {
    // 1. Remove spaces INSIDE the number (e.g. "2 74" -> "274")
    let cleaned = str.replace(/\s+/g, '');

    // 2. Specific Fix: If it ends in '/', replace with '7' (Fixes 303/)
    if (cleaned.endsWith('/')) {
        cleaned = cleaned.slice(0, -1) + '7';
    }

    // 3. Sandwich Fix: 3/7 -> 37
    cleaned = cleaned.replace(/(\d)[\/\|\\](\d)/g, '$1$2');

    // 4. Character Map
    return cleaned
        .replace(/[lI|!]/g, '1') 
        .replace(/\//g, '1')      // Forward slash usually 1 (unless at end, handled above)
        .replace(/[O]/g, '0')     
        .replace(/[S]/g, '5')     
        .replace(/[Z]/g, '2')     
        .replace(/[d]/g, '4')     // Fixes 'crd2' -> 'cr42'
        .replace(/[B]/g, '8')
        .replace(/[?]/g, '7')     
        .replace(/[^0-9]/g, '');  // Kill everything else
}

function parseData(data) {
    const fullText = data.text;
    const lines = data.lines;

    console.log("--- RAW TEXT ---");
    console.log(fullText);

    let foundCP = null;
    let cpLineIndex = -1;

    // === STEP 1: FIND CP ===
    // Greedy Regex to capture messy CP lines
    const strictRegex = /(?:CP|CR|CA|GP|0P|LP|P|\[|\()[^0-9\n]{0,5}([0-9lIioOdS\/\-\s]{2,10})/i;
    
    // FIX 1: Start loop at i = 0 (Don't skip the first line!)
    for (let i = 0; i < lines.length; i++) {
        const lineText = lines[i].text.trim();
        if (lineText.length < 3) continue;

        // Extra Safety: Ignore lines that look like Time (e.g. 11:00)
        if (/^[0-9]{1,2}:[0-9]{2}/.test(lineText)) continue;

        const match = lineText.match(strictRegex);
        if (match) {
            const cleanNumber = cleanOCRNumbers(match[1]);
            const val = parseInt(cleanNumber);
            
            if (val > 10 && val < 6500) {
                foundCP = cleanNumber;
                cpLineIndex = i;
                break; 
            }
        }
    }

    // Strategy B: Fallback (Big Number Search)
    if (!foundCP) {
        console.log("⚠️ No CP prefix found. Trying fallback...");
        let maxVal = 0;
        
        // FIX 2: Start loop at i = 0 here too
        for (let i = 0; i < Math.min(lines.length, 6); i++) {
            const lineText = lines[i].text;
            
            // Ignore Time lines here too
            if (/^[0-9]{1,2}:[0-9]{2}/.test(lineText)) continue;

            const numbers = lineText.match(/[0-9lI|/SdB]{2,}(\s+[0-9lI|/SdB]{2,})*/g); 
            
            if (numbers) {
                numbers.forEach(num => {
                    const clean = cleanOCRNumbers(num);
                    const val = parseInt(clean);
                    if (val > maxVal && val < 6500) {
                        maxVal = val;
                        foundCP = clean;
                        cpLineIndex = i;
                    }
                });
            }
        }
    }

    if (foundCP) fieldCP.value = foundCP;
    else fieldCP.value = "Error"; 

    // === STEP 2: FIND HP (Bottom Anchor) ===
    let hpLineIndex = -1;
    const startSearch = cpLineIndex === -1 ? 0 : cpLineIndex + 1;
    const hpRegex = /[0-9lIoO]{2,4}\s*[\/\|]\s*[0-9lIoO]{2,4}/;

    for (let i = startSearch; i < lines.length; i++) {
        if (i > startSearch + 12) break; 
        if (hpRegex.test(lines[i].text)) {
            hpLineIndex = i;
            break;
        }
    }

    // === STEP 3: FIND NAME ===
    // FIX 3: Expanded Banned Words List to fix the Garchomp error
    const bannedWords = ["WEIGHT", "HEIGHT", "HEAVIEST", "LIGHTEST", "SHORTEST", "TALLEST", "CANDY", "STARDUST", "HP", "CP", "LUCKY", "SHADOW", "PURIFIED", "POKEMON", "MEGA", "YMS", "RAIDS"];

    if (hpLineIndex !== -1) {
        // Scan UP from HP
        for (let i = hpLineIndex - 1; i >= 0; i--) { // Allow going to 0
            if (!lines[i]) continue;
            let line = lines[i].text.trim();
            
            // Filter Banned Words (Fixes "HEAVIEST DRAGON...")
            const isBanned = bannedWords.some(word => line.toUpperCase().includes(word));
            if (isBanned) continue;

            // Filter pure numbers (e.g. "2024")
            if (/^[0-9\s\-\.]+$/.test(line)) continue;
            
            // Filter short junk (e.g. "kg", "m")
            if (line.length < 3) continue;

            let cleanName = line.replace(/[^a-zA-Z\s\-\.']/g, '').trim();
            if (cleanName.length > 2) {
                fieldName.value = cleanName;
                return;
            }
        }
    } 
    
    // Fallback: Scan DOWN from CP
    if (fieldName.value === "" && cpLineIndex !== -1) {
         for (let i = cpLineIndex + 1; i < cpLineIndex + 5; i++) {
            if (!lines[i]) break;
            let line = lines[i].text.trim();
            
            const isBanned = bannedWords.some(word => line.toUpperCase().includes(word));
            if (isBanned) continue;
            if (/^[0-9\s\-\.]+$/.test(line)) continue;

            let cleanName = line.replace(/[^a-zA-Z\s\-\.']/g, '').trim();
            if (cleanName.length > 2) {
                fieldName.value = cleanName;
                break;
            }
         }
    }
}
