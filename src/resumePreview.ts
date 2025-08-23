import * as pdfjs from '../js/pdf.mjs';
import {els} from './dom';
import {toggle} from './view';

pdfjs.GlobalWorkerOptions.workerSrc = './pdf.worker.mjs';

let currentPdf: pdfjs.PDFDocumentProxy | null = null;
let currentScale = 0.9;
const MIN_SCALE = 0.3;
const MAX_SCALE = 3.0;
const SCALE_STEP = 0.2;

export async function renderPdfPreview(buffer: ArrayBuffer) {
    currentPdf = await pdfjs.getDocument(buffer).promise;
    await renderPdfAtScale(currentScale);
    setupZoomButtons();
    toggle(els.resumePreviewContainer, true);
}

async function renderPdfAtScale(scale: number) {
    if (!currentPdf) return;

    els.resumePreviewContainer.innerHTML = '';
    if (els.zoomControls) {
        els.resumePreviewContainer.appendChild(els.zoomControls);
    }

    for (let i = 1; i <= currentPdf.numPages; i++) {
        const page = await currentPdf.getPage(i);
        const viewport = page.getViewport({scale});
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        canvas.className = 'block mx-auto mb-4 shadow-lg';
        await page.render({canvasContext: ctx, viewport}).promise;
        els.resumePreviewContainer.appendChild(canvas);
    }
}

function setupZoomButtons() {
    // Get zoom buttons by their IDs from the HTML
    if (!els.zoomInBtn || !els.zoomOutBtn) {
        console.warn('Zoom buttons not found');
        return;
    }

    // Add event listeners
    els.zoomInBtn.addEventListener('click', () => zoomIn());
    els.zoomOutBtn.addEventListener('click', () => zoomOut());

    // Update button states
    updateZoomButtonStates();
}

async function zoomIn() {
    if (currentScale < MAX_SCALE) {
        currentScale = Math.min(currentScale + SCALE_STEP, MAX_SCALE);
        await renderPdfAtScale(currentScale);
        updateZoomButtonStates();
    }
}

async function zoomOut() {
    if (currentScale > MIN_SCALE) {
        currentScale = Math.max(currentScale - SCALE_STEP, MIN_SCALE);
        await renderPdfAtScale(currentScale);
        updateZoomButtonStates();
    }
}

function updateZoomButtonStates() {
    // Update zoom in button
    if (currentScale >= MAX_SCALE) {
        els.zoomInBtn.classList.add('opacity-50', 'cursor-not-allowed');
        els.zoomInBtn.classList.remove('hover:bg-gray-50');
    } else {
        els.zoomInBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        els.zoomInBtn.classList.add('hover:bg-gray-50');
    }

    // Update zoom out button
    if (currentScale <= MIN_SCALE) {
        els.zoomOutBtn.classList.add('opacity-50', 'cursor-not-allowed');
        els.zoomOutBtn.classList.remove('hover:bg-gray-50');
    } else {
        els.zoomOutBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        els.zoomOutBtn.classList.add('hover:bg-gray-50');
    }
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}