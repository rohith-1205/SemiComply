import { Injectable, ToolDecorator as Tool, z, ExecutionContext } from '@nitrostack/core';
import { ShippingTradeService } from './shipping.service.js';

@Injectable({ deps: [ShippingTradeService] })
export class ShippingTradeTools {
    constructor(private readonly shippingTradeService: ShippingTradeService) { }

    @Tool({
        name: 'get_shipping_and_trade_compliance',
        title: 'Shipping & Trade Compliance',
        description: 'Retrieves international shipment logistics, export control classification (ECCN), HS code, applicable tariffs, and live customs hold status from SAP/ERP systems.',
        inputSchema: z.object({
            shipmentId: z.string().describe('The tracking/shipment ID, e.g. SHIP-2026-04471'),
        }),
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
        },
    })
    async getCompliance(input: { shipmentId: string }, ctx: ExecutionContext) {
        const shipmentId = String(input.shipmentId).replace(/^shipmentId:\s*/i, '').trim();
        ctx.logger.info(`Fetching shipping compliance for: ${shipmentId}`);
        const compliance = await this.shippingTradeService.getCompliance(shipmentId);
        if (!compliance) {
            return { error: `Shipment ${shipmentId} not found in ERP system.` };
        }
        return compliance;
    }
}
