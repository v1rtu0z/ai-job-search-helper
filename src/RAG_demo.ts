// TODO: Make use of this logic when doing actual RAG

import { PDFReader } from "@llamaindex/readers/pdf";
// import { TextFileReader } from "@llamaindex/readers/text";
// import { MarkdownReader } from "@llamaindex/readers/markdown";
import { GeminiEmbedding, gemini, GEMINI_MODEL } from "@llamaindex/google";
import { VectorStoreIndex, Settings } from "llamaindex";
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Update Embed Model
Settings.embedModel = new GeminiEmbedding();

Settings.llm = gemini({
    model: GEMINI_MODEL.GEMINI_2_0_FLASH,
});

async function main() {
    try {
        // Read from the smth.pdf file
        const documents = await new PDFReader().loadData("../smth.pdf");

        // Load and index documents
        const index = await VectorStoreIndex.fromDocuments(documents);

        // Create a query engine
        const queryEngine = index.asQueryEngine();

        const query = "What is the meaning of life?";

        // Query
        const response = await queryEngine.query({
            query,
        });

        // Log the response
        console.log(response.message);
    } catch (error) {
        console.error("An error occurred:", error);
    }
}

// Call the main function
main();