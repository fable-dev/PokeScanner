const uploader = document.getElementById('uploader');
const canvas = document.getElementById('processing-canvas');
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

        // 2. ISOLATE TEXT (New Threshold Logic)
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

// === THE FIX: STRICTER COLOR FILTER ===
function isolateWhiteText(cvs) {
    const imgData = ctx.getImageData(0, 0, cvs.width, cvs.height);
    const data = imgData.data;

    // We raised the threshold from 160 to 210.
    // This separates "Bright Text" (255) from "Light Backgrounds" (~200).
    const threshold = 210; 

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Check if pixel is SUPER bright (Text)
        if (r > threshold && g > threshold && b > threshold) {
            // It is Text -> Make it PURE BLACK
            data[i] = 0;     
            data[i + 1] = 0; 
            data[i + 2] = 0; 
        } else {
            // It is Background (Beige, Gold, Blue) -> Make it PURE WHITE
            data[i] = 255;   
            data[i + 1] = 255; 
            data[i + 2] = 255; 
        }
    }
    ctx.putImageData(imgData, 0, 0);
}

// === OCR HELPERS ===
function cleanOCRNumbers(str) {
    // Sandwich Fix (3/7 -> 37)
    let cleaned = str.replace(/(\d)[\/\|\\](\d)/g, '$1$2');

    return cleaned
        .replace(/[lI|/!]/g, '1') 
        .replace(/[O]/g, '0')     
        .replace(/[S]/g, '5')     
        .replace(/[Z]/g, '2')     
        .replace(/[d]/g, '4')     
        .replace(/[B]/g, '8')
        .replace(/[?]/g, '7')     // New: Question mark sometimes replaces 7
        .replace(/[^0-9]/g, '');  
}

function parseData(data) {
    const fullText = data.text;
    const lines = data.lines;

    console.log("--- RAW TEXT ---");
    console.log(fullText);

    let foundCP = null;
    let cpLineIndex = -1;

    // ============================================
    // STEP 1: FIND CP (Top Anchor)
    // ============================================
    const strictRegex = /(?:CP|CR|CA|GP|0P|LP|P|\[|\()[^0-9]{0,4}([0-9lIioOdS\/\-]{2,7})/i;
    
    // Strategy A: Strict Prefix
    for (let i = 1; i < lines.length; i++) {
        const lineText = lines[i].text.trim();
        if (lineText.length < 3) continue;

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
        for (let i = 1; i < Math.min(lines.length, 6); i++) {
            const lineText = lines[i].text;
            const numbers = lineText.match(/[0-9lI|/SdB]{3,6}/g); 
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


    // ============================================
    // STEP 2: FIND HP (Bottom Anchor)
    // ============================================
    let hpLineIndex = -1;
    
    // We start searching AFTER the CP line
    const startSearch = cpLineIndex === -1 ? 0 : cpLineIndex + 1;

    // Regex for HP: matches "120/120" or "120 / 120" or "120/120 HP"
    const hpRegex = /[0-9lIoO]{2,4}\s*[\/\|]\s*[0-9lIoO]{2,4}/;

    for (let i = startSearch; i < lines.length; i++) {
        // Stop if we go too far (safety break)
        if (i > startSearch + 10) break; 

        if (hpRegex.test(lines[i].text)) {
            hpLineIndex = i;
            break;
        }
    }


    // ============================================
    // STEP 3: FIND NAME (The Meat in the Sandwich)
    // ============================================
    
    // We scan UPWARDS from the HP line (or downwards from CP if HP fails)
    let nameCandidate = "";

    if (hpLineIndex !== -1) {
        // STRATEGY: Scan UP from HP
        // The name is usually immediately above the HP line.
        // Sometimes "LUCKY POKEMON" or "SHADOW POKEMON" is in between.
        
        for (let i = hpLineIndex - 1; i > cpLineIndex; i--) {
            let line = lines[i].text.trim();
            
            // 1. FILTER: Ignore known non-name labels
            if (/(LUCKY|SHADOW|PURIFIED|POKEMON)/i.test(line)) continue;
            
            // 2. FILTER: Ignore short garbage (e.g. "©", ">>")
            // Must have at least 3 letters to be a name
            const lettersOnly = line.replace(/[^a-zA-Z]/g, '');
            if (lettersOnly.length < 3) continue;

            // 3. CLEANING: Remove stray numbers/symbols from the name
            // (e.g. "Charizard 2024" -> "Charizard")
            let cleanName = line.replace(/[^a-zA-Z\s\-\.']/g, '').trim();
            
            // If we have a valid name now, take it and stop!
            if (cleanName.length > 2) {
                fieldName.value = cleanName;
                return; // Done!
            }
        }
    } 
    
    // FALLBACK: If HP was not found, scan DOWN from CP
    if (fieldName.value === "" && cpLineIndex !== -1) {
         for (let i = cpLineIndex + 1; i < cpLineIndex + 4; i++) {
            if (!lines[i]) break;
            
            let line = lines[i].text.trim();
            
            // Same filters as above
            if (/(LUCKY|SHADOW|PURIFIED|POKEMON)/i.test(line)) continue;
            
            const lettersOnly = line.replace(/[^a-zA-Z]/g, '');
            if (lettersOnly.length < 3) continue;

            let cleanName = line.replace(/[^a-zA-Z\s\-\.']/g, '').trim();
            
            if (cleanName.length > 2) {
                fieldName.value = cleanName;
                break;
            }
         }
    }
}
