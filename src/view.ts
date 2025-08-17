import {els} from './dom';

const allSections = [
    els.apiKeySection, els.userDetailsSection, els.instructionDisplay, els.markdownOutputSection,
    els.loadingSpinnerSection, els.settingsView, els.resumePreviewContainer, els.coverLetterWarning
];

export function hideAll() {
    for (const el of allSections) el.classList.add('hidden');
    [
        els.backBtn, els.tailorResumeBtn, els.generateCoverLetterBtn, els.downloadCoverLetterBtn,
        els.retryBtn, els.markdownContent, els.coverLetterTextarea, els.coverLetterTextareaTitle,
        els.settingsBtn, els.downloadTailoredResumeBtn
    ].forEach(el => el.classList.add('hidden'));
}

export function toggle(el: HTMLElement, visible: boolean) {
    el.classList[visible ? 'remove' : 'add']('hidden');
}

export function setHTML(el: HTMLElement, html: string) {
    el.innerHTML = html;
}

export function showLoading(message = 'Processing...', hideEverything: boolean = true) {
    if (hideEverything) {
        hideAll();
    }
    els.loadingSpinnerTitle.innerHTML = message;
    toggle(els.loadingSpinnerSection, true);
    toggle(els.backBtn, true);
}
