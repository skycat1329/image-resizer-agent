// DOM Elements
const resizeModeSelect = document.getElementById('resize-mode');
const padColorGroup = document.getElementById('pad-color-group');
const padColorInput = document.getElementById('pad-color');
const padColorText = document.getElementById('pad-color-text');
const outputFormatSelect = document.getElementById('output-format');
const qualityGroup = document.getElementById('quality-group');
const imageQualityInput = document.getElementById('image-quality');
const qualityValSpan = document.getElementById('quality-val');

// Mode Toggles
const modeFolderBtn = document.getElementById('mode-folder-btn');
const modeUrlBtn = document.getElementById('mode-url-btn');
const sectionFolder = document.getElementById('section-folder');
const sectionUrl = document.getElementById('section-url');

// Operation & Scrape
const targetUrlInput = document.getElementById('target-url');
const scrapeBtn = document.getElementById('scrape-btn');
const selectFolderBtn = document.getElementById('select-folder-btn');
const setDestFolderBtn = document.getElementById('set-dest-folder-btn');
const statusDashboard = document.getElementById('status-dashboard');
const startBtn = document.getElementById('start-btn');
const cancelBtn = document.getElementById('cancel-btn');

// Stats
const statTotal = document.getElementById('stat-total');
const statProcessed = document.getElementById('stat-processed');
const statSuccess = document.getElementById('stat-success');
const statErrors = document.getElementById('stat-errors');

// Progress
const progressBar = document.getElementById('progress-bar');
const progressPercentage = document.getElementById('progress-percentage');
const progressDetail = document.getElementById('progress-detail');

// Lists & Gallery
const gallerySection = document.getElementById('gallery-section');
const imageGrid = document.getElementById('image-grid');
const selectAllBtn = document.getElementById('select-all-btn');
const deselectAllBtn = document.getElementById('deselect-all-btn');
const galleryCountBadge = document.getElementById('gallery-count');

const queueSection = document.getElementById('queue-section');
const queueCountBadge = document.getElementById('queue-count');
const queueBody = document.getElementById('queue-body');

// Global State
let activeMode = 'folder'; // 'folder' or 'url'
let inputDirHandle = null;
let outputDirHandle = null;

let localFoundFiles = []; // files for Local Folder mode
let urlFoundImages = [];   // image URLs for URL Scraper mode
let selectedUrlImages = new Set(); // set of selected URL image strings

let isProcessing = false;
let shouldStop = false;
let processedCount = 0;
let successCount = 0;
let errorCount = 0;

// Set Mode
modeFolderBtn.addEventListener('click', () => setMode('folder'));
modeUrlBtn.addEventListener('click', () => setMode('url'));

function setMode(mode) {
  if (isProcessing) return;
  activeMode = mode;
  resetAllState();

  if (mode === 'folder') {
    modeFolderBtn.classList.add('active');
    modeUrlBtn.classList.remove('active');
    sectionFolder.style.display = 'block';
    sectionUrl.style.display = 'none';
    setDestFolderBtn.style.display = 'none';
  } else {
    modeFolderBtn.classList.remove('active');
    modeUrlBtn.classList.add('active');
    sectionFolder.style.display = 'none';
    sectionUrl.style.display = 'block';
    setDestFolderBtn.style.display = 'inline-flex';
  }
}

function resetAllState() {
  inputDirHandle = null;
  outputDirHandle = null;
  localFoundFiles = [];
  urlFoundImages = [];
  selectedUrlImages.clear();
  
  statusDashboard.style.display = 'none';
  gallerySection.style.display = 'none';
  queueSection.style.display = 'none';
  startBtn.setAttribute('disabled', 'true');
  
  imageGrid.innerHTML = '';
  queueBody.innerHTML = '';
}

// Config Event Listeners
resizeModeSelect.addEventListener('change', (e) => {
  padColorGroup.style.display = e.target.value === 'contain' ? 'flex' : 'none';
});

padColorInput.addEventListener('input', (e) => {
  padColorText.value = e.target.value;
});

padColorText.addEventListener('input', (e) => {
  if (/^#[0-9A-F]{6}$/i.test(e.target.value)) {
    padColorInput.value = e.target.value;
  }
});

outputFormatSelect.addEventListener('change', (e) => {
  qualityGroup.style.display = (e.target.value === 'jpeg' || e.target.value === 'webp') ? 'flex' : 'none';
});

imageQualityInput.addEventListener('input', (e) => {
  qualityValSpan.textContent = `${e.target.value}%`;
});

