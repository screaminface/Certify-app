/**
 * Check if app is running as installed PWA
 */
function isPWA(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
         (window.navigator as any).standalone ||
         document.referrer.includes('android-app://');
}

/**
 * Save file with user-selected location (if supported)
 * Falls back to automatic download if File System Access API is not available
 */
export async function saveFile(blob: Blob, suggestedFilename: string): Promise<void> {
  console.log('📁 saveFile called for:', suggestedFilename);
  console.log('🔍 PWA mode:', isPWA());
  
  // Check if File System Access API is supported
  // Note: Some PWA implementations may have restricted access
  if ('showSaveFilePicker' in window) {
    console.log('✅ File System Access API is supported');
    try {
      // Get file extension
      const ext = suggestedFilename.split('.').pop() || '';
      
      // Define file type options
      const options: SaveFilePickerOptions = {
        suggestedName: suggestedFilename,
        types: []
      };

      // Add appropriate file type filters
      if (ext === 'json') {
        options.types = [{
          description: 'JSON файл',
          accept: { 'application/json': ['.json'] }
        }];
      } else if (ext === 'xlsx') {
        options.types = [{
          description: 'Excel файл',
          accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] }
        }];
      } else if (ext === 'csv') {
        options.types = [{
          description: 'CSV файл',
          accept: { 'text/csv': ['.csv'] }
        }];
      } else if (ext === 'docx') {
        options.types = [{
          description: 'Word документ',
          accept: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] }
        }];
      }

      // Show save file picker
      const handle = await (window as any).showSaveFilePicker(options);
      
      // Write file
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      
      return; // Success - file saved
    } catch (error) {
      // User cancelled or error occurred - fall through to automatic download
      if ((error as Error).name === 'AbortError') {
        // User cancelled - don't show error, just return
        return;
      }
      console.warn('File System Access API failed, falling back to automatic download:', error);
    }
  } else {
    console.log('❌ File System Access API not supported, using fallback');
  }

  // Fallback: Automatic download (old method)
  console.log('⬇️ Using automatic download fallback');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Type definition for File System Access API
interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
}
