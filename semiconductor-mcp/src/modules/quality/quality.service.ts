import { Injectable } from '@nitrostack/core';
import { GoogleSheetsService } from '../google-sheets/google-sheets.service.js';

export interface FailingBin {
    binCode: string;
    count: number;
    impact: string;
}

export interface YieldSummary {
    lotId: string;
    totalWafersTested: number;
    overallYield: string;
    failingBins: FailingBin[];
}

@Injectable({ deps: [GoogleSheetsService] })
export class QualityTestService {
    constructor(private readonly sheets: GoogleSheetsService) {}

    async getYieldSummary(lotId: string): Promise<YieldSummary | undefined> {
        const map = await this.sheets.fetchSheetAsMap('Yield Data', 'lotId');
        const row = map[lotId];
        if (!row) return undefined;

        let failingBins: FailingBin[] = [];
        if (row.failingBins) {
            try {
                failingBins = JSON.parse(row.failingBins);
            } catch {
                failingBins = [];
            }
        }

        return {
            lotId: row.lotId,
            totalWafersTested: parseInt(row.totalWafersTested, 10) || 0,
            overallYield: row.overallYield,
            failingBins,
        };
    }
}
