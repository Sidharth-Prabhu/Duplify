import { useState, useRef, useEffect } from 'react';
import { splitPdf, type ProcessedPDFResult } from './utils/pdfProcessor';
import frisscoLogo from './assets/frissco.png';

export default function App() {
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
    <div>
      <div className="glow-bg"></div>

      <div className="container">
        {/* Header */}
        <header className="app-header">
          <div className="logo">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M17 17H7V15H17V17ZM17 13H7V11H17V13ZM17 9H7V7H17V9ZM19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3ZM19 19H5V5H19V19Z" fill="currentColor" />
            </svg>
            <span>Duplify</span>
          </div>
          <h1>Duplex Printing Manager</h1>
          <p className="subtitle">Process PDF files for double-sided manual printing effortlessly</p>
        </header>

        {error && (
          <div className="card" style={{ borderColor: 'var(--color-danger)', backgroundColor: 'rgba(239, 68, 68, 0.05)', color: 'var(--color-danger)', padding: '16px', marginBottom: '24px' }}>
            <p style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4C9.11 4 6.6 5.64 5.35 8.04C2.34 8.36 0 10.91 0 14C0 17.31 2.69 20 6 20H19C21.76 20 24 17.76 24 15C24 12.36 21.95 10.22 19.35 10.04ZM19 18H6C3.79 18 2 16.21 2 14C2 11.95 3.53 10.24 5.56 10.03L6.63 9.92L7.13 8.97C8.08 7.14 9.94 6 12 6C14.89 6 17.39 8.01 17.85 10.85L18.09 12.32L19.61 12.43C21.01 12.53 22 13.68 22 15C22 16.65 20.65 18 19 18ZM8 13H10.55V16H13.45V13H16L12 9L8 13Z" fill="currentColor" />
                    </svg>
                  </div>
                  <p className="drag-text">Drag and drop your PDF here, or <span className="browse-link">browse</span></p>
                  <p className="file-limits">Max file size: 50MB</p>
                </div>
              ) : null}

              {isProcessing && !processedData && (
                <div className="progress-container">
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: '100%' }}></div>
                  </div>
                  <div className="progress-status">
                    <span>Reading and processing PDF data...</span>
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
                  <button className="btn-text" onClick={handleReset}>
                    Change File
                  </button>
                </div>
              )}
            </div>

            {/* Settings Card */}
            <div className={`card card-settings ${!file ? 'disabled' : ''}`}>
              <div className="card-header">
                <h2>2. Duplex Configuration</h2>
              </div>
              <div className="card-body">
                <div className="setting-group">
                  <label className="setting-label">Even Page Printing Order (Side B)</label>
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
                          Prints back pages in reverse (e.g. 10, 8, 6...). Perfect for printers that output pages face-up. Flip the stack as-is and reload.
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
                          Prints back pages in normal order (e.g. 2, 4, 6...). Use if you manually reverse the stack before reloading, or for face-down output.
                        </span>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="setting-group">
                  <div className="toggle-control">
                    <div>
                      <label className="setting-label" htmlFor="rotate-even-toggle">Rotate Back Pages 180°</label>
                      <p className="setting-hint">Flip orientation if your printer prints back sides upside down.</p>
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
                <h2>3. Manual Duplex Stepper</h2>
              </div>

              <div className="stepper">
                {/* Step A: Print fronts */}
                <div className={`step-item ${file && !checkADone ? 'active' : ''} ${checkADone ? 'done' : ''}`}>
                  <div className="step-indicator" onClick={() => setCheckADone(false)}>
                    <div className="step-num">A</div>
                    <div className="step-title">Print Side A (Fronts)</div>
                  </div>
                  <div className="step-content">
                    <p>Generate and print the front (odd) pages of your document.</p>
                    <div className="action-row">
                      <button
                        className="btn btn-primary"
                        onClick={() => handlePrint('a')}
                        disabled={isProcessing}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M19 8H5C3.34 8 2 9.34 2 11V17H6V21H18V17H22V11C22 9.34 20.66 8 19 8ZM16 19H8V15H16V19ZM19 12C18.45 12 18 11.55 18 11C18 10.45 18.45 10 19 10C19.55 10 20 10.45 20 11C20 11.55 19.55 12 19 12ZM18 3H6V7H18V3Z" fill="currentColor" />
                        </svg>
                        Print Side A (Odd Pages)
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
                      I have printed Side A successfully
                    </label>
                  </div>
                </div>

                {/* Step B: Flip guides */}
                <div className={`step-item ${checkADone && !checkFlipped ? 'active' : ''} ${checkFlipped ? 'done' : ''}`}>
                  <div className="step-indicator" onClick={() => {
                    if (checkADone) setCheckFlipped(false);
                  }}>
                    <div className="step-num">B</div>
                    <div className="step-title">Flip & Reload Paper</div>
                  </div>
                  <div className="step-content">
                    <p>Take the printed sheets from the output tray, flip them, and reload them into the input tray.</p>

                    <div className="flip-animation-container">
                      <div className="flip-animation-box">
                        <div className="animated-page">
                          <div className="page-side face-front">Odd Side</div>
                          <div className="page-side face-back">Even Side</div>
                        </div>
                      </div>
                      <div className="flip-guide-text">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ color: 'var(--color-warning)' }}>
                          <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V15H13V17ZM13 13H11V7H13V13Z" fill="currentColor" />
                        </svg>
                        <span>Flip sheets along the <strong>long edge</strong> so the blank sides are ready to print. Keep the top of pages facing inside the printer.</span>
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
                      Paper stack is reloaded
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
                    <p>Generate and print the back (even) pages in the matching order.</p>
                    <div className="action-row">
                      <button
                        className="btn btn-primary"
                        onClick={() => handlePrint('b')}
                        disabled={isProcessing}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M19 8H5C3.34 8 2 9.34 2 11V17H6V21H18V17H22V11C22 9.34 20.66 8 19 8ZM16 19H8V15H16V19ZM19 12C18.45 12 18 11.55 18 11C18 10.45 18.45 10 19 10C19.55 10 20 10.45 20 11C20 11.55 19.55 12 19 12ZM18 3H6V7H18V3Z" fill="currentColor" />
                        </svg>
                        Print Side B (Even Pages)
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
                      <button className="btn btn-outline-success" onClick={handleReset}>
                        Done! Reset Printer Utility
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel: Live Visual Simulation */}
          <div className="panel-right">
            <div className="card card-simulator">
              <div className="card-header flex-header">
                <h2>Live Sheet Stack Preview</h2>
                <span className="sheets-badge">
                  {processedData ? processedData.totalSheets : 0} {processedData?.totalSheets === 1 ? 'Sheet' : 'Sheets'}
                </span>
              </div>
              <div className="card-body centered-body">
                {!processedData ? (
                  <div className="preview-placeholder">
                    <div className="doc-icon">
                      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2ZM13 9V3.5L18.5 9H13Z" fill="currentColor" />
                      </svg>
                    </div>
                    <h3>Waiting for Document Upload</h3>
                    <p>Once you upload a PDF file, you will be able to see the interactive front/back printing layout here.</p>
                  </div>
                ) : (
                  <div className="simulator-view">
                    <div className="simulator-controls">
                      <span className="tip-text">Hover or click a sheet to flip it and verify pages!</span>
                    </div>

                    <div className="sheet-stack-container">
                      {processedData.sheetsPreview.map((sheet, idx) => {
                        const isFlipped = !!flippedSheets[sheet.sheetNum];

                        // Calculate offset stacking translations for realistic overlap look
                        const zTranslate = idx * 6;
                        const yTranslate = idx * -4;
                        const xTranslate = idx % 2 === 0 ? 1 : -1;

                        const baseTransform = `translateZ(${zTranslate}px) rotateX(15deg) translateY(${yTranslate}px) translateX(${xTranslate}px)`;

                        return (
                          <div
                            key={sheet.sheetNum}
                            className={`virtual-sheet ${rotateEven ? 'rotate-back' : ''} ${isFlipped ? 'flipped' : ''}`}
                            style={{
                              zIndex: isFlipped ? 100 : idx + 1,
                              transform: isFlipped
                                ? `translateZ(60px) rotateX(0deg) rotateY(180deg)`
                                : baseTransform
                            }}
                            onClick={() => toggleSheetFlip(sheet.sheetNum)}
                          >
                            {/* Front Side (Odd Page) */}
                            <div className="sheet-face sheet-face-front">
                              <div className="sheet-header">
                                <span>Sheet {sheet.sheetNum}</span>
                                <span>Front</span>
                              </div>
                              <div className="sheet-body">
                                <span className="sheet-page-label">{sheet.front}</span>
                                <span className="sheet-page-indicator">Front Side</span>
                              </div>
                              <div className="sheet-footer">Duplex Print</div>
                            </div>

                            {/* Back Side (Even Page / Blank) */}
                            <div className={`sheet-face sheet-face-back ${sheet.back === 'Blank' ? 'blank-page' : ''}`}>
                              <div className="sheet-header">
                                <span>Sheet {sheet.sheetNum}</span>
                                <span>Back</span>
                              </div>
                              <div className="sheet-body">
                                <span className="sheet-page-label">{sheet.back}</span>
                                <span className="sheet-page-indicator">
                                  {sheet.back === 'Blank' ? 'Blank' : 'Back Side'}
                                </span>
                              </div>
                              <div className="sheet-footer">Duplex Print</div>
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
          <p>Developed by <a href="https://frissco.net" target="_blank" rel="noopener noreferrer"><img src={frisscoLogo} alt="Frissco Creative Labs" className="footer-logo" /></a></p>
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
