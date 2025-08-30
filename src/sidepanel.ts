import * as serverComms from "./server-comms";
import {els} from './dom';
import {allSections, hideAll, setHTML, showLoading, toggle} from './view';
import {stateMachine, ViewState} from './state';
import {getUserData, saveUserData, updateJobCache} from './storage';
import {arrayBufferToBase64, base64ToArrayBuffer, renderPdfPreview} from './resumePreview';
import {downloadBlob} from './downloads';
import {loadingRotator} from "./loading-rotator";
import {isFirefox, saveUserSettings, showUserSettings} from "./settings";

import '../backdrop_overlay_style.css';
import {browser} from "webextension-polyfill-ts";

import * as pdfjs from "../js/pdf.mjs";
import {DebugLogger} from "./logging";

// Set PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = "./pdf.worker.mjs";

let abortController: AbortController | null = null;

function abortInFlight() {
    if (abortController) {
        abortController.abort();
        abortController = null;
    }
}

let latestJobId: string;

// Unified retry context that handles all retry scenarios
interface RetryContext {
    operation: 'analyze' | 'cover-letter' | 'resume';
    jobId?: string;
    originalParams?: any;
    // For success screen retries with feedback
    currentContent?: string;
    feedbackElementId?: string; // ID of the textarea for feedback
    requiresFeedback?: boolean; // Whether feedback is required for retry
}

let currentRetryContext: RetryContext | null = null;

const sidepanelLogger = new DebugLogger('sidepanel');

// Unified retry setup that works for both error and success screens
function setupRetryForCurrentView() {
    if (!currentRetryContext) return;

    els.retryBtn = removeAllListeners(els.retryBtn);
    els.retryBtn.addEventListener('click', async () => {
        if (!currentRetryContext) return;

        try {
            // For retries that require feedback, check if feedback is provided
            if (currentRetryContext.requiresFeedback && currentRetryContext.feedbackElementId) {
                const feedbackElement = els[currentRetryContext.feedbackElementId] as HTMLTextAreaElement;
                const feedback = feedbackElement?.value?.trim();

                if (!feedback) {
                    toggle(els.retryErrorMessage, true);
                    return;
                }

                // Add feedback to retry parameters
                currentRetryContext.originalParams = {
                    ...currentRetryContext.originalParams,
                    retryFeedback: feedback
                };
            }

            // Execute the retry
            await executeRetry(currentRetryContext);

            // Clear feedback and reset UI state after successful retry
            if (currentRetryContext.feedbackElementId) {
                const feedbackElement = els[currentRetryContext.feedbackElementId] as HTMLTextAreaElement;
                if (feedbackElement) feedbackElement.value = '';

                // Update cache to clear stored feedback
                if (currentRetryContext.jobId) {
                    await updateJobCache(currentRetryContext.jobId, r => {
                        if (currentRetryContext.operation === 'cover-letter') {
                            r.coverLetterRetryFeedback = null;
                        } else if (currentRetryContext.operation === 'resume') {
                            r.resumeRetryFeedback = null;
                        }
                    });
                }

                // Hide feedback UI elements
                hideRetryFeedbackUI();
            }
        } catch (error) {
            console.error('Retry failed:', error);
            showError(error?.message ?? 'Retry failed. Please try again later.', stateMachine.value);
        }
    });
}

// Execute the actual retry operation
async function executeRetry(retryContext: RetryContext) {
    switch (retryContext.operation) {
        case 'analyze':
            const {selectedText, jobSpecificContext, previousAnalysis, retryFeedback} = retryContext.originalParams;
            // For analysis, retryFeedback becomes the new jobSpecificContext
            await onAnalyze(selectedText, retryFeedback || jobSpecificContext, previousAnalysis);
            break;

        case 'cover-letter':
            const {currentContent: clContent, retryFeedback: clFeedback} = retryContext.originalParams;
            await onGenerateCoverLetter(retryContext.jobId, clContent, clFeedback);
            break;

        case 'resume':
            const {currentResumeData, retryFeedback: resumeFeedback} = retryContext.originalParams;
            await onTailorResume(retryContext.jobId, currentResumeData, resumeFeedback);
            break;
    }
}

