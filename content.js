// Question Bulk Uploader - Content Script

// This content script runs on all pages and can help with page analysis
// It's mainly used for detecting question bank IDs from the page source

(function() {
    'use strict';

    // Listen for messages from the popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'analyzePage') {
            const analysis = analyzeCurrentPage();
            sendResponse(analysis);
        }
    });

    function analyzeCurrentPage() {
        const analysis = {
            url: window.location.href,
            title: document.title,
            questionBankId: null,
            authToken: null
        };

        // Look for question bank ID in various places
        analysis.questionBankId = detectQuestionBankId();
        
        // Look for auth token
        analysis.authToken = detectAuthToken();

        return analysis;
    }

    function detectQuestionBankId() {
        const patterns = [
            // URL patterns
            /question-banks\/([a-f0-9-]{36})\/questions/gi,
            /question-banks\/([a-f0-9-]{36})/gi,
            
            // HTML structure patterns
            /data-rbd-droppable-id=["\s]*([a-f0-9-]{36})/gi,
            /data-rbd-draggable-id=["\s]*([a-f0-9-]{36})/gi,
            /question[_-]?banks[_-]?([a-f0-9-]{36})/gi,
            /questionBanks\/([a-f0-9-]{36})/gi,
            
            // Common JSON patterns
            /question[_-]?bank[_-]?id["\s]*[:=]["\s]*([^"'\s,}]+)/gi,
            /bank[_-]?id["\s]*[:=]["\s]*([^"'\s,}]+)/gi,
            /data[_-]?bank[_-]?id["\s]*[:=]["\s]*([^"'\s,}]+)/gi,
            /id["\s]*[:=]["\s]*([a-f0-9-]{36})/gi,
            
            // HTML attribute patterns
            /data[_-]?question[_-]?bank[_-]?id["\s]*=["\s]*([^"'\s>]+)/gi,
            /data[_-]?bank[_-]?id["\s]*=["\s]*([^"'\s>]+)/gi,
            
            // URL parameter patterns
            /[?&](?:question[_-]?bank[_-]?id|bank[_-]?id)=([^&]+)/gi,
            
            // Generic UUID patterns (for question bank IDs)
            /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/gi
        ];

        const pageSource = document.documentElement.outerHTML;
        const currentUrl = window.location.href;
        const foundIds = new Set();

        // Check URL first
        const urlMatch = currentUrl.match(/question-banks\/([a-f0-9-]{36})/);
        if (urlMatch && urlMatch[1]) {
            foundIds.add(urlMatch[1]);
        }

        // Then check page source
        patterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(pageSource)) !== null) {
                if (match[1] && match[1].length > 3) {
                    foundIds.add(match[1]);
                }
            }
        });

        // Look in form fields
        const formFields = document.querySelectorAll('input[name*="bank"], input[name*="question"], input[id*="bank"], input[id*="question"], select[name*="bank"], select[name*="question"]');
        formFields.forEach(field => {
            if (field.value && field.value.length > 3) {
                foundIds.add(field.value);
            }
        });

        // Look in data attributes
        const elementsWithData = document.querySelectorAll('[data-bank-id], [data-question-bank-id], [data-bankid]');
        elementsWithData.forEach(element => {
            const bankId = element.dataset.bankId || element.dataset.questionBankId || element.dataset.bankid;
            if (bankId && bankId.length > 3) {
                foundIds.add(bankId);
            }
        });

        // Return the most likely candidate (longest one)
        const candidates = Array.from(foundIds);
        return candidates.sort((a, b) => b.length - a.length)[0] || null;
    }



    function detectAuthToken() {
        // Check cookies first
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
            const [name, value] = cookie.trim().split('=');
            if (name === 'jwtToken' && value) {
                return `Bearer ${value}`;
            }
        }

        // Check localStorage
        try {
            const jwtToken = localStorage.getItem('jwtToken');
            if (jwtToken) {
                return `Bearer ${jwtToken}`;
            }
        } catch (e) {
            // localStorage might not be accessible
        }

        // Check sessionStorage
        try {
            const jwtToken = sessionStorage.getItem('jwtToken');
            if (jwtToken) {
                return `Bearer ${jwtToken}`;
            }
        } catch (e) {
            // sessionStorage might not be accessible
        }

        // Look for JWT tokens in page source/scripts
        const pageSource = document.documentElement.outerHTML;
        const jwtPattern = /Bearer\s+([A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+)/gi;
        const match = jwtPattern.exec(pageSource);
        if (match && match[1]) {
            return `Bearer ${match[1]}`;
        }

        return null;
    }

    // Make the analysis function available globally for debugging
    window.questionBulkUploader = {
        analyzePage: analyzeCurrentPage,
        detectQuestionBankId: detectQuestionBankId,
        detectAuthToken: detectAuthToken
    };

})();
