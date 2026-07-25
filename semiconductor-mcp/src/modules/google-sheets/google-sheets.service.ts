import { Injectable } from '@nitrostack/core';

const SHEET_ID = '1e2hu_SSxkcLQNqGDg2CRKikUxv7fpwrWIAlym-cRerY';
const BASE_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`;

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

    async fetchSheet(tabName: string): Promise<Record<string, string>[]> {
        const cached = this.cache.get(tabName);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            return cached.data;
        }

        const url = `${BASE_URL}&sheet=${encodeURIComponent(tabName)}`;
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