// Hide retry feedback UI elements
function hideRetryFeedbackUI() {
    toggle(els.retryErrorMessage, false);
    toggle(els.coverLetterRetryFeedbackSection, false);
    toggle(els.resumeRetryFeedbackSection, false);
    toggle(els.outputWarning, false);
    toggle(els.retryBtn, false);
    toggle(els.thisNeedsWorkBtn, true);
}

// Updated showError function - now uses the unified retry system
export function showError(errorMessage: string, state: ViewState, retryContext?: RetryContext, isBack = false) {
    hideAll();
    els.analysisContent.textContent = errorMessage;
    toggle(els.outputSection, true);
    toggle(els.analysisContent, true);
    toggle(els.backBtn, true);
    toggle(els.settingsBtn, true);

    if (retryContext) {
        currentRetryContext = retryContext;
        setupRetryForCurrentView();
        toggle(els.retryBtn, true);
    } else {
        currentRetryContext = null;
        toggle(els.retryBtn, false);
    }

    stateMachine.set(state, isBack);
}

// Updated showAnalysis - now uses unified retry system
async function showAnalysis(html: string, jobId: string, isBack = false) {
    abortController = null;
    hideAll();
    setHTML(els.analysisContent, html);
    toggle(els.outputSection, true);
    toggle(els.analysisContent, true);

    const {jobPostingCache} = await getUserData();
    const jobSpecificContext = jobPostingCache[jobId]?.jobSpecificContext
    if (jobSpecificContext) {
        els.jobSpecificContext.value = jobSpecificContext;
    }

    toggle(els.jobSpecificContextSection, true);
    toggle(els.tailorResumeBtn, true);
    toggle(els.generateCoverLetterBtn, true);
    toggle(els.retryBtn, true);
    toggle(els.backBtn, true);
    toggle(els.settingsBtn, true);
    toggle(els.outputWarning, true);

    // Set up unified retry context for analysis
    currentRetryContext = {
        operation: 'analyze',
        jobId,
        originalParams: {
            selectedText: jobPostingCache[jobId].jobPostingText,
            previousAnalysis: jobPostingCache[jobId].Analysis
        },
        feedbackElementId: 'jobSpecificContext',
        requiresFeedback: false // Analysis doesn't require feedback, but can use it
    };

    setupRetryForCurrentView();

    // Handle job specific context input
    els.jobSpecificContext = removeAllListeners(els.jobSpecificContext) as HTMLTextAreaElement;
    els.jobSpecificContext.addEventListener('input', () => {
        updateJobCache(jobId, r => {
            r.jobSpecificContext = els.jobSpecificContext.value;
        });

        // Update retry context with current input
        if (currentRetryContext) {
            currentRetryContext.originalParams = {
                ...currentRetryContext.originalParams,
                jobSpecificContext: els.jobSpecificContext.value
            };
        }
    });

    stateMachine.set(ViewState.Analysis, isBack, jobId);
    latestJobId = jobId;
}

