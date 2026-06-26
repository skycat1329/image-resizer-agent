// DOM Elements
const resizeModeSelect = document.getElementById('resize-mode');
const padColorGroup = document.getElementById('pad-color-group');
const padColorInput = document.getElementById('pad-color');
const padColorText = document.getElementById('pad-color-text');
const outputFormatSelect = document.getElementById('output-format');
const qualityGroup = document.getElementById('quality-group');
const imageQualityInput = document.getElementById('image-quality');
const qualityValSpan = document.getElementById('quality-val');

const dropzone = document.getElementById('dropzone');
const selectFolderBtn = document.getElementById('select-folder-btn');
const statusDashboard = document.getElementById('status-dashboard');
const statTotal = document.getElementById('stat-total');
const statProcessed = document.getElementById('stat-processed');
const statSuccess = document.getElementById('stat-success');
const statErrors = document.getElementById('stat-errors');

const progressBar = document.getElementById('progress-bar');
const progressPercentage = document.getElementById('progress-percentage');
const progressDetail = document.getElementById('progress-detail');

const startBtn = document.getElementById('start-btn');
const cancelBtn = document.getElementById('cancel-btn');

const queueSection = document.getElementById('queue-section');
const queueCountBadge = document.getElementById('queue-count');
const queueBody = document.getElementById('queue-body');

// Global State
let inputDirHandle = null;
let foundFiles = [];
let isProcessing = false;
let shouldStop = false;
let processedCount = 0;
let successCount = 0;
let errorCount = 0;

// Event Listeners
resizeModeSelect.addEventListener('change', (e) => {
  if (e.target.value === 'contain') {
    padColorGroup.style.display = 'flex';
  } else {
    padColorGroup.style.display = 'none';
  }
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
  if (e.target.value === 'jpeg' || e.target.value === 'webp') {
    qualityGroup.style.display = 'flex';
  } else {
    qualityGroup.style.display = 'none';
  }
});

imageQualityInput.addEventListener('input', (e) => {
  qualityValSpan.textContent = `${e.target.value}%`;
});

// Pick folder
selectFolderBtn.addEventListener('click', async () => {
  try {
    if (!('showDirectoryPicker' in window)) {
      alert("Your browser does not support the File System Access API. Please use a modern browser like Chrome, Edge, or Opera.");
      return;
    }
    inputDirHandle = await window.showDirectoryPicker({
      mode: 'readwrite'
    });
    
    // Scan files
    await scanFolder();
  } catch (err) {
    console.error(err);
    if (err.name !== 'AbortError') {
      alert('Failed to select directory: ' + err.message);
    }
  }
});

// Drag and drop directories support (fallback/alternative)
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
});

dropzone.addEventListener('drop', async (e) => {
  e.preventDefault();
  // Drag and drop folder isn't fully supported by showDirectoryPicker standard picker directly,
  // so we prompt them to click the button for direct folder system access.
  alert("Please click the 'Select Input Folder' button. Secure folder writing requires user verification.");
});

async function scanFolder() {
  if (!inputDirHandle) return;

  progressDetail.textContent = 'Scanning folder for images...';
  dropzone.style.display = 'none';
  statusDashboard.style.display = 'block';
  queueSection.style.display = 'block';
  
  foundFiles = [];
  queueBody.innerHTML = '';
  
  try {
    await recurseDirectory(inputDirHandle, '');
    
    statTotal.textContent = foundFiles.length;
    queueCountBadge.textContent = `${foundFiles.length} images`;
    
    if (foundFiles.length > 0) {
      startBtn.removeAttribute('disabled');
      progressDetail.textContent = `Found ${foundFiles.length} image(s). Ready to begin resizing.`;
    } else {
      startBtn.setAttribute('disabled', 'true');
      progressDetail.textContent = 'No supported images found in the selected folder.';
    }
  } catch (err) {
    console.error(err);
    progressDetail.textContent = 'Error scanning folder: ' + err.message;
  }
}

async function recurseDirectory(dirHandle, relativePath) {
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file') {
      const file = await entry.getFile();
      const isImg = file.type.startsWith('image/') || 
                    /\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name);
      
      if (isImg) {
        const fileId = 'img-' + Math.random().toString(36).substr(2, 9);
        foundFiles.push({
          id: fileId,
          entry,
          file,
          path: relativePath ? `${relativePath}/${entry.name}` : entry.name
        });
        
        // Add row to table
        const row = document.createElement('tr');
        row.id = fileId;
        row.innerHTML = `
          <td>${relativePath ? relativePath + '/' : ''}${entry.name}</td>
          <td>${formatSize(file.size)}</td>
          <td class="dim-cell">-</td>
          <td><span class="status-badge status-pending">Pending</span></td>
        `;
        queueBody.appendChild(row);
      }
    } else if (entry.kind === 'directory') {
      // Do not recurse into our output folder to prevent loops
      if (entry.name !== 'resized_600x600') {
        await recurseDirectory(entry, relativePath ? `${relativePath}/${entry.name}` : entry.name);
      }
    }
  }
}

function formatSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Start/Cancel operations
startBtn.addEventListener('click', startResizing);
cancelBtn.addEventListener('click', () => {
  shouldStop = true;
  cancelBtn.setAttribute('disabled', 'true');
  progressDetail.textContent = 'Cancelling...';
});

async function startResizing() {
  if (isProcessing) return;
  isProcessing = true;
  shouldStop = false;
  
  startBtn.setAttribute('disabled', 'true');
  cancelBtn.removeAttribute('disabled');
  
  // Disable config settings during processing
  resizeModeSelect.setAttribute('disabled', 'true');
  padColorInput.setAttribute('disabled', 'true');
  padColorText.setAttribute('disabled', 'true');
  outputFormatSelect.setAttribute('disabled', 'true');
  imageQualityInput.setAttribute('disabled', 'true');

  processedCount = 0;
  successCount = 0;
  errorCount = 0;
  
  updateDashboard();

  try {
    // Create the output directory 'resized_600x600' inside the input directory
    const outputDirHandle = await inputDirHandle.getDirectoryHandle('resized_600x600', { create: true });
    
    for (let i = 0; i < foundFiles.length; i++) {
      if (shouldStop) {
        progressDetail.textContent = 'Processing stopped by user.';
        break;
      }
      
      const item = foundFiles[i];
      const row = document.getElementById(item.id);
      const statusCell = row.querySelector('td:last-child');
      const dimCell = row.querySelector('.dim-cell');
      
      statusCell.innerHTML = '<span class="status-badge status-running">Resizing...</span>';
      
      try {
        const mode = resizeModeSelect.value;
        const padColor = padColorInput.value;
        const format = outputFormatSelect.value;
        const quality = parseInt(imageQualityInput.value);

        // Process image
        const result = await processImage(item.file, mode, padColor, format, quality);
        
        // Update original dims in table
        dimCell.textContent = `${result.width}x${result.height}`;

        // Get matching output extension
        let outputName = item.entry.name;
        if (format !== 'original') {
          const baseName = outputName.substring(0, outputName.lastIndexOf('.')) || outputName;
          outputName = `${baseName}.${format}`;
        }

        // Save
        const newFileHandle = await outputDirHandle.getFileHandle(outputName, { create: true });
        const writable = await newFileHandle.createWritable();
        await writable.write(result.blob);
        await writable.close();

        statusCell.innerHTML = '<span class="status-badge status-success">Saved (600x600)</span>';
        successCount++;
      } catch (err) {
        console.error(err);
        statusCell.innerHTML = `<span class="status-badge status-error" title="${err.message}">Failed</span>`;
        errorCount++;
      }
      
      processedCount++;
      updateDashboard();
      
      // Scroll the current item into view if needed
      row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    
    if (!shouldStop) {
      progressDetail.textContent = `Completed! Saved in ${inputDirHandle.name}/resized_600x600`;
    }
  } catch (err) {
    console.error(err);
    alert('Processing failed: ' + err.message);
  } finally {
    isProcessing = false;
    cancelBtn.setAttribute('disabled', 'true');
    startBtn.removeAttribute('disabled');
    
    // Re-enable config
    resizeModeSelect.removeAttribute('disabled');
    padColorInput.removeAttribute('disabled');
    padColorText.removeAttribute('disabled');
    outputFormatSelect.removeAttribute('disabled');
    imageQualityInput.removeAttribute('disabled');
  }
}

function updateDashboard() {
  statProcessed.textContent = processedCount;
  statSuccess.textContent = successCount;
  statErrors.textContent = errorCount;
  
  const percentage = foundFiles.length > 0 ? Math.round((processedCount / foundFiles.length) * 100) : 0;
  progressBar.style.width = `${percentage}%`;
  progressPercentage.textContent = `${percentage}% Complete`;
  
  if (isProcessing && !shouldStop) {
    progressDetail.textContent = `Processing image ${processedCount + 1} of ${foundFiles.length}...`;
  }
}

function processImage(file, mode, padColor, format, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function(e) {
      const img = new Image();
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
        
        canvas.toBlob((blob) => {
          if (blob) {
            resolve({ blob, width: imgW, height: imgH });
          } else {
            reject(new Error('Canvas conversion failed'));
          }
        }, mime, quality / 100);
      };
      img.onerror = () => reject(new Error('Image load error'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('File read error'));
    reader.readAsDataURL(file);
  });
}
