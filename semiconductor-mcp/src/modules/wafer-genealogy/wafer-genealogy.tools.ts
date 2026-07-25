import { Injectable, ToolDecorator as Tool, Widget, z, ExecutionContext } from '@nitrostack/core';
import { WaferGenealogyService } from './wafer-genealogy.service.js';

@Injectable({ deps: [WaferGenealogyService] })
export class WaferGenealogyTools {
    constructor(private readonly genealogyService: WaferGenealogyService) { }

    @Tool({
        name: 'trace_wafer_genealogy',
        title: 'Wafer Batch Genealogy Trace',
        description: 'Traces the complete lifecycle of a wafer batch across all manufacturing systems. Given a batchId (which maps to lotId), retrieves and chronologically combines records from Design Revisions, MES Telemetry, Yield Data, Product Specs, and Shipping into a single genealogy timeline. Returns both a structured event list sorted by time, a concise human-readable lifecycle summary, and a visual timeline widget showing the full journey from design through shipping. Use this when the user asks for the full history, genealogy, or lifecycle of a wafer batch.',
        inputSchema: z.object({
            batchId: z.string().describe('The wafer batch/lot ID to trace, e.g. LOT-8923'),
        }),
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
        },
        invocation: {
            invoking: 'Tracing wafer genealogy...',
            invoked: 'Genealogy trace complete',
        },
        examples: {
            request: { batchId: 'LOT-8923' },
            response: {
                batchId: 'LOT-8923',
                totalEvents: 13,
                phases: [
                    { name: 'Design', icon: '✏️', color: '#6366f1', events: [{ timestamp: '2026-02-18T11:45:00Z', source: 'Design Revisions', processStep: 'Design — DMA_CONTROLLER', details: { revisionId: 'REV-DMA-CTRL-v1.1', designer: 'M. Patel', ipBlock: 'DMA_CONTROLLER', changes: 'Fixed AXI bus protocol violation' } }] },
                    { name: 'Manufacturing', icon: '🏭', color: '#f59e0b', events: [{ timestamp: '2026-07-25T14:40:55Z', source: 'MES Telemetry', processStep: 'Manufacturing — POLY_SILICON_ETCH_V3', details: { stationId: 'ETCH-CHAMBER-07', recipeName: 'POLY_SILICON_ETCH_V3', temperature: '185.4 °C' } }] },
                ],
                route: [
                    { leg: 1, origin: 'Taiwan (Hsinchu)', destination: 'United States (Austin TX)', eccnClassification: '3A090.a', hsCode: '8542.31.0000', applicableTariffs: '25% Section 301', status: 'Customs Hold', isBlocked: true },
                    { leg: 2, origin: 'South Korea (Hwaseong)', destination: 'Germany (Munich)', eccnClassification: '3A001', hsCode: '8542.33.0000', applicableTariffs: '0% EU GSP', status: 'Cleared', isBlocked: false },
                ],
                summary: 'Wafer Batch LOT-8923 — 13 events across 5 sources',
            },
        },
    })
    @Widget('wafer-lifecycle')
    async trace(input: { batchId: string }, ctx: ExecutionContext) {
        const batchId = String(input.batchId).replace(/^batchId:\s*/i, '').trim();
        ctx.logger.info(`Tracing wafer genealogy for batch: ${batchId}`);

        try {
            const result = await this.genealogyService.trace(batchId);
            ctx.logger.info(`Genealogy trace complete: ${result.totalEvents} events found`);

            return {
                batchId: result.batchId,
                totalEvents: result.totalEvents,
                timeline: result.timeline,
                summary: result.summary,
                route: result.route,
                phases: result.phases,
                products: result.widget?.products || [],
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            ctx.logger.error(`Genealogy trace failed: ${message}`);
            return { error: message };
        }
    }
}
