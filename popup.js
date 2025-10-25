// Question Bulk Uploader - Popup Script

class QuestionUploader {
    constructor() {
        this.questions = [];
        this.isUploading = false;
        this.stopUploading = false;
        this.initializeEventListeners();
        this.loadSettings();
    }

    initializeEventListeners() {
        // File input button
        document.getElementById('csvFile').addEventListener('click', () => {
            this.openFileDialog();
        });

        // Preview actions
        document.getElementById('startUpload').addEventListener('click', () => {
            this.startUpload();
        });

        document.getElementById('clearPreview').addEventListener('click', () => {
            this.clearPreview();
        });

        // Stop upload button
        document.getElementById('stopUpload').addEventListener('click', () => {
            this.stopUpload();
        });

        // Settings
        document.getElementById('detectBankId').addEventListener('click', () => {
            this.refreshDetection();
        });

        document.getElementById('downloadSample').addEventListener('click', () => {
            this.downloadSampleExcel();
        });

        // Save settings on change
        document.getElementById('baseUrl').addEventListener('change', () => {
            this.saveSettings();
        });

        document.getElementById('questionBankId').addEventListener('change', () => {
            this.saveSettings();
        });

        document.getElementById('delayMs').addEventListener('change', () => {
            this.saveSettings();
        });

        document.getElementById('authToken').addEventListener('change', () => {
            this.saveSettings();
        });
    }

