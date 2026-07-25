import { Injectable, ToolDecorator as Tool, z, ExecutionContext } from '@nitrostack/core';
import { ShippingTradeService } from './shipping.service.js';

@Injectable({ deps: [ShippingTradeService] })
export class ShippingTradeTools {
    constructor(private readonly shippingTradeService: ShippingTradeService) { }

    @Tool({
        name: 'get_shipping_and_trade_compliance',
        title: 'Shipping & Trade Compliance',
        description: 'Retrieves shipment logistics, export control classification (ECCN), HS code, tariffs, and customs hold status. Can be queried by shipment ID or by product ID to find all active shipments for a product. When the user asks about shipping restrictions for a product, use the productId parameter to find all related shipments and their compliance status. Returns route, export-control law (ECCN), taxes (tariffs + HS code), and order/customs status.',
        inputSchema: z.object({
            shipmentId: z.string().optional().describe('The tracking/shipment ID, e.g. SHIP-2026-04471. Use this to look up a specific shipment.'),
            productId: z.string().optional().describe('The product ID to find all shipments containing this product, e.g. SERDES-PHY-BLOCK. Use this when the user asks about shipping restrictions, routes, or compliance for a specific product.'),
        }),
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
        },
    })
    async getCompliance(
        input: { shipmentId?: string; productId?: string },
        ctx: ExecutionContext,
    ) {
        if (input.productId) {
            const productId = String(input.productId).replace(/^productId:\s*/i, '').trim();
            ctx.logger.info(`Fetching shipping compliance for product: ${productId}`);
            const shipments = await this.shippingTradeService.getByProductId(productId);
            if (shipments.length === 0) {
                return { error: `No shipments found for product ${productId}.` };
            }
            return {
                productId,
                totalShipments: shipments.length,
                shipments: shipments.map((s) => ({
                    shipmentId: s.shipmentId,
                    origin: s.origin,
                    destination: s.destination,
                    eccnClassification: s.eccnClassification,
                    hsCode: s.hsCode,
                    applicableTariffs: s.applicableTariffs,
                    status: s.status,
                })),
            };
        }

        if (input.shipmentId) {
            const shipmentId = String(input.shipmentId).replace(/^shipmentId:\s*/i, '').trim();
            ctx.logger.info(`Fetching shipping compliance for: ${shipmentId}`);
            const compliance = await this.shippingTradeService.getCompliance(shipmentId);
            if (!compliance) {
                return { error: `Shipment ${shipmentId} not found in ERP system.` };
            }
            return compliance;
        }

        return { error: 'Please provide either a shipmentId or productId.' };
    }
}
