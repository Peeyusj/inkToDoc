import React, { useState, useCallback } from 'react';
import { 
  Upload, 
  Download, 
  FileText, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  GripVertical,
  Sparkles,
  Zap,
  Shield,
  PenTool,
  FileCheck,
  ArrowDown,
  RotateCcw,
  Info
} from 'lucide-react';

type FileStatus = 'pending' | 'processing' | 'completed' | 'error';

interface FileData {
  file: File;
  preview: string;
  id: string;
  status: FileStatus;
  error: string | null;
}

interface ProcessedResult {
  downloadUrl: string;
  filename: string;
}

const MAX_FILES = 3;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Loading spinner
const Spinner = () => (
  <div className="relative w-5 h-5">
    <div className="absolute inset-0 rounded-full border-2 border-white/20" />
    <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-white animate-spin" />
  </div>
);

// Feature card
const FeatureCard = ({ icon: Icon, title, description }: { 
  icon: React.ElementType; 
  title: string; 
  description: string;
}) => (
  <div className="group p-6 rounded-2xl bg-slate-800/50 border border-slate-700/50 hover:border-violet-500/30 transition-all duration-300">
    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mb-4">
      <Icon className="w-6 h-6 text-white" />
    </div>
    <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
    <p className="text-slate-400 text-sm leading-relaxed">{description}</p>
  </div>
);

