// File Converter Server - Deploy to Railway for FREE
// Handles PDF, DOCX, TXT conversion to plain text

const express = require("express");
const cors = require("cors");
const mammoth = require("mammoth");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Main conversion endpoint
app.post("/convert", async (req, res) => {
  let tempFile = null;
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

    let extractedText = "";

    // ============================================
    // PDF: Use pdftotext CLI (most reliable)
    // ============================================
    if (fileType === "pdf") {
      try {
        // Write buffer to temp file
        tempFile = path.join(os.tmpdir(), `pdf_${Date.now()}.pdf`);
        fs.writeFileSync(tempFile, buffer);

        // Use pdftotext CLI to extract text
        const text = execSync(`pdftotext "${tempFile}" -`, {
          encoding: "utf-8",
          maxBuffer: 10 * 1024 * 1024,
        });

        extractedText = text;
      } catch (error) {
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
        const result = await mammoth.extractRawText({ buffer });
        extractedText = result.value;

        // Check for errors
        if (result.messages && result.messages.length > 0) {
          console.warn("Mammoth warnings:", result.messages);
        }
      } catch (error) {
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
        extractedText = buffer.toString("utf-8");
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
      .replace(/[\x00-\x1F\x7F]/g, " ")
      .replace(/\s+/g, " ")
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
  } finally {
    // Clean up temp file
    if (tempFile && fs.existsSync(tempFile)) {
      try {
        fs.unlinkSync(tempFile);
      } catch (e) {
        console.warn("Failed to delete temp file:", e.message);
      }
    }
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
});
