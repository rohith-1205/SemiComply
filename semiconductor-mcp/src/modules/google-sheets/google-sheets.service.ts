import { Injectable } from '@nitrostack/core';
import { google, sheets_v4 } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';

const PUBLISHED_SHEET_ID = '2PACX-1vTM9gAH-TLKghwnmwWQNRrSeVXlXOiMNSGoP7B7IMpxU7KPJoZLfMpkCdZoyRdHXJTEP2oXroBVV5Hj';
const PUBLISHED_BASE_URL = `https://docs.google.com/spreadsheets/d/e/${PUBLISHED_SHEET_ID}/pub`;

function parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (inQuotes) {
            if (char === '"') {
                if (i + 1 < line.length && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                current += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
            } else if (char === ',') {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
    }
    result.push(current.trim());
    return result;
}

function parseCsv(csv: string): Record<string, string>[] {
    const lines = csv.split('\n').filter((l) => l.trim());
    if (lines.length < 2) return [];

    const headers = parseCsvLine(lines[0]);
    const rows: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
        const values = parseCsvLine(lines[i]);
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => {
            row[h] = values[idx] || '';
        });
        rows.push(row);
    }
    return rows;
}

@Injectable()
export class GoogleSheetsService {
    private cache = new Map<string, { data: Record<string, string>[]; timestamp: number }>();
    private readonly CACHE_TTL = 30_000;
    private sheetsClient: sheets_v4.Sheets | null = null;

    private readonly TAB_GIDS: Record<string, string> = {
        'Design Revisions': '0',
        'MES Telemetry': '1511561505',
        'Yield Data': '318655177',
        'Product Specs': '710900377',
        'Shipping': '23966863',
    };

    private readonly TAB_COLUMNS: Record<string, string> = {
        'Design Revisions': 'revisionId,lotId,designer,ipBlock,changes,timestamp',
        'MES Telemetry': 'lotId,stationId,recipeName,chamberPressure,temperature,operatorId',
        'Yield Data': 'lotId,totalWafersTested,overallYield,failingBins',
        'Product Specs': 'productId,lotId,datasheetUrl,operatingVoltage,maxThermalThreshold,complianceCertifications',
        'Shipping': 'shipmentId,productId,lotId,origin,destination,eccnClassification,hsCode,applicableTariffs,status,routeOrder,timestamp',
    };

    private getSpreadsheetId(): string {
        return process.env.GOOGLE_SPREADSHEET_ID || '';
    }

    private async authorize(): Promise<sheets_v4.Sheets> {
        if (this.sheetsClient) return this.sheetsClient;

        const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH || './credentials/service-account.json';
        const fullPath = path.resolve(keyPath);

        if (!fs.existsSync(fullPath)) {
            throw new Error(`Service account key not found at ${fullPath}. Set GOOGLE_SERVICE_ACCOUNT_PATH in .env`);
        }

        const keyFile = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));

        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: keyFile.client_email,
                private_key: keyFile.private_key,
            },
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        this.sheetsClient = google.sheets({ version: 'v4', auth });
        return this.sheetsClient;
    }

    // ─── Read Methods (published CSV) ────────────────────────────────

    async fetchSheet(tabName: string): Promise<Record<string, string>[]> {
        const cached = this.cache.get(tabName);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            return cached.data;
        }

        const gid = this.TAB_GIDS[tabName];
        if (!gid) {
            throw new Error(`Unknown tab name: "${tabName}". Available: ${Object.keys(this.TAB_GIDS).join(', ')}`);
        }

        const url = `${PUBLISHED_BASE_URL}?output=csv&gid=${gid}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Failed to fetch sheet "${tabName}": ${response.statusText}`);
        }

        const csv = await response.text();
        const rows = parseCsv(csv);
        this.cache.set(tabName, { data: rows, timestamp: Date.now() });
        return rows;
    }

    async fetchSheetAsMap<K extends string>(
        tabName: string,
        keyField: K,
    ): Promise<Record<string, Record<string, string>>> {
        const rows = await this.fetchSheet(tabName);
        const map: Record<string, Record<string, string>> = {};
        for (const row of rows) {
            const key = row[keyField];
            if (key) {
                map[key] = row;
            }
        }
        return map;
    }

    // ─── Write Methods (Sheets API v4) ────────────────────────────────

    async appendRow(tabName: string, values: string[]): Promise<{ updatedRange: string }> {
        const client = await this.authorize();
        const spreadsheetId = this.getSpreadsheetId();
        const columns = this.TAB_COLUMNS[tabName];
        if (!columns) throw new Error(`Unknown tab: "${tabName}"`);

        const response = await client.spreadsheets.values.append({
            spreadsheetId,
            range: `'${tabName}'!A:Z`,
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            requestBody: { values: [values] },
        });

        this.invalidateCache(tabName);

        const updatedRange = response.data.updates?.updatedRange || '';
        return { updatedRange };
    }

    invalidateCache(tabName: string): void {
        this.cache.delete(tabName);
    }
}
