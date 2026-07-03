import { useState, useRef, useEffect } from 'react';
import { splitPdf, type ProcessedPDFResult } from './utils/pdfProcessor';
import frisscoEssentialsLogo from './assets/frissco_essentials.png';
import frisscoLogo from './assets/frissco.png';

export default function App() {
  // Theme state
  const [theme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('frissco-theme') as 'light' | 'dark') || 'dark';
  });

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('frissco-theme', theme);
  }, [theme]);

  // File states
  const [file, setFile] = useState<File | null>(null);
  const [fileMeta, setFileMeta] = useState<{ name: string; sizeMB: string; pages: number } | null>(null);
  const [arrayBuffer, setArrayBuffer] = useState<ArrayBuffer | null>(null);

  // Configuration states
  const [reverseEven, setReverseEven] = useState<boolean>(true);
  const [rotateEven, setRotateEven] = useState<boolean>(false);

  // Processing & UI preview states
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [processedData, setProcessedData] = useState<ProcessedPDFResult | null>(null);
  const [flippedSheets, setFlippedSheets] = useState<Record<number, boolean>>({});

  // Blob URL states for downloading and printing
  const [blobUrlA, setBlobUrlA] = useState<string>('');
  const [blobUrlB, setBlobUrlB] = useState<string>('');

  // Stepper states
  const [checkADone, setCheckADone] = useState<boolean>(false);
  const [checkFlipped, setCheckFlipped] = useState<boolean>(false);

  // Drag and drop border state
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Refs for printing
  const iframeARef = useRef<HTMLIFrameElement>(null);
  const iframeBRef = useRef<HTMLIFrameElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Toast state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Clean up Blob URLs on unmount
  useEffect(() => {
    return () => {
      if (blobUrlA) URL.revokeObjectURL(blobUrlA);
      if (blobUrlB) URL.revokeObjectURL(blobUrlB);
    };
  }, [blobUrlA, blobUrlB]);

  // Handle toast notifications
  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 5000);
  };

  // Process PDF when file or settings change
  useEffect(() => {
    if (!arrayBuffer) return;

    const runProcess = async () => {
      setIsProcessing(true);
      setError(null);
      try {
        const result = await splitPdf(arrayBuffer, reverseEven, rotateEven);
        setProcessedData(result);

        // Generate and set Blob URLs (casting to any to satisfy DOM BlobPart typing)
        const blobA = new Blob([result.sideABytes as any], { type: 'application/pdf' });
        const blobB = new Blob([result.sideBBytes as any], { type: 'application/pdf' });

        // Clean up previous blob URLs
        if (blobUrlA) URL.revokeObjectURL(blobUrlA);
        if (blobUrlB) URL.revokeObjectURL(blobUrlB);

        setBlobUrlA(URL.createObjectURL(blobA));
        setBlobUrlB(URL.createObjectURL(blobB));
      } catch (err: any) {
        setError(err.message || 'Failed to process PDF file.');
        showToast(err.message || 'Failed to process PDF file.');
      } finally {
        setIsProcessing(false);
      }
    };

    runProcess();
  }, [arrayBuffer, reverseEven, rotateEven]);

  // Handle file uploads
  const handleFile = async (selectedFile: File) => {
    if (!selectedFile.name.toLowerCase().endsWith('.pdf')) {
      showToast('Error: Only PDF documents are supported.');
      return;
    }

    setError(null);
    setIsProcessing(true);
    setFlippedSheets({});

    try {
      const buffer = await selectedFile.arrayBuffer();
      // Test parse to verify it is valid
      const sizeMB = (selectedFile.size / (1024 * 1024)).toFixed(1);

      setFile(selectedFile);
      setFileMeta({
        name: selectedFile.name,
        sizeMB,
        pages: 0 // Will be set by effect splitting
      });
      setArrayBuffer(buffer);
    } catch (err: any) {
      setError('Could not read PDF. File may be corrupted or unreadable.');
      showToast('Could not read PDF. File may be corrupted.');
      setIsProcessing(false);
    }
  };

  // Sync page counts returned from engine
  useEffect(() => {
    if (processedData && fileMeta && fileMeta.pages === 0) {
      // Calculate total original pages
      // Front page count is odd pages. Back page count matches except when we pad a blank.
      const originalPages = processedData.sideAPages.length +
        processedData.sideBPages.filter(p => p !== 'Blank').length;

      setFileMeta(prev => prev ? { ...prev, pages: originalPages } : null);
    }
  }, [processedData]);

  // Reset application state
  const handleReset = () => {
    setFile(null);
    setFileMeta(null);
    setArrayBuffer(null);
    setProcessedData(null);
    setFlippedSheets({});
    setError(null);
    setCheckADone(false);
    setCheckFlipped(false);
    setReverseEven(true);
    setRotateEven(false);

    if (blobUrlA) URL.revokeObjectURL(blobUrlA);
    if (blobUrlB) URL.revokeObjectURL(blobUrlB);
    setBlobUrlA('');
    setBlobUrlB('');

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // PDF direct printing triggers
  const handlePrint = (side: 'a' | 'b') => {
    const iframe = side === 'a' ? iframeARef.current : iframeBRef.current;
    const blobUrl = side === 'a' ? blobUrlA : blobUrlB;

    if (!iframe || !blobUrl) {
      showToast('Print target is not ready yet.');
      return;
    }

    iframe.src = blobUrl;
    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        showToast('Browser blocked automatic print dialog. Downloading PDF instead.');
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `print_side_${side.toUpperCase()}.pdf`;
        link.click();
      }
    };
  };

  const toggleSheetFlip = (sheetNum: number) => {
    setFlippedSheets(prev => ({
      ...prev,
      [sheetNum]: !prev[sheetNum]
    }));
  };

  return (
    <div className="app-root">
      {/* Global suite navigation header */}
      <header className="main-navbar">
        <div className="navbar-container">
          <div className="navbar-left">
            <img src={frisscoEssentialsLogo} alt="Frissco Essentials" className="brand-logo" />
            <span className="navbar-divider">/</span>
            <div className="module-badge">
              <span className="module-name">Duplify</span>
              <span className="module-pill">PRINT MODULE</span>
            </div>
          </div>
        </div>
      </header>

      <div className="container">
        {/* Module Title Section */}
        <div className="page-header">
          <h1>Duplex Printing Manager</h1>
          <p className="subtitle">Process and split PDF files for double-sided manual printing effortlessly</p>
        </div>

        {error && (
          <div className="card error-card">
            <p className="error-message">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V15H13V17ZM13 13H11V7H13V13Z" fill="currentColor" />
              </svg>
              {error}
            </p>
          </div>
        )}

        <main className="app-grid">
          {/* Left Panel: Stepper & Controls */}
          <div className="panel-left">

            {/* Upload Step */}
            <div className="card card-upload" id="upload-card">
              <div className="card-header">
                <h2>1. Upload PDF Document</h2>
              </div>

              {!file ? (
                <div
                  className={`drag-drop-zone ${isDragOver ? 'dragover' : ''}`}
                  id="drop-zone"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOver(false);
                    if (e.dataTransfer.files.length) {
                      handleFile(e.dataTransfer.files[0]);
                    }
                  }}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => {
                      if (e.target.files?.length) {
                        handleFile(e.target.files[0]);
                      }
                    }}
                    accept=".pdf"
                    style={{ display: 'none' }}
                  />
                  <div className="upload-icon">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4C9.11 4 6.6 5.64 5.35 8.04C2.34 8.36 0 10.91 0 14C0 17.31 2.69 20 6 20H19C21.76 20 24 17.76 24 15C24 12.36 21.95 10.22 19.35 10.04ZM19 18H6C3.79 18 2 16.21 2 14C2 11.95 3.53 10.24 5.56 10.03L6.63 9.92L7.13 8.97C8.08 7.14 9.94 6 12 6C14.89 6 17.39 8.01 17.85 10.85L18.09 12.32L19.61 12.43C21.01 12.53 22 13.68 22 15C22 16.65 20.65 18 19 18ZM8 13H10.55V16H13.45V13H16L12 9L8 13Z" fill="currentColor" />
                    </svg>
                  </div>
                  <p className="drag-text">Drag and drop your PDF here, or <span className="browse-link">browse files</span></p>
                  <p className="file-limits">Supports documents up to 50MB</p>
                </div>
              ) : null}

              {isProcessing && !processedData && (
                <div className="progress-container">
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: '100%' }}></div>
                  </div>
                  <div className="progress-status">
                    <span>Analyzing pages and preparing duplex sheets...</span>
                  </div>
                </div>
              )}

              {file && fileMeta && (
                <div className="file-info" id="file-info-container">
                  <div className="file-details">
                    <svg className="file-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M14 2H6C4.9 2 4.01 2.9 4.01 4L4 20C4 21.1 4.89 22 5.99 22H18C19.1 22 20 21.1 20 20V8L14 2ZM16 18H8V16H16V18ZM16 14H8V12H16V14ZM13 9V3.5L18.5 9H13Z" fill="currentColor" />
                    </svg>
                    <div>
                      <p className="file-name">{fileMeta.name}</p>
                      <p className="file-meta">
                        {fileMeta.sizeMB} MB • {fileMeta.pages || 'Counting...'} pages
                      </p>
                    </div>
                  </div>
                  <button className="btn-change-file" onClick={handleReset}>
                    Change File
                  </button>
                </div>
              )}
            </div>

            {/* Settings Card */}
            <div className={`card card-settings ${!file ? 'disabled' : ''}`}>
              <div className="card-header">
                <h2>2. Configuration</h2>
              </div>
              <div className="card-body">
                <div className="setting-group">
                  <label className="setting-label">Back Page Layout Order (Side B)</label>
                  <div className="radio-cards">
                    <label className="radio-card">
                      <input
                        type="radio"
                        name="reverse_even"
                        checked={reverseEven}
                        onChange={() => setReverseEven(true)}
                      />
                      <div className="radio-content">
                        <div className="radio-header">
                          <span className="radio-title">Reverse Order</span>
                          <span className="badge badge-rec">Recommended</span>
                        </div>
                        <span className="radio-desc">
                          Prints backs reversed (e.g. 10, 8, 6...). Best for face-up output trays. Flip and feed stack directly.
                        </span>
                      </div>
                    </label>
                    <label className="radio-card">
                      <input
                        type="radio"
                        name="reverse_even"
                        checked={!reverseEven}
                        onChange={() => setReverseEven(false)}
                      />
                      <div className="radio-content">
                        <span className="radio-title">Normal Order</span>
                        <span className="radio-desc">
                          Prints backs normally (e.g. 2, 4, 6...). Best if you manually reverse the stack or have face-down trays.
                        </span>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="setting-group">
                  <div className="toggle-control">
                    <div>
                      <label className="setting-label" htmlFor="rotate-even-toggle">Rotate Back Pages 180°</label>
                      <p className="setting-hint">Flip orientation if back sides print upside down relative to fronts.</p>
                    </div>
                    <label className="switch">
                      <input
                        type="checkbox"
                        id="rotate-even-toggle"
                        checked={rotateEven}
                        onChange={(e) => setRotateEven(e.target.checked)}
                      />
                      <span className="slider"></span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Stepper Card */}
            <div className={`card card-wizard ${!file ? 'disabled' : ''}`}>
              <div className="card-header">
                <h2>3. Print Steps</h2>
              </div>

              <div className="stepper">
                {/* Step A: Print fronts */}
                <div className={`step-item ${file && !checkADone ? 'active' : ''} ${checkADone ? 'done' : ''}`}>
                  <div className="step-indicator" onClick={() => setCheckADone(false)}>
                    <div className="step-num">A</div>
                    <div className="step-title">Print Side A (Fronts)</div>
                  </div>
                  <div className="step-content">
                    <p>Load blank paper and print all odd-numbered front pages.</p>
                    <div className="action-row">
                      <button
                        className="btn btn-primary"
                        onClick={() => handlePrint('a')}
                        disabled={isProcessing}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="6 9 6 2 18 2 18 9"></polyline>
                          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                          <rect x="6" y="14" width="12" height="8"></rect>
                        </svg>
                        Print Side A
                      </button>
                      <a
                        className="btn btn-secondary"
                        href={blobUrlA || '#'}
                        download="print_side_A.pdf"
                        onClick={(e) => {
                          if (!blobUrlA) e.preventDefault();
                        }}
                      >
                        Download PDF
                      </a>
                    </div>
                    <label className="checkbox-container">
                      <input
                        type="checkbox"
                        checked={checkADone}
                        onChange={(e) => {
                          setCheckADone(e.target.checked);
                          if (!e.target.checked) {
                            setCheckFlipped(false);
                          }
                        }}
                      />
                      <span className="checkbox-checkmark"></span>
                      Side A printed successfully
                    </label>
                  </div>
                </div>

                {/* Step B: Flip guides */}
                <div className={`step-item ${checkADone && !checkFlipped ? 'active' : ''} ${checkFlipped ? 'done' : ''}`}>
                  <div className="step-indicator" onClick={() => {
                    if (checkADone) setCheckFlipped(false);
                  }}>
                    <div className="step-num">B</div>
                    <div className="step-title">Flip & Reload Stack</div>
                  </div>
                  <div className="step-content">
                    <p>Retrieve the printed sheets, flip them, and reload them into your printer's input tray.</p>

                    <div className="flip-animation-container">
                      <div className="flip-animation-box">
                        <div className="animated-page">
                          <div className="page-side face-front">Odd Side</div>
                          <div className="page-side face-back">Even Side</div>
                        </div>
                      </div>
                      <div className="flip-guide-text">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--color-warning)', marginTop: '2px' }}>
                          <circle cx="12" cy="12" r="10"></circle>
                          <line x1="12" y1="8" x2="12" y2="12"></line>
                          <line x1="12" y1="16" x2="12.01" y2="16"></line>
                        </svg>
                        <span>Flip sheets along the <strong>long edge</strong> so the blank side is ready to receive prints. Maintain correct heading alignment.</span>
                      </div>
                    </div>

                    <label className="checkbox-container">
                      <input
                        type="checkbox"
                        checked={checkFlipped}
                        disabled={!checkADone}
                        onChange={(e) => setCheckFlipped(e.target.checked)}
                      />
                      <span className="checkbox-checkmark"></span>
                      Stack is flipped & reloaded
                    </label>
                  </div>
                </div>

                {/* Step C: Print backs */}
                <div className={`step-item ${checkFlipped ? 'active' : ''}`}>
                  <div className="step-indicator">
                    <div className="step-num">C</div>
                    <div className="step-title">Print Side B (Backs)</div>
                  </div>
                  <div className="step-content">
                    <p>Print the back sides. The pages will be printed in order matching your config settings.</p>
                    <div className="action-row">
                      <button
                        className="btn btn-primary"
                        onClick={() => handlePrint('b')}
                        disabled={isProcessing}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="6 9 6 2 18 2 18 9"></polyline>
                          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                          <rect x="6" y="14" width="12" height="8"></rect>
                        </svg>
                        Print Side B
                      </button>
                      <a
                        className="btn btn-secondary"
                        href={blobUrlB || '#'}
                        download="print_side_B.pdf"
                        onClick={(e) => {
                          if (!blobUrlB) e.preventDefault();
                        }}
                      >
                        Download PDF
                      </a>
                    </div>

                    {checkADone && checkFlipped && (
                      <button className="btn btn-success-finish" onClick={handleReset}>
                        Complete & Reset Utility
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel: Clean Grid Sheet Stack Simulator */}
          <div className="panel-right">
            <div className="card card-simulator">
              <div className="card-header flex-header">
                <h2>Sheet Layout Inspector</h2>
                <span className="sheets-badge">
                  {processedData ? processedData.totalSheets : 0} {processedData?.totalSheets === 1 ? 'Sheet' : 'Sheets'}
                </span>
              </div>
              <div className="card-body centered-body">
                {!processedData ? (
                  <div className="preview-placeholder">
                    <div className="doc-icon">
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                      </svg>
                    </div>
                    <h3>No Document Active</h3>
                    <p>Upload a PDF document to preview sheet-by-sheet mapping of fronts and backs.</p>
                  </div>
                ) : (
                  <div className="simulator-view">
                    <p className="inspector-hint">Click individual sheets below to test flip and review alignment.</p>

                    <div className="sheets-grid">
                      {processedData.sheetsPreview.map((sheet) => {
                        const isFlipped = !!flippedSheets[sheet.sheetNum];

                        return (
                          <div
                            key={sheet.sheetNum}
                            className={`grid-sheet-card ${isFlipped ? 'flipped' : ''}`}
                            onClick={() => toggleSheetFlip(sheet.sheetNum)}
                            title="Click to flip sheet"
                          >
                            <div className="grid-sheet-inner">
                              {/* Front side view */}
                              <div className="grid-sheet-front">
                                <div className="sheet-card-header">
                                  <span className="sheet-badge-pill">Sheet {sheet.sheetNum}</span>
                                  <span className="side-label">Front</span>
                                </div>
                                <div className="sheet-card-page">
                                  <span className="page-number">{sheet.front}</span>
                                  <span className="page-desc">Odd Page</span>
                                </div>
                                <div className="sheet-card-footer">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                                  </svg>
                                  <span>Tap to Flip</span>
                                </div>
                              </div>

                              {/* Back side view */}
                              <div className={`grid-sheet-back ${sheet.back === 'Blank' ? 'blank-page' : ''} ${rotateEven ? 'rotated-back' : ''}`}>
                                <div className="sheet-card-header">
                                  <span className="sheet-badge-pill">Sheet {sheet.sheetNum}</span>
                                  <span className="side-label">Back</span>
                                </div>
                                <div className="sheet-card-page">
                                  <span className="page-number">{sheet.back}</span>
                                  <span className="page-desc">{sheet.back === 'Blank' ? 'Blank Padding' : 'Even Page'}</span>
                                </div>
                                <div className="sheet-card-footer">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                                  </svg>
                                  <span>Tap to Flip</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>

        <footer className="app-footer">
          <div className="footer-content">
            <p className="footer-attribution">
              Developed by{' '}
              <a href="https://www.frissco.net" target="_blank" rel="noopener noreferrer" className="footer-logo-link">
                <img src={frisscoLogo} alt="Frissco Creative Labs" className="footer-logo-img" />
              </a>
            </p>
            <p className="footer-meta">© {new Date().getFullYear()} Frissco Essentials. All rights reserved.</p>
          </div>
        </footer>
      </div>

      {/* Hidden iframes for printing */}
      <iframe ref={iframeARef} style={{ display: 'none' }} title="Print Side A" />
      <iframe ref={iframeBRef} style={{ display: 'none' }} title="Print Side B" />

      {/* Error Toast Notification */}
      {toastMessage && (
        <div id="toast" className="toast">
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
