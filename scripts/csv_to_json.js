import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.resolve(__dirname, '../warehouse_decision_engine_sample_dataset.csv');
const jsonOutputDir = path.resolve(__dirname, '../ui/src/data');
const jsonOutputPath = path.resolve(jsonOutputDir, 'warehouse_orders.json');

// Helper to parse CSV line while respecting quotes
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

try {
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV File not found at: ${csvPath}`);
    process.exit(1);
  }

  const csvData = fs.readFileSync(csvPath, 'utf8');
  const lines = csvData.split(/\r?\n/).filter(line => line.trim().length > 0);
  
  if (lines.length === 0) {
    console.error('CSV file is empty');
    process.exit(1);
  }

  const headers = parseCSVLine(lines[0]);
  const records = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    // Skip mismatching rows
    if (values.length !== headers.length) {
      continue;
    }

    const row = {};
    headers.forEach((header, idx) => {
      let val = values[idx];
      
      // Auto-coerce numerical values
      if (val === '') {
        val = null;
      } else if (!isNaN(val) && val !== null) {
        val = val.includes('.') ? parseFloat(val) : parseInt(val, 10);
      } else if (val === 'Yes' || val === 'No') {
        // Keep string, but we can check boolean conditions in JS
      }
      
      row[header] = val;
    });

    records.push(row);
  }

  // Ensure output directory exists
  if (!fs.existsSync(jsonOutputDir)) {
    fs.mkdirSync(jsonOutputDir, { recursive: true });
  }

  fs.writeFileSync(jsonOutputPath, JSON.stringify(records, null, 2), 'utf8');
  console.log(`Successfully converted ${records.length} records to JSON: ${jsonOutputPath}`);

} catch (error) {
  console.error('Error converting CSV to JSON:', error);
  process.exit(1);
}
