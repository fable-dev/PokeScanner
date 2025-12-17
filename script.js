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
        // 1. Setup the canvas (But only for the top 35% of the image)
        // This removes the bottom buttons/map which confuse the scanner
        const cropHeight = img.height * 0.35; 
        
        canvas.width = img.width;
        canvas.height = cropHeight;
        
        // Draw only the top slice
        ctx.drawImage(img, 0, 0, img.width, cropHeight, 0, 0, img.width, cropHeight);
        
        // 2. Pre-process: Invert & Grayscale
        // This makes white text (common in PoGo) turn black, which OCR prefers.
        preprocessImage(canvas);

        // Show the user exactly what the computer sees (Debug step)
        previewImage.src = canvas.toDataURL();
        previewImage.style.display = 'block';

        status.innerText = "⏳ Scanning top section...";
        fieldName.value = '';
        fieldCP.value = '';

        // 3. Run Tesseract
        Tesseract.recognize(
            canvas,
            'eng',
            { logger: m => { if (m.status === 'recognizing text') status.innerText = `⏳ Scanning... ${Math.round(m.progress * 100)}%`; } }
        ).then(({ data }) => {
            status.innerText = "✅ Scan Complete";
            parseData(data);
        }).catch(err => {
            status.innerText = "❌ Error: " + err.message;
        });
    };
}

function preprocessImage(cvs) {
    const imgData = ctx.getImageData(0, 0, cvs.width, cvs.height);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
        // Get RGB values
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // 1. Grayscale standard formula
        let gray = 0.299 * r + 0.587 * g + 0.114 * b;

        // 2. Contrast Stretch (Make darks darker, lights lighter)
        // If it's kinda light (>100), make it white (255). Else black (0).
        // BUT: Since PoGo text is often white, we might want to INVERT it.
        // Let's try Inversion: White Text becomes Black (0), Dark BG becomes White (255)
        
        // Invert logic: 255 - gray
        gray = 255 - gray;

        // Apply "Binarization" (forcing Black or White) to clean edges
        // Adjust this '150' number if text is disappearing or too thick
        gray = (gray > 150) ? 255 : 0; 

        data[i] = gray;     // R
        data[i + 1] = gray; // G
        data[i + 2] = gray; // B
    }
    ctx.putImageData(imgData, 0, 0);
}

function parseData(data) {
    const fullText = data.text;
    const lines = data.lines;
    
    // Debugging: Print exactly what it saw to the console
    console.log("--- OCR SCAN RESULTS ---");
    console.log(fullText);
    console.log("------------------------");

    // 1. Robust CP Regex
    // Looks for C, G, O, 0 followed by P, R, B (Common misreads)
    // Matches: "CP 2500", "CR 2500", "GP 2500", "0P 2500"
    const cpRegex = /[CG0O][PRB]\s*([0-9]+)/i;
    const cpMatch = fullText.match(cpRegex);
    
    let cpLineIndex = -1;

    if (cpMatch) {
        fieldCP.value = cpMatch[1]; 
        
        // Find the line index
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].text.includes(cpMatch[0])) {
                cpLineIndex = i;
                break;
            }
        }
    }

    // 2. Name Guessing
    if (cpLineIndex !== -1 && cpLineIndex + 1 < lines.length) {
        let nameCandidate = lines[cpLineIndex + 1].text.trim();
        
        // Cleaning
        nameCandidate = nameCandidate.replace(/[^a-zA-Z\s]/g, ''); // Remove weird symbols
        if (nameCandidate.length > 2) {
             fieldName.value = nameCandidate;
        }
    } else {
        // Fallback: If we didn't find CP, maybe the name is just the biggest text line?
        // (Skipping for now to keep it simple)
    }
}
