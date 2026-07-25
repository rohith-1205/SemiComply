import { Injectable, ToolDecorator as Tool, z, ExecutionContext } from '@nitrostack/core';
import { ProductDocService } from './product.service.js';

@Injectable({ deps: [ProductDocService] })
export class ProductDocTools {
    constructor(private readonly productDocService: ProductDocService) { }

    @Tool({
        name: 'get_product_datasheet_specs',
        title: 'Product Datasheet & Compliance Specs',
        description: 'Searches document repositories for a product\'s official datasheet, operating voltage limits, thermal thresholds, and compliance certifications.',
        inputSchema: z.object({
            productId: z.string().describe('The product ID or part number, e.g. SERDES-PHY-BLOCK'),
        }),
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
        },
    })
    async getSpecs(input: { productId: string }, ctx: ExecutionContext) {
        const productId = String(input.productId).replace(/^productId:\s*/i, '').trim();
        ctx.logger.info(`Fetching product specs for: ${productId}`);
        const specs = await this.productDocService.getSpecs(productId);
        if (!specs) {
            return { error: `No datasheet found for product ${productId}.` };
        }
        return specs;
    }
}