    async loadSettings() {
        try {
            const result = await chrome.storage.local.get(['baseUrl', 'questionBankId', 'delayMs', 'authToken']);
            if (result.baseUrl) document.getElementById('baseUrl').value = result.baseUrl;
            if (result.questionBankId) document.getElementById('questionBankId').value = result.questionBankId;
            if (result.delayMs) {
                const delayValue = Math.max(result.delayMs, 10); // Ensure minimum of 10ms
                document.getElementById('delayMs').value = delayValue;
            }
            if (result.authToken) document.getElementById('authToken').value = result.authToken;
            
            // Auto-detect values from the current page
            await this.autoDetectPageInfo();
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }

    saveSettings() {
        const settings = {
            baseUrl: document.getElementById('baseUrl').value,
            questionBankId: document.getElementById('questionBankId').value,
            delayMs: parseInt(document.getElementById('delayMs').value) || 50,
            authToken: document.getElementById('authToken').value
        };
        chrome.storage.local.set(settings);
    }

    async autoDetectPageInfo() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            const response = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                function: () => {
                    return window.questionBulkUploader ? window.questionBulkUploader.analyzePage() : null;
                }
            });
            
            if (response && response[0] && response[0].result) {
                const pageInfo = response[0].result;
                const origin = new URL(pageInfo.url).origin;
                
                // Auto-detect question bank ID
                if (pageInfo.questionBankId) {
                    document.getElementById('questionBankId').value = pageInfo.questionBankId;
                    this.addLogEntry(`Auto-detected question bank ID: ${pageInfo.questionBankId}`, 'info');
                    this.logToTabConsole(`[Question Bulk Uploader] Auto-detected question bank ID: ${pageInfo.questionBankId}`, 'info');
                } else {
                    document.getElementById('questionBankId').value = 'undetected';
                    this.logToTabConsole(`[Question Bulk Uploader] WARNING: Could not auto-detect question bank ID`, 'warn');
                }
                
                // Auto-detect auth token
                if (pageInfo.authToken) {
                    document.getElementById('authToken').value = pageInfo.authToken;
                    this.addLogEntry(`Auto-detected auth token`, 'info');
                    this.logToTabConsole(`[Question Bulk Uploader] Auto-detected auth token successfully`, 'info');
                } else {
                    this.logToTabConsole(`[Question Bulk Uploader] WARNING: Could not auto-detect auth token`, 'warn');
                }
                
                // Auto-construct base URL
                if (pageInfo.questionBankId) {
                    const baseUrl = `${origin}/api/rest/v2/admin/question-banks/${pageInfo.questionBankId}/questions`;
                    document.getElementById('baseUrl').value = baseUrl;
                    this.logToTabConsole(`[Question Bulk Uploader] Auto-generated API URL: ${baseUrl}`, 'info');
                } else {
                    document.getElementById('baseUrl').value = `${origin}/api/rest/v2/admin/question-banks/{question-bank-id}/questions`;
                }
                
                // Save settings after auto-detection
                this.saveSettings();
            }
        } catch (error) {
            console.error('Error auto-detecting page info:', error);
        }
    }

    openFileDialog() {
        // Create a hidden file input element
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.csv,.xlsx,.xls';
        fileInput.style.display = 'none';
        
        // Add event listener for file selection
        fileInput.addEventListener('change', (e) => {
            this.handleFileSelect(e);
        });
        
        // Trigger file dialog
        document.body.appendChild(fileInput);
        fileInput.click();
        document.body.removeChild(fileInput);
    }

    async handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        document.getElementById('fileName').textContent = file.name;
        
        try {
            const fileContent = await this.readFileAsText(file);
            this.questions = this.parseFile(fileContent, file.name);
            this.showPreview();
        } catch (error) {
            this.showError('Error reading file: ' + error.message);
        }
    }

    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('Failed to read file'));
            
            // Always read as ArrayBuffer for SheetJS compatibility
            reader.readAsArrayBuffer(file);
        });
    }

    parseFile(fileContent, fileName) {
        try {
            // Parse the file using SheetJS
            const workbook = XLSX.read(fileContent, { type: 'array' });
            
            // Get the first worksheet
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            
            // Convert to JSON array (header: 1 means first row is headers)
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            
            if (jsonData.length < 2) {
                throw new Error('File must have at least a header row and one data row');
            }
            
            const headers = jsonData[0];
            const questions = [];
            
            // Process each row (skip header row)
            for (let i = 1; i < jsonData.length; i++) {
                const values = jsonData[i] || [];
                
                // Pad with empty strings if row is shorter than header
                while (values.length < headers.length) {
                    values.push('');
                }
                
                const question = this.parseQuestionRow(headers, values, i + 1); // Pass line number (1-indexed)
                if (question) {
                    questions.push(question);
                }
            }
            
            return questions;
        } catch (error) {
            throw new Error('Error parsing file: ' + error.message);
        }
    }


    parseQuestionRow(headers, values, lineNumber) {
        const question = { lineNumber: lineNumber };
        
        // Map headers to question properties
        for (let i = 0; i < headers.length; i++) {
            const header = headers[i].toLowerCase().trim();
            const value = values[i] ? values[i].trim() : '';
            
            if (header.includes('question') && !header.includes('type')) {
                question.text = value;
            } else if (header.includes('type')) {
                question.type = value.toLowerCase().trim();
            } else if (header.includes('option') || header.includes('choice')) {
                if (!question.options) question.options = [];
                if (value) question.options.push(value);
            } else if (header.includes('correct') && header.includes('answer') || header.includes('key')) {
                question.correctAnswer = value;
            } else if (header.includes('feedback') && header.includes('correct')) {
                question.feedbackCorrect = value;
            } else if (header.includes('feedback') && header.includes('wrong')) {
                question.feedbackWrong = value;
            }
        }

        // Validate required fields
        if (!question.text) {
            console.warn('Skipping question without text:', values);
            return null;
        }

        // Set default values
        if (!question.type) question.type = 'single_answer';
        if (!question.options) question.options = [];

        return question;
    }


    showPreview() {
        const previewSection = document.getElementById('previewSection');
        const questionPreview = document.getElementById('questionPreview');
        const questionCount = document.getElementById('questionCount');
        
        previewSection.style.display = 'block';
        
        // Update question count
        questionCount.textContent = `(${this.questions.length} questions)`;
        
        let previewHTML = '';
        this.questions.forEach((question, index) => {
            // Validate answer key
            const validation = this.validateQuestion(question);
            
            previewHTML += `
                <div class="question-item ${validation.hasWarning ? 'question-warning' : ''}">
                    <div class="question-header">
                        <span class="question-number">Question ${index + 1}</span>
                        <span class="question-type">${question.type.replace('_', ' ').toUpperCase()}</span>
                    </div>
                    <div class="question-text">${question.text}</div>
                    ${question.options.length > 0 ? `
                        <div class="question-options">
                            Options (${question.options.length}/10): ${question.options.join(', ')}
                        </div>
                    ` : ''}
                    ${question.correctAnswer ? `
                        <div class="question-options">
                            Correct Answer: ${question.correctAnswer}
                        </div>
                    ` : ''}
                    ${question.feedbackCorrect ? `
                        <div class="question-options">
                            Feedback If Correct: ${question.feedbackCorrect}
                        </div>
                    ` : ''}
                    ${question.feedbackWrong ? `
                        <div class="question-options">
                            Feedback If Wrong: ${question.feedbackWrong}
                        </div>
                    ` : ''}
                    ${validation.hasWarning ? `
                        <div class="question-warning-text">
                            WARNING (Line ${question.lineNumber}): ${validation.warning}
                        </div>
                    ` : ''}
                </div>
            `;
        });
        
        questionPreview.innerHTML = previewHTML;
    }

    validateQuestion(question) {
        const validation = { hasWarning: false, warning: '' };
        
        // Check for too many options
        if (question.options.length > 10) {
            validation.hasWarning = true;
            validation.warning = `Too many options (${question.options.length}). Maximum is 10.`;
            return validation;
        }
        
        // Check answer key for choice-based questions
        if ((question.type === 'single_answer' || question.type === 'multiple_answer') && question.options.length > 0) {
            if (!question.correctAnswer) {
                validation.hasWarning = true;
                validation.warning = 'No correct answer specified.';
                return validation;
            }
            
            if (question.type === 'single_answer') {
                // Single answer - must be a valid letter (A, B, C, etc.)
                const validLetters = question.options.map((_, index) => String.fromCharCode(65 + index));
                if (!validLetters.includes(question.correctAnswer)) {
                    validation.hasWarning = true;
                    validation.warning = `Correct answer letter "${question.correctAnswer}" is not valid. Use letters A-${String.fromCharCode(65 + question.options.length - 1)}.`;
                    return validation;
                }
            } else if (question.type === 'multiple_answer') {
                // Multiple answers - check each letter
                const validLetters = question.options.map((_, index) => String.fromCharCode(65 + index));
                const correctAnswers = question.correctAnswer.split(',').map(a => a.trim());
                const invalidLetters = correctAnswers.filter(letter => !validLetters.includes(letter));
                if (invalidLetters.length > 0) {
                    validation.hasWarning = true;
                    validation.warning = `Invalid answer letters: ${invalidLetters.join(', ')}. Use letters A-${String.fromCharCode(65 + question.options.length - 1)}.`;
                    return validation;
                }
            }
        }
        
        
        return validation;
    }

    clearPreview() {
        document.getElementById('previewSection').style.display = 'none';
        document.getElementById('progressSection').style.display = 'none';
        document.getElementById('csvFile').value = '';
        document.getElementById('fileName').textContent = '';
        this.questions = [];
        this.isUploading = false;
        this.stopUploading = false;
    }

    stopUpload() {
        this.stopUploading = true;
        this.addLogEntry('Stopping upload...', 'warning');
    }

    async startUpload() {
        if (this.isUploading) return;
        
        const questionBankId = document.getElementById('questionBankId').value;
        
        if (!questionBankId || questionBankId === 'undetected') {
            this.showError('Question bank ID not detected. Please navigate to a question bank page or refresh detection.');
            return;
        }
        
        // Get the origin from the baseUrl field or use stored settings
        const baseUrlInput = document.getElementById('baseUrl').value;
        const origin = baseUrlInput ? new URL(baseUrlInput).origin : window.location.origin;
        
        // Construct the full API URL using the question bank ID
        const baseUrl = `${origin}/api/rest/v2/admin/question-banks/${questionBankId}/questions`;

        this.isUploading = true;
        this.stopUploading = false;
        
        document.getElementById('progressSection').style.display = 'block';
        document.getElementById('startUpload').disabled = true;
        
        this.logToTabConsole(`[Question Bulk Uploader] Starting upload of ${this.questions.length} questions to: ${baseUrl}`, 'info');
        
        await this.uploadQuestions(baseUrl, questionBankId);
        
        this.isUploading = false;
        document.getElementById('startUpload').disabled = false;
        
        if (this.stopUploading) {
            this.logToTabConsole(`[Question Bulk Uploader] Upload stopped by user`, 'info');
        } else {
            this.logToTabConsole(`[Question Bulk Uploader] Upload completed!`, 'info');
            // Refresh the current tab after upload completion
            await this.refreshCurrentTab();
        }
    }

    async uploadQuestions(baseUrl, questionBankId) {
        const delayMs = parseInt(document.getElementById('delayMs').value) || 50;
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        const uploadLog = document.getElementById('uploadLog');
        
        uploadLog.innerHTML = '';
        
        for (let i = 0; i < this.questions.length; i++) {
            // Check if upload was stopped
            if (this.stopUploading) {
                this.addLogEntry('Upload stopped by user', 'warning');
                this.logToTabConsole(`[Question Bulk Uploader] Upload stopped by user at question ${i + 1}`, 'info');
                break;
            }

            const question = this.questions[i];
            const progress = ((i + 1) / this.questions.length) * 100;
            
            progressFill.style.width = progress + '%';
            progressText.textContent = `${i + 1} / ${this.questions.length} questions uploaded`;
            
            try {
                const success = await this.uploadQuestion(baseUrl, questionBankId, question, i + 1);
                this.addLogEntry(`Question ${i + 1}: ${success ? 'Success' : 'Failed'}`, success ? 'success' : 'error');
                if (success) {
                    this.logToTabConsole(`[Question Bulk Uploader] Question ${i + 1} uploaded successfully: "${question.text}"`, 'info');
                }
            } catch (error) {
                this.addLogEntry(`Question ${i + 1}: Error - ${error.message}`, 'error');
                this.logToTabConsole(`[Question Bulk Uploader] Question ${i + 1} upload failed: ${error.message}`, 'error');
            }
            
            // Delay between requests
            if (i < this.questions.length - 1) {
                await this.delay(delayMs);
            }
        }
    }

    async uploadQuestion(baseUrl, questionBankId, question, questionNumber) {
        const requestData = this.formatQuestionForAPI(question, questionBankId);
        
        try {
            // Get auth token from settings
            const authToken = document.getElementById('authToken').value;
            
            // Extract origin from baseUrl
            const origin = new URL(baseUrl).origin;
            
            // Match the exact headers from your working curl request
            const headers = {
                'accept': 'application/hal+json',
                'authorization': authToken || '', // Use the full token as provided
                'cache-control': 'no-cache',
                'content-type': 'application/json',
                'origin': origin,
                'pragma': 'no-cache',
                'referer': `${origin}/admin/questionBanks/edit/${questionBankId}`,
                'sec-ch-ua': '"Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"macOS"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
            };
            
            const response = await fetch(baseUrl, {
                method: 'POST',
                headers: headers,
                credentials: 'include', // Include cookies for authentication
                body: JSON.stringify(requestData)
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            this.addLogEntry(`Uploaded question ${questionNumber}: "${question.text}" (ID: ${result.id})`, 'success');
            return result;
        } catch (error) {
            throw error;
        }
    }

    formatQuestionForAPI(question, questionBankId) {
        // Generate a UUID for the question ID (simplified version)
        const generateId = () => {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        };

        // Base data structure (updated format)
        const baseData = {
            "id": generateId(),
            "name": `<p>${question.text}</p>`,
            "order": 1,
            "correctReply": `<p>${question.feedbackCorrect || 'Correct!'}</p>`,
            "incorrectReply": `<p>${question.feedbackWrong || 'Incorrect. Please try again.'}</p>`,
            "attachment": null,
            "questionOptions": []
        };

        // Map question types
        let questionType;
        switch (question.type) {
            case 'single_answer':
                questionType = 'SingleAnswer';
                break;
            case 'multiple_answer':
                questionType = 'MultipleAnswer';
                break;
            default:
                questionType = 'SingleAnswer';
        }

        // Add question type
        baseData.questionType = questionType;

        // Handle question options for all question types
        if (question.options && question.options.length > 0) {
            // Limit to maximum 10 options (based on your JSON samples)
            const maxOptions = 10;
            const limitedOptions = question.options.slice(0, maxOptions);
            
            baseData.questionOptions = limitedOptions.map((option, index) => {
                let isCorrect = false;
                
                // Determine if this option is correct
                if (questionType === 'SingleAnswer') {
                    // Single correct answer - check if this option's letter matches
                    const optionLetter = String.fromCharCode(65 + index); // A, B, C, D, etc.
                    isCorrect = optionLetter === question.correctAnswer;
                } else if (questionType === 'MultipleAnswer') {
                    // Multiple correct answers (comma-separated letters)
                    const correctAnswers = question.correctAnswer ? question.correctAnswer.split(',').map(a => a.trim()) : [];
                    const optionLetter = String.fromCharCode(65 + index); // A, B, C, D, etc.
                    isCorrect = correctAnswers.includes(optionLetter);
                }
                
                return {
                    "id": generateId(),
                    "name": option,
                    "isCorrect": isCorrect,
                    "order": index + 1
                };
            });
            
            // Validate answer key for SingleAnswer questions
            if (questionType === 'SingleAnswer' && question.correctAnswer) {
                const hasCorrectAnswer = baseData.questionOptions.some(opt => opt.isCorrect);
                if (!hasCorrectAnswer) {
                    console.warn(`Warning: Correct answer letter "${question.correctAnswer}" not found in options for question: ${question.text}`);
                }
            }
            
            // Validate answer key for MultipleAnswer questions
            if (questionType === 'MultipleAnswer' && question.correctAnswer) {
                const correctAnswers = question.correctAnswer.split(',').map(a => a.trim());
                const foundCorrectAnswers = baseData.questionOptions.filter(opt => opt.isCorrect).length;
                if (foundCorrectAnswers === 0) {
                    console.warn(`Warning: No correct answer letters found for MultipleAnswer question: ${question.text}`);
                }
            }
        }

        return baseData;
    }

    async refreshDetection() {
        try {
            this.addLogEntry('Refreshing auto-detection...', 'info');
            await this.autoDetectPageInfo();
            this.addLogEntry('Auto-detection refreshed successfully', 'success');
        } catch (error) {
            this.showError('Error refreshing detection: ' + error.message);
        }
    }

    addLogEntry(message, type = 'info') {
        const uploadLog = document.getElementById('uploadLog');
        const entry = document.createElement('div');
        entry.className = `log-entry log-${type}`;
        entry.textContent = `${new Date().toLocaleTimeString()}: ${message}`;
        uploadLog.appendChild(entry);
        uploadLog.scrollTop = uploadLog.scrollHeight;
        
        // Also log to tab console for important messages
        if (type === 'error' || type === 'success' || type === 'info') {
            this.logToTabConsole(`[Question Bulk Uploader] ${type.toUpperCase()}: ${message}`, type === 'error' ? 'error' : 'info');
        }
    }

    showError(message) {
        this.addLogEntry(message, 'error');
        // Also log to the current tab's console for easy debugging
        this.logToTabConsole(`[Question Bulk Uploader] ERROR: ${message}`, 'error');
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async logToTabConsole(message, level = 'log') {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                function: (msg, logLevel) => {
                    console[logLevel](msg);
                },
                args: [message, level]
            });
        } catch (error) {
            // Fallback to extension console if tab logging fails
            console[level](message);
        }
    }

    async refreshCurrentTab() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            await chrome.tabs.reload(tab.id);
            this.addLogEntry('Page refreshed to show uploaded questions', 'info');
            this.logToTabConsole(`[Question Bulk Uploader] Tab refreshed to show uploaded questions`, 'info');
        } catch (error) {
            this.addLogEntry('Could not refresh page: ' + error.message, 'error');
            this.logToTabConsole(`[Question Bulk Uploader] ERROR: Could not refresh page: ${error.message}`, 'error');
        }
    }


    downloadSampleExcel() {
        // Create sample data with 2 questions (single choice and multi choice)
        const sampleData = [
            // Headers
            ['Question Text', 'Type', 'Option 1', 'Option 2', 'Option 3', 'Option 4', 'Option 5', 'Option 6', 'Option 7', 'Option 8', 'Option 9', 'Option 10', 'Correct Answer / Key', 'Feedback If Correct', 'Feedback If Wrong'],
            // Single Answer Question
            ['What is the capital of France?', 'single_answer', 'Paris', 'London', 'Berlin', 'Madrid', '', '', '', '', '', '', 'A', 'Correct! Paris is the capital of France.', 'Incorrect. The capital of France is Paris.'],
            // Multiple Answer Question
            ['Which of the following are programming languages? (Select all that apply)', 'multiple_answer', 'Python', 'HTML', 'CSS', 'JavaScript', 'Java', 'PHP', '', '', '', '', 'A,D,E,F', 'Great job! Python, JavaScript, PHP, and Java are programming languages.', 'Not quite right!']
        ];

        // Create workbook and worksheet
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(sampleData);
        
        // Add worksheet to workbook
        XLSX.utils.book_append_sheet(wb, ws, 'Questions');
        
        // Generate Excel file
        const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        
        // Create blob and download
        const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        
        // Create download link
        const a = document.createElement('a');
        a.href = url;
        a.download = 'sample_questions.xlsx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.addLogEntry('Sample Excel file downloaded successfully!', 'success');
    }
}

// Initialize the uploader when the popup loads
document.addEventListener('DOMContentLoaded', () => {
    new QuestionUploader();
});
