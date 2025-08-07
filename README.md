# **AI job search helper**

The AI job search helper is a Chrome extension designed to help you analyze job postings and tailor your resume and cover letters for a better fit. By leveraging a context menu, you can highlight a job posting on any webpage and instantly get a detailed analysis or generate customized application materials.

## **Features**

* **Analyze Job Posting Fit:** Highlight a job posting and a mini-window will appear next to your selection, providing a quick analysis of your fit for the role.  
* **Tailor Resume:** Use the assistant to suggest specific changes to your resume to better match the selected job posting.  
* **Draft Cover Letter:** Automatically generate a draft of a cover letter based on your resume and the job description.

## **Getting Started**

### **Prerequisites**

* You need to have [Node.js](https://nodejs.org/en) installed to build the TypeScript files.  
* Google Chrome browser.

### **Installation**

1. **Clone the repository:**  
   git clone https://github.com/YourPersonalUsername/ai-job-search-helper.git  
   cd ai-job-search-helper

   *(Replace YourPersonalUsername with your GitHub username)*  
2. **Install dependencies:**  
   npm install

3. **Build the project:**  
   npm run build

   This will compile the TypeScript files into the js/ directory.

### **Loading the Extension in Chrome**

1. Open Google Chrome and navigate to chrome://extensions.  
2. Enable **Developer mode** by toggling the switch in the top-right corner.  
3. Click on **"Load unpacked"**.  
4. Select the ai-job-search-helper project folder.

The extension is now installed and ready to use\!

## **Usage**

1. Navigate to any webpage with a job posting.  
2. Highlight the text of the job description.  
3. Right-click on the selected text.  
4. Select the **"Analyze Job Posting Fit"** option from the context menu.  
5. A tooltip-style window will appear next to your selection with a summary of the job fit.

## **Contributing**

We welcome contributions\! If you would like to contribute, please fork the repository and submit a pull request.

## **License**

This project is licensed under the MIT License \- see the [LICENSE](https://www.google.com/search?q=LICENSE) file for details.