// Updated showCoverLetter - now uses unified retry system
async function showCoverLetter(filename: string, content: string, jobId: string, isBack = false) {
    abortController = null;
    hideAll();
    toggle(els.coverLetterWarning, true);
    toggle(els.outputSection, true);
    els.coverLetterTextarea.value = content;
    toggle(els.coverLetterTextarea, true);
    toggle(els.backBtn, true);
    toggle(els.settingsBtn, true);

    const {jobPostingCache} = await getUserData();
    const currentJobCache = jobPostingCache[jobId];
    const hasContent = content && content.trim().length > 0;

    els.coverLetterRetryFeedback.value = currentJobCache?.coverLetterRetryFeedback || '';

    // Set up unified retry context
    currentRetryContext = {
        operation: 'cover-letter',
        jobId,
        originalParams: {
            currentContent: content
        },
        feedbackElementId: 'coverLetterRetryFeedback',
        requiresFeedback: hasContent // Only require feedback if there's existing content
    };

    if (els.coverLetterRetryFeedback.value) {
        // Already in feedback mode
        toggle(els.outputWarning, true);
        toggle(els.coverLetterRetryFeedbackSection, true);
        toggle(els.retryBtn, true);
        toggle(els.thisNeedsWorkBtn, false);
        setupRetryForCurrentView();
    } else if (hasContent) {
        // Has content, show "This needs work" button
        toggle(els.thisNeedsWorkBtn, true);
        els.thisNeedsWorkBtn = removeAllListeners(els.thisNeedsWorkBtn)
        els.thisNeedsWorkBtn.addEventListener('click', async () => {
            toggle(els.outputWarning, true);
            toggle(els.coverLetterRetryFeedbackSection, true);
            toggle(els.retryBtn, true);
            toggle(els.thisNeedsWorkBtn, false);
            setupRetryForCurrentView();
        })
    } else {
        // No content (error case), show retry directly
        toggle(els.retryBtn, true);
        currentRetryContext.requiresFeedback = false;
        setupRetryForCurrentView();
    }

    // Handle feedback input
    els.coverLetterRetryFeedback = removeAllListeners(els.coverLetterRetryFeedback) as HTMLTextAreaElement;
    els.coverLetterRetryFeedback.addEventListener('input', () => {
        toggle(els.retryErrorMessage, false);
        updateJobCache(jobId, r => {
            r.coverLetterRetryFeedback = els.coverLetterRetryFeedback.value;
        });
    });

    if (hasContent) {
        toggle(els.downloadCoverLetterBtn, true);
        const textSpan = els.downloadCoverLetterBtn.querySelector('span');
        if (textSpan) {
            textSpan.textContent = `Download as ${filename}`;
        }
        els.downloadCoverLetterBtn.onclick = () => {
            downloadBlob(new Blob([els.coverLetterTextarea.value], {type: 'text/plain'}), filename);
        };
    }

    toggle(els.tailorResumeBtn, true);
    stateMachine.set(ViewState.CoverLetter, isBack, jobId);
    latestJobId = jobId;
}

// Updated showResumePreview - now uses unified retry system
async function showResumePreview(filename: string, pdfBuffer: ArrayBuffer, jobId: string, isBack = false) {
    abortController = null;
    hideAll();
    toggle(els.outputSection, true);
    toggle(els.backBtn, true);
    toggle(els.settingsBtn, true);
    toggle(els.generateCoverLetterBtn, true);

    const {jobPostingCache} = await getUserData();
    const currentJobCache = jobPostingCache[jobId];
    const hasContent = pdfBuffer && pdfBuffer.byteLength > 0;

    els.resumeRetryFeedback.value = currentJobCache?.resumeRetryFeedback || '';

    // Set up unified retry context
    currentRetryContext = {
        operation: 'resume',
        jobId,
        originalParams: {
            currentResumeData: currentJobCache.TailoredResume?.jsonString
        },
        feedbackElementId: 'resumeRetryFeedback',
        requiresFeedback: hasContent // Only require feedback if there's existing content
    };

    if (els.resumeRetryFeedback.value) {
        // Already in feedback mode
        toggle(els.resumeRetryFeedbackSection, true);
        toggle(els.retryBtn, true);
        toggle(els.outputWarning, true);
        toggle(els.thisNeedsWorkBtn, false);
        setupRetryForCurrentView();
    } else if (hasContent) {
        // Has content, show "This needs work" button
        toggle(els.thisNeedsWorkBtn, true);
        els.thisNeedsWorkBtn = removeAllListeners(els.thisNeedsWorkBtn)
        els.thisNeedsWorkBtn.addEventListener('click', async () => {
            toggle(els.resumeRetryFeedbackSection, true);
            toggle(els.retryBtn, true);
            toggle(els.outputWarning, true);
            toggle(els.thisNeedsWorkBtn, false);
            setupRetryForCurrentView();
        })
    } else {
        // No content (error case), show retry directly
        toggle(els.retryBtn, true);
        currentRetryContext.requiresFeedback = false;
        setupRetryForCurrentView();
    }

    // Handle feedback input
    els.resumeRetryFeedback = removeAllListeners(els.resumeRetryFeedback) as HTMLTextAreaElement;
    els.resumeRetryFeedback.addEventListener('input', () => {
        toggle(els.retryErrorMessage, false);
        updateJobCache(jobId, r => {
            r.resumeRetryFeedback = els.resumeRetryFeedback.value;
        });
    });

    if (hasContent) {
        toggle(els.downloadTailoredResumeBtn, true);
        const textSpan = els.downloadTailoredResumeBtn.querySelector('span');
        if (textSpan) {
            textSpan.textContent = `Download as ${filename}`;
        }

        const blob = new Blob([pdfBuffer], {type: 'application/pdf'});
        els.downloadTailoredResumeBtn.onclick = async () => {
            const a = document.createElement('a');
            const url = window.URL.createObjectURL(blob);
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            let userData = await getUserData();
            userData.resumesDownloaded++;
            await saveUserData(userData);

            if (userData.resumesDownloaded % 20 === 0) {
                showSupportPopup();
            }
        };

        await renderPdfPreview(pdfBuffer);
    } else {
        toggle(els.downloadTailoredResumeBtn, false);
        console.error("The PDF buffer is empty. Cannot download a file.");
    }

    stateMachine.set(ViewState.ResumePreview, isBack, jobId);
    latestJobId = jobId;
}

