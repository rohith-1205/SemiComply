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

An engineer asks: *"Why did Lot LOT-8923's yield drop, and is the affected shipment safe?"*

Without this server, they'd manually query 4-5 systems, copy data between spreadsheets, and call 3 teams. With this server, one tool call returns:

> "The etch chamber had a pressure excursion (14.2 mTorr vs 12.0 threshold), which correlates with 184 leakage failures. No design issue. The shipment is also on customs hold for a missing export license — resolve both before release."

---

## 2. Architecture

### 2.1 High-Level Architecture

```
┌──────────────────────────────────────────────────────────┐
│              AI Client (NitroStudio Chat / any MCP client) │
│   "Why did Lot LOT-8923's yield drop, and is the affected  │
│    shipment export-compliant?"                             │
└────────────────────────────┬───────────────────────────────┘
                             │ Model Context Protocol (MCP)
                             ▼
┌──────────────────────────────────────────────────────────┐
│          Orchestrator Module — RootCauseAnalysis         │
│  Chains calls across all five domain modules, correlates │
│  results, and returns one synthesized answer             │
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
Service Layer (fetches from Google Sheets API)
        │
        ▼
Google Sheets (published CSV endpoint)
        │
        ▼
Response (JSON) → AI synthesizes answer → User sees result
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
  "timestamp": "2026-03-24T14:30:00Z"
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
  "stationId": "ETCH-CHAMBER-07",
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
  "totalWafersTested": 25,
  "overallYield": "81.4%",
  "failingBins": [
    { "binCode": "BIN_12_LEAKAGE", "count": 184, "impact": "High power consumption" },
    { "binCode": "BIN_04_TIMING", "count": 42, "impact": "Clock skew failure" }
  ]
}
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
  "operatingVoltage": "1.2V +/- 5%",
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
  "totalShipments": 3,
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
    ...
  ]
}
```

**Use case:** "Are there any restrictions in shipping SERDES-PHY-BLOCK?" → Returns all active shipments with route, ECCN, tariffs, and customs status.

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
  "overallYield": "81.4%",
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

**Correlation logic:**

| Process Excursion | Failure Bin Match | Root Cause |
|---|---|---|
| Pressure exceeded threshold | `BIN_12_LEAKAGE` | Incomplete etch creating leakage paths |
| Pressure exceeded threshold | `BIN_04_TIMING` | Timing margin degradation |
| Pressure exceeded threshold | `BIN_07_RESISTANCE` | Open circuits / poor interconnect |
| No excursion detected | Any | Process-based root cause unlikely — investigate elsewhere |

---

## 4. Data Backend (Google Sheets)

### 4.1 Why Google Sheets

- **No infrastructure required** — no databases, no servers
- **Editable by non-technical users** — anyone with edit access can add/remove/modify data
- **Live updates** — changes appear within 30 seconds (cache TTL)
- **Free** — no hosting costs for the data layer

### 4.2 Sheet Structure

**Sheet ID:** `1e2hu_SSxkcLQNqGDg2CRKikUxv7fpwrWIAlym-cRerY`  
**Access:** Published to web (anyone with link can view)

| Tab Name | Key Field | Columns |
|---|---|---|
| `Design Revisions` | `revisionId` | `revisionId`, `designer`, `ipBlock`, `changes`, `timestamp` |
| `MES Telemetry` | `lotId` | `lotId`, `stationId`, `recipeName`, `chamberPressure`, `temperature`, `operatorId` |
| `Yield Data` | `lotId` | `lotId`, `totalWafersTested`, `overallYield`, `failingBins` (JSON array) |
| `Product Specs` | `productId` | `productId`, `datasheetUrl`, `operatingVoltage`, `maxThermalThreshold`, `complianceCertifications` (JSON array) |
| `Shipping` | `shipmentId` | `shipmentId`, `productId`, `origin`, `destination`, `eccnClassification`, `hsCode`, `applicableTariffs`, `status` |

### 4.3 Adding New Data

To add a new record, simply add a row to the appropriate tab in the Google Sheet. No code changes needed.

**Example — adding a new shipment:**
1. Open the Google Sheet
2. Go to the "Shipping" tab
3. Add a new row:

```
SHIP-2026-07000,ADC-CORE-12B,Japan (Kobe),India (Bengaluru),3A001 (Export Controlled),8542.32.0000,7.5% Basic Customs Duty,Cleared: In Transit
```

4. Wait 30 seconds (cache TTL)
5. The tool will now return this shipment when queried

### 4.4 Data Relationships

```
Product Specs (productId)
        │
        ├── Shipping (productId) — links products to their shipments
        │
        └── Design Revisions (ipBlock ↔ productId) — implicit link via IP block name

Yield Data (lotId) ──── MES Telemetry (lotId) — same lot, different systems

Root Cause Orchestrator
        ├── calls Yield Data (lotId)
        ├── calls MES Telemetry (lotId)
        ├── calls Design Revisions (revisionId)
        └── calls Shipping (shipmentId or productId)
```

