import * as pdfjs from './pdf.mjs';
import {els} from './dom';
import {toggle} from './view';

pdfjs.GlobalWorkerOptions.workerSrc = './pdf.worker.mjs';

// todo: add zoom buttons
export async function renderPdfPreview(buffer: ArrayBuffer) {
    const pdf = await pdfjs.getDocument(buffer).promise;
    els.resumePreviewContainer.innerHTML = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const scale = 0.9;
        const viewport = page.getViewport({scale});
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await page.render({canvasContext: ctx, viewport}).promise;
        els.resumePreviewContainer.appendChild(canvas);
    }
    toggle(els.resumePreviewContainer, true);
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