// fixme: this doesn't seem to work great with some pdf
export async function getPdfText(file: File): Promise<string> {
    const arrayBuffer = await new Response(file).arrayBuffer();
    const pdf = await pdfjs.getDocument({data: arrayBuffer}).promise;
    const numPages = pdf.numPages;
    let fullText = '';

    for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const text = textContent.items.map((item: any) => item.str).join(' ');
        fullText += text + ' ';
    }

    return fullText;
}

function showSupportPopup() {
    if (els.sponsorshipPopupOverlay && els.closePopupBtn && els.sponsorshipPopupModal) {
        // Show the popup by removing the 'hidden' class
        els.sponsorshipPopupOverlay.classList.remove('hidden');

        // Add event listener to close button
        els.closePopupBtn.addEventListener('click', () => {
            els.sponsorshipPopupOverlay.classList.add('hidden');
        }, {once: true}); // Use { once: true } to automatically remove the listener after it's been called once

        // Add event listener to close when clicking outside the modal
        els.sponsorshipPopupOverlay.addEventListener('click', (event) => {
            // Check if the click target is the overlay itself, not the modal
            if (event.target === els.sponsorshipPopupOverlay) {
                els.sponsorshipPopupOverlay.classList.add('hidden');
            }
        });
    }
}

/**
 * Removes all event listeners from an element by replacing it with a clone.
 * @param element The HTMLElement to remove listeners from.
 * @returns The new cloned element.
 */
export function removeAllListeners(element): any {
    // Check if the element has a parent node.
    if (!element || !element.parentNode) {
        console.error('The provided element is null, undefined, or has no parent.');
        return element;
    }

    // Create a deep clone, which does not copy event listeners.
    const clonedElement = element.cloneNode(true) as HTMLElement;

    // Replace the original element with the new clone in the DOM.
    element.parentNode.replaceChild(clonedElement, element);

    // Replace the element with the cloned one in the allSections list if it exists
    const elementIndex = allSections.indexOf(element);
    if (elementIndex !== -1) {
        allSections[elementIndex] = clonedElement as (typeof element);
    }

    // Handle children - find and replace any child elements that are in allSections
    const originalChildren = Array.from(element.querySelectorAll('*')) as HTMLElement[];
    const clonedChildren = Array.from(clonedElement.querySelectorAll('*')) as HTMLElement[];

    // For each original child, check if it's in allSections and replace it with the corresponding cloned child
    originalChildren.forEach((originalChild: any, index) => {
        const childIndex = allSections.indexOf(originalChild);
        if (childIndex !== -1) {
            // Replace the original child with the corresponding cloned child
            allSections[childIndex] = clonedChildren[index] as (typeof originalChild);
        }
    });

    // Update els object - replace any references to the original element with the cloned one
    Object.keys(els).forEach(key => {
        if (els[key] === element) {
            els[key] = clonedElement;
        }
    });

    // Update els object - replace any references to original children with cloned children
    originalChildren.forEach((originalChild, index) => {
        Object.keys(els).forEach(key => {
            if (els[key] === originalChild) {
                els[key] = clonedChildren[index];
            }
        });
    });

    // Return the new element for further use.
    return clonedElement as (typeof element);
}

