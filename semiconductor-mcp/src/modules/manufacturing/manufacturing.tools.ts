import { Injectable, ToolDecorator as Tool, z, ExecutionContext } from '@nitrostack/core';
import { ManufacturingMESService } from './manufacturing.service.js';

@Injectable({ deps: [ManufacturingMESService] })
export class ManufacturingMESTools {
    constructor(private readonly manufacturingMESService: ManufacturingMESService) { }

    @Tool({
        name: 'get_manufacturing_mes_telemetry',
        title: 'Manufacturing MES Telemetry',
        description: 'Fetches machine-level process telemetry (chamber pressure, temperature, recipe, operator) for a given wafer lot from GE Vernova/Siemens MES. Automatically flags threshold excursions.',
        inputSchema: z.object({
            lotId: z.string().describe('The semiconductor lot ID, e.g. LOT-8923'),
        }),
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
        },
    })
    async getTelemetry(input: { lotId: string }, ctx: ExecutionContext) {
        const lotId = String(input.lotId).replace(/^lotId:\s*/i, '').trim();
        ctx.logger.info(`Fetching MES telemetry for lot: ${lotId}`);
        const telemetry = await this.manufacturingMESService.getTelemetry(lotId);
        if (!telemetry) {
            return { error: `Lot ${lotId} not found in MES database.` };
        }
        return telemetry;
    }
}
