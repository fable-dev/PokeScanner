const uploader = document.getElementById('uploader');
const canvas = document.getElementById('processing-canvas');
// Fix for the console warning: optimized for frequent reading
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
        // Show original image
        previewImage.src = img.src;
        previewImage.style.display = 'block';

        // 1. UPSCALING (2x Zoom)
        // Making the text bigger helps Tesseract separate the numbers
        const scaleFactor = 2;
        canvas.width = img.width * scaleFactor;
        canvas.height = img.height * scaleFactor;
        
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // 2. IMAGE FILTERING (The Blue Channel Trick)
        processImageForOCR(canvas);

        status.innerText = "⏳ Scanning optimized image...";
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

function processImageForOCR(cvs) {
    const imgData = ctx.getImageData(0, 0, cvs.width, cvs.height);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // --- THE MAGIC FORMULA ---
        // instead of standard grayscale, we prioritize the BLUE channel.
        // This kills the Gold/Yellow/Orange backgrounds (which have low blue)
        // while keeping White text (which has high blue).
        
        // We use 0.5 * Blue + 0.5 * Grayscale to balance it for Blue/Water types too.
        const grayScale = 0.299 * r + 0.587 * g + 0.114 * b;
        let finalVal = (b * 0.6) + (grayScale * 0.4);

        // INVERT: Tesseract loves Black Text on White Background.
        // Since PoGo is White Text on Dark/Color, we invert it.
        finalVal = 255 - finalVal;

        // CONTRAST BOOST:
        // Push dark grays to black, light grays to white.
        // This removes "fuzzy" pixels.
        if (finalVal < 100) finalVal = 0;   // Make text PURE BLACK
        else if (finalVal > 180) finalVal = 255; // Make bg PURE WHITE

        data[i] = finalVal;     // R
        data[i + 1] = finalVal; // G
        data[i + 2] = finalVal; // B
    }
    ctx.putImageData(imgData, 0, 0);
}

function parseData(data) {
    const fullText = data.text;
    const lines = data.lines;

    console.log("--- RAW TEXT ---");
    console.log(fullText);

    // 1. Find CP (Updated Regex)
    // We look for 'CP' or 'CR' or just a standalone large number at the start
    // We've loosened the regex to catch "CP<garbage>2500"
    const cpRegex = /(CP|CR|G|0P)\s*[\D]{0,3}\s*([0-9]{3,4})/i;
    const cpMatch = fullText.match(cpRegex);
    
    let cpLineIndex = -1;

    if (cpMatch) {
        // We use the LAST group (numbers)
        fieldCP.value = cpMatch[2]; 
        
        // Find line index
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].text.includes(cpMatch[0])) {
                cpLineIndex = i;
                break;
            }
        }
    }

    // 2. Find Name
    if (cpLineIndex !== -1) {
        // Look at next 3 lines
        for(let i = 1; i <= 3; i++) {
            if (lines[cpLineIndex + i]) {
                let candidate = lines[cpLineIndex + i].text.trim();
                
                // If it's a valid looking name
                if (candidate.length > 2 && 
                    !candidate.includes('/') && 
                    !candidate.includes('HP')) {
                    
                    // Clean symbols
                    candidate = candidate.replace(/[^a-zA-Z\s\-]/g, '');
                    fieldName.value = candidate;
                    break;
                }
            }
        }
    }
}
