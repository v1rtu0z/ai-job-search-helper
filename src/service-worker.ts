import {browser, Runtime} from "webextension-polyfill-ts";
import MessageSender = Runtime.MessageSender;

// Define types for context menu data and tab information
interface ContextMenuData extends chrome.contextMenus.OnClickData {
    selectionText?: string;
}

interface Tab extends chrome.tabs.Tab {}

// Function to set up the context menu item
function setupContextMenu(): void {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: 'analyze-job-posting',
            title: 'Analyze Job Posting Fit',
            contexts: ['selection']
        });
    });
}

// Listener for when the extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
    setupContextMenu();
    if (chrome.sidePanel) {
        // Set the side panel to open when the extension's action icon is clicked
        chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
            .catch((error) => console.error('Error setting side panel behavior:', error));
    }
    console.log("Service Worker installed/updated. Context menu and side panel behavior set up.");
});

// Listener for context menu clicks
chrome.contextMenus.onClicked.addListener((data: ContextMenuData, tab?: Tab) => {
    if (!tab || !tab.id || !data.selectionText) {
        console.warn('No active tab or selected text for context menu action.');
        return;
    }

    const selectedText = data.selectionText;
    const tabId = tab.id;

    // Check if the sidePanel API exists to differentiate between Chrome and Firefox.
    if (chrome.sidePanel) {
        // --- Chrome Logic ---
        console.log("Using Chrome side panel API.");
        // Open the side panel for the current tab.
        chrome.sidePanel.open({ tabId: tabId });

        // Try to send the message.
        chrome.runtime.sendMessage({
            type: 'selected-text',
            text: selectedText
        }).catch(error => {
            // If the message fails, add a listener for the side panel to become ready.
            console.warn('Side panel not active yet, adding a listener for its readiness:', error);
            const messageListener = (message: any, sender: chrome.runtime.MessageSender) => {
                if (message.type === 'side-panel-ready' && sender.tab?.id === tabId) {
                    console.log('Side panel is ready, sending selected text.');
                    chrome.runtime.sendMessage({
                        type: 'selected-text',
                        text: selectedText
                    }).catch(error => console.error('Error sending message:', error));
                    chrome.runtime.onMessage.removeListener(messageListener);
                    return true;
                }
                return false;
            };
            chrome.runtime.onMessage.addListener(messageListener);
        });
    } else {
        // --- Firefox Logic ---
        console.log("Using Firefox sidebar action window.");

        // First, open the sidebar. This will open it in the current browser window.
        browser.sidebarAction.open();

        browser.runtime.sendMessage({
            type: 'selected-text',
            text: selectedText
        }).catch(error => {
            console.warn('Sidebar not active yet, adding a listener for its readiness:', error);
            const messageListener = (message: any, sender: MessageSender) => {
                if (message.type === 'side-panel-ready') {
                    console.log('Sidebar is ready, sending selected text.');
                    browser.runtime.sendMessage({
                        type: 'selected-text',
                        text: selectedText
                    }).catch(error => console.error('Error sending message:', error));
                    chrome.runtime.onMessage.removeListener(messageListener);
                    return true;
                }
                return false;
            };
            chrome.runtime.onMessage.addListener(messageListener);
        });
    }
});


// New listener for the keyboard shortcut
browser.commands.onCommand.addListener((command: string) => {
    if (command === 'analyze-job-posting-shortcut') {
        if (typeof browser.sidebarAction !== 'undefined') {
            // Use Firefox's sidebarAction API
            browser.sidebarAction.open();
            console.log("Firefox sidebar opened.");
        }

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];

            // Open the side panel as a direct user action.
            // We'll check for both Chrome's and Firefox's APIs here.
            if (typeof chrome.sidePanel !== 'undefined') {
                // Use Chrome's sidePanel API
                chrome.sidePanel.open({ tabId: activeTab.id });
                console.log("Chrome side panel opened.");
            }

            if (activeTab && activeTab.id) {
                browser.scripting.executeScript({
                    target: { tabId: activeTab.id },
                    func: () => window.getSelection()?.toString()
                }).then(selectionResult => {
                    const selectedText = selectionResult[0].result;
                    const tabId = activeTab.id;

                    if (selectedText) {
                        // Try to send the message synchronously
                        browser.runtime.sendMessage({
                            type: 'selected-text',
                            text: selectedText
                        }).catch(error => {
                            // If the message fails, it means the side panel is not open yet.
                            console.warn('Side panel not active yet, adding a listener for its readiness:', error);

                            // Create a temporary listener for the 'side-panel-ready' message.
                            const messageListener = (message: any, sender: MessageSender) => {
                                if (message.type === 'side-panel-ready') {
                                    console.log('Side panel is ready, sending selected text.');

                                    // Once ready, send the message.
                                    browser.runtime.sendMessage({
                                        type: 'selected-text',
                                        text: selectedText
                                    }).catch(error => console.error('Error sending message:', error));

                                    // Remove this temporary listener to prevent memory leaks.
                                    chrome.runtime.onMessage.removeListener(messageListener);

                                    // Return true to keep the message channel open.
                                    return true;
                                }
                                return false;
                            };

                            // Add the listener.
                            chrome.runtime.onMessage.addListener(messageListener);
                        });
                    } else {
                        console.warn('No text selected for keyboard shortcut action.');
                    }
                }).catch(error => console.error('Scripting failed:', error));
            }
        });
    }
});

// Listener for clicks on the extension's toolbar icon.
// This is required for Firefox to open the sidebar.
browser.action.onClicked.addListener((tab) => {
    console.log("service-worker.ts: Toolbar icon clicked.");
    if (tab && tab.id) {
        // Since we are clicking the icon, there is no selected text.
        // We still need to open the side panel/sidebar.

        // Check for the specific APIs.
        if (typeof chrome.sidePanel !== 'undefined' && chrome.sidePanel.open) {
            // Chrome's Manifest V3 handles this behavior with the `setPanelBehavior` call.
            // This listener is a good fallback, but Chrome should handle it automatically.
            console.log("service-worker.ts: Using chrome.sidePanel.open for toolbar icon.");
            chrome.sidePanel.open({ tabId: tab.id });
        } else if (typeof browser.sidebarAction !== 'undefined' && browser.sidebarAction.open) {
            // --- Firefox Logic: Open the sidebar. ---
            console.log("service-worker.ts: Using browser.sidebarAction.open for toolbar icon.");
            browser.sidebarAction.open();
        } else {
            console.error("service-worker.ts: Neither sidePanel nor sidebarAction are available to open from icon click.");
        }
    }
});
