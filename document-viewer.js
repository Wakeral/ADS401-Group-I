(() => {
  'use strict';

  const root = document.documentElement;
  const dialog = document.createElement('dialog');
  dialog.className = 'document-dialog';
  dialog.setAttribute('aria-labelledby', 'document-dialog-title');
  dialog.innerHTML = `
    <header class="document-dialog-toolbar">
      <h2 id="document-dialog-title"></h2>
      <div class="document-dialog-actions">
        <a class="document-original-link" target="_blank" rel="noopener noreferrer">Open original</a>
        <a class="document-download-link" download hidden>Download PDF</a>
        <button class="document-close" type="button" aria-label="Close preview">
          <span aria-hidden="true">×</span><span>Close</span>
        </button>
      </div>
    </header>
    <p class="document-preview-status" role="status" aria-live="polite"></p>
    <div class="document-preview-host"></div>`;
  document.body.append(dialog);

  const title = dialog.querySelector('#document-dialog-title');
  const original = dialog.querySelector('.document-original-link');
  const download = dialog.querySelector('.document-download-link');
  const closeButton = dialog.querySelector('.document-close');
  const status = dialog.querySelector('.document-preview-status');
  const host = dialog.querySelector('.document-preview-host');
  let returnFocus = null;
  let activeKind = null;
  let activePdf = null;
  let pdfModulePromise = null;

  const pdfIsCurrent = (session) => activePdf === session && !session.cancelled && dialog.open;
  const clearPdfCanvas = (record) => {
    if (!record.canvas) return;
    record.canvas.width = 0;
    record.canvas.height = 0;
    record.canvas.remove();
    record.canvas = null;
    record.renderedGeneration = 0;
  };
  const stopPdf = () => {
    const session = activePdf;
    activePdf = null;
    if (!session) return;
    session.cancelled = true;
    session.observer?.disconnect();
    session.resizeObserver?.disconnect();
    cancelAnimationFrame(session.layoutFrame);
    cancelAnimationFrame(session.queueFrame);
    cancelAnimationFrame(session.scrollFrame);
    session.records.forEach((record) => {
      record.task?.cancel();
      clearPdfCanvas(record);
    });
    session.loadingTask?.destroy().catch(() => {});
  };

  const openPdf = async (url) => {
    const pane = document.createElement('div');
    pane.className = 'document-pdf-pane';
    pane.innerHTML = `
      <div class="document-pdf-controls">
        <span class="document-pdf-counter">PDF</span>
        <div class="document-pdf-zoom">
          <button type="button" aria-label="Zoom out" disabled>−</button>
          <output aria-label="Zoom level">100%</output>
          <button type="button" aria-label="Zoom in" disabled>+</button>
          <button class="document-pdf-fit" type="button" disabled>Fit width</button>
        </div>
      </div>
      <div class="document-pdf-scroll" tabindex="0" role="region" aria-label="PDF document pages"></div>`;
    host.append(pane);
    const scroller = pane.querySelector('.document-pdf-scroll');
    const counter = pane.querySelector('.document-pdf-counter');
    const [zoomOut, zoomIn, fitWidth] = pane.querySelectorAll('button');
    const zoomLevel = pane.querySelector('output');
    const session = {
      cancelled: false, records: [], generation: 0, processing: false,
      zoom: 1, loadingTask: null, firstRendered: false, laidOut: false,
    };
    activePdf = session;

    const availableWidth = () => {
      const padding = getComputedStyle(scroller);
      return Math.max(120, scroller.clientWidth - parseFloat(padding.paddingLeft)
        - parseFloat(padding.paddingRight) - 2);
    };
    const updateCounter = () => {
      if (!pdfIsCurrent(session) || !session.records.length) return;
      const top = scroller.getBoundingClientRect().top + Math.min(80, scroller.clientHeight / 3);
      const current = session.records.find((record) => record.figure.getBoundingClientRect().bottom > top)
        || session.records[session.records.length - 1];
      counter.textContent = `Page ${current.number} / ${session.records.length}`;
    };
    const requestPaint = () => {
      if (!pdfIsCurrent(session) || session.queueFrame) return;
      session.queueFrame = requestAnimationFrame(() => {
        session.queueFrame = null;
        paintNearbyPages();
      });
    };
    const paintNearbyPages = async () => {
      if (session.processing || !pdfIsCurrent(session)) return;
      session.processing = true;
      try {
        while (pdfIsCurrent(session)) {
          const record = session.records.find((item) => item.near
            && item.renderedGeneration !== session.generation
            && item.failedGeneration !== session.generation);
          if (!record) break;
          const generation = session.generation;
          let task;
          try {
            record.page ||= await session.pdf.getPage(record.number);
            if (!pdfIsCurrent(session) || !record.near || generation !== session.generation) continue;
            const base = record.page.getViewport({ scale: 1 });
            const viewport = record.page.getViewport({ scale: availableWidth() / base.width * session.zoom });
            record.figure.style.width = `${viewport.width}px`;
            record.sheet.style.height = `${viewport.height}px`;
            clearPdfCanvas(record);
            const canvas = document.createElement('canvas');
            const density = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.ceil(viewport.width * density);
            canvas.height = Math.ceil(viewport.height * density);
            canvas.setAttribute('role', 'img');
            canvas.setAttribute('aria-label', `${title.textContent}, page ${record.number} of ${session.records.length}`);
            record.canvas = canvas;
            record.sheet.replaceChildren(canvas);
            task = record.page.render({
              canvas, viewport,
              transform: density === 1 ? null : [density, 0, 0, density, 0, 0],
            });
            record.task = task;
            await task.promise;
            if (!pdfIsCurrent(session) || !record.near || generation !== session.generation) continue;
            record.renderedGeneration = generation;
            record.sheet.classList.add('is-rendered');
            if (!session.firstRendered) {
              session.firstRendered = true;
              status.textContent = `${session.records.length} ${session.records.length === 1 ? 'page' : 'pages'} · Scroll to read the document.`;
            }
          } catch (error) {
            if (!pdfIsCurrent(session)) break;
            if (error?.name !== 'RenderingCancelledException') {
              record.failedGeneration = generation;
              status.textContent = 'A page could not be displayed. Use Open original or Download PDF if needed.';
            }
          } finally {
            if (record.task === task) record.task = null;
            if (!pdfIsCurrent(session) || !record.near || generation !== session.generation) {
              clearPdfCanvas(record);
            }
          }
        }
      } finally {
        session.processing = false;
        if (pdfIsCurrent(session) && session.records.some((record) => record.near
          && record.renderedGeneration !== session.generation
          && record.failedGeneration !== session.generation)) requestPaint();
      }
    };
    const layoutPages = () => {
      if (!pdfIsCurrent(session) || !session.records.length) return;
      const center = (scroller.scrollTop + scroller.clientHeight / 2) / Math.max(1, scroller.scrollHeight);
      session.generation += 1;
      const width = availableWidth();
      session.records.forEach((record) => {
        record.task?.cancel();
        const base = record.page?.getViewport({ scale: 1 }) || session.firstViewport;
        const scale = width / base.width * session.zoom;
        record.figure.style.width = `${base.width * scale}px`;
        record.sheet.style.height = `${base.height * scale}px`;
        record.failedGeneration = 0;
      });
      if (session.laidOut) scroller.scrollTop = center * scroller.scrollHeight - scroller.clientHeight / 2;
      session.laidOut = true;
      zoomLevel.textContent = `${Math.round(session.zoom * 100)}%`;
      zoomOut.disabled = session.zoom <= 0.5;
      zoomIn.disabled = session.zoom >= 2;
      fitWidth.disabled = false;
      updateCounter();
      requestPaint();
    };
    const setZoom = (value) => {
      session.zoom = Math.max(0.5, Math.min(2, value));
      layoutPages();
    };
    zoomOut.addEventListener('click', () => setZoom(session.zoom - 0.25));
    zoomIn.addEventListener('click', () => setZoom(session.zoom + 0.25));
    fitWidth.addEventListener('click', () => setZoom(1));
    scroller.addEventListener('scroll', () => {
      if (session.scrollFrame) return;
      session.scrollFrame = requestAnimationFrame(() => {
        session.scrollFrame = null;
        updateCounter();
      });
    }, { passive: true });

    try {
      const base = new URL('vendor/pdfjs/', document.baseURI);
      pdfModulePromise ||= import(new URL('pdf.mjs', base).href).catch((error) => {
        pdfModulePromise = null;
        throw error;
      });
      const pdfjs = await pdfModulePromise;
      if (!pdfIsCurrent(session)) return;
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.mjs', base).href;
      session.loadingTask = pdfjs.getDocument({
        url: url.href,
        cMapUrl: new URL('cmaps/', base).href, cMapPacked: true,
        standardFontDataUrl: new URL('standard_fonts/', base).href,
        wasmUrl: new URL('wasm/', base).href,
        iccUrl: new URL('iccs/', base).href,
      });
      session.pdf = await session.loadingTask.promise;
      if (!pdfIsCurrent(session)) return;
      const firstPage = await session.pdf.getPage(1);
      if (!pdfIsCurrent(session)) return;
      session.firstViewport = firstPage.getViewport({ scale: 1 });
      for (let number = 1; number <= session.pdf.numPages; number += 1) {
        const figure = document.createElement('figure');
        figure.className = 'document-pdf-page';
        const caption = document.createElement('figcaption');
        caption.className = 'document-pdf-label';
        caption.textContent = `Page ${number} of ${session.pdf.numPages}`;
        const sheet = document.createElement('div');
        sheet.className = 'document-pdf-sheet';
        figure.append(caption, sheet);
        scroller.append(figure);
        session.records.push({
          number, figure, sheet, page: number === 1 ? firstPage : null,
          near: number === 1, renderedGeneration: 0, failedGeneration: 0,
        });
      }
      layoutPages();
      const byFigure = new Map(session.records.map((record) => [record.figure, record]));
      session.observer = new IntersectionObserver((entries) => {
        if (!pdfIsCurrent(session)) return;
        entries.forEach((entry) => {
          const record = byFigure.get(entry.target);
          record.near = entry.isIntersecting;
          if (!record.near) {
            if (record.task) record.task.cancel();
            else {
              clearPdfCanvas(record);
              record.page?.cleanup();
            }
          }
        });
        requestPaint();
      }, { root: scroller, rootMargin: '600px 300px' });
      session.records.forEach((record) => session.observer.observe(record.figure));
      let previousWidth = scroller.clientWidth;
      session.resizeObserver = new ResizeObserver(() => {
        if (!pdfIsCurrent(session) || Math.abs(scroller.clientWidth - previousWidth) < 1) return;
        previousWidth = scroller.clientWidth;
        if (session.layoutFrame) return;
        session.layoutFrame = requestAnimationFrame(() => {
          session.layoutFrame = null;
          layoutPages();
        });
      });
      session.resizeObserver.observe(scroller);
    } catch {
      if (pdfIsCurrent(session)) {
        status.textContent = 'This PDF could not be loaded. Use Open original or Download PDF.';
        const message = document.createElement('p');
        message.className = 'document-pdf-error';
        message.textContent = 'The PDF preview is unavailable. The original document is still available above.';
        scroller.replaceChildren(message);
      }
    }
  };

  const closePreview = ({ restoreFocus = true } = {}) => {
    if (!restoreFocus) returnFocus = null;
    if (dialog.open) dialog.close();
  };

  const preparePreview = (label, kind, opener) => {
    stopPdf();
    returnFocus = opener || document.activeElement;
    activeKind = kind;
    title.textContent = label;
    dialog.dataset.previewKind = kind;
    host.replaceChildren();
    original.hidden = false;
    download.hidden = kind !== 'pdf';
    root.classList.add('preview-open');
    if (!dialog.open) dialog.showModal();
    closeButton.focus({ preventScroll: true });
  };

  const addFrame = (frame, kind) => {
    frame.className = 'document-preview-frame';
    frame.title = title.textContent;
    frame.referrerPolicy = 'no-referrer';
    frame.addEventListener('load', () => {
      if (host.firstElementChild !== frame || !dialog.open) return;
      if (kind === 'pdf') {
        status.textContent = 'If the PDF does not appear, use Open original or Download PDF.';
      }
      // A successful load event cannot tell us whether an external website
      // allowed framing, so its Open original fallback stays visible.
      try {
        frame.contentDocument?.addEventListener('keydown', (event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          event.stopPropagation();
          closePreview();
        });
      } catch {
        // Cross-origin documents keep their own keyboard handling.
      }
      if (kind === 'presentation') frame.contentWindow.focus();
    });
    host.append(frame);
  };

  const openDocument = (link, url, kind) => {
    const label = link.textContent.replace(/\s+/g, ' ').trim() || 'Document preview';
    preparePreview(label, kind, link);
    original.href = url.href;
    download.href = url.href;
    status.textContent = kind === 'pdf'
      ? 'Loading PDF preview…'
      : 'Some websites do not allow embedded viewing. Use Open original if needed.';
    if (kind === 'pdf' && ['http:', 'https:'].includes(url.protocol) && url.origin === location.origin) {
      openPdf(url);
      return;
    }
    const frame = document.createElement('iframe');
    if (kind === 'website') {
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-downloads');
    }
    frame.src = url.href;
    addFrame(frame, kind);
  };

  const openPresentation = (opener) => {
    if (dialog.open && activeKind === 'presentation') return;
    const source = document.querySelector('#presentation-source');
    if (!source) return;
    let markup;
    try {
      markup = JSON.parse(source.textContent);
    } catch {
      return;
    }
    preparePreview('Presentation 3 — Evaluation Design', 'presentation', opener);
    original.hidden = true;
    original.removeAttribute('href');
    download.removeAttribute('href');
    status.textContent = 'Use the slide buttons or arrow keys to change slides.';
    const frame = document.createElement('iframe');
    // The original slide canvas stays fixed at 1600px before fit() scales it.
    frame.srcdoc = markup.replace('</head>', '<style>#stage{flex-shrink:0}</style></head>');
    addFrame(frame, 'presentation');
  };

  closeButton.addEventListener('click', closePreview);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closePreview();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right
      || event.clientY < bounds.top || event.clientY > bounds.bottom) closePreview();
  });
  dialog.addEventListener('close', () => {
    stopPdf();
    root.classList.remove('preview-open');
    host.replaceChildren();
    activeKind = null;
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    returnFocus = null;
  });

  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey
      || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('.main-content a[href]');
    if (!link || link.hasAttribute('download')) return;
    const href = link.getAttribute('href');
    if (href === '#presentation3') {
      event.preventDefault();
      openPresentation(link);
      return;
    }
    if (!href || href.startsWith('#')) return;
    let url;
    try {
      url = new URL(href, document.baseURI);
    } catch {
      return;
    }
    if (!['http:', 'https:', 'file:'].includes(url.protocol)) return;
    const pdf = /\.pdf$/i.test(url.pathname);
    const external = ['http:', 'https:'].includes(url.protocol) && url.origin !== location.origin;
    if (!pdf && !external) return;
    event.preventDefault();
    openDocument(link, url, pdf ? 'pdf' : 'website');
  });

  const presentationRequest = (event) => openPresentation(event.detail?.opener);
  document.addEventListener('ads401:preview-presentation', presentationRequest);
  window.addEventListener('ads401:preview-presentation', presentationRequest);
  window.addEventListener('popstate', () => closePreview({ restoreFocus: false }));
  window.addEventListener('hashchange', () => closePreview({ restoreFocus: false }));
  window.ads401DocumentPreview = Object.freeze({ openPresentation, close: closePreview });
  window.dispatchEvent(new Event('ads401:preview-ready'));
})();