function addGlobalEventListeners() {
    sidepanelLogger.log("sidepanel.ts: Adding global event listeners.");
    els.backBtn = removeAllListeners(els.backBtn)
    els.backBtn.addEventListener('click', () => goBack());

    els.refreshBtn = removeAllListeners(els.refreshBtn)

    els.downloadTailoredResumeBtn = removeAllListeners(els.downloadTailoredResumeBtn)
    els.settingsBtn.addEventListener('click', showUserSettings);

    els.analyzeJobDescriptionBtn = removeAllListeners(els.analyzeJobDescriptionBtn)
    els.analyzeJobDescriptionBtn.addEventListener('click', async () => {
        await onAnalyze(els.jobDescriptionInput.value);
    })

    els.tailorResumeBtn = removeAllListeners(els.tailorResumeBtn)
    els.tailorResumeBtn.addEventListener('click', async () => {
        const currentJobId = stateMachine.currentJobId || latestJobId;
        if (!currentJobId) return;
        await onTailorResume(currentJobId);
    });

    els.generateCoverLetterBtn = removeAllListeners(els.generateCoverLetterBtn)
    els.generateCoverLetterBtn.addEventListener('click', async () => {
        const currentJobId = stateMachine.currentJobId || latestJobId;
        if (!currentJobId) return;
        await onGenerateCoverLetter(currentJobId);
    });

    if (isFirefox()) {
        els.shortcutInstructions.innerHTML = els.shortcutInstructions.innerHTML.replace(
            '+B', '+Y'
        ).replace(
            '+B', '+Y'
        ).replace(
            'Chrome extension', 'Firefox add-On'
        )
    }
}

async function onSearchQueryRefresh(forceRegenerate: boolean): Promise<void> {
    const userRelevantData = await getUserData();
    toggle(els.querySection, false);
    if (!forceRegenerate && userRelevantData.linkedinSearchQuery) {
        showSectionWithQuery(userRelevantData.linkedinSearchQuery);
        return;
    }

    showLoading('Generating a personalized LinkedIn search query...', false);

    const searchQuery = await serverComms.generateSearchQuery();
    userRelevantData.linkedinSearchQuery = searchQuery;
    await saveUserData(userRelevantData);
    showSectionWithQuery(searchQuery);
}

async function onAnalyze(selectedText: string, jobSpecificContext?: string, previousAnalysis?: string) {
    sidepanelLogger.log(`[onAnalyze] Function called. JobSpecificContext: ${!!jobSpecificContext}, PreviousAnalysis: ${!!previousAnalysis}`);
    sidepanelLogger.log(`[onAnalyze] Input text (first 50 chars): "${selectedText.substring(0, 50)}..."`);

    abortInFlight();

    try {
        let jobPostingText = selectedText.trim().replace(/\n/g, ' ');
        if (jobPostingText.length === 0) {
            console.error('[onAnalyze] Error: Empty job posting text.');
            throw new Error('Empty job posting text.');
        }

        const {jobPostingCache} = await getUserData();
        sidepanelLogger.log('[onAnalyze] Fetched user data. Cache size:', Object.keys(jobPostingCache || {}).length);

        // Skip caching if this is a retry with context/feedback
        const isRetry = !!(jobSpecificContext || previousAnalysis);
        if (!isRetry && jobPostingText && jobPostingCache) {
            sidepanelLogger.log('[onAnalyze] Starting cache lookup...');
            for (const jobId in jobPostingCache) {
                const parts = jobId.split(' @ ');
                if (parts.length < 2) continue;

                const jobTitleFromCache = parts[0].toLowerCase();
                const companyNameFromCache = parts[1].toLowerCase();
                const lowercaseJobText = jobPostingText.toLowerCase();

                sidepanelLogger.log(`[onAnalyze] Checking cache key: "${jobId}"`);
                if (lowercaseJobText.includes(jobTitleFromCache) && lowercaseJobText.includes(companyNameFromCache)) {
                    const rec = jobPostingCache[jobId];
                    sidepanelLogger.log(`[onAnalyze] CACHE HIT! Returning cached data for: "${jobId}"`);
                    await showAnalysis(rec.Analysis, jobId, false);
                    return;
                }
            }
            sidepanelLogger.log('[onAnalyze] CACHE MISS. No matching entry found.');
        }

        abortController = new AbortController();
        showLoading('Analyzing job posting...');
        loadingRotator.start('analyze', {
            intervalMs: 6000,
            stopOn: abortController.signal,
        });
        sidepanelLogger.log('[onAnalyze] Calling server for new analysis...');

        const response = await serverComms.analyzeJobPosting(
            selectedText, abortController.signal, jobSpecificContext, previousAnalysis
        );

        if (!response) {
            sidepanelLogger.log('[onAnalyze] Request was aborted after server response');
            return;
        }

        const {jobId, companyName, jobAnalysis} = response;

        latestJobId = jobId;
        sidepanelLogger.log(`[onAnalyze] Server response received. New jobId: "${jobId}"`);

        await updateJobCache(jobId, r => {
            r.jobPostingText = jobPostingText;
            r.CompanyName = companyName;
            r.Analysis = jobAnalysis;
        });

        sidepanelLogger.log('[onAnalyze] Cache updated successfully. Showing output.');
        await showAnalysis(jobAnalysis, jobId);

    } catch (e: any) {
        console.error('[onAnalyze] Analysis failed. Error:', e);

        // Create retry context with original parameters
        const retryContext: RetryContext = {
            operation: 'analyze',
            originalParams: {
                selectedText,
                jobSpecificContext,
                previousAnalysis
            }
        };

        showError(e?.message ?? 'Unexpected error during analysis.', ViewState.Analysis, retryContext);
    } finally {
        sidepanelLogger.log('[onAnalyze] onAnalyze finished. Stopping loading spinner.');
        loadingRotator.stop();
        abortController = null;
    }
}

