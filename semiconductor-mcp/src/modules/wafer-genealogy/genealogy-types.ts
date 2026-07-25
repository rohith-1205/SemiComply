export interface GenealogyEvent {
    timestamp: string;
    source: string;
    processStep: string;
    details: Record<string, unknown>;
}

export interface GenealogyContributor {
    readonly sourceName: string;
    fetchEvents(batchId: string): Promise<GenealogyEvent[]>;
}

export interface RouteStop {
    leg: number;
    origin: string;
    destination: string;
    eccnClassification: string;
    hsCode: string;
    applicableTariffs: string;
    status: string;
    isBlocked: boolean;
}

export interface LifecyclePhase {
    name: string;
    icon: string;
    color: string;
    events: GenealogyEvent[];
}

export interface GenealogyResult {
    batchId: string;
    totalEvents: number;
    timeline: GenealogyEvent[];
    summary: string;
    route?: RouteStop[];
    phases?: LifecyclePhase[];
    widget?: {
        batchId: string;
        phases: LifecyclePhase[];
        route: RouteStop[];
        products: Record<string, unknown>[];
    };
}
