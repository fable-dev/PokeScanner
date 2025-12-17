const uploader = document.getElementById('uploader');
const canvas = document.getElementById('processing-canvas');
const ctx = canvas.getContext('2d');
const status = document.getElementById('status');

// UI Fields
const fieldName = document.getElementById('p-name');
const fieldCP = document.getElementById('p-cp');
const fieldHP = document.getElementById('p-hp');
const fieldDust = document.getElementById('p-dust');
const fieldMoves = document.getElementById('p-moves');

uploader.addEventListener('change', handleUpload);

function handleUpload() {
    const file = uploader.files[0];
    if (!file) return;

    const img = new Image();
    img.src = URL.createObjectURL(file);

    img.onload = () => {
        // 1. Draw image to canvas to prepare for processing
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        canvas.style.display = 'block'; // Show the user what we are scanning

        // 2. Pre-process: Convert to Grayscale for better OCR
        preprocessImage(canvas);

        // 3. Start Tesseract
        status.innerText = "⏳ Reading text...";
        resetFields();

        Tesseract.recognize(
            canvas, // We pass the CANVAS, not the file!
            'eng',
            { 
                logger: m => { 
                    if (m.status === 'recognizing text') {
                        status.innerText = `⏳ Scanning: ${Math.round(m.progress * 100)}%`;
                    }
                } 
            }
        ).then(({ data: { text, lines } }) => {
            status.innerText = "✅ Scan Complete!";
            parseData(text, lines);
        }).catch(err => {
            status.innerText = "❌ Error: " + err.message;
            console.error(err);
        });
    };
}

// === IMAGE REFINEMENT ===
function preprocessImage(cvs) {
    const imgData = ctx.getImageData(0, 0, cvs.width, cvs.height);
    const data = imgData.data;

    // Loop through every pixel
    for (let i = 0; i < data.length; i += 4) {
        // Standard RGB to Grayscale formula
        const brightness = 0.34 * data[i] + 0.5 * data[i + 1] + 0.16 * data[i + 2];
        
        // Thresholding: Turn gray into Black or White (High Contrast)
        // This removes the background noise
        const threshold = brightness > 100 ? 255 : 0;
        
        data[i] = threshold;     // R
        data[i + 1] = threshold; // G
        data[i + 2] = threshold; // B
    }
    ctx.putImageData(imgData, 0, 0);
}

function resetFields() {
    fieldName.value = ''; 
    fieldCP.value = ''; 
    fieldHP.value = ''; 
    fieldDust.value = ''; 
    fieldMoves.value = '';
}

// === DATA PARSING ===
function parseData(fullText, lines) {
    console.log("Raw Text:", fullText); // Debugging

    // 1. CP
    const cpMatch = fullText.match(/CP\s*([0-9]+)/i);
    if (cpMatch) fieldCP.value = cpMatch[1];

    // 2. HP
    const hpMatch = fullText.match(/([0-9]+)\s*\/\s*([0-9]+)/);
    if (hpMatch) fieldHP.value = hpMatch[2];

    // 3. Stardust (Refined)
    // Looks for "Power Up" OR the stardust icon (often read as '*')
    // We look for a number that is 3-5 digits long nearby
    const dustMatch = fullText.match(/Power\s*Up[\s\S]{0,30}?([0-9]{1,2}[,\.][0-9]{3}|[0-9]{3,5})/i);
    if (dustMatch) {
        fieldDust.value = dustMatch[1].replace(/[,\.]/g, '');
    }

    // 4. Name Guessing
    lines.forEach((line, index) => {
        if (cpMatch && line.text.includes(cpMatch[0])) {
            // Check the next line
            if (lines[index + 1]) {
                let candidate = lines[index + 1].text.trim();
                // Filter out bad guesses (like HP bars or health text)
                if (candidate.length > 2 && !candidate.includes('/') && !candidate.includes('HP')) {
                    fieldName.value = candidate;
                }
            }
        }
    });

    // 5. Moves Guessing
    let potentialMoves = [];
    lines.forEach(line => {
        let t = line.text.trim();
        // Look for lines ending in numbers (Move Damage)
        // But exclude lines that are CP, HP, or look like dates/weights
        if (/\s[0-9]{1,3}$/.test(t)) {
            if (!t.includes('CP') && !t.includes('/') && !t.includes('kg') && !t.includes('Power')) {
                potentialMoves.push(t);
            }
        }
    });
    fieldMoves.value = potentialMoves.join(", ");
}
