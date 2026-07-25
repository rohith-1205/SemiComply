import { Injectable } from '@nitrostack/core';

const SHEET_ID = '2PACX-1vTM9gAH-TLKghwnmwWQNRrSeVXlXOiMNSGoP7B7IMpxU7KPJoZLfMpkCdZoyRdHXJTEP2oXroBVV5Hj';
const BASE_URL = `https://docs.google.com/spreadsheets/d/e/${SHEET_ID}/pub`;

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

    private readonly TAB_GIDS: Record<string, string> = {
        'Design Revisions': '0',
        'MES Telemetry': '1511561505',
        'Yield Data': '318655177',
        'Product Specs': '710900377',
        'Shipping': '23966863',
    };

    async fetchSheet(tabName: string): Promise<Record<string, string>[]> {
        const cached = this.cache.get(tabName);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            return cached.data;
        }

        const gid = this.TAB_GIDS[tabName];
        if (!gid) {
            throw new Error(`Unknown tab name: "${tabName}". Available: ${Object.keys(this.TAB_GIDS).join(', ')}`);
        }

        const url = `${BASE_URL}?output=csv&gid=${gid}`;
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
}