### 4.5 Complex Field Formats

**`failingBins` (Yield Data tab):** Store as a JSON array string:
```json
[{"binCode":"BIN_12_LEAKAGE","count":184,"impact":"High power consumption"},{"binCode":"BIN_04_TIMING","count":42,"impact":"Clock skew failure"}]
```

**`complianceCertifications` (Product Specs tab):** Store as a JSON array string:
```json
["RoHS Compliant","REACH Certified"]
```

---

## 5. Project Structure

```
semiconductor-mcp/
├── src/
│   ├── app.module.ts                          # Root module — registers all 6 modules + GoogleSheetsService
│   ├── index.ts                               # Server entry point — stdio bootstrap
│   └── modules/
│       ├── google-sheets/                     # Shared data backend
│       │   └── google-sheets.service.ts       # Fetches CSV from Google Sheets, parses, caches (30s TTL)
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
│       │   ├── quality.service.ts             # Fetches "Yield Data" tab, parses failingBins JSON
│       │   └── quality.tools.ts              # get_lot_yield_summary tool
│       ├── product/                           # Product Datasheets & Specs Module
│       │   ├── product.module.ts
│       │   ├── product.service.ts             # Fetches "Product Specs" tab, parses certifications JSON
│       │   └── product.tools.ts              # get_product_datasheet_specs tool
│       ├── shipping/                          # Shipping & Trade Compliance Module
│       │   ├── shipping.module.ts
│       │   ├── shipping.service.ts            # Fetches "Shipping" tab, supports shipmentId + productId lookup
│       │   └── shipping.tools.ts             # get_shipping_and_trade_compliance tool
│       └── root-cause-analysis/               # Agentic Orchestrator Module
│           ├── root-cause-analysis.module.ts
│           ├── root-cause-analysis.service.ts  # Cross-module correlation logic
│           └── root-cause-analysis.tools.ts   # analyze_yield_root_cause tool
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
| **CSV Parsing** | Custom parser (built-in) | Parses Google Sheets CSV with proper quote handling |
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
3. Add data rows (see Section 4.3 for examples)
4. Go to **File → Share → Publish to web**
5. Select "Entire Document" → Format: "Comma-separated values (.csv)" → Publish
6. Ensure sharing is set to **"Anyone with the link can view"**

### 7.4 Running

```bash
# Development (with hot reload)
npm run dev

# Production build
npm run build
npm start
```

### 7.5 Testing in NitroStudio

1. Open NitroStudio
2. Click **"Select Project"** → navigate to `semiconductor-mcp` folder
3. Click **Connect**
4. Use the **Tools Panel** to test individual tools, or **Chat Interface** for natural language queries

---

## 8. Example Queries

### Single-Tool Queries

| Query | Tool Called | Parameters |
|---|---|---|
| "Show me revision REV-SERDES-PHY-v2.3" | `get_cadence_design_revision` | `revisionId: "REV-SERDES-PHY-v2.3"` |
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

---

## 11. Data Model Reference

| Field | Format | Example |
|---|---|---|
| `lotId` | `LOT-####` | `LOT-8923` |
| `revisionId` | `REV-<block>-v#.#` | `REV-SERDES-PHY-v2.3` |
| `shipmentId` | `SHIP-YYYY-#####` | `SHIP-2026-04471` |
| `productId` | uppercase block name | `SERDES-PHY-BLOCK` |
| `stationId` | `<PROCESS>-CHAMBER-##` | `ETCH-CHAMBER-07` |
| `eccnClassification` | ECCN format | `3A090.a` |
| `hsCode` | HS code format | `8542.31.0000` |
| `failingBins` | JSON array | `[{"binCode":"BIN_12_LEAKAGE","count":184,"impact":"..."}]` |
| `complianceCertifications` | JSON array | `["RoHS Compliant","REACH Certified"]` |

---

## 12. Feature Coverage

| # | Requirement | Tool(s) |
|---|---|---|
| 1 | Retrieve designs from Cadence | `get_cadence_design_revision` |
| 2 | Retrieve manufacturing data | `get_manufacturing_mes_telemetry` |
| 3 | Retrieve test data | `get_lot_yield_summary` |
| 4 | Correlate design + test data, explain why a test failed | `analyze_yield_root_cause` (orchestrates 1-3 internally) |
| 5 | Analyze international trade routes, taxes, laws, orders, shipping | `get_shipping_and_trade_compliance` |
| — | Supporting reference data (compliance limits) | `get_product_datasheet_specs` |
| — | Product-to-shipment relationship | `get_shipping_and_trade_compliance` (productId lookup) |

---

## 13. Authors

**Team:** Rohith S, Arun Pravin AP, Varum M, Mithuraa S

**Repository:** [github.com/rohith-1205/SemiComply](https://github.com/rohith-1205/SemiComply)

---

*Last updated: July 2026*