async function onGenerateCoverLetter(jobId: string, currentContent?: string, retryFeedback?: string) {
    sidepanelLogger.log(`[onGenerateCoverLetter] Function called. JobId: "${jobId}", CurrentContent: ${!!currentContent}, RetryFeedback: ${!!retryFeedback}`);

    abortInFlight();
    abortController = new AbortController();
    showLoading('Drafting a cover letter...');
    loadingRotator.start('cover-letter', {
        intervalMs: 6000,
        stopOn: abortController.signal,
    });

    try {
        const {jobPostingCache, resumeJsonData} = await getUserData();
        sidepanelLogger.log(`[onGenerateCoverLetter] Fetched user data. Looking for jobId: "${jobId}" in cache.`);

        // Skip caching if this is a retry with feedback
        const isRetry = !!(currentContent || retryFeedback);
        if (!isRetry && jobPostingCache[jobId]?.CoverLetter) {
            sidepanelLogger.log(`[onGenerateCoverLetter] CACHE HIT! Returning cached cover letter for: "${jobId}"`);
            const cachedLetter = jobPostingCache[jobId].CoverLetter;
            await showCoverLetter(cachedLetter.filename, cachedLetter.content, jobId);
            return cachedLetter;
        }

        sidepanelLogger.log(`[onGenerateCoverLetter] Calling server for ${isRetry ? 'retry' : 'new'} cover letter for: "${jobId}"`);
        const response = await serverComms.generateCoverLetter(jobId, abortController.signal, currentContent, retryFeedback);

        if (!response) {
            sidepanelLogger.log('[onGenerateCoverLetter] Request was aborted after server response');
            return;
        }

        const {content} = response;

        const companyName = jobPostingCache[jobId]?.CompanyName || 'UnknownCompany';
        const filename = `${resumeJsonData.personal.full_name}_cover_letter_${companyName}.txt`;
        sidepanelLogger.log(`[onGenerateCoverLetter] Server response received. Filename: "${filename}"`);

        await updateJobCache(jobId, r => {
            r.CoverLetter = {filename, content};
        });

        sidepanelLogger.log('[onGenerateCoverLetter] Cache updated successfully. Showing cover letter.');
        await showCoverLetter(filename, content, jobId);
        return {filename, content};
    } catch (e: any) {
        console.error('[onGenerateCoverLetter] Failed to draft cover letter. Error:', e);

        // Create retry context
        const retryContext: RetryContext = {
            operation: 'cover-letter',
            jobId,
            originalParams: {
                currentContent,
                retryFeedback
            }
        };

        showError(e?.message ?? 'Failed to draft a cover letter.', ViewState.CoverLetter, retryContext);
    } finally {
        sidepanelLogger.log('[onGenerateCoverLetter] Finished. Stopping loading spinner.');
        loadingRotator.stop();
        abortController = null;
    }
}

