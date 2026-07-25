import { Injectable, ToolDecorator as Tool, z, ExecutionContext } from '@nitrostack/core';
import { DesignService } from './design.service.js';

@Injectable({ deps: [DesignService] })
export class DesignTools {
    constructor(private readonly designService: DesignService) { }

    @Tool({
        name: 'get_cadence_design_revision',
        title: 'Cadence Design Revision Lookup',
        description: 'Retrieves layout/IP block revision metadata from Cadence Virtuoso/Altium for a given revision ID. Returns designer, IP block, changes, and timestamp.',
        inputSchema: z.object({
            revisionId: z.string().describe('The revision identifier for the IP block or PCB layout, e.g. REV-SERDES-PHY-v2.3'),
        }),
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
        },
    })
    async getRevision(input: { revisionId: string }, ctx: ExecutionContext) {
        const revisionId = String(input.revisionId).replace(/^revisionId:\s*/i, '').trim();
        ctx.logger.info(`Fetching design revision: ${revisionId}`);
        const revision = await this.designService.getRevision(revisionId);
        if (!revision) {
            return { error: `Revision ${revisionId} not found in Cadence vault.` };
        }
        return revision;
    }
}
