// Question Bulk Uploader - Background Script (Service Worker)

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        // Set default settings
        chrome.storage.local.set({
            baseUrl: '',
            questionBankId: '',
            delayMs: 50
        });
    }
});


