const uploader = document.getElementById('uploader');
const canvas = document.getElementById('processing-canvas');
const ctx = canvas.getContext('2d');
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
        // 1. Show the original image clearly
        previewImage.src = img.src;
        previewImage.style.display = 'block';

        // 2. Prepare canvas with FULL image (No cropping)
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        // 3. Gentle Grayscale (Removes color noise, keeps text smooth)
        convertToGrayscale(canvas);

        status.innerText = "⏳ Scanning full image...";
        fieldName.value = '';
        fieldCP.value = '';

        // 4. Run Tesseract
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
            console.error(err);
        });
    };
}

function convertToGrayscale(cvs) {
    const imgData = ctx.getImageData(0, 0, cvs.width, cvs.height);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        // Standard Grayscale Formula
        // We do NOT threshold (no if/else). We just strip the color.
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        
        data[i] = gray;     // R
        data[i + 1] = gray; // G
        data[i + 2] = gray; // B
        // Alpha (transparency) remains unchanged
    }
    ctx.putImageData(imgData, 0, 0);
}

function parseData(data) {
    const fullText = data.text;
    const lines = data.lines;

    console.log("--- RAW TEXT ---");
    console.log(fullText); // Check the console to see what it found!

    // 1. Find CP (Robust Regex)
    // Matches "CP", "CR", "GP", "0P" followed by numbers
    const cpRegex = /[CGO0][PRB]\s*([0-9]+)/i;
    const cpMatch = fullText.match(cpRegex);
    
    let cpLineIndex = -1;

    if (cpMatch) {
        fieldCP.value = cpMatch[1];
        
        // Find which line index contains the CP
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].text.includes(cpMatch[0])) {
                cpLineIndex = i;
                break;
            }
        }
    }

    // 2. Find Name
    // Logic: If we found CP, the name is likely the next non-empty line.
    if (cpLineIndex !== -1) {
        // Look ahead up to 3 lines (sometimes HP or a level arc separates them)
        for(let i = 1; i <= 3; i++) {
            if (lines[cpLineIndex + i]) {
                let candidate = lines[cpLineIndex + i].text.trim();

                // Name Filter:
                // - Must be letters
                // - Must not be "HP" or a date/time
                // - Must be longer than 2 characters
                if (candidate.length > 2 && !candidate.includes('/') && !candidate.includes(':')) {
                    // Clean up trailing punctuation often read by OCR
                    candidate = candidate.replace(/[.,\-_]+$/, '');
                    fieldName.value = candidate;
                    break; // Stop once we find a good candidate
                }
            }
        }
    }
}