async function onTailorResume(jobId: string, currentResumeData?: string, retryFeedback?: string) {
    sidepanelLogger.log(`[onTailorResume] Function called. JobId: "${jobId}", CurrentResumeData: ${!!currentResumeData}, RetryFeedback: ${!!retryFeedback}`);

    abortInFlight();
    abortController = new AbortController();
    showLoading('Tailoring resume...');
    loadingRotator.start('resume', {
        intervalMs: 6000,
        stopOn: abortController.signal,
    });

    try {
        const {resumeJsonData, jobPostingCache} = await getUserData();
        sidepanelLogger.log(`[onTailorResume] Fetched user data. Looking for jobId: "${jobId}" in cache.`);

        // Skip caching if this is a retry with feedback
        const isRetry = !!(currentResumeData || retryFeedback);
        if (!isRetry && jobPostingCache[jobId]?.TailoredResume) {
            sidepanelLogger.log(`[onTailorResume] CACHE HIT! Returning cached tailored resume for: "${jobId}"`);
            const {filename, pdfArrayBufferInBase64} = jobPostingCache[jobId].TailoredResume;
            const pdfBuffer = base64ToArrayBuffer(pdfArrayBufferInBase64);
            await showResumePreview(filename, pdfBuffer, jobId);
            return {filename, pdfBuffer};
        }

        sidepanelLogger.log(`[onTailorResume] Calling server for ${isRetry ? 'retry' : 'new'} tailored resume for: "${jobId}"`);
        const companyName = jobPostingCache[jobId]?.CompanyName || 'UnknownCompany';
        const filename = `${
            resumeJsonData.personal.full_name.toLowerCase().replace(/\s+/g, '_')
        }_resume_${
            companyName.toLowerCase().replace(/\s+/g, '_')
        }.pdf`;

        const response = await serverComms.tailorResume(jobId, filename, abortController.signal, currentResumeData, retryFeedback);
        sidepanelLogger.log(`[onTailorResume] Server response received for filename: "${filename}"`);

        if (!response) {
            sidepanelLogger.log('[onTailorResume] Request was aborted after server response');
            return;
        }
        const {pdfBuffer, jsonString} = response;

        await updateJobCache(jobId, r => {
            const pdfArrayBufferInBase64 = arrayBufferToBase64(pdfBuffer);
            r.TailoredResume = {
                filename,
                pdfArrayBufferInBase64,
                jsonString
            };
        });

        sidepanelLogger.log('[onTailorResume] Cache updated successfully. Showing resume preview.');
        await showResumePreview(filename, pdfBuffer, jobId);
        return {filename, pdfBuffer};
    } catch (e: any) {
        console.error('[onTailorResume] Failed to tailor resume. Error:', e);

        // Create retry context
        const retryContext: RetryContext = {
            operation: 'resume',
            jobId,
            originalParams: {
                currentResumeData,
                retryFeedback
            }
        };

        showError(e?.message ?? 'Failed to tailor resume.', ViewState.ResumePreview, retryContext);
    } finally {
        sidepanelLogger.log('[onTailorResume] Finished. Stopping loading spinner.');
        loadingRotator.stop();
        abortController = null;
    }
}

export async function goBack() {
    abortInFlight();

    // Handle settings case - don't change state machine
    if (els.userDetailsSection.checkVisibility()) {
        // Just hide settings, don't modify history
        const currentState = stateMachine.value;
        const currentJobId = stateMachine.currentJobId;
        // Re-show current view
        await showViewForState(currentState, currentJobId, true);
        return;
    }

    const prev = stateMachine.back();
    if (!prev) {
        await showInstructions(true);
        return;
    }

    await showViewForState(prev.state, prev.jobId, true);
}

