// File Converter Server - Deploy to Railway/Render for FREE
// Handles PDF, DOCX, TXT conversion to plain text
// Uses pdf-parse (simple, reliable npm package - no system binaries or workers needed)

const express = require("express");
const cors = require("cors");
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Main conversion endpoint
app.post("/convert", async (req, res) => {
  try {
    const { fileData, fileType } = req.body;

    // Validate input
    if (!fileData) {
      return res.status(400).json({ error: "fileData is required" });
    }
    if (!fileType) {
      return res.status(400).json({ error: "fileType is required (pdf, docx, txt)" });
    }

    // Decode base64 to buffer
    let buffer;
    try {
      buffer = Buffer.from(fileData, "base64");
    } catch (e) {
      return res.status(400).json({ error: "Invalid base64 encoding" });
    }

    console.log(`Processing ${fileType} file, size: ${buffer.length} bytes`);

    let extractedText = "";

    // ============================================
    // PDF: Use pdf-parse (simple and reliable)
    // ============================================
    if (fileType === "pdf") {
      try {
        console.log("Starting PDF extraction with pdf-parse...");

        // Parse PDF buffer
        const data = await pdfParse(buffer);
        
        console.log(`PDF loaded: ${data.numpages} pages`);
        console.log(`Extracted ${data.text.length} characters`);

        if (!data.text || data.text.trim().length === 0) {
          throw new Error("No text could be extracted from PDF");
        }

        extractedText = data.text;
        console.log(`✓ PDF extraction succeeded`);
      } catch (error) {
        console.error("PDF extraction error:", error.message);
        return res.status(400).json({
          error: "PDF extraction failed",
          detail: error.message,
        });
      }
    }
    // ============================================
    // DOCX: Use mammoth npm library
    // ============================================
    else if (fileType === "docx") {
      try {
        console.log("Starting DOCX extraction with mammoth...");
        const result = await mammoth.extractRawText({ buffer });
        extractedText = result.value;

        // Check for errors
        if (result.messages && result.messages.length > 0) {
          console.warn("Mammoth warnings:", result.messages);
        }

        console.log(`✓ DOCX extraction succeeded: ${extractedText.length} characters`);
      } catch (error) {
        console.error("DOCX extraction error:", error.message);
        return res.status(400).json({
          error: "DOCX extraction failed",
          detail: error.message,
        });
      }
    }
    // ============================================
    // TXT: Plain text decoding
    // ============================================
    else if (fileType === "txt") {
      try {
        console.log("Starting TXT extraction...");
        extractedText = buffer.toString("utf-8");
        console.log(`✓ TXT extraction succeeded: ${extractedText.length} characters`);
      } catch (error) {
        return res.status(400).json({
          error: "TXT decoding failed",
          detail: error.message,
        });
      }
    }
    // ============================================
    // Unsupported format
    // ============================================
    else {
      return res.status(400).json({
        error: `Unsupported file type: ${fileType}`,
        supported: ["pdf", "docx", "txt"],
      });
    }

    // Clean extracted text
    const cleanedText = extractedText
      .replace(/[\x00-\x1F\x7F]/g, " ") // Remove control characters
      .replace(/\s+/g, " ") // Collapse whitespace
      .trim();

    // Validate extracted text
    if (!cleanedText || cleanedText.length < 10) {
      return res.status(400).json({
        error: "File is empty or could not be extracted",
        extractedLength: cleanedText.length,
        hint: "Check that the file is not corrupt or empty",
      });
    }

    // Success
    console.log(`✓ Conversion successful: ${cleanedText.length} characters`);
    return res.json({
      success: true,
      text: cleanedText,
      length: cleanedText.length,
      fileType: fileType,
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return res.status(500).json({
      error: "Server error during conversion",
      message: error.message,
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    error: "Server error",
    message: err.message,
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✓ File converter running on http://localhost:${PORT}`);
  console.log(`  POST /convert - Convert PDF/DOCX/TXT to text`);
  console.log(`  GET  /health - Health check`);
  console.log(`  Using pdf-parse for PDF extraction (no system binaries or workers needed)`);
});
