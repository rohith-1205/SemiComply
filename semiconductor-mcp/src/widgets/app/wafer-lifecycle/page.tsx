'use client';

import { useTheme, useMaxHeight, useWidgetSDK } from '@nitrostack/widgets';
import { useState } from 'react';

export const dynamic = 'force-dynamic';

interface RouteStop {
    leg: number;
    origin: string;
    destination: string;
    eccnClassification: string;
    hsCode: string;
    applicableTariffs: string;
    status: string;
    isBlocked: boolean;
}

interface LifecycleEvent {
    timestamp: string;
    source: string;
    processStep: string;
    details: Record<string, unknown>;
}

interface LifecyclePhase {
    name: string;
    icon: string;
    color: string;
    events: LifecycleEvent[];
}

interface WidgetData {
    batchId: string;
    phases: LifecyclePhase[];
    route: RouteStop[];
    products: Record<string, unknown>[];
}

function formatDate(ts: string): string {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(ts: string): string {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export default function WaferLifecycleWidget() {
    const theme = useTheme();
    const maxHeight = useMaxHeight();
    const isDark = theme === 'dark';
    const { isReady, getToolOutput } = useWidgetSDK();
    const data = getToolOutput<WidgetData>();
    const [expandedPhase, setExpandedPhase] = useState<string | null>(null);

    if (!data) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', color: isDark ? '#fff' : '#000' }}>
                Loading lifecycle data... {isReady ? '(SDK ready)' : '(waiting for SDK)'}
            </div>
        );
    }

    const bg = isDark ? '#0a0a0a' : '#f8fafc';
    const cardBg = isDark ? '#1a1a1a' : '#ffffff';
    const borderColor = isDark ? '#333' : '#e2e8f0';
    const textPrimary = isDark ? '#f1f5f9' : '#0f172a';
    const textSecondary = isDark ? '#94a3b8' : '#64748b';

    return (
        <div style={{ background: bg, minHeight: '100vh', maxHeight: maxHeight || '100vh', overflow: 'auto', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            {/* Header */}
            <div style={{ background: cardBg, borderBottom: `1px solid ${borderColor}`, padding: '20px 24px', position: 'sticky', top: 0, zIndex: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: textPrimary, letterSpacing: '-0.02em' }}>
                            Wafer Lifecycle
                        </h1>
                        <p style={{ margin: '4px 0 0', fontSize: '13px', color: textSecondary }}>
                            Batch {data.batchId} • {data.phases.length} phases • {data.route.length} route legs
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                        {data.phases.map((phase) => (
                            <div key={phase.name} style={{ width: '8px', height: '8px', borderRadius: '50%', background: phase.color }} title={phase.name} />
                        ))}
                    </div>
                </div>
            </div>

            {/* Phase Cards */}
            <div style={{ padding: '16px 24px' }}>
                {data.phases.map((phase, phaseIdx) => {
                    const isExpanded = expandedPhase === phase.name;
                    return (
                        <div key={phase.name} style={{ marginBottom: '12px' }}>
                            <button
                                onClick={() => setExpandedPhase(isExpanded ? null : phase.name)}
                                style={{
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    padding: '14px 16px',
                                    background: cardBg,
                                    border: `1px solid ${borderColor}`,
                                    borderRadius: '12px',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    transition: 'all 0.15s ease',
                                }}
                            >
                                <div style={{
                                    width: '36px',
                                    height: '36px',
                                    borderRadius: '10px',
                                    background: `${phase.color}18`,
                                    border: `1.5px solid ${phase.color}40`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '18px',
                                    flexShrink: 0,
                                }}>
                                    {phase.icon}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '14px', fontWeight: '600', color: textPrimary }}>{phase.name}</div>
                                    <div style={{ fontSize: '12px', color: textSecondary }}>{phase.events.length} event{phase.events.length !== 1 ? 's' : ''}</div>
                                </div>
                                <div style={{
                                    fontSize: '12px',
                                    color: textSecondary,
                                    transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)',
                                    transition: 'transform 0.2s ease',
                                }}>
                                    ▼
                                </div>
                            </button>

                            {isExpanded && (
                                <div style={{ marginTop: '8px', paddingLeft: '16px' }}>
                                    {phase.events.map((event, evIdx) => (
                                        <div key={evIdx} style={{
                                            position: 'relative',
                                            padding: '12px 16px',
                                            marginBottom: '8px',
                                            background: isDark ? '#111' : '#f8fafc',
                                            border: `1px solid ${borderColor}`,
                                            borderRadius: '10px',
                                        }}>
                                            {/* Timeline connector */}
                                            {evIdx < phase.events.length - 1 && (
                                                <div style={{
                                                    position: 'absolute',
                                                    left: '24px',
                                                    bottom: '-12px',
                                                    width: '2px',
                                                    height: '12px',
                                                    background: `${phase.color}40`,
                                                }} />
                                            )}
                                            <div style={{ fontSize: '12px', color: textSecondary, marginBottom: '4px' }}>
                                                {formatDate(event.timestamp)} at {formatTime(event.timestamp)}
                                            </div>
                                            <div style={{ fontSize: '13px', fontWeight: '600', color: textPrimary, marginBottom: '6px' }}>
                                                {event.processStep}
                                            </div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                {Object.entries(event.details)
                                                    .filter(([k]) => !['lotId', 'routeOrder'].includes(k))
                                                    .slice(0, 4)
                                                    .map(([key, val]) => {
                                                        const displayVal = Array.isArray(val)
                                                            ? val.map((v) => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(', ')
                                                            : typeof val === 'object' && val !== null
                                                                ? JSON.stringify(val)
                                                                : String(val);
                                                        return (
                                                            <div key={key} style={{
                                                                padding: '3px 8px',
                                                                background: isDark ? '#1a1a1a' : '#e2e8f0',
                                                                borderRadius: '6px',
                                                                fontSize: '11px',
                                                                color: textSecondary,
                                                            }}>
                                                                <span style={{ fontWeight: '500', color: textPrimary }}>{key}:</span> {displayVal.substring(0, 60)}
                                                            </div>
                                                        );
                                                    })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Route Visualization */}
            {data.route.length > 0 && (
                <div style={{ padding: '0 24px 24px' }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: textPrimary, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        🚢 Physical Route
                    </div>
                    <div style={{ background: cardBg, border: `1px solid ${borderColor}`, borderRadius: '12px', padding: '16px' }}>
                        {data.route.map((stop, idx) => (
                            <div key={idx} style={{ display: 'flex', alignItems: 'stretch', marginBottom: idx < data.route.length - 1 ? '0' : '0' }}>
                                {/* Timeline */}
                                <div style={{ width: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                                    <div style={{
                                        width: '12px',
                                        height: '12px',
                                        borderRadius: '50%',
                                        background: stop.isBlocked ? '#ef4444' : '#3b82f6',
                                        border: `2px solid ${stop.isBlocked ? '#fca5a5' : '#93c5fd'}`,
                                        zIndex: 1,
                                    }} />
                                    {idx < data.route.length - 1 && (
                                        <div style={{ flex: 1, width: '2px', background: stop.isBlocked ? '#ef444480' : '#3b82f640' }} />
                                    )}
                                </div>
                                {/* Content */}
                                <div style={{ flex: 1, paddingBottom: idx < data.route.length - 1 ? '20px' : '0' }}>
                                    <div style={{ fontSize: '13px', fontWeight: '600', color: textPrimary }}>
                                        {stop.origin}
                                        <span style={{ margin: '0 6px', color: stop.isBlocked ? '#ef4444' : '#3b82f6', fontWeight: '700' }}>
                                            {stop.isBlocked ? ' blocked ' : ' → '}
                                        </span>
                                        {stop.destination}
                                    </div>
                                    <div style={{ fontSize: '12px', color: textSecondary, marginTop: '2px' }}>
                                        ECCN: {stop.eccnClassification} • HS: {stop.hsCode}
                                    </div>
                                    <div style={{ fontSize: '11px', color: stop.isBlocked ? '#ef4444' : '#10b981', marginTop: '2px', fontWeight: '500' }}>
                                        {stop.status}
                                    </div>
                                    {stop.applicableTariffs && (
                                        <div style={{ fontSize: '11px', color: textSecondary, marginTop: '2px' }}>
                                            Tariffs: {stop.applicableTariffs}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Footer */}
            <div style={{ padding: '16px 24px', textAlign: 'center', fontSize: '11px', color: isDark ? '#555' : '#94a3b8', borderTop: `1px solid ${borderColor}` }}>
                Semiconductor Lifecycle MCP • NitroStack
            </div>
        </div>
    );
}
