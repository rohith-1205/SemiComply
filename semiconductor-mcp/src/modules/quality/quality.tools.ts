import { Injectable, ToolDecorator as Tool, z, ExecutionContext } from '@nitrostack/core';
import { QualityTestService } from './quality.service.js';

@Injectable({ deps: [QualityTestService] })
export class QualityTestTools {
    constructor(private readonly qualityTestService: QualityTestService) { }

    @Tool({
        name: 'get_lot_yield_summary',
        title: 'Lot Yield Summary (STDF)',
        description: 'Parses STDF binary test logs for a given lot and returns a summarized yield report with failing bin codes, counts, and impacts.',
        inputSchema: z.object({
            lotId: z.string().describe('The lot identifier to fetch quality test summaries for'),
        }),
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
        },
    })
    async getYieldSummary(input: { lotId: string }, ctx: ExecutionContext) {
        const lotId = String(input.lotId).replace(/^lotId:\s*/i, '').trim();
        ctx.logger.info(`Fetching yield summary for lot: ${lotId}`);
        const summary = await this.qualityTestService.getYieldSummary(lotId);
        if (!summary) {
            return { error: `No yield data found for lot ${lotId}.` };
        }
        return summary;
    }
}
