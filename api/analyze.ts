import type { VercelRequest, VercelResponse } from '@vercel/node';
import { parse } from 'csv-parse/sync';
import Busboy from 'busboy';

function parseMultipart(req: VercelRequest): Promise<{ fields: Record<string, string>; fileBuffer: Buffer }> {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers as any });
    const fields: Record<string, string> = {};
    let fileBuffer = Buffer.alloc(0);

    busboy.on('field', (name: string, val: string) => { fields[name] = val; });
    busboy.on('file', (_name: string, stream: any) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => { fileBuffer = Buffer.concat(chunks); });
    });
    busboy.on('finish', () => resolve({ fields, fileBuffer }));
    busboy.on('error', reject);
    req.pipe(busboy);
  });
}

export const config = { api: { bodyParser: false } };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { fields, fileBuffer } = await parseMultipart(req);
    if (!fileBuffer.length) return res.status(400).json({ error: 'No file uploaded' });

    const { targetColumn, sensitiveColumn } = fields;
    if (!targetColumn || !sensitiveColumn) return res.status(400).json({ error: 'Missing column selection' });

    const fileContent = fileBuffer.toString('utf8');

    let delimiter = ',';
    const firstLine = fileContent.split('\n')[0];
    if (!firstLine.includes(',') && firstLine.includes(';')) delimiter = ';';
    else if (!firstLine.includes(',') && firstLine.includes('\t')) delimiter = '\t';

    const records = parse(fileContent, { columns: true, skip_empty_lines: true, delimiter, trim: true, bom: true });

    if (!records || records.length === 0) return res.status(400).json({ error: 'Selected file is empty or could not be parsed.' });

    const headers = Object.keys(records[0]);
    if (!headers.includes(targetColumn)) return res.status(400).json({ error: `Target column "${targetColumn}" not found in dataset headers.` });
    if (!headers.includes(sensitiveColumn)) return res.status(400).json({ error: `Sensitive column "${sensitiveColumn}" not found in dataset headers.` });

    const recordsWithMissingData = records.filter(
      (r: any) => r[targetColumn] === undefined || r[targetColumn] === '' || r[sensitiveColumn] === undefined || r[sensitiveColumn] === ''
    );
    if (recordsWithMissingData.length === records.length) return res.status(400).json({ error: "The selected columns seem to be empty or contain only missing values." });

    const groups = [...new Set(records.map((r: any) => r[sensitiveColumn]).filter((v: any) => v !== ''))] as string[];
    if (groups.length < 2) return res.status(400).json({ error: `The sensitive column "${sensitiveColumn}" must contain at least 2 distinct groups for comparison.` });

    const targetValues = [...new Set(records.map((r: any) => r[targetColumn]).filter((v: any) => v !== ''))] as string[];
    if (targetValues.length > 20) return res.status(400).json({ error: `Target column "${targetColumn}" has too many unique values (${targetValues.length}). Bias detection works best with binary or low-cardinality outcomes.` });

    let positiveValue = targetValues[0];
    const positiveKeywords = ['hired', 'approved', 'yes', '1', 'true', 'success', 'passed'];
    const foundKeyword = targetValues.find((v: any) => positiveKeywords.includes(String(v).toLowerCase()));
    if (foundKeyword) positiveValue = foundKeyword;

    const analysis: any = { totalRecords: records.length, positiveValue, groups: {} };
    groups.forEach((group: any) => {
      const groupRecords = records.filter((r: any) => r[sensitiveColumn] === group);
      const groupSelected = groupRecords.filter((r: any) => r[targetColumn] === positiveValue);
      analysis.groups[group] = { total: groupRecords.length, selected: groupSelected.length, rate: groupRecords.length > 0 ? groupSelected.length / groupRecords.length : 0 };
    });

    const groupRates = Object.values(analysis.groups).map((g: any) => g.rate);
    const maxRate = Math.max(...groupRates);
    const minRate = Math.min(...groupRates);
    const difference = Math.abs(maxRate - minRate);

    const missingCount = records.filter((r: any) => Object.values(r).some((v: any) => v === '' || v === undefined || v === null)).length;
    const missingPct = ((missingCount / records.length) * 100).toFixed(1);

    const emailRegex = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
    const piiFound = records.some((r: any) => Object.values(r).some((v: any) => typeof v === 'string' && emailRegex.test(v)));

    const groupCounts = Object.values(analysis.groups).map((g: any) => g.total);
    const minGroupSize = Math.min(...groupCounts);
    const maxGroupSize = Math.max(...groupCounts);
    const imbalanceRatio = (minGroupSize / maxGroupSize).toFixed(2);

    const fairnessScore = Math.max(0, Math.floor(100 - difference * 100));
    let biasStatus = 'No Bias Detected';
    if (fairnessScore < 60) biasStatus = 'Significant Bias Detected';
    else if (fairnessScore < 85) biasStatus = 'Moderate Bias Detected';

    res.json({
      fairnessScore, biasStatus, difference: (difference * 100).toFixed(1),
      groups: analysis.groups, targetValues, positiveValue,
      integrity: { missingPct, piiFound, imbalanceRatio, minGroupSize, totalRecords: records.length }
    });
  } catch (error: any) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
