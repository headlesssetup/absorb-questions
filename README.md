# Question Bulk Uploader Chrome Extension

A Chrome extension that allows you to bulk upload questions from CSV/XLSX files to Absorb LMS with automatic authentication and a much better user interface.

## How to Install as Chrome Extension

### Step 1: Download the Extension
1. Download or clone this repository to your computer
2. Extract the files to a folder (e.g., `absorb-questions`)

### Step 2: Enable Developer Mode in Chrome
1. Open Chrome and go to `chrome://extensions/`
2. Turn ON "Developer mode" (toggle in top-right corner)

### Step 3: Load the Extension
1. Click "Load unpacked" button
2. Select the folder containing the extension files
3. The extension icon should appear in your Chrome toolbar

### Step 4: Verify Installation
- Look for the "Question Bulk Uploader" icon in your Chrome toolbar
- Click it to open the extension popup


## Supported Question Types

- **Multiple Choice (Single Answer)**: Choose one correct answer from options A, B, C, D, etc.
- **Multiple Response (Multi-select)**: Choose multiple correct answers (e.g., A, C, E)

### Answer Key Formats

- **Single Answer**: Use letter A, B, C, D, etc. (e.g., "A" for first option)
- **Multiple Answers**: Use comma-separated letters (e.g., "A,C,E")

## Quick Start Guide

### 1. Navigate to Question Bank Page
- Go to your Absorb question bank page
- The extension automatically detects the question bank ID and authentication

### 2. Prepare Your File
Create a CSV or Excel file (.csv, .xlsx, .xls) with questions. 
"Download Sample Excel" to get a template.

### 3. Upload Questions
1. **Click the extension icon** in your Chrome toolbar
2. **Upload your file** by clicking "Choose CSV/Excel File"
3. **Preview your questions** to verify they're parsed correctly
4. **Click "Start Upload"** to begin uploading
5. **Page refreshes automatically** when complete to show new questions

## Timing and Delays

The extension includes a configurable delay between question uploads to prevent server overload. The default delay is 50ms between each question upload. With very short delays, question order may be affected due to asynchronous processing.

## License

This project is open source. Feel free to modify and distribute according to your needs. Note that the SheetJS library included in this project is subject to its own licence. More info: https://github.com/SheetJS/