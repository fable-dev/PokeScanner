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
        // Show original
        previewImage.src = img.src;
        previewImage.style.display = 'block';

        // 1. UPSCALE TO 3X (Bigger is better for numbers)
        const scale = 3; 
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // 2. High Contrast Grayscale (No weird color filters)
        applySmartContrast(canvas);

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

function applySmartContrast(cvs) {
    const imgData = ctx.getImageData(0, 0, cvs.width, cvs.height);
    const data = imgData.data;
    
    // Simple Grayscale + Contrast Boost
    // We want to make gray text darker and light backgrounds lighter
    const contrast = 1.2; // Increase contrast by 20%
    const intercept = 128 * (1 - contrast);

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        // Standard Luminance (Human perception of brightness)
        let gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        
        // Apply Contrast Curve
        gray = (gray * contrast) + intercept;
        
        // Clamp values to 0-255
        gray = Math.min(255, Math.max(0, gray));

        data[i] = gray;     // R
        data[i + 1] = gray; // G
        data[i + 2] = gray; // B
    }
    ctx.putImageData(imgData, 0, 0);
}

// === THE NEW BRAIN: OCR CLEANER ===
function cleanOCRNumbers(str) {
    return str
        .replace(/[lI|/!]/g, '1') // l, I, pipe, slash -> 1
        .replace(/[O]/g, '0')     // Capital O -> 0
        .replace(/[S]/g, '5')     // S -> 5
        .replace(/[Z]/g, '2')     // Z -> 2
        .replace(/[d]/g, '4')     // d -> 4
        .replace(/[B]/g, '8')     // B -> 8
        .replace(/[^0-9]/g, '');  // Remove anything else
}

function parseData(data) {
    const fullText = data.text;
    const lines = data.lines;

    console.log("--- RAW TEXT ---");
    console.log(fullText);

    let foundCP = null;
    let cpLineIndex = -1;

    // STRATEGY A: Strict "CP" Prefix Search
    // FIX: Changed .{0,4} to [^0-9]{0,4}
    // This prevents the scanner from "eating" the first digits of the CP
    const strictRegex = /(?:CP|CR|CA|GP|0P|LP|P)[^0-9]{0,4}([0-9lIioOdS\/\-]{2,6})/i;
    
    // Start at i=1 to skip the phone status bar
    for (let i = 1; i < lines.length; i++) {
        const lineText = lines[i].text.trim();
        
        if (lineText.length < 3) continue;

        const match = lineText.match(strictRegex);

        if (match) {
            const cleanNumber = cleanOCRNumbers(match[1]);
            const val = parseInt(cleanNumber);
            
            // Range check (10 to 6500)
            if (val > 10 && val < 6500) {
                foundCP = cleanNumber;
                cpLineIndex = i;
                break; 
            }
        }
    }

    // STRATEGY B: The Fallback (Big Number Search)
    if (!foundCP) {
        console.log("⚠️ No CP prefix found. Trying fallback...");
        let maxVal = 0;

        for (let i = 1; i < Math.min(lines.length, 6); i++) {
            const lineText = lines[i].text;
            
            // Match groups of 3-4 digits
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

    // SET THE CP
    if (foundCP) {
        fieldCP.value = foundCP;
    } else {
        fieldCP.value = "Error";
    }

    // FIND THE NAME
    // Logic: Name is strictly 1 or 2 lines BELOW the CP line.
    if (cpLineIndex !== -1) {
        for(let offset = 1; offset <= 2; offset++) {
            const targetLine = lines[cpLineIndex + offset];
            if (targetLine) {
                let candidate = targetLine.text.trim();
                
                // Name must have letters, no numbers, no slashes
                if (candidate.length > 2 && 
                    /[a-zA-Z]/.test(candidate) && 
                    !/[0-9]/.test(candidate) &&
                    !candidate.includes('/')
                ) {
                    candidate = candidate.replace(/[^a-zA-Z\s\-]/g, '');
                    fieldName.value = candidate;
                    break;
                }
            }
        }
    }
}