export default function OCRApp() {
  const [selectedFiles, setSelectedFiles] = useState<FileData[]>([]);
  const [processing, setProcessing] = useState(false);
  const [processedResult, setProcessedResult] = useState<ProcessedResult | null>(null);
  const [progress, setProgress] = useState('');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [notification, setNotification] = useState<string>('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  const showNotification = (message: string) => {
    setNotification(message);
    setTimeout(() => setNotification(''), 4000);
  };

  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files) return;
    
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length === 0) {
      showNotification('⚠️ Please upload image files only (PNG, JPG, etc.)');
      return;
    }

    const validFiles: FileData[] = [];
    let tooLarge = 0;

    imageFiles.forEach(file => {
      if (file.size > MAX_FILE_SIZE) {
        tooLarge++;
      } else {
        validFiles.push({
          file,
          preview: URL.createObjectURL(file),
          id: Math.random().toString(36).substr(2, 9),
          status: 'pending',
          error: null
        });
      }
    });

    if (tooLarge > 0) {
      showNotification(`⚠️ ${tooLarge} file(s) exceed 10MB limit and were skipped`);
    }

    const totalFiles = selectedFiles.length + validFiles.length;
    
    if (totalFiles > MAX_FILES) {
      showNotification(`⚠️ Maximum ${MAX_FILES} files allowed. ${totalFiles - MAX_FILES} file(s) not added.`);
      const remainingSlots = MAX_FILES - selectedFiles.length;
      const filesToAdd = validFiles.slice(0, Math.max(0, remainingSlots));
      setSelectedFiles(prev => [...prev, ...filesToAdd]);
      filesToAdd.forEach((f, i) => {
        if (i >= remainingSlots) {
          URL.revokeObjectURL(f.preview);
        }
      });
    } else {
      setSelectedFiles(prev => [...prev, ...validFiles]);
      if (validFiles.length > 0) {
        showNotification(`✅ Added ${validFiles.length} file(s)`);
      }
    }

    if (processedResult) {
      URL.revokeObjectURL(processedResult.downloadUrl);
      setProcessedResult(null);
    }
  }, [selectedFiles.length, processedResult]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files);
  };

  const handleDropZoneDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  const removeFile = (id: string) => {
    setSelectedFiles(prev => {
      const file = prev.find(f => f.id === id);
      if (file) URL.revokeObjectURL(file.preview);
      return prev.filter(f => f.id !== id);
    });
    if (processedResult) {
      URL.revokeObjectURL(processedResult.downloadUrl);
      setProcessedResult(null);
    }
  };

  const handleReorderDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleReorderDragEnd = () => setDraggedIndex(null);
  const handleReorderDragOver = (e: React.DragEvent) => e.preventDefault();

  const handleReorderDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) return;

    setSelectedFiles(prev => {
      const newFiles = [...prev];
      const [draggedItem] = newFiles.splice(draggedIndex, 1);
      newFiles.splice(dropIndex, 0, draggedItem);
      return newFiles;
    });
    setDraggedIndex(null);
    
    if (processedResult) {
      URL.revokeObjectURL(processedResult.downloadUrl);
      setProcessedResult(null);
    }
  };

  const moveFile = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === selectedFiles.length - 1) return;

    setSelectedFiles(prev => {
      const newFiles = [...prev];
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      [newFiles[index], newFiles[newIndex]] = [newFiles[newIndex], newFiles[index]];
      return newFiles;
    });

    if (processedResult) {
      URL.revokeObjectURL(processedResult.downloadUrl);
      setProcessedResult(null);
    }
  };

  const processAllFiles = async () => {
    if (selectedFiles.length === 0) return;

    setProcessing(true);
    setProgress('Uploading images...');
    setSelectedFiles(prev => prev.map(f => ({ ...f, status: 'processing' })));

    try {
      const formData = new FormData();
      selectedFiles.forEach(fileData => formData.append('files', fileData.file));

      setProgress('Processing with AI...');
      const startResponse = await fetch(`${API_URL}/start-batch-conversion`, {
        method: 'POST',
        body: formData,
      });

      if (!startResponse.ok) {
        throw new Error(`Server error: ${startResponse.status}. Please check if the API is running.`);
      }

      const { call_id } = await startResponse.json();

      let isReady = false;
      let attempts = 0;
      const maxAttempts = 300; // 5 minutes

      while (!isReady && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const statusResponse = await fetch(`${API_URL}/check-status/${call_id}`);
        
        if (!statusResponse.ok) {
          throw new Error('Failed to check processing status');
        }

        const statusData = await statusResponse.json();
        
        if (statusData.status === 'completed') {
          isReady = true;
        } else if (statusData.status === 'error') {
          throw new Error(statusData.error || 'Processing failed. Please try again.');
        }
        
        attempts++;
        const timeLeft = Math.ceil((maxAttempts - attempts) / 60);
        setProgress(`Processing... ${attempts}s (${timeLeft}m remaining)`);
      }

      if (!isReady) throw new Error('Processing timeout. Please try again with fewer files.');

      setProgress('Preparing download...');
      const downloadResponse = await fetch(`${API_URL}/download-combined/${call_id}`);
      if (!downloadResponse.ok) throw new Error('Failed to download result. Please try again.');

      const blob = await downloadResponse.blob();
      const downloadUrl = window.URL.createObjectURL(blob);

      setProcessedResult({ downloadUrl, filename: 'converted_document.docx' });
      setSelectedFiles(prev => prev.map(f => ({ ...f, status: 'completed' })));
      setProgress('');
      showNotification('✅ Conversion complete! Ready to download.');

    } catch (error) {
      const msg = error instanceof Error ? error.message : 'An unknown error occurred';
      setSelectedFiles(prev => prev.map(f => ({ ...f, status: 'error', error: msg })));
      setProgress('');
      showNotification(`❌ ${msg}`);
    } finally {
      setProcessing(false);
    }
  };

  const downloadResult = () => {
    if (processedResult) {
      const a = document.createElement('a');
      a.href = processedResult.downloadUrl;
      a.download = processedResult.filename;
      a.click();
    }
  };

  const clearAll = () => {
    selectedFiles.forEach(f => URL.revokeObjectURL(f.preview));
    if (processedResult) URL.revokeObjectURL(processedResult.downloadUrl);
    setSelectedFiles([]);
    setProcessedResult(null);
    setProgress('');
    setShowClearConfirm(false);
    showNotification('🗑️ All files cleared');
  };

  const retryFailedFiles = () => {
    setSelectedFiles(prev => prev.map(f => 
      f.status === 'error' ? { ...f, status: 'pending', error: null } : f
    ));
  };

  const scrollToUpload = () => {
    document.getElementById('upload-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">

      {/* Notification Toast */}
      {notification && (
        <div className="fixed top-4 right-4 z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 shadow-lg max-w-sm animate-in fade-in slide-in-from-top-2 duration-300">
            <p className="text-sm text-slate-200">{notification}</p>
          </div>
        </div>
      )}

      {/* Clear Confirmation Dialog */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-white mb-2">Clear all files?</h3>
            <p className="text-sm text-slate-400 mb-6">
              This will remove all {selectedFiles.length} file(s). This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={clearAll}
                className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="fixed inset-0 pointer-events-none">
  {/* Fine Grid */}
  <div 
    className="absolute inset-0 opacity-[0.15]"
    style={{
      backgroundImage: `linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px)`,
      backgroundSize: '40px 40px'
    }}
  />
  
  {/* Top Gradient */}
  <div className="absolute inset-0 bg-gradient-to-b from-violet-600/10 via-transparent to-transparent" />
  
  {/* Corner Glow */}
  <div className="absolute -top-40 -left-40 w-80 h-80 bg-violet-500/30 rounded-full blur-[100px]" />
  <div className="absolute -bottom-40 -right-40 w-80 h-80 bg-purple-500/20 rounded-full blur-[100px]" />
</div>

      {/* Navigation */}
      <nav className="relative z-10 border-b border-slate-800">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                <PenTool className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="text-xl font-bold text-white">InkToDoc</span>
                <span className="hidden sm:inline text-xs text-slate-500 ml-2">Handwriting OCR</span>
              </div>
            </div>
            <a 
              href="https://github.com/Peeyusj" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-slate-400 hover:text-white transition-colors text-sm"
            >
              GitHub
            </a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 pt-8 pb-8">
        <div className="max-w-5xl mx-auto px-6 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-sm mb-6">
            <Sparkles className="w-4 h-4" />
            AI-Powered Handwriting Recognition with 99% Accuracy
          </div>
          
          {/* Heading */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 leading-normal!">
            Convert Handwritten Notes
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-purple-400">
              to Digital Documents
            </span>
          </h1>
          
          {/* Description */}
          <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-8 leading-relaxed">
            Snap a photo of your handwritten notes, assignments, or documents. 
            Our AI instantly converts them to editable Word files.
          </p>

          {/* CTA Button */}
          <button 
            onClick={scrollToUpload}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white transition-all shadow-lg shadow-violet-500/20"
          >
            Start Converting
            <ArrowDown className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* Upload Section */}
      <section id="upload-section" className="relative z-10 py-8">
        <div className="max-w-3xl mx-auto px-6">
          <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
                  <Upload className="w-4 h-4 text-violet-400" />
                </div>
                <div>
                  <h2 className="font-semibold text-white">Upload Images</h2>
                  <p className="text-xs text-slate-500">Max {MAX_FILES} images • PNG, JPG supported</p>
                </div>
              </div>
              {selectedFiles.length > 0 && !processing && (
                <button
                  onClick={() => setShowClearConfirm(true)}
                  className="px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Remove all files"
                >
                  Clear all
                </button>
              )}
            </div>

            {/* Upload Zone */}
            <div className="p-6">
              <label 
                className={`block ${selectedFiles.length >= MAX_FILES ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDropZoneDrop}
              >
                <div className={`
                  rounded-xl border-2 border-dashed p-8 text-center transition-all duration-200
                  ${isDragOver 
                    ? 'border-violet-500 bg-violet-500/10' 
                    : 'border-slate-700 hover:border-slate-600 bg-slate-800/50'
                  }
                `}>
                  <div className={`
                    w-14 h-14 mx-auto mb-4 rounded-xl flex items-center justify-center transition-colors
                    ${isDragOver ? 'bg-violet-500/20' : 'bg-slate-700/50'}
                  `}>
                    <Upload className={`w-7 h-7 ${isDragOver ? 'text-violet-400' : 'text-slate-400'}`} />
                  </div>
                  
                  <p className="text-slate-300 font-medium mb-1">
                    {selectedFiles.length >= MAX_FILES 
                      ? 'Maximum files reached' 
                      : 'Drag images here or click to upload'
                    }
                  </p>
                  <p className="text-sm text-slate-500">
                    {selectedFiles.length}/{MAX_FILES} files selected
                  </p>
                  
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleInputChange}
                    className="hidden"
                    disabled={processing || selectedFiles.length >= MAX_FILES}
                    aria-label="Upload image files"
                  />
                </div>
              </label>

              {/* File List */}
              {selectedFiles.length > 0 && (
                <div className="mt-6">
                  <p className="text-xs text-slate-500 mb-3 flex items-center gap-1">
                    <GripVertical className="w-3 h-3" />
                    Drag to reorder pages
                  </p>
                  
                  <div className="space-y-2">
                    {selectedFiles.map((fileData, index) => (
                      <div
                        key={fileData.id}
                        draggable={!processing}
                        onDragStart={(e) => handleReorderDragStart(e, index)}
                        onDragEnd={handleReorderDragEnd}
                        onDragOver={handleReorderDragOver}
                        onDrop={(e) => handleReorderDrop(e, index)}
                        className={`
                          group flex items-center gap-3 p-3 rounded-xl border transition-all
                          ${draggedIndex === index 
                            ? 'border-violet-500 bg-violet-500/10' 
                            : 'border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/50'
                          }
                          ${!processing ? 'cursor-grab active:cursor-grabbing' : ''}
                        `}
                      >
                        {/* Handle & Number */}
                        <div className="flex items-center gap-2">
                          <GripVertical className="w-4 h-4 text-slate-600" />
                          <span className="w-6 h-6 rounded-md bg-slate-700/50 flex items-center justify-center text-xs font-medium text-slate-400">
                            {index + 1}
                          </span>
                        </div>

                        {/* Thumbnail */}
                        <img
                          src={fileData.preview}
                          alt={fileData.file.name}
                          className="w-12 h-12 object-cover rounded-lg border border-slate-700"
                        />

                        {/* File Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-200 truncate">
                            {fileData.file.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {(fileData.file.size / 1024).toFixed(0)} KB
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          {fileData.status === 'processing' && (
                            <div className="flex items-center gap-2 text-violet-400 text-sm">
                              <Spinner />
                            </div>
                          )}
                          {fileData.status === 'completed' && (
                            <span title="Converted successfully">
                              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                            </span>
                          )}
                          {fileData.status === 'error' && (
                            <span title="Conversion failed">
                              <AlertCircle className="w-5 h-5 text-red-400" />
                            </span>
                          )}
                          {fileData.status === 'pending' && (
                            <div className="w-5 h-5 rounded-full border-2 border-slate-600 border-t-violet-400" title="Pending" />
                          )}
                        </div>
                        
                        {/* Error Message */}
                        {fileData.status === 'error' && fileData.error && (
                          <div className="text-xs text-red-400 flex-1 px-2">
                            {fileData.error}
                          </div>
                        )}

                        {/* Move Buttons */}
                        {!processing && selectedFiles.length > 1 && (
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => moveFile(index, 'up')}
                              disabled={index === 0}
                              className="w-6 h-6 rounded flex items-center justify-center text-slate-500 hover:text-white hover:bg-slate-700 disabled:opacity-30 text-xs"
                            >
                              ▲
                            </button>
                            <button
                              onClick={() => moveFile(index, 'down')}
                              disabled={index === selectedFiles.length - 1}
                              className="w-6 h-6 rounded flex items-center justify-center text-slate-500 hover:text-white hover:bg-slate-700 disabled:opacity-30 text-xs"
                            >
                              ▼
                            </button>
                          </div>
                        )}

                        {/* Remove */}
                        {!processing && (
                          <button
                            onClick={() => removeFile(fileData.id)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              {selectedFiles.length > 0 && (
                <div className="mt-6 space-y-3">
                  {/* Main Action */}
                  <div className="flex gap-3">
                    <button
                      onClick={processAllFiles}
                      disabled={processing}
                      className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white"
                      title={processing ? 'Processing...' : 'Convert selected files to document'}
                    >
                      {processing ? (
                        <>
                          <Spinner />
                          <span className="text-sm">{progress}</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-5 h-5" />
                          <span>Convert to Document</span>
                        </>
                      )}
                    </button>

                    {processedResult && !processing && (
                      <button
                        onClick={downloadResult}
                        className="flex items-center gap-2 px-5 py-3 rounded-xl font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                        title="Download converted document"
                      >
                        <Download className="w-5 h-5" />
                        <span>Download</span>
                      </button>
                    )}
                  </div>

                  {/* Retry Button for Failed Files */}
                  {selectedFiles.some(f => f.status === 'error') && !processing && (
                    <button
                      onClick={retryFailedFiles}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700"
                      title="Retry conversion for failed files"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Retry Failed Files
                    </button>
                  )}
                </div>
              )}

              {/* Empty State */}
              {selectedFiles.length === 0 && (
                <div className="mt-6 p-4 rounded-lg bg-slate-800/50 border border-slate-700/50 flex items-center justify-center w-full">
                  <div className="flex gap-3 items-start">
                    <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-slate-300 mb-2">Supported formats:</p>
                      <ul className="text-xs text-slate-400 space-y-1">
                        <li>• Image formats: PNG, JPG, JPEG, GIF, WebP</li>
                        <li>• File size: Max 10 MB per image</li>
                        <li>• Content: Handwritten notes, printed documents, receipts, forms</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative z-10 py-16">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">How It Works</h2>
            <p className="text-slate-400">Three simple steps to digitize your handwriting</p>
          </div>

          <div className="grid sm:grid-cols-3 gap-6">
            <FeatureCard 
              icon={Upload}
              title="1. Upload"
              description="Take a photo or upload images of your handwritten notes. Support for multiple pages."
            />
            <FeatureCard 
              icon={Sparkles}
              title="2. AI Processing"
              description="Our advanced OCR model analyzes and extracts text with high accuracy."
            />
            <FeatureCard 
              icon={FileCheck}
              title="3. Download"
              description="Get a perfectly formatted Word document ready to edit and share."
            />
          </div>
        </div>
      </section>

      {/* Why Choose Section */}
      <section className="relative z-10 py-16 border-t border-slate-800">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="text-center p-4">
              <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <Shield className="w-6 h-6 text-emerald-400" />
              </div>
              <h3 className="font-semibold text-white mb-1">Secure</h3>
              <p className="text-sm text-slate-500">Files auto-deleted</p>
            </div>
            <div className="text-center p-4">
              <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <PenTool className="w-6 h-6 text-amber-400" />
              </div>
              <h3 className="font-semibold text-white mb-1">Accurate</h3>
              <p className="text-sm text-slate-500">99%+ recognition</p>
            </div>
            <div className="text-center p-4">
              <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <FileText className="w-6 h-6 text-blue-400" />
              </div>
              <h3 className="font-semibold text-white mb-1">Formatted</h3>
              <p className="text-sm text-slate-500">Clean Word output</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800 py-8">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                <PenTool className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-white">InkToDoc</span>
            </div>
            <p className="text-slate-500 text-sm">
              Built for my mom❤️ 
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}