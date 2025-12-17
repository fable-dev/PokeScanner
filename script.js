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
        // Show original image to user
        previewImage.src = img.src;
        previewImage.style.display = 'block';

        // Prepare canvas for processing (this remains hidden)
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        // --- THE FIX: Better Pre-processing ---
        // Convert to grayscale without destroying details.
        preprocessImageToGrayscale(canvas);

        status.innerText = "⏳ Reading text...";
        fieldName.value = '';
        fieldCP.value = '';

        // Start Tesseract recognition on the processed canvas
        Tesseract.recognize(
            canvas,
            'eng',
            { 
                logger: m => { 
                    if (m.status === 'recognizing text') {
                        status.innerText = `⏳ Scanning: ${Math.round(m.progress * 100)}%`;
                    }
                } 
            }
        ).then(({ data }) => {
            status.innerText = "✅ Scan Complete!";
            // We pass the full data object now to get lines
            parseData(data);
        }).catch(err => {
            status.innerText = "❌ Error: " + err.message;
            console.error(err);
        });
    };
}

// --- IMPROVED IMAGE PROCESSING ---
function preprocessImageToGrayscale(cvs) {
    const imgData = ctx.getImageData(0, 0, cvs.width, cvs.height);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        // Standard formula for converting RGB to Grayscale
        // This preserves the "brightness" correctly.
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        
        data[i] = gray;     // R
        data[i + 1] = gray; // G
        data[i + 2] = gray; // B
        // Alpha (data[i+3]) is left alone
    }
    // Put the grayscale data back onto the canvas
    ctx.putImageData(imgData, 0, 0);
}


// --- SIMPLIFIED DATA PARSING ---
function parseData(data) {
    const fullText = data.text;
    const lines = data.lines;

    console.log("Raw Text Found:", fullText); 

    // 1. Find CP (Updated to catch "CR" errors)
    // Pattern: "C" followed by P or R, optional space, then numbers
    const cpRegex = /C[PR]\s*([0-9]+)/i; 
    const cpMatch = fullText.match(cpRegex);
    
    let cpLineIndex = -1;

    if (cpMatch) {
        fieldCP.value = cpMatch[1]; // The number part (e.g., "2500")

        // Find which line the CP is on
        for (let i = 0; i < lines.length; i++) {
            // We search for the FULL match string (e.g., "CP 2500" or "CR 2500")
            if (lines[i].text.includes(cpMatch[0])) {
                cpLineIndex = i;
                break;
            }
        }
    }

    // 2. Find Name (Guessing Logic)
    // The name is usually the line directly below the CP line.
    if (cpLineIndex !== -1 && cpLineIndex + 1 < lines.length) {
        let nameCandidate = lines[cpLineIndex + 1].text.trim();
        
        // Validation: Must be > 2 chars and contain at least one letter
        if (nameCandidate.length > 2 && /[a-zA-Z]/.test(nameCandidate)) {
             // Clean up trailing symbols often left by OCR
             nameCandidate = nameCandidate.replace(/['`,\.\-_]+$/, '');
             fieldName.value = nameCandidate;
        }
    }
}
