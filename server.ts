import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import cors from 'cors';
import fs from 'fs';

const upload = multer({ dest: 'uploads/' });

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // API Routes
  app.post('/api/analyze', upload.single('file'), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { targetColumn, sensitiveColumn } = req.body;
      if (!targetColumn || !sensitiveColumn) {
        return res.status(400).json({ error: 'Missing column selection' });
      }

      const fileContent = fs.readFileSync(req.file.path, 'utf8');
      
      // Attempt to detect delimiter if it's not a standard comma
      let delimiter = ',';
      const firstLine = fileContent.split('\n')[0];
      if (!firstLine.includes(',') && firstLine.includes(';')) {
        delimiter = ';';
      } else if (!firstLine.includes(',') && firstLine.includes('\t')) {
        delimiter = '\t';
      }

      const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        delimiter,
        trim: true,
        bom: true
      });

      // Cleanup uploaded file
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      if (!records || records.length === 0) {
        return res.status(400).json({ error: 'Selected file is empty or could not be parsed.' });
      }

      // Check column existence
      const headers = Object.keys(records[0]);
      if (!headers.includes(targetColumn)) {
        return res.status(400).json({ error: `Target column "${targetColumn}" not found in dataset headers.` });
      }
      if (!headers.includes(sensitiveColumn)) {
        return res.status(400).json({ error: `Sensitive column "${sensitiveColumn}" not found in dataset headers.` });
      }

      // Check for consistent data / significant missing values
      const recordsWithMissingData = records.filter(
        (r: any) => r[targetColumn] === undefined || r[targetColumn] === '' || r[sensitiveColumn] === undefined || r[sensitiveColumn] === ''
      );
      if (recordsWithMissingData.length === records.length) {
        return res.status(400).json({ error: "The selected columns seem to be empty or contain only missing values." });
      }

      // 1. Identify groups in sensitive column
      const groups = [...new Set(records.map((r: any) => r[sensitiveColumn]).filter(v => v !== ''))] as string[];
      if (groups.length < 2) {
        return res.status(400).json({ error: `The sensitive column "${sensitiveColumn}" must contain at least 2 distinct groups for comparison.` });
      }
      
      // 2. Identify target values
      const targetValues = [...new Set(records.map((r: any) => r[targetColumn]).filter(v => v !== ''))] as string[];
      if (targetValues.length > 20) {
        return res.status(400).json({ error: `Target column "${targetColumn}" has too many unique values (${targetValues.length}). Bias detection works best with binary or low-cardinality outcomes.` });
      }
      
      // Heuristic for "selected" value
      let positiveValue = targetValues[0];
      const positiveKeywords = ['hired', 'approved', 'yes', '1', 'true', 'success', 'passed'];
      const foundKeyword = targetValues.find(v => 
        positiveKeywords.includes(String(v).toLowerCase())
      );
      if (foundKeyword) positiveValue = foundKeyword;

      // 3. Calculate selection rates
      const analysis: any = {
        totalRecords: records.length,
        positiveValue,
        groups: {}
      };

      groups.forEach((group: any) => {
        const groupRecords = records.filter((r: any) => r[sensitiveColumn] === group);
        const groupSelected = groupRecords.filter((r: any) => r[targetColumn] === positiveValue);
        analysis.groups[group] = {
          total: groupRecords.length,
          selected: groupSelected.length,
          rate: groupRecords.length > 0 ? (groupSelected.length / groupRecords.length) : 0
        };
      });

      // 4. Compute Demographic Parity Difference (between top 2 groups for simplicity, or min/max)
      const groupRates = Object.values(analysis.groups).map((g: any) => g.rate);
      const maxRate = Math.max(...groupRates);
      const minRate = Math.min(...groupRates);
      const difference = Math.abs(maxRate - minRate);

      // 5. Data Integrity Checks
      const missingCount = records.filter((r: any) => Object.values(r).some(v => v === '' || v === undefined || v === null)).length;
      const missingPct = ((missingCount / records.length) * 100).toFixed(1);

      // Simple PII check (Email, Phone-like, SSN-like)
      const emailRegex = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
      const piiFound = records.some((r: any) => 
        Object.values(r).some(v => typeof v === 'string' && emailRegex.test(v))
      );

      // Distribution Check
      const groupCounts = Object.values(analysis.groups).map((g: any) => g.total);
      const minGroupSize = Math.min(...groupCounts);
      const maxGroupSize = Math.max(...groupCounts);
      const imbalanceRatio = (minGroupSize / maxGroupSize).toFixed(2);

      // 6. Generate Fairness Score
      const fairnessScore = Math.max(0, Math.floor(100 - (difference * 100)));

      let biasStatus = 'No Bias Detected';
      if (fairnessScore < 60) biasStatus = 'Significant Bias Detected';
      else if (fairnessScore < 85) biasStatus = 'Moderate Bias Detected';

      res.json({
        fairnessScore,
        biasStatus,
        difference: (difference * 100).toFixed(1),
        groups: analysis.groups,
        targetValues,
        positiveValue,
        integrity: {
          missingPct,
          piiFound,
          imbalanceRatio,
          minGroupSize,
          totalRecords: records.length
        }
      });

    } catch (error: any) {
      console.error('Analysis error:', error);
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
