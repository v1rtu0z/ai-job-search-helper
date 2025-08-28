import {els} from './dom';

export const allSections = [
    els.apiKeySection, els.userDetailsSection, els.instructionDisplay, els.outputSection,
    els.loadingSpinnerSection, els.settingsView, els.resumePreviewContainer, els.coverLetterWarning,
    els.googleAiConfigSection, els.advancedSettingsToggle, els.backBtn, els.tailorResumeBtn,
    els.generateCoverLetterBtn, els.downloadCoverLetterBtn, els.retryBtn, els.analysisContent,
    els.coverLetterTextarea, els.coverLetterTextareaTitle, els.settingsBtn, els.downloadTailoredResumeBtn,
    els.jobSpecificContextSection, els.resumeRetryFeedbackSection, els.coverLetterRetryFeedbackSection,
    els.retryErrorMessage, els.thisNeedsWorkBtn, els.outputWarning, els.advancedSettingsContent
];

export function hideAll() {
    for (const el of allSections) el.classList.add('hidden');
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