// Helper function to show view based on state and job ID
async function showViewForState(state: ViewState, jobId: string | undefined, isBack: boolean) {
    const data = await getUserData();
    const rec = jobId ? data.jobPostingCache[jobId] : null;

    switch (state) {
        case ViewState.Analysis:
            if (rec?.Analysis) {
                await showAnalysis(rec.Analysis, jobId, isBack);
                return;
            }
            break;
        case ViewState.CoverLetter:
            if (rec?.CoverLetter) {
                await showCoverLetter(rec.CoverLetter.filename, rec.CoverLetter.content, jobId, isBack);
                return;
            }
            break;
        case ViewState.ResumePreview:
            if (rec?.TailoredResume) {
                await showResumePreview(
                    rec.TailoredResume.filename,
                    base64ToArrayBuffer(rec.TailoredResume.pdfArrayBufferInBase64),
                    jobId,
                    isBack
                );
                return;
            }
            break;
    }
    await showInstructions(true);
}

async function showInstructions(isBack: boolean = false) {
    sidepanelLogger.log("sidepanel.ts: Showing instructions.");
    const data = await getUserData()
    if (!data.resumeJsonData) {
        await showUserSettings()
    } else {
        hideAll();
        const firstName = data.resumeJsonData.personal.full_name.split(' ')[0];
        els.instructionsGreeting.textContent = `Welcome, ✨${firstName}✨! Let's get you set up for success!`;
        toggle(els.instructionDisplay, true);
        stateMachine.set(ViewState.Instructions, isBack);
        toggle(els.settingsBtn, true);
        toggle(els.backBtn, false);
        if (data.linkedinSearchQuery) {
            showSectionWithQuery(data.linkedinSearchQuery);
            return;
        } else {
            await onSearchQueryRefresh(true);
        }
    }
}

function showSectionWithQuery(query: string) {
    if (!els.querySection || !els.searchQueryLink || !els.searchQueryText) {
        console.error('One or more search query elements not found.');
        return;
    }

    toggle(els.loadingSpinnerSection, false);

    const linkedInBaseUrl = 'https://www.linkedin.com/jobs/search/?f_TPR=r86400&keywords=';
    const encodedQuery = encodeURIComponent(query);
    els.searchQueryLink.href = `${linkedInBaseUrl}${encodedQuery}`;

    els.searchQueryText.textContent = query;

    toggle(els.querySection, true);

    if (els.refreshBtn) {
        const refreshBtn = els.refreshBtn.cloneNode(true) as HTMLButtonElement;
        els.refreshBtn.replaceWith(refreshBtn);
        refreshBtn.addEventListener('click', () => onSearchQueryRefresh(true));
    }
}

els.saveAllSettingsBtn = removeAllListeners(els.saveAllSettingsBtn)
els.saveAllSettingsBtn.addEventListener('click', saveUserSettings);

sidepanelLogger.log("sidepanel.ts: Setting up runtime message listener.");
browser.runtime.onMessage.addListener((message, sender) => {
    // Log every message that comes into this listener.
    sidepanelLogger.log("sidepanel.ts: Message received!", {message, sender});

    // Check if the incoming message is of the correct type.
    if (message.type === 'selected-text' && message.text) {
        sidepanelLogger.log("sidepanel.ts: Received 'selected-text' message. Starting analysis...");

        // Call the asynchronous analysis function.
        // Note: The listener will continue to execute while onAnalyze is running.
        onAnalyze(message.text).then(() => {
            sidepanelLogger.log("sidepanel.ts: onAnalyze completed successfully.");
            // You can optionally return true here to signal to the sender that
            // you are handling the message asynchronously.
        }).catch((error) => {
            // Log any errors that occur during analysis.
            console.error('sidepanel.ts: Error analyzing text:', error);
            // Re-throw the error to ensure it's propagated.
            throw error;
        });
    } else {
        // Log if the message type is not what we expect.
        sidepanelLogger.log("sidepanel.ts: Message type is not 'selected-text'. Ignoring.");
    }
});

// Execute the initial setup functions.
addGlobalEventListeners();
showInstructions();

sidepanelLogger.log("sidepanel.ts: Attempting to send 'side-panel-ready' message.");
browser.runtime.sendMessage({type: 'side-panel-ready'}).catch(error => {
    // Log if the message fails to send, which can happen if no one is listening yet.
    sidepanelLogger.log('sidepanel.ts: Error sending side-panel-ready message:', error);
});