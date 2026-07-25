# Unified Semiconductor Lifecycle MCP Server

> **Version:** 1.0.0  
> **Framework:** [NitroStack](https://nitrostack.ai) (MCP Framework + SDK)  
> **Testing Environment:** NitroStudio  
> **Protocol:** Model Context Protocol (MCP)  
> **Language:** TypeScript  
> **Data Backend:** Google Sheets (live, editable by non-technical users)

---

## 1. Executive Summary

Semiconductor manufacturing data is spread across five disconnected enterprise systems — design tools, factory telemetry, quality testing, product documentation, and shipping/compliance. Answering a single cross-domain question like *"why did this wafer lot's yield drop, and does it affect a shipment already in transit?"* normally requires querying 4-5 separate systems and manually correlating results.

This project implements a **Unified Semiconductor Lifecycle MCP Server** — a single server that exposes each domain as a callable tool, plus an orchestration layer that chains these tools together to answer cross-domain questions in one request. An AI agent connected to this server can ask a natural-language question and receive a synthesized, root-cause-level answer.

**What it does in plain English:**

An engineer asks: *"Show me the lifecycle of LOT-8923"*

Without this server, they'd manually query 4-5 systems, copy data between spreadsheets, and call 3 teams. With this server, one tool call returns:

> "LOT-8923 is SERDES-PHY-BLOCK. Designed by A. Sharma (Nov 2025) then R. Chen (Jan 2026). Fabricated at Hsinchu Fab — 3 process steps including an etch chamber with pressure excursion. Tested at 81.4% yield (184 leakage failures). Shipped Taiwan → Austin (on customs hold) → Munich (cleared)."

---

## 2. Architecture

### 2.1 High-Level Architecture

```
┌──────────────────────────────────────────────────────────┐
│              AI Client (NitroStudio Chat / any MCP client) │
│   "Show me the lifecycle of LOT-8923"                       │
└────────────────────────────┬───────────────────────────────┘
                             │ Model Context Protocol (MCP)
                             ▼
┌──────────────────────────────────────────────────────────┐
│          Orchestrator Modules                              │
│  RootCauseAnalysis — cross-domain correlation             │
│  WaferGenealogy — structured lifecycle timeline           │
└──────┬──────────┬──────────┬──────────┬──────────┬───────┘
       ▼          ▼          ▼          ▼          ▼
   Design     Manufacturing  Quality    Product    Shipping
   Module     Module         Module     Doc Module Module
       │          │             │           │          │
       ▼          ▼             ▼           ▼          ▼
  Cadence/    GE Vernova    STDF Logs / SharePoint  Customs /
  Virtuoso    MES           Yield Maps  Docs        ERP DBs
```

### 2.2 Runtime Architecture (NitroStudio ↔ NitroStack)

```
┌─────────────────────────────────────────────────────────────────┐
│                    NitroStudio (Standalone App)                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │
│  │    Chat     │  │   Tools     │  │    Logs     │               │
│  │  Interface  │  │   Panel     │  │   Viewer    │               │
│  └─────────────┘  └─────────────┘  └─────────────┘               │
│                           │                                       │
│                    ┌──────┴──────┐                                │
│                    │ MCP Client  │                                │
│                    └──────┬──────┘                                │
└───────────────────────────┼───────────────────────────────────────┘
                            │ stdio
┌───────────────────────────┼───────────────────────────────────────┐
│               NitroStack Project (this codebase)                  │
│                           │                                       │
│  ┌────────────────────────▼────────────────────────┐              │
│  │              MCP Server (stdio transport)         │              │
│  └───────────────────────────────────────────────────┘              │
│                                                                    │
│  ┌─────────────────────────────────────────────────┐              │
│  │         Google Sheets (live data backend)        │              │
│  │   5 tabs — editable by anyone with link access   │              │
│  └─────────────────────────────────────────────────┘              │
└────────────────────────────────────────────────────────────────────┘
```

### 2.3 Data Flow

```
User Question (natural language)
        │
        ▼
NitroStudio AI (parses intent, selects tool)
        │
        ▼
MCP Tool Call (JSON-RPC over stdio)
        │
        ▼
NitroStack Tool Handler (validates input via Zod)
        │
        ▼
Service Layer (fetches from Google Sheets published CSV)
        │
        ▼
Google Sheets → /d/e/{id}/pub?output=csv&gid={tabId}
        │
        ▼
Response (JSON) → AI synthesizes answer → User sees result + widget
```

---

## 3. Tools

### 3.1 Tool Overview

| # | Tool Name | Domain | Purpose |
|---|---|---|---|
| 1 | `get_cadence_design_revision` | Design | Retrieve Cadence/Altium design revision metadata |
| 2 | `get_manufacturing_mes_telemetry` | Manufacturing | Retrieve factory sensor telemetry for a lot |
| 3 | `get_lot_yield_summary` | Quality | Retrieve STDF yield data and failing bin codes |
| 4 | `get_product_datasheet_specs` | Documentation | Retrieve product specs, voltage limits, certifications |
| 5 | `get_shipping_and_trade_compliance` | Shipping/Trade | Retrieve shipment route, ECCN, tariffs, customs status |
| 6 | `analyze_yield_root_cause` | Orchestrator | Cross-domain correlation and root-cause diagnosis |
| 7 | `trace_wafer_genealogy` | Lifecycle | Structured lifecycle timeline with product, design, manufacturing, testing, and shipping route |

### 3.2 Tool Details

#### 3.2.1 `get_cadence_design_revision`

**Module:** `DesignModule`  
**Wraps:** Cadence Virtuoso / Altium  
**Data Source:** Google Sheet tab "Design Revisions"

Retrieves layout/IP block revision metadata — who changed it, what changed, when — without returning raw GDSII/OASIS binaries.

**Input:**
```json
{ "revisionId": "REV-SERDES-PHY-v2.3" }
```

**Output:**
```json
{
  "revisionId": "REV-SERDES-PHY-v2.3",
  "designer": "A. Sharma",
  "ipBlock": "SERDES_PHY_BLOCK",
  "changes": "Adjusted metal layer 4 trace spacing to satisfy DRC rules and reduce crosstalk.",
  "timestamp": "2025-11-10T09:00:00Z"
}
```

---

#### 3.2.2 `get_manufacturing_mes_telemetry`

**Module:** `ManufacturingMESModule`  
**Wraps:** GE Vernova MES / Siemens MES  
**Data Source:** Google Sheet tab "MES Telemetry"

Fetches machine-level process telemetry (chamber pressure, temperature, recipe, operator) for a given wafer lot, flagging threshold excursions.

**Input:**
```json
{ "lotId": "LOT-8923" }
```

**Output:**
```json
{
  "lotId": "LOT-8923",
  "stationId": "FAB-HSINCHU-ETCH-07",
  "recipeName": "POLY_SILICON_ETCH_V3",
  "chamberPressure": "14.2 mTorr (Exceeded threshold of 12.0 mTorr between 10:12–10:18)",
  "temperature": "185.4 C",
  "operatorId": "OP-4492"
}
```

---

#### 3.2.3 `get_lot_yield_summary`

**Module:** `QualityTestModule`  
**Wraps:** STDF (Standard Test Data Format) binary logs  
**Data Source:** Google Sheet tab "Yield Data"

Parses STDF test logs and returns a summarized yield report — avoiding payload bloat of raw binary data.

**Input:**
```json
{ "lotId": "LOT-8923" }
```

**Output:**
```json
{
  "lotId": "LOT-8923",
  "totalWafersTested": 2000,
  "overallYield": "81.40%",
  "failingBins": [
    { "binCode": "BIN_12_LEAKAGE", "count": 184, "impact": "High power consumption" },
    { "binCode": "BIN_04_TIMING", "count": 42, "impact": "Clock skew failure" }
  ]
}
```

**Note:** `failingBins` in the sheet uses en dash (`–`) as separator, parsed by regex:
```
BIN_12_LEAKAGE – 184 failures (Impact: High power consumption)
```

---

#### 3.2.4 `get_product_datasheet_specs`

**Module:** `ProductDocModule`  
**Wraps:** SharePoint / Confluence  
**Data Source:** Google Sheet tab "Product Specs"

Searches document repositories for a product's official datasheet, operating limits, and compliance certifications.

**Input:**
```json
{ "productId": "SERDES-PHY-BLOCK" }
```

**Output:**
```json
{
  "productId": "SERDES-PHY-BLOCK",
  "datasheetUrl": "https://company.sharepoint.com/specs/SERDES-v2.pdf",
  "operatingVoltage": "1.2V A 5%",
  "maxThermalThreshold": "105 C",
  "complianceCertifications": ["RoHS Compliant", "REACH Certified"]
}
```

---

#### 3.2.5 `get_shipping_and_trade_compliance`

**Module:** `ShippingTradeModule`  
**Wraps:** SAP / ERP customs & logistics systems  
**Data Source:** Google Sheet tab "Shipping"

Retrieves international shipment logistics, export control classification (ECCN), HS code, applicable tariffs, and customs hold status. Supports lookup by **shipment ID** or **product ID**.

**Query by Shipment ID:**
```json
{ "shipmentId": "SHIP-2026-04471" }
```

**Output:**
```json
{
  "shipmentId": "SHIP-2026-04471",
  "productId": "SERDES-PHY-BLOCK",
  "origin": "Taiwan (Hsinchu)",
  "destination": "United States (Austin TX)",
  "eccnClassification": "3A090.a (Export Controlled)",
  "hsCode": "8542.31.0000",
  "applicableTariffs": "25% Section 301 Tariff + 2.5% Base Duty",
  "status": "Customs Hold: Missing Dual-Use License Endorsement"
}
```

**Query by Product ID:**
```json
{ "productId": "SERDES-PHY-BLOCK" }
```

**Output:**
```json
{
  "productId": "SERDES-PHY-BLOCK",
  "totalShipments": 2,
  "shipments": [
    {
      "shipmentId": "SHIP-2026-04471",
      "origin": "Taiwan (Hsinchu)",
      "destination": "United States (Austin TX)",
      "eccnClassification": "3A090.a (Export Controlled)",
      "hsCode": "8542.31.0000",
      "applicableTariffs": "25% Section 301 Tariff + 2.5% Base Duty",
      "status": "Customs Hold: Missing Dual-Use License Endorsement"
    },
    {
      "shipmentId": "SHIP-2026-05102",
      "origin": "United States (Austin TX)",
      "destination": "Germany (Munich)",
      "eccnClassification": "3A001 (Export Controlled)",
      "hsCode": "8542.33.0000",
      "applicableTariffs": "0% EU GSP Preferential Rate",
      "status": "Cleared: Awaiting Carrier Pickup"
    }
  ]
}
```

---

#### 3.2.6 `analyze_yield_root_cause` (Orchestrator)

**Module:** `RootCauseAnalysisModule`  
**Role:** Agentic centerpiece — calls other tools internally and reasons across their outputs  
**Data Source:** Cross-module (calls all 5 domain services internally)

Given a lot ID (and optionally a shipment ID), this tool autonomously:
1. Fetches yield data and failing bin codes
2. Fetches manufacturing telemetry and process excursions
3. **Correlates** process excursions with failure modes (e.g., pressure excursion ↔ leakage failures)
4. Checks if any design revision is implicated
5. If a shipment ID is provided, checks downstream compliance risk

**Input:**
```json
{
  "lotId": "LOT-8923",
  "shipmentId": "SHIP-2026-04471"
}
```

**Output:**
```json
{
  "lotId": "LOT-8923",
  "overallYield": "81.40%",
  "totalWafersTested": 2000,
  "failingBins": [
    { "binCode": "BIN_12_LEAKAGE", "count": 184, "impact": "High power consumption" },
    { "binCode": "BIN_04_TIMING", "count": 42, "impact": "Clock skew failure" }
  ],
  "telemetry": {
    "stationId": "FAB-HSINCHU-ETCH-07",
    "recipeName": "POLY_SILICON_ETCH_V3",
    "chamberPressure": "14.2 mTorr (Exceeded threshold of 12.0 mTorr between 10:12–10:18)",
    "temperature": "185.4 C",
    "operatorId": "OP-4492",
    "hasExcursion": true
  },
  "likelyRootCause": "Chamber pressure excursion (14.2 mTorr) correlates with elevated BIN_12_LEAKAGE failures (184 units) — consistent with incomplete etch creating unintended leakage paths.",
  "designImplicated": false,
  "designNote": "No design revision changes found in the relevant window; root cause is process-based, not layout-based.",
  "shipmentRisk": {
    "shipmentId": "SHIP-2026-04471",
    "risk": true,
    "reason": "Shipment is on independent customs hold (Missing Dual-Use License Endorsement) — recommend resolving both the yield issue and the compliance hold before shipment release."
  }
}
```

**Widget:** `lot-yield-timeline` — renders yield bar chart, failing bins, telemetry excursion marker, root cause card, and shipment risk badge.

**Correlation logic:**

| Process Excursion | Failure Bin Match | Root Cause |
|---|---|---|
| Pressure exceeded threshold | `BIN_12_LEAKAGE` | Incomplete etch creating leakage paths |
| Pressure exceeded threshold | `BIN_04_TIMING` | Timing margin degradation |
| Pressure exceeded threshold | `BIN_07_RESISTANCE` | Open circuits / poor interconnect |
| No excursion detected | Any | Process-based root cause unlikely — investigate elsewhere |
| Empty failing bins | — | Yield analysis incomplete or pending |

---

#### 3.2.7 `trace_wafer_genealogy` (Lifecycle Orchestrator)

**Module:** `WaferGenealogyModule`  
**Role:** Structured lifecycle trace across all 5 domains  
**Data Source:** Cross-module (calls all 5 domain services internally)

Given a batchId (lotId), this tool:
1. Fetches all records from Design, MES, Quality, Product, and Shipping tabs
2. Extracts the product identity (one product per lot)
3. Groups events into structured lifecycle phases: **Product → Design → Manufacturing → Testing**
4. Builds the physical shipping route from ordered shipment legs
5. Returns a structured timeline with date-ordered steps per phase

**Input:**
```json
{ "batchId": "LOT-8923" }
```

**Output:**
```json
{
  "batchId": "LOT-8923",
  "totalEvents": 7,
  "product": {
    "productId": "SERDES-PHY-BLOCK",
    "lotId": "LOT-8923",
    "operatingVoltage": "1.2V A 5%",
    "maxThermalThreshold": "105 C",
    "complianceCertifications": ["RoHS Compliant", "REACH Certified"]
  },
  "phases": [
    {
      "id": "product",
      "name": "SERDES-PHY-BLOCK",
      "color": "#6366f1",
      "steps": [
        {
          "timestamp": "2025-11-10T09:00:00Z",
          "label": "Product Identity",
          "description": "SERDES-PHY-BLOCK · 1.2V A 5% · 105 C max",
          "meta": {
            "Lot": "LOT-8923",
            "Voltage": "1.2V A 5%",
            "Thermal Limit": "105 C",
            "Certifications": "RoHS Compliant, REACH Certified"
          }
        }
      ]
    },
    {
      "id": "design",
      "name": "Design",
      "color": "#8b5cf6",
      "steps": [
        {
          "timestamp": "2025-11-10T09:00:00Z",
          "label": "REV-SERDES-v2.3",
          "description": "Adjusted metal layer 4 trace spacing to satisfy DRC rules.",
          "meta": { "Designer": "A. Sharma", "IP Block": "SERDES_PHY_BLOCK" }
        },
        {
          "timestamp": "2026-01-15T14:30:00Z",
          "label": "REV-SERDES-v2.4",
          "description": "Updated PLL loop filter bandwidth to improve jitter.",
          "meta": { "Designer": "R. Chen", "IP Block": "SERDES_PHY_BLOCK" }
        }
      ]
    },
    {
      "id": "manufacturing",
      "name": "Manufacturing",
      "color": "#f59e0b",
      "steps": [
        {
          "timestamp": "2026-02-10T08:00:00Z",
          "label": "FAB-HSINCHU-ETCH-07",
          "description": "POLY_SILICON_ETCH_V3",
          "meta": { "Pressure": "14.2 mTorr (Exceeded threshold...)", "Temperature": "185.4 C", "Operator": "OP-4492" }
        },
        {
          "timestamp": "2026-02-12T14:00:00Z",
          "label": "FAB-HSINCHU-CVD-02",
          "description": "TEOS_OXIDE_DEPOSITION_V2",
          "meta": { "Pressure": "8.1 mTorr", "Temperature": "408.7 C", "Operator": "OP-4492" }
        },
        {
          "timestamp": "2026-02-15T09:00:00Z",
          "label": "FAB-HSINCHU-LITHO-03",
          "description": "DUV_PATTERNING_V5",
          "meta": { "Pressure": "7.8 mTorr", "Temperature": "23.1 C", "Operator": "OP-3317" }
        }
      ]
    },
    {
      "id": "testing",
      "name": "Testing",
      "color": "#10b981",
      "steps": [
        {
          "timestamp": "2026-03-05T10:00:00Z",
          "label": "Yield: 81.40%",
          "description": "2000 wafers tested",
          "meta": { "Yield": "81.40%", "Wafers Tested": "2000", "Failing Bins": "BIN_12_LEAKAGE (184), BIN_04_TIMING (42)" }
        },
        {
          "timestamp": "2026-03-12T10:00:00Z",
          "label": "Yield: 84.10%",
          "description": "2000 wafers tested",
          "meta": { "Yield": "84.10%", "Wafers Tested": "2000", "Failing Bins": "BIN_12_LEAKAGE (142)" }
        }
      ]
    }
  ],
  "route": [
    {
      "leg": 1,
      "origin": "Taiwan (Hsinchu)",
      "destination": "United States (Austin TX)",
      "eccnClassification": "3A090.a (Export Controlled)",
      "hsCode": "8542.31.0000",
      "applicableTariffs": "25% Section 301 Tariff + 2.5% Base Duty",
      "status": "Customs Hold: Missing Dual-Use License Endorsement",
      "isBlocked": true
    },
    {
      "leg": 2,
      "origin": "United States (Austin TX)",
      "destination": "Germany (Munich)",
      "eccnClassification": "3A001 (Export Controlled)",
      "hsCode": "8542.33.0000",
      "applicableTariffs": "0% EU GSP Preferential Rate",
      "status": "Cleared: Awaiting Carrier Pickup",
      "isBlocked": false
    }
  ],
  "summary": "SERDES-PHY-BLOCK (LOT-8923) — Lifecycle Genealogy\n\n[Design]\n  Nov 10, 2025 — REV-SERDES-v2.3\n    Adjusted metal layer 4 trace spacing to satisfy DRC rules.\n    Designer: A. Sharma\n    ...\n\n[Manufacturing]\n  Feb 10, 2026 — FAB-HSINCHU-ETCH-07\n    POLY_SILICON_ETCH_V3\n    Pressure: 14.2 mTorr (Exceeded threshold...)\n    ...\n\n[Testing]\n  Mar 5, 2026 — Yield: 81.40%\n    2000 wafers tested\n    Failing Bins: BIN_12_LEAKAGE (184), BIN_04_TIMING (42)\n    ...\n\n[Shipping Route]\n  Leg 1: Taiwan (Hsinchu) — United States (Austin TX) — Customs Hold\n    ECCN: 3A090.a | HS: 8542.31.0000 | Tariffs: 25% Section 301\n  Leg 2: United States (Austin TX) → Germany (Munich) — Cleared\n    ECCN: 3A001 | HS: 8542.33.0000 | Tariffs: 0% EU GSP"
}
```

**Widget:** `wafer-lifecycle` — renders a vertical timeline with:
- Product identity header (name, voltage, thermal limit, certifications)
- Phase sections (Design → Manufacturing → Testing) with date-ordered steps
- Shipping route with origin/destination, ECCN, tariffs, and blocked/cleared status
- Clean editorial design — no emoji, minimal color, proper typographic hierarchy

---

## 4. Data Backend (Google Sheets)

### 4.1 Why Google Sheets

- **No infrastructure required** — no databases, no servers
- **Editable by non-technical users** — anyone with edit access can add/remove/modify data
- **Live updates** — changes appear within 30 seconds (cache TTL)
- **Free** — no hosting costs for the data layer

### 4.2 Sheet Structure

**Published Sheet URL:** `https://docs.google.com/spreadsheets/d/e/2PACX-1vTM9gAH-TLKghwnmwWQNRrSeVXlXOiMNSGoP7B7IMpxU7KPJoZLfMpkCdZoyRdHXJTEP2oXroBVV5Hj/pubhtml`  
**CSV Export:** `https://docs.google.com/spreadsheets/d/e/2PACX-.../pub?output=csv&gid={gid}`  
**Access:** Published to web (anyone with link can view)

| Tab Name | GID | Key Field | Columns |
|---|---|---|---|
| `Design Revisions` | `0` | `revisionId` | `revisionId`, `lotId`, `designer`, `ipBlock`, `changes`, `timestamp` |
| `MES Telemetry` | `1511561505` | `lotId` | `lotId`, `stationId`, `recipeName`, `chamberPressure`, `temperature`, `operatorId` |
| `Yield Data` | `318655177` | `lotId` | `lotId`, `totalWafersTested`, `overallYield`, `failingBins` |
| `Product Specs` | `710900377` | `productId` | `productId`, `lotId`, `datasheetUrl`, `operatingVoltage`, `maxThermalThreshold`, `complianceCertifications` |
| `Shipping` | `23966863` | `shipmentId` | `shipmentId`, `productId`, `lotId`, `origin`, `destination`, `eccnClassification`, `hsCode`, `applicableTariffs`, `status`, `routeOrder`, `timestamp` |

### 4.3 Adding New Data

To add a new record, simply add a row to the appropriate tab in the Google Sheet. No code changes needed.

**Example — adding a new shipment:**
1. Open the Google Sheet
2. Go to the "Shipping" tab
3. Add a new row:

```
SHIP-2026-07000,ADC-CORE-12B,LOT-24701,Japan (Kobe),India (Bengaluru),3A001 (Export Controlled),8542.32.0000,7.5% Basic Customs Duty,Cleared: In Transit,1,2026-07-20T06:00:00Z
```

4. Wait 30 seconds (cache TTL)
5. The tool will now return this shipment when queried

### 4.4 Data Relationships

```
Design Revisions (lotId) ─────┐
MES Telemetry (lotId) ────────┤
Yield Data (lotId) ───────────┤── All linked by lotId (e.g., LOT-8923)
Product Specs (lotId) ────────┤
Shipping (lotId + routeOrder) ┘
                                │
                    Wafer Genealogy Orchestrator
                    ├── Extracts product identity from Product Specs
                    ├── Groups events into lifecycle phases
                    ├── Sorts shipping by routeOrder → physical route
                    └── Returns structured timeline with steps per phase
```

**Key relationships:**
- **lotId** is the universal link — every tab has a `lotId` column that ties records to a specific wafer batch
- **One lot = one product** — each lotId maps to exactly one productId for a clean lifecycle story
- **routeOrder** in Shipping determines the physical path the lot takes through the global supply chain
- **productId** links Shipping and Product Specs to a specific product type
- **ipBlock** in Design links revisions to the product's IP blocks

### 4.5 Data Design Principles

Each lot tells a coherent lifecycle story with meaningful chronological dates:

| Phase | Date Range | Meaning |
|---|---|---|
| Design | Nov 2025 — Mar 2026 | When the IP block was designed/revised |
| Manufacturing | Feb — Jun 2026 | When the lot was fabricated (after design) |
| Testing | Mar — Jul 2026 | When the lot was tested (after fab) |
| Shipping | Apr — Jul 2026 | When the lot was shipped (after test) |

### 4.6 Complex Field Formats

**`failingBins` (Yield Data tab):** Store as text with en dash separator:
```
BIN_12_LEAKAGE – 184 failures (Impact: High power consumption)BIN_04_TIMING – 42 failures (Impact: Clock skew failure)
```
The service parses this with regex. Multiple bins are concatenated without delimiters.

**`complianceCertifications` (Product Specs tab):** Store as semicolon-separated text:
```
RoHS Compliant; REACH Certified
```

**`chamberPressure` (MES Telemetry tab):** Store with excursion notes in parentheses:
```
14.2 mTorr (Exceeded threshold of 12.0 mTorr between 10:12-10:18)
```

---

## 5. Project Structure

```
semiconductor-mcp/
├── src/
│   ├── app.module.ts                          # Root module — registers all 7 modules + GoogleSheetsService
│   ├── index.ts                               # Server entry point — stdio bootstrap
│   └── modules/
│       ├── google-sheets/                     # Shared data backend
│       │   └── google-sheets.service.ts       # Fetches published CSV by tab name → gid mapping
│       ├── design/                            # Cadence Design Revision Module
│       │   ├── design.module.ts
│       │   ├── design.service.ts              # Fetches "Design Revisions" tab
│       │   └── design.tools.ts               # get_cadence_design_revision tool
│       ├── manufacturing/                     # GE Vernova MES Telemetry Module
│       │   ├── manufacturing.module.ts
│       │   ├── manufacturing.service.ts       # Fetches "MES Telemetry" tab
│       │   └── manufacturing.tools.ts        # get_manufacturing_mes_telemetry tool
│       ├── quality/                           # STDF Quality & Test Diagnostics Module
│       │   ├── quality.module.ts
│       │   ├── quality.service.ts             # Fetches "Yield Data" tab, parses en-dash failingBins text
│       │   └── quality.tools.ts              # get_lot_yield_summary tool
│       ├── product/                           # Product Datasheets & Specs Module
│       │   ├── product.module.ts
│       │   ├── product.service.ts             # Fetches "Product Specs" tab, parses semicolon-separated certs
│       │   └── product.tools.ts              # get_product_datasheet_specs tool
│       ├── shipping/                          # Shipping & Trade Compliance Module
│       │   ├── shipping.module.ts
│       │   ├── shipping.service.ts            # Fetches "Shipping" tab, supports shipmentId + productId lookup
│       │   └── shipping.tools.ts             # get_shipping_and_trade_compliance tool
│       ├── root-cause-analysis/               # Agentic Orchestrator Module
│       │   ├── root-cause-analysis.module.ts
│       │   ├── root-cause-analysis.service.ts  # Cross-module correlation with enriched output
│       │   └── root-cause-analysis.tools.ts   # analyze_yield_root_cause + lot-yield-timeline widget
│       └── wafer-genealogy/                   # Lifecycle Orchestrator Module
│           ├── wafer-genealogy.module.ts
│           ├── wafer-genealogy.service.ts      # Structured lifecycle: product → design → mfg → test
│           ├── wafer-genealogy.tools.ts        # trace_wafer_genealogy + wafer-lifecycle widget
│           ├── genealogy-types.ts              # ProductInfo, LifecyclePhase, LifecycleStep, RouteStop
│           ├── genealogy-registry.ts           # Contributor registry
│           └── contributors/
│               ├── design.contributor.ts        # Searches Design tab by lotId
│               ├── manufacturing.contributor.ts # Searches MES tab by lotId
│               ├── quality.contributor.ts       # Searches Yield tab by lotId
│               ├── product.contributor.ts       # Searches Product tab by lotId
│               └── shipping.contributor.ts      # Searches Shipping tab by lotId, sorts by routeOrder
├── src/widgets/                                # NitroStack Widgets (Next.js)
│   ├── app/
│   │   ├── layout.tsx                          # Widget root layout
│   │   ├── wafer-lifecycle/
│   │   │   └── page.tsx                        # Vertical timeline widget — product, phases, route
│   │   └── lot-yield-timeline/
│   │       └── page.tsx                        # Yield root cause dashboard — bar chart, bins, excursion
│   ├── components/                             # Shared UI components
│   └── widget-manifest.json                    # Widget registry (2 widgets)
├── package.json
├── tsconfig.json
└── .env.example
```

---

## 6. Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Framework** | NitroStack v1.0.14 | MCP server framework with decorators, Zod validation, DI |
| **Language** | TypeScript 5.3 | Type-safe development |
| **Schema Validation** | Zod 3.22 | Input validation + auto-generated tool schemas for AI |
| **Transport** | stdio | Communication between NitroStudio and MCP server |
| **Data Backend** | Google Sheets (published CSV) | Live, editable data source |
| **CSV Fetch** | Published sheet API | `GET /d/e/{id}/pub?output=csv&gid={gid}` with tab→gid mapping |
| **CSV Parsing** | Custom parser (built-in) | Parses CSV with proper quote handling |
| **Failing Bins** | Regex parser | Handles en-dash (`–`) separator in text-format bins |
| **Widgets** | NitroStack Widgets (Next.js) | Interactive HTML widgets rendered in NitroStudio |
| **Testing** | NitroStudio | Visual tool testing + AI chat interface |
| **AI Integration** | MCP Protocol | Standard protocol for AI-tool communication |

---

## 7. Setup & Running

### 7.1 Prerequisites

- Node.js >= 18
- npm 9+
- NitroStudio (download from [nitrostack.ai/studio](https://nitrostack.ai/studio))

### 7.2 Installation

```bash
cd semiconductor-mcp
npm install
```

### 7.3 Google Sheet Setup

1. Create a Google Sheet with 5 tabs: `Design Revisions`, `MES Telemetry`, `Yield Data`, `Product Specs`, `Shipping`
2. Add column headers matching Section 4.2
3. Add data rows following the design principles in Section 4.5 (one product per lot, chronological dates)
4. Go to **File → Share → Publish to web**
5. Select "Entire Document" → Format: "Comma-separated values (.csv)" → Publish
6. Ensure sharing is set to **"Anyone with the link can view"**
7. Note the published sheet URL and tab GIDs (inspect HTML source or use browser dev tools)

### 7.4 Google Sheets API Configuration

The service uses a published-sheet CSV export URL with hardcoded tab→gid mapping:

```typescript
// src/modules/google-sheets/google-sheets.service.ts
const SHEET_ID = '2PACX-1vTM9gAH-TLKghwnmwWQNRrSeVXlXOiMNSGoP7B7IMpxU7KPJoZLfMpkCdZoyRdHXJTEP2oXroBVV5Hj';
const BASE_URL = `https://docs.google.com/spreadsheets/d/e/${SHEET_ID}/pub`;

// Tab name → GID mapping (update if tabs change)
private readonly TAB_GIDS: Record<string, string> = {
    'Design Revisions': '0',
    'MES Telemetry': '1511561505',
    'Yield Data': '318655177',
    'Product Specs': '710900377',
    'Shipping': '23966863',
};
```

If you add/remove/rename tabs, update the `TAB_GIDS` mapping and find the new GID from the published HTML source.

### 7.5 Running

```bash
# Development (with hot reload)
npm run dev

# Production build
npm run build
npm start
```

### 7.6 Testing in NitroStudio

1. Open NitroStudio
2. Click **"Select Project"** → navigate to `semiconductor-mcp` folder
3. Click **Connect**
4. Use the **Tools Panel** to test individual tools, or **Chat Interface** for natural language queries

---

## 8. Example Queries

### Single-Tool Queries

| Query | Tool Called | Parameters |
|---|---|---|
| "Show me revision REV-SERDES-v2.3" | `get_cadence_design_revision` | `revisionId: "REV-SERDES-v2.3"` |
| "What's the MES telemetry for LOT-8923?" | `get_manufacturing_mes_telemetry` | `lotId: "LOT-8923"` |
| "How did LOT-8923 test?" | `get_lot_yield_summary` | `lotId: "LOT-8923"` |
| "What are SERDES-PHY-BLOCK's specs?" | `get_product_datasheet_specs` | `productId: "SERDES-PHY-BLOCK"` |
| "Is SHIP-2026-04471 clear to ship?" | `get_shipping_and_trade_compliance` | `shipmentId: "SHIP-2026-04471"` |
| "Are there restrictions shipping SERDES-PHY-BLOCK?" | `get_shipping_and_trade_compliance` | `productId: "SERDES-PHY-BLOCK"` |

### Orchestrator Queries

| Query | Tool Called | Parameters |
|---|---|---|
| "Why did LOT-8923's yield drop?" | `analyze_yield_root_cause` | `lotId: "LOT-8923"` |
| "Why did LOT-8923's yield drop, and is SHIP-2026-04471 safe?" | `analyze_yield_root_cause` | `lotId: "LOT-8923"`, `shipmentId: "SHIP-2026-04471"` |

### Lifecycle Queries

| Query | Tool Called | Parameters |
|---|---|---|
| "Show me the lifecycle of LOT-8923" | `trace_wafer_genealogy` | `batchId: "LOT-8923"` |
| "Trace the genealogy of LOT-67234" | `trace_wafer_genealogy` | `batchId: "LOT-67234"` |
| "What's the full history of NPU-ACCELERATOR?" | `trace_wafer_genealogy` | `batchId: "LOT-91456"` |

---

## 9. Security

### 9.1 Current State

- No authentication guards — all tools are publicly accessible via NitroStudio
- Google Sheet is published to web (view-only access to anyone with the link)
- All data is mock/demo data — not production-sensitive

### 9.2 Production Security (Recommended)

For production deployment, NitroStack supports:

- **JWT Authentication** — `JWTModule` + `JWTGuard` for token-based auth
- **API Key Authentication** — `ApiKeyModule` + `ApiKeyGuard` for service-to-service auth
- **OAuth 2.1** — `OAuthModule` for enterprise SSO integration
- **RBAC** — Chain guards for role-based access control

Example guard (can be added to any tool):
```typescript
@Tool({ name: 'my_tool', ... })
@UseGuards(JWTGuard)
async myTool(input: MyInput, ctx: ExecutionContext) {
    // Only executes if JWT is valid
}
```

---

## 10. Future Enhancements

| Enhancement | Description | Complexity |
|---|---|---|
| **Live MES Integration** | Connect manufacturing service to GE Vernova / Siemens Opcenter REST APIs | Medium-High |
| **STDF File Parser** | Parse real STDF binary test logs from ATE equipment | Low-Medium |
| **SAP ERP Integration** | Connect shipping service to SAP OData API for live customs data | High |
| **Cadence API** | Connect design service to Cadence Virtuoso API for live revision data | Medium |
| **Database Backend** | Replace Google Sheets with PostgreSQL/MongoDB for production scale | Medium |
| **Authentication** | Add JWT/API Key guards for production security | Low |
| **Rate Limiting** | Add rate limits to prevent abuse | Low |
| **WebSocket Transport** | Replace stdio with WebSocket for web-based clients | Medium |
| **Additional Orchestrators** | Add tools for compliance-only analysis, design-only audit, etc. | Low |
| **Yield Trend Analysis** | Multi-lot yield comparison across time for process capability studies | Medium |
| **Supply Chain Map** | Geographic visualization of shipping routes on a world map | Medium |

---

## 11. Data Model Reference

| Field | Format | Example |
|---|---|---|
| `lotId` | `LOT-####` | `LOT-8923` |
| `revisionId` | `REV-<block>-v#.#` | `REV-SERDES-v2.3` |
| `shipmentId` | `SHIP-YYYY-#####` | `SHIP-2026-04471` |
| `productId` | uppercase block name | `SERDES-PHY-BLOCK` |
| `stationId` | `<FAB>-<PROCESS>-##` | `FAB-HSINCHU-ETCH-07` |
| `eccnClassification` | ECCN format + description | `3A090.a (Export Controlled)` |
| `hsCode` | HS code format | `8542.31.0000` |
| `failingBins` | Text format with en dash | `BIN_12_LEAKAGE – 184 failures (Impact: High power consumption)` |
| `complianceCertifications` | Semicolon-separated text | `RoHS Compliant; REACH Certified` |
| `chamberPressure` | Value + excursion note | `14.2 mTorr (Exceeded threshold of 12.0 mTorr between 10:12-10:18)` |

---

## 12. Feature Coverage

| # | Requirement | Tool(s) |
|---|---|---|
| 1 | Retrieve designs from Cadence | `get_cadence_design_revision` |
| 2 | Retrieve manufacturing data | `get_manufacturing_mes_telemetry` |
| 3 | Retrieve test data | `get_lot_yield_summary` |
| 4 | Correlate design + test data, explain why a test failed | `analyze_yield_root_cause` (orchestrates 1-3 internally) |
| 5 | Analyze international trade routes, taxes, laws, orders, shipping | `get_shipping_and_trade_compliance` |
| 6 | Full lifecycle trace with structured timeline | `trace_wafer_genealogy` (orchestrates all 5 internally) |
| — | Supporting reference data (compliance limits) | `get_product_datasheet_specs` |
| — | Product-to-shipment relationship | `get_shipping_and_trade_compliance` (productId lookup) |

---

## 13. Authors

**Team:** Rohith S, Arun Pravin AP, Varum M, Mithuraa S

**Repository:** [github.com/rohith-1205/SemiComply](https://github.com/rohith-1205/SemiComply)

---

*Last updated: July 2026*
