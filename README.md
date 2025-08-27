# **AI Job Search Helper**

The AI Job Search Helper is a browser extension designed to help you analyze job postings and tailor your resume and cover letters for a better fit. You can start an analysis by highlighting a job posting on any webpage, using a keyboard shortcut, or by simply pasting text into the sidebar.

## **Features**

* **Analyze Job Posting Fit:** Get a detailed analysis of how well your resume matches a job description in a dedicated side panel.
* **Tailor Resume:** Instead of just suggesting changes, the assistant creates a completely new, tailored version of your resume based on the job posting and your original resume.
* **Draft Cover Letter:** Automatically generate a draft of a cover letter based on your resume and the job description.

## **Upcoming Features**

* **Iterations on tailored docs:** Improve the quality of the tailored docs by iterating on them.
* **Text selection improvements:** A selector in the style of "inspect element" will be added to ease selecting the JD text.
* **Resume Analysis:** Analyze the resume and suggest changes to improve it.
* **Application Tracking:** Application calendar with reminders to reach out to the company with drafted messages.

## **Getting Started**

### **Prerequisites**

* You need to have [Node.js](https://nodejs.org/en) installed to build the TypeScript files.
* You can use either **Google Chrome** or **Mozilla Firefox**.

### **Installation**

1. **Clone the repository:**  
   git clone https://github.com/v1rtu0z/ai-job-search-helper.git  
   cd ai-job-search-helper

2. **Install dependencies:**  
   npm install

3. Build the project:  
   This will compile the TypeScript files into the js/ directory for your chosen browser.  
   npm run build:chrome  
   \# or  
   npm run build:firefox

### **Loading the Extension**

#### **For Google Chrome**

1. Open Google Chrome and navigate to chrome://extensions.
2. Enable **Developer mode** by toggling the switch in the top-right corner.
3. Click on **"Load unpacked"**.
4. Select the ai-job-search-helper project folder.

#### **For Mozilla Firefox**

1. Open Mozilla Firefox and navigate to about:debugging\#/runtime/this-firefox.
2. Click on **"Load Temporary Add-on..."**.
3. Navigate to your ai-job-search-helper project folder.
4. Select the manifest.json file inside the folder.

The extension is now installed and ready to use\! We're also working on getting this add-on into the official Chrome and Firefox web stores soon.

### **Server improvements**

Check out the [server repo](https://github.com/v1rtu0z/AI-job-search-helper-renderCVserver) for the server code.

## **Usage**

First, you need to **upload your resume** in the side panel.

You can open the side panel and start an analysis in one of three ways:

* **Context Menu:** Navigate to any webpage with a job posting, highlight the text of the job description, right-click on the selection, and choose the **"Analyze Job Posting Fit"** option.
* **Keyboard Shortcut:** Press **Ctrl \+ B** (or MacCtrl \+ B on macOS) for Chrome or **Ctrl \+ Y** (or MacCtrl \+ Y on macOS) for Firefox to open the side panel and analyze any highlighted text.
* **Toolbar Icon:** Click the extension's icon in your browser's toolbar. You can then paste the job description text into the side panel.

## **Contributing**

We welcome contributions\! If you would like to contribute, please fork the repository and submit a pull request.

## **License**

This project is licensed under  a modified MIT License with a non-commercial clause. See the full [LICENSE](LICENSE.md) file for details.