// Select Input Folder (Local Folder Mode)
selectFolderBtn.addEventListener('click', async () => {
  try {
    if (!('showDirectoryPicker' in window)) {
      alert("Your browser does not support folder picker access. Try using Chrome or Edge.");
      return;
    }
    inputDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await scanLocalFolder();
  } catch (err) {
    if (err.name !== 'AbortError') {
      alert('Failed to open directory: ' + err.message);
    }
  }
});

// Select Destination Folder (URL Mode)
setDestFolderBtn.addEventListener('click', async () => {
  try {
    outputDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    progressDetail.textContent = `Output folder set: ${outputDirHandle.name}. Ready to process.`;
    checkUrlStartAvailability();
  } catch (err) {
    if (err.name !== 'AbortError') {
      alert('Failed to set output directory: ' + err.message);
    }
  }
});

// Scan Local Folder
async function scanLocalFolder() {
  progressDetail.textContent = 'Scanning folder...';
  statusDashboard.style.display = 'block';
  queueSection.style.display = 'block';
  startBtn.setAttribute('disabled', 'true');
  
  localFoundFiles = [];
  queueBody.innerHTML = '';
  
  try {
    await recurseDirectory(inputDirHandle, '');
    statTotal.textContent = localFoundFiles.length;
    
    if (localFoundFiles.length > 0) {
      startBtn.removeAttribute('disabled');
      progressDetail.textContent = `Found ${localFoundFiles.length} image(s). Click Start Resizing.`;
    } else {
      progressDetail.textContent = 'No images found in the selected folder.';
    }
  } catch (err) {
    progressDetail.textContent = 'Error scanning folder: ' + err.message;
  }
}

async function recurseDirectory(dirHandle, relativePath) {
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file') {
      const file = await entry.getFile();
      const isImg = file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name);
      
      if (isImg) {
        const fileId = 'img-' + Math.random().toString(36).substr(2, 9);
        localFoundFiles.push({
          id: fileId,
          entry,
          file,
          path: relativePath ? `${relativePath}/${entry.name}` : entry.name
        });
        
        appendQueueRow(fileId, relativePath ? `${relativePath}/${entry.name}` : entry.name, file.size);
      }
    } else if (entry.kind === 'directory') {
      if (entry.name !== 'resized_600x600') {
        await recurseDirectory(entry, relativePath ? `${relativePath}/${entry.name}` : entry.name);
      }
    }
  }
}

function appendQueueRow(id, name, size) {
  const row = document.createElement('tr');
  row.id = id;
  row.innerHTML = `
    <td>${name}</td>
    <td>${formatSize(size)}</td>
    <td class="dim-cell">-</td>
    <td><span class="status-badge status-pending">Pending</span></td>
  `;
  queueBody.appendChild(row);
}

function formatSize(bytes) {
  if (!bytes) return '-';
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Scrape URL Mode
scrapeBtn.addEventListener('click', async () => {
  const url = targetUrlInput.value.trim();
  if (!url) {
    alert("Please enter a website URL.");
    return;
  }

  scrapeBtn.setAttribute('disabled', 'true');
  scrapeBtn.textContent = 'Scanning...';
  
  try {
    const response = await fetch(`/api/scrape?url=${encodeURIComponent(url)}`);
    const data = await response.json();
    
    if (data.error) {
      alert(data.error);
      return;
    }

    urlFoundImages = data.images || [];
    selectedUrlImages.clear();
    urlFoundImages.forEach(imgUrl => selectedUrlImages.add(imgUrl)); // default select all

    renderGallery();
    
    statusDashboard.style.display = 'block';
    progressDetail.textContent = `Found ${urlFoundImages.length} image(s). Set an output folder to begin.`;
    
    checkUrlStartAvailability();
  } catch (err) {
    console.error(err);
    alert("Failed to connect to local server backend. Make sure 'python server.py' is running.");
  } finally {
    scrapeBtn.removeAttribute('disabled');
    scrapeBtn.textContent = 'Scan Website';
  }
});

function renderGallery() {
  gallerySection.style.display = 'block';
  imageGrid.innerHTML = '';
  galleryCountBadge.textContent = `${selectedUrlImages.size} selected`;

  urlFoundImages.forEach(imgUrl => {
    const card = document.createElement('div');
    card.className = 'image-card' + (selectedUrlImages.has(imgUrl) ? ' selected' : '');
    
    // Create image preview via proxy to avoid CORS canvas bugs
    const proxiedUrl = `/api/proxy?url=${encodeURIComponent(imgUrl)}`;
    card.innerHTML = `
      <img src="${proxiedUrl}" alt="scraped" loading="lazy">
      <div class="image-checkbox"></div>
    `;

    card.addEventListener('click', () => {
      if (selectedUrlImages.has(imgUrl)) {
        selectedUrlImages.delete(imgUrl);
        card.classList.remove('selected');
      } else {
        selectedUrlImages.add(imgUrl);
        card.classList.add('selected');
      }
      galleryCountBadge.textContent = `${selectedUrlImages.size} selected`;
      checkUrlStartAvailability();
    });

    imageGrid.appendChild(card);
  });
}

function checkUrlStartAvailability() {
  if (selectedUrlImages.size > 0 && outputDirHandle) {
    startBtn.removeAttribute('disabled');
  } else {
    startBtn.setAttribute('disabled', 'true');
  }
}

selectAllBtn.addEventListener('click', () => {
  urlFoundImages.forEach(url => selectedUrlImages.add(url));
  document.querySelectorAll('.image-card').forEach(card => card.classList.add('selected'));
  galleryCountBadge.textContent = `${selectedUrlImages.size} selected`;
  checkUrlStartAvailability();
});

deselectAllBtn.addEventListener('click', () => {
  selectedUrlImages.clear();
  document.querySelectorAll('.image-card').forEach(card => card.classList.remove('selected'));
  galleryCountBadge.textContent = `0 selected`;
  checkUrlStartAvailability();
});

// Run Batch Job
startBtn.addEventListener('click', runBatchJob);
cancelBtn.addEventListener('click', () => {
  shouldStop = true;
  cancelBtn.setAttribute('disabled', 'true');
  progressDetail.textContent = 'Cancelling...';
});

async function runBatchJob() {
  if (isProcessing) return;
  isProcessing = true;
  shouldStop = false;

  startBtn.setAttribute('disabled', 'true');
  cancelBtn.removeAttribute('disabled');
  
  // Disable fields during batch
  resizeModeSelect.setAttribute('disabled', 'true');
  padColorInput.setAttribute('disabled', 'true');
  padColorText.setAttribute('disabled', 'true');
  outputFormatSelect.setAttribute('disabled', 'true');
  imageQualityInput.setAttribute('disabled', 'true');

  processedCount = 0;
  successCount = 0;
  errorCount = 0;

  if (activeMode === 'folder') {
    await runFolderMode();
  } else {
    await runUrlMode();
  }

  isProcessing = false;
  cancelBtn.setAttribute('disabled', 'true');
  startBtn.removeAttribute('disabled');
  
  resizeModeSelect.removeAttribute('disabled');
  padColorInput.removeAttribute('disabled');
  padColorText.removeAttribute('disabled');
  outputFormatSelect.removeAttribute('disabled');
  imageQualityInput.removeAttribute('disabled');
}

// Processing Local Folder
async function runFolderMode() {
  try {
    const finalOutputDir = await inputDirHandle.getDirectoryHandle('resized_600x600', { create: true });
    statTotal.textContent = localFoundFiles.length;
    
    for (let i = 0; i < localFoundFiles.length; i++) {
      if (shouldStop) {
        progressDetail.textContent = 'Processing stopped.';
        break;
      }
      
      const item = localFoundFiles[i];
      const row = document.getElementById(item.id);
      const statusCell = row.querySelector('td:last-child');
      const dimCell = row.querySelector('.dim-cell');
      
      statusCell.innerHTML = '<span class="status-badge status-running">Resizing...</span>';
      
      try {
        const mode = resizeModeSelect.value;
        const padColor = padColorInput.value;
        const format = outputFormatSelect.value;
        const quality = parseInt(imageQualityInput.value);

        const result = await processImage(item.file, mode, padColor, format, quality);
        dimCell.textContent = `${result.width}x${result.height}`;

        let outputName = item.entry.name;
        if (format !== 'original') {
          const baseName = outputName.substring(0, outputName.lastIndexOf('.')) || outputName;
          outputName = `${baseName}.${format}`;
        }

        const newFileHandle = await finalOutputDir.getFileHandle(outputName, { create: true });
        const writable = await newFileHandle.createWritable();
        await writable.write(result.blob);
        await writable.close();

        statusCell.innerHTML = '<span class="status-badge status-success">Saved</span>';
        successCount++;
      } catch (err) {
        console.error(err);
        statusCell.innerHTML = '<span class="status-badge status-error">Failed</span>';
        errorCount++;
      }
      
      processedCount++;
      updateProgress(localFoundFiles.length);
      row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  } catch (err) {
    alert("Folder batch processing error: " + err.message);
  }
}

// Processing URL Scraped Images
async function runUrlMode() {
  const imagesToResize = Array.from(selectedUrlImages);
  
  // Set up Queue table
  queueSection.style.display = 'block';
  queueBody.innerHTML = '';
  statTotal.textContent = imagesToResize.length;
  queueCountBadge.textContent = `${imagesToResize.length} images`;

  const queueItems = [];
  imagesToResize.forEach((imgUrl, idx) => {
    const fileId = `url-img-${idx}`;
    // Extract a cleaner name from URL
    let name = imgUrl.substring(imgUrl.lastIndexOf('/') + 1);
    if (name.includes('?')) name = name.substring(0, name.indexOf('?'));
    if (!name || !name.includes('.')) name = `scraped_image_${idx + 1}.jpg`;

    appendQueueRow(fileId, name, null);
    queueItems.push({ id: fileId, name, url: imgUrl });
  });

  for (let i = 0; i < queueItems.length; i++) {
    if (shouldStop) {
      progressDetail.textContent = 'Processing stopped.';
      break;
    }

    const item = queueItems[i];
    const row = document.getElementById(item.id);
    const statusCell = row.querySelector('td:last-child');
    const dimCell = row.querySelector('.dim-cell');

    statusCell.innerHTML = '<span class="status-badge status-running">Resizing...</span>';

    try {
      const mode = resizeModeSelect.value;
      const padColor = padColorInput.value;
      const format = outputFormatSelect.value;
      const quality = parseInt(imageQualityInput.value);

      // Download file via proxy server to bypass CORS issues
      const proxyUrl = `/api/proxy?url=${encodeURIComponent(item.url)}`;
      const response = await fetch(proxyUrl);
      const blob = await response.blob();
      
      const file = new File([blob], item.name, { type: blob.type });

      // Resize
      const result = await processImage(file, mode, padColor, format, quality);
      dimCell.textContent = `${result.width}x${result.height}`;

      // Update filename extension if format is forced
      let outputName = item.name;
      if (format !== 'original') {
        const baseName = outputName.substring(0, outputName.lastIndexOf('.')) || outputName;
        outputName = `${baseName}.${format}`;
      }

      // Save inside selected destination folder
      const newFileHandle = await outputDirHandle.getFileHandle(outputName, { create: true });
      const writable = await newFileHandle.createWritable();
      await writable.write(result.blob);
      await writable.close();

      statusCell.innerHTML = '<span class="status-badge status-success">Saved</span>';
      successCount++;
    } catch (err) {
      console.error(err);
      statusCell.innerHTML = '<span class="status-badge status-error">Failed</span>';
      errorCount++;
    }

    processedCount++;
    updateProgress(imagesToResize.length);
    row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  if (!shouldStop) {
    progressDetail.textContent = `Completed! Files saved to output folder: ${outputDirHandle.name}`;
  }
}

function updateProgress(total) {
  statProcessed.textContent = processedCount;
  statSuccess.textContent = successCount;
  statErrors.textContent = errorCount;

  const pct = total > 0 ? Math.round((processedCount / total) * 100) : 0;
  progressBar.style.width = `${pct}%`;
  progressPercentage.textContent = `${pct}% Complete`;

  if (isProcessing && !shouldStop) {
    progressDetail.textContent = `Resizing image ${processedCount + 1} of ${total}...`;
  }
}

function processImage(file, mode, padColor, format, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function(e) {
      const img = new Image();
      img.crossOrigin = 'anonymous'; // critical for canvas export safety
      img.onload = function() {
        const canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = 600;
        const ctx = canvas.getContext('2d');

        const targetW = 600;
        const targetH = 600;
        const imgW = img.width;
        const imgH = img.height;

        if (mode === 'stretch') {
          ctx.drawImage(img, 0, 0, targetW, targetH);
        } else if (mode === 'cover') {
          const ratio = Math.max(targetW / imgW, targetH / imgH);
          const newW = imgW * ratio;
          const newH = imgH * ratio;
          const x = (targetW - newW) / 2;
          const y = (targetH - newH) / 2;
          ctx.drawImage(img, x, y, newW, newH);
        } else if (mode === 'contain') {
          ctx.fillStyle = padColor;
          ctx.fillRect(0, 0, targetW, targetH);
          const ratio = Math.min(targetW / imgW, targetH / imgH);
          const newW = imgW * ratio;
          const newH = imgH * ratio;
          const x = (targetW - newW) / 2;
          const y = (targetH - newH) / 2;
          ctx.drawImage(img, x, y, newW, newH);
        }

        let mime = file.type;
        if (format !== 'original') {
          mime = `image/${format}`;
        }
        if (!mime.startsWith('image/')) {
          mime = 'image/jpeg'; // fallback
        }
        
        canvas.toBlob((blob) => {
          if (blob) {
            resolve({ blob, width: imgW, height: imgH });
          } else {
            reject(new Error('Canvas export failed'));
          }
        }, mime, quality / 100);
      };
      img.onerror = () => reject(new Error('Image failed to load'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Reader failed to read file'));
    reader.readAsDataURL(file);
  });
}
