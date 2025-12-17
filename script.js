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
    // This maps common OCR letter-mistakes to numbers
    return str
        .replace(/[lI|/!]/g, '1') // l, I, pipe, slash -> 1
        .replace(/[O]/g, '0')     // Capital O -> 0
        .replace(/[S]/g, '5')     // S -> 5
        .replace(/[Z]/g, '2')     // Z -> 2
        .replace(/[d]/g, '4')     // d -> 4 (Fixes 'cpd' error)
        .replace(/[B]/g, '8')     // B -> 8
        .replace(/[^0-9]/g, '');  // Finally, remove anything that isn't a number
}

function parseData(data) {
    const fullText = data.text;
    const lines = data.lines;

    console.log("--- RAW TEXT ---");
    console.log(fullText);

    let foundCP = null;
    let cpLineIndex = -1;

    // STRATEGY A: Look for "CP" Prefix
    // Regex explanation:
    // 1. (CP|CR|CA|G|0P|LP|P) -> Matches CP, CR, CA, GP, 0P, LP, or just P
    // 2. .{0,4} -> Matches up to 4 junk characters (spaces, symbols, 'd')
    // 3. ([0-9lIioOdS\/\-]{2,6}) -> Matches the number part (including typos like l, /, d)
    const strictRegex = /(?:CP|CR|CA|G|0P|LP|P).{0,4}([0-9lIioOdS\/\-]{2,6})/i;
    
    // Loop through lines to find the best match
    for (let i = 0; i < lines.length; i++) {
        const lineText = lines[i].text.trim();
        const match = lineText.match(strictRegex);

        if (match) {
            // We found a line that looks like CP!
            const rawNumber = match[1];
            const cleanNumber = cleanOCRNumbers(rawNumber);
            
            // Sanity check: CP is usually between 10 and 6000
            if (cleanNumber.length >= 2 && parseInt(cleanNumber) < 7000) {
                foundCP = cleanNumber;
                cpLineIndex = i;
                break; // Stop looking, we found it.
            }
        }
    }

    // STRATEGY B: The "Fallback" (If regex failed)
    // Sometimes the 'CP' is totally gone (like your "~ 4549" example).
    // We look for the LARGEST 3-or-4 digit number in the first 5 lines.
    if (!foundCP) {
        console.log("⚠️ No CP prefix found. Trying fallback strategy...");
        for (let i = 0; i < Math.min(lines.length, 6); i++) {
            const lineText = lines[i].text;
            // Extract all potential number-blobs
            const numbers = lineText.match(/[0-9lI|/SdB]{3,4}/g); 
            
            if (numbers) {
                numbers.forEach(num => {
                    const clean = cleanOCRNumbers(num);
                    const val = parseInt(clean);
                    // Heuristic: CP is likely > 100 and < 6000
                    // Also, we ignore numbers that look like time (e.g. 1100, 1200) if they are on line 0
                    if (val > 100 && val < 6000 && i > 0) {
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
    // Logic: Name is usually the line AFTER the CP.
    if (cpLineIndex !== -1 && lines[cpLineIndex + 1]) {
        // Try line +1
        let nameCandidate = lines[cpLineIndex + 1].text.trim();
        
        // If line +1 is empty or tiny, try line +2
        if (nameCandidate.length < 3 && lines[cpLineIndex + 2]) {
            nameCandidate = lines[cpLineIndex + 2].text.trim();
        }

        // Clean name
        nameCandidate = nameCandidate.replace(/[^a-zA-Z\s\-]/g, '');
        fieldName.value = nameCandidate;
    }
}
