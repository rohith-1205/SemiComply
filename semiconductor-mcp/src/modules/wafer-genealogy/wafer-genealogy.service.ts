import { Injectable } from '@nitrostack/core';
import { GenealogyContributorRegistry } from './genealogy-registry.js';
import { GenealogyEvent, GenealogyResult, RouteStop, LifecyclePhase } from './genealogy-types.js';
import { ManufacturingContributor } from './contributors/manufacturing.contributor.js';
import { QualityContributor } from './contributors/quality.contributor.js';
import { DesignContributor } from './contributors/design.contributor.js';
import { ProductContributor } from './contributors/product.contributor.js';
import { ShippingContributor } from './contributors/shipping.contributor.js';

@Injectable({
    deps: [
        GenealogyContributorRegistry,
        ManufacturingContributor,
        QualityContributor,
        DesignContributor,
        ProductContributor,
        ShippingContributor,
    ],
})
export class WaferGenealogyService {
    constructor(
        private readonly registry: GenealogyContributorRegistry,
        private readonly mfgContributor: ManufacturingContributor,
        private readonly qualityContributor: QualityContributor,
        private readonly designContributor: DesignContributor,
        private readonly productContributor: ProductContributor,
        private readonly shippingContributor: ShippingContributor,
    ) {
        this.registry.register(this.mfgContributor);
        this.registry.register(this.qualityContributor);
        this.registry.register(this.designContributor);
        this.registry.register(this.productContributor);
        this.registry.register(this.shippingContributor);
    }

    getRegisteredContributors(): string[] {
        return this.registry.getContributors().map((c) => c.sourceName);
    }

    async trace(batchId: string): Promise<GenealogyResult> {
        const contributors = this.registry.getContributors();
        const allEvents: GenealogyEvent[] = [];

        const results = await Promise.allSettled(
            contributors.map((c) => c.fetchEvents(batchId)),
        );

        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            const name = contributors[i]?.sourceName || `Contributor ${i}`;
            if (result.status === 'fulfilled') {
                allEvents.push(...result.value);
            } else {
                console.error(`[Genealogy] Contributor "${name}" failed:`, result.reason);
            }
        }

        allEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        const phases = this.buildPhases(allEvents);
        const route = this.buildRoute(allEvents);
        const products = allEvents.filter((e) => e.source === 'Product Specs');
        const summary = this.buildSummary(batchId, allEvents, route);

