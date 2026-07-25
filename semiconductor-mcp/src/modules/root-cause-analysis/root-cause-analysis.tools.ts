import { Injectable, ToolDecorator as Tool, z, ExecutionContext } from '@nitrostack/core';
import { RootCauseAnalysisService } from './root-cause-analysis.service.js';

@Injectable({ deps: [RootCauseAnalysisService] })
export class RootCauseAnalysisTools {
    constructor(private readonly rootCauseAnalysisService: RootCauseAnalysisService) { }

    @Tool({
        name: 'analyze_yield_root_cause',
        title: 'Yield Root Cause Analysis (Orchestrator)',
        description: 'Investigates why a wafer lot\'s yield dropped AND checks shipment compliance in a single call. Internally calls manufacturing, quality, and design tools, correlates process excursions with failure bins, and checks shipment export-control/customs status. IMPORTANT: When the user asks about both yield AND shipment safety, pass BOTH lotId and shipmentId in this one tool call — do NOT call get_shipping_and_trade_compliance separately.',
        inputSchema: z.object({
            lotId: z.string().describe('The wafer lot ID to investigate'),
            shipmentId: z.string().optional().describe('Shipment ID to check for customs holds, export-control violations, and compliance risk (e.g. SHIP-2026-04471). Always provide this when the user asks about shipment safety or compliance.'),
        }),
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
        },
    })
    async analyze(input: { lotId: string; shipmentId?: string }, ctx: ExecutionContext) {
        const lotId = String(input.lotId).replace(/^lotId:\s*/i, '').trim();
        const shipmentId = input.shipmentId ? String(input.shipmentId).replace(/^shipmentId:\s*/i, '').trim() : undefined;
        ctx.logger.info(`Starting root cause analysis for lot: ${lotId}`);

        try {
            const result = await this.rootCauseAnalysisService.analyze(
                lotId,
                shipmentId,
            );
            ctx.logger.info(`Root cause analysis complete for lot: ${lotId}`);
            return result;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            ctx.logger.error(`Root cause analysis failed: ${message}`);
            return { error: message };
        }
    }
}
