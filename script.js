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

        // 2. APPLY THE "WHITE TEXT ISOLATOR"
        isolateWhiteText(canvas);

        status.innerText = "⏳ Scanning isolated text...";
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

// === THE FIX: COLOR FILTER ===
function isolateWhiteText(cvs) {
    const imgData = ctx.getImageData(0, 0, cvs.width, cvs.height);
    const data = imgData.data;

    // We look for pixels that are close to PURE WHITE.
    // Pure white is R=255, G=255, B=255.
    // Gold/Lucky background is R=255, G=215, B=0 (High R/G, but Zero Blue).
    // Dragon background is Purple (High B, Low G).
    
    // Threshold: How bright must the pixel be?
    const threshold = 160; 

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // LOGIC: If R, G, AND B are ALL high, it's White Text.
        if (r > threshold && g > threshold && b > threshold) {
            // It's Text! Make it Black for the scanner.
            data[i] = 0;     // R
            data[i + 1] = 0; // G
            data[i + 2] = 0; // B
        } else {
            // It's Background (Color/Dark). Delete it (Make it White).
            data[i] = 255;     // R
            data[i + 1] = 255; // G
            data[i + 2] = 255; // B
        }
    }
    ctx.putImageData(imgData, 0, 0);
}

// === OCR HELPERS ===
function cleanOCRNumbers(str) {
    return str
        .replace(/[lI|/!]/g, '1') 
        .replace(/[O]/g, '0')     
        .replace(/[S]/g, '5')     
        .replace(/[Z]/g, '2')     
        .replace(/[d]/g, '4')     
        .replace(/[B]/g, '8')     
        .replace(/[^0-9]/g, '');  
}

function parseData(data) {
    const fullText = data.text;
    const lines = data.lines;

    console.log("--- RAW TEXT ---");
    console.log(fullText);

    let foundCP = null;
    let cpLineIndex = -1;

    // STRATEGY A: Strict Prefix Search
    const strictRegex = /(?:CP|CR|CA|GP|0P|LP|P)[^0-9]{0,4}([0-9lIioOdS\/\-]{2,6})/i;
    
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

    // STRATEGY B: Fallback (Big Number Search)
    if (!foundCP) {
        console.log("⚠️ No CP prefix found. Trying fallback...");
        let maxVal = 0;
        for (let i = 1; i < Math.min(lines.length, 6); i++) {
            const lineText = lines[i].text;
            const numbers = lineText.match(/[0-9lI|/SdB]{3,4}/g); 
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

    // Name Logic
    if (cpLineIndex !== -1) {
        for(let offset = 1; offset <= 2; offset++) {
            const targetLine = lines[cpLineIndex + offset];
            if (targetLine) {
                let candidate = targetLine.text.trim();
                if (candidate.length > 2 && /[a-zA-Z]/.test(candidate) && !/[0-9]/.test(candidate) && !candidate.includes('/')) {
                    candidate = candidate.replace(/[^a-zA-Z\s\-]/g, '');
                    fieldName.value = candidate;
                    break;
                }
            }
        }
    }
}