        return {
            batchId,
            totalEvents: allEvents.length,
            timeline: allEvents,
            summary,
            route,
            phases,
            widget: {
                batchId,
                phases,
                route,
                products: products.map((e) => e.details),
            },
        };
    }

    private buildPhases(events: GenealogyEvent[]): LifecyclePhase[] {
        const phaseMap: Record<string, GenealogyEvent[]> = {
            Design: [],
            Manufacturing: [],
            'Quality & Test': [],
            Product: [],
            'Shipping & Trade': [],
        };

        for (const event of events) {
            if (event.source === 'Design Revisions') phaseMap.Design.push(event);
            else if (event.source === 'MES Telemetry') phaseMap.Manufacturing.push(event);
            else if (event.source === 'Quality & Test') phaseMap['Quality & Test'].push(event);
            else if (event.source === 'Product Specs') phaseMap.Product.push(event);
            else if (event.source === 'Shipping & Trade') phaseMap['Shipping & Trade'].push(event);
        }

        const phaseConfig: Record<string, { icon: string; color: string }> = {
            Design: { icon: '✏️', color: '#6366f1' },
            Manufacturing: { icon: '🏭', color: '#f59e0b' },
            'Quality & Test': { icon: '🔍', color: '#10b981' },
            Product: { icon: '📦', color: '#8b5cf6' },
            'Shipping & Trade': { icon: '🚢', color: '#3b82f6' },
        };

        return Object.entries(phaseMap)
            .filter(([, events]) => events.length > 0)
            .map(([name, events]) => ({
                name,
                icon: phaseConfig[name]?.icon || '📋',
                color: phaseConfig[name]?.color || '#6b7280',
                events,
            }));
    }

    private buildRoute(events: GenealogyEvent[]): RouteStop[] {
        const shippingEvents = events.filter((e) => e.source === 'Shipping & Trade');

        return shippingEvents.map((event, index) => {
            const status = (event.details.status as string) || '';
            const isBlocked = status.toLowerCase().includes('hold') || status.toLowerCase().includes('blocked');

            return {
                leg: (event.details.routeOrder as number) || index + 1,
                origin: (event.details.origin as string) || '',
                destination: (event.details.destination as string) || '',
                eccnClassification: (event.details.eccnClassification as string) || '',
                hsCode: (event.details.hsCode as string) || '',
                applicableTariffs: (event.details.applicableTariffs as string) || '',
                status,
                isBlocked,
            };
        });
    }

    private buildSummary(batchId: string, events: GenealogyEvent[], route: RouteStop[]): string {
        if (events.length === 0) {
            return `No genealogy records found for batch ${batchId}. Verify the batch ID exists across manufacturing, quality, design, product, or shipping systems.`;
        }

        const sources = [...new Set(events.map((e) => e.source))];
        const lines: string[] = [];

        lines.push(`Wafer Batch ${batchId} — Lifecycle Genealogy`);
        lines.push(`${events.length} event(s) found across ${sources.length} data source(s): ${sources.join(', ')}`);
        lines.push('');

        for (const event of events) {
            const details = event.details;
            const detailParts: string[] = [];

            if (event.source === 'MES Telemetry') {
                detailParts.push(`Station: ${details.stationId}`);
                detailParts.push(`Recipe: ${details.recipeName}`);
                detailParts.push(`Pressure: ${details.chamberPressure}`);
                detailParts.push(`Temperature: ${details.temperature}`);
                detailParts.push(`Operator: ${details.operatorId}`);
            } else if (event.source === 'Quality & Test') {
                detailParts.push(`Yield: ${details.overallYield}`);
                detailParts.push(`Wafers tested: ${details.totalWafersTested}`);
                const bins = details.failingBins as { binCode: string; count: number; impact: string }[];
                if (Array.isArray(bins) && bins.length > 0) {
                    detailParts.push(`Failing bins: ${bins.map((b) => `${b.binCode} (${b.count})`).join(', ')}`);
                }
            } else if (event.source === 'Design Revisions') {
                detailParts.push(`Revision: ${details.revisionId}`);
                detailParts.push(`IP Block: ${details.ipBlock}`);
                detailParts.push(`Designer: ${details.designer}`);
                detailParts.push(`Changes: ${details.changes}`);
            } else if (event.source === 'Product Specs') {
                detailParts.push(`Product: ${details.productId}`);
                detailParts.push(`Voltage: ${details.operatingVoltage}`);
                detailParts.push(`Thermal limit: ${details.maxThermalThreshold}`);
                const certs = details.complianceCertifications as string[];
                if (Array.isArray(certs) && certs.length > 0) {
                    detailParts.push(`Certifications: ${certs.join(', ')}`);
                }
            } else if (event.source === 'Shipping & Trade') {
                detailParts.push(`Route: ${details.origin} → ${details.destination}`);
                detailParts.push(`ECCN: ${details.eccnClassification}`);
                detailParts.push(`HS Code: ${details.hsCode}`);
                detailParts.push(`Tariffs: ${details.applicableTariffs}`);
                detailParts.push(`Status: ${details.status}`);
            }

            lines.push(`[${event.source}] ${event.processStep}`);
            for (const part of detailParts) {
                lines.push(`  ${part}`);
            }
        }

        if (route.length > 0) {
            lines.push('');
            lines.push('=== Physical Route ===');
            for (const stop of route) {
                const arrow = stop.isBlocked ? 'BLOCKED' : '→';
                lines.push(`  Leg ${stop.leg}: ${stop.origin} ${arrow} ${stop.destination} [${stop.status}]`);
            }
        }

        return lines.join('\n');
    }
}
