# Broker Profiles — AI Agent Training Reference

## Overview

This document explains the enriched broker profile dataset (`broker_profiles_enriched.json`) designed for training an AI agent on Indonesian stock market (IDX/BEI) broker intelligence. The dataset preserves the original status categories (Bandar / Retail / Retail-Bandar / Whale) and adds research-validated metadata for each of the 89 brokers.

## Schema

Each broker entry contains the following enriched fields:

| Field | Description | Use Case |
|-------|-------------|----------|
| `broker_code` | Original 2-letter IDX code | Primary key for matching API data |
| `broker_name` | Full registered name | Display + verification |
| `status` | Original category (unchanged) | Top-level classification |
| `ownership` | Parent group, country of origin, year established | Determines whether flow is foreign/local/BUMN/family-conglo |
| `size_tier` | Small / Medium / Large / Very Large | Scaling factor for signal weight |
| `license` | PEE (underwriter) / PPE (broker-dealer) / MI (investment manager) | Regulatory capacity |
| `primary_clientele` | Who actually transacts through this broker | Identifies the actual money flow type |
| `trading_style` | Behavioral pattern: where they trade, how often, and through what segment | Pattern matching |
| `behavioral_signal` | What an accumulation/distribution pattern from this broker actually means | Core interpretation logic |
| `favored_segments` | Stock types they're most active in (bluechip, mid-cap, group-affiliated, etc) | Segment-aware filtering |
| `smart_money_weight` | Tier classification: Low / Medium / High / Very High | Scoring weight for screener |
| `notes_for_ai` | Critical cautions, biases to avoid, contextual rules | Guard rails for the agent |

## Smart Money Weight Tiers

The `smart_money_weight` field is a synthesized rating combining:
1. **Capital base** (size, MKBD, transaction volume rank)
2. **Clientele quality** (institutional vs retail, foreign vs local)
3. **Information edge** (research depth, insider access, sovereign fund flow)
4. **Historical predictive value** (whether their accumulation typically precedes moves)

Tier interpretation for the AI agent:

| Tier | Interpretation | Examples | Recommended Weight |
|------|----------------|----------|---------------------|
| **Very High (Tier 1)** | Global institutional smart money — flow from sovereign wealth funds, top-tier hedge funds, MSCI/FTSE-tracking giants | AK, BK, RX, ZP, GW, DP, YU, KZ | 1.0 (max weight) |
| **High** | Strong institutional or premium domestic flow | CC, DX, LG, HP, KI, SQ, AI, AG, AH, BQ, FS, HD, TP | 0.75 |
| **Medium-High** | Mixed institutional-retail with informed base | YP, NI, OD, CP, BB, NH, KK, MG | 0.6 |
| **Medium** | Moderate informed activity, often tier-2 institutions | DH, MNC affiliates, IF | 0.45 |
| **Low-Medium** | Mostly informed retail or small institutions | AZ, PD, IH, ES, RG | 0.3 |
| **Low** | Pure retail proxy or minor brokers | XL, XC, OS, OK, RB, etc | 0.15 |

## Key Behavioral Categories

### Tier 1 Foreign Smart Money (Highest Signal Quality)

These are foreign-backed brokers whose accumulation patterns historically lead market moves. When 2 or more of these brokers accumulate the same stock concurrently, treat it as a very strong fundamental signal.

- **AK (UBS)** — #1 in transaction value, gateway for global institutional money
- **BK (J.P. Morgan)** — US institutional flow, MSCI-driven moves
- **RX (Macquarie)** — Australian + global, strategic long-term positioning, heavy on block trades
- **ZP (Maybank)** — ASEAN tier-1, Malaysian sovereign + pension funds
- **GW (HSBC)** — Global institutional, HNW private banking flow
- **DP (DBS Vickers)** — Singapore-ASEAN, often aligns with Temasek/GIC
- **YU (CGS International)** — ASEAN + China institutional mix
- **KZ (CLSA)** — Hong Kong/CITIC, hedge fund flow

### Tier 1 Domestic Institutional (BUMN + Premium)

These are domestic institutional brokers with strong fund management or BUMN backing:

- **CC (Mandiri)** — Largest BUMN broker, dana pensiun + premium retail
- **DX (Bahana)** — BUMN/IFG, dana pensiun + asuransi negara
- **LG (Trimegah)** — Domestic asset management, IPO underwriter top
- **HP (Henan Putihrai)** — Asset management linked, fundamental long-term
- **KI (Ciptadana)** — Lippo Group, fund manager flow
- **SQ (BCA Sekuritas)** — Hartono/Djarum family flow, HNW Indonesia terbesar

### Group-Affiliated Brokers (Bias Watch)

These brokers have inherent bias when transacting in their own group's stocks. The AI must downweight or exclude their signal for stocks within their own group:

| Broker | Group | Group Stocks (downweight when these brokers accumulate them) |
|--------|-------|------------------------------------------------------------|
| DH (Sinarmas) | Sinarmas Group | DSSA, SMRA, INKP, TKIM, BSDE, SMAR, SMMA |
| EP (MNC) | MNC Group | BHIT, BMTR, MNCN, IPTV, BCAP |
| CD (Mega Capital) | CT Corp | CARS, ALDO |
| AF (Harita) | Harita Group | NCKL, MDKA-related |
| OD (BRI Danareksa) | BRI/BUMN | BBRI itself |
| CC (Mandiri) | Mandiri/BUMN | BMRI itself |
| NI (BNI Sekuritas) | BNI/BUMN | BBNI itself |
| SQ (BCA Sekuritas) | BCA/Djarum | BBCA itself |
| MI (Victoria) | Victoria Group | VICO-related |

### Retail Sentiment Indicators (Often Contra-Signals)

These are pure retail-flow indicators. High net buy from these brokers can signal **retail FOMO at peaks** rather than smart accumulation:

- **XL (Stockbit)** — Largest retail flow proxy, community-driven
- **XC (Ajaib)** — Retail muda/digital
- **GI (Webull)** — Retail digital
- **RO (Pluang)** — Retail multi-asset muda
- **OS (OSO)** — Retail aktif gocap/penny
- **PD (Indo Premier)** — Retail informed (lebih kuat dari rata-rata retail)
- **AZ (Sucor)** — Retail premium informed
- **MG (Semesta Indovest)** — Active traders + informed retail

### Insider Transaction Gateways

These brokers often facilitate corporate insider transactions (controlling shareholders, family transactions):

- **AH (Shinhan)** — Sabana Prawira Widjaja (ULTJ)
- **GR (Panin)** — Haiyanto (ELSA), individual rich investors
- **SQ (BCA)** — Hartono/Djarum family
- **DH (Sinarmas)** — Lo Kheng Hong (ABMM), Widjaja family
- **KI (Ciptadana)** — Lippo affiliated transactions

## Recommended Agent Logic

### Composite Smart Money Score Per Stock

```
For each stock:
  signal_score = 0
  for each broker accumulating:
    base_weight = smart_money_weight_value (tier mapping above)
    
    # Apply group bias correction
    if broker.group == stock.group:
      base_weight *= 0.3  # heavy downweight for internal flow
    
    # Apply concurrent-broker confirmation bonus
    if multiple_tier1_brokers_present:
      base_weight *= 1.3
    
    # Apply retail-FOMO contra signal
    if broker.smart_money_weight == "Low" and accumulation > peer_avg * 3:
      base_weight *= -0.5  # treat as contra signal
    
    signal_score += base_weight * accumulation_value_normalized
```

### Multi-Broker Consensus Rules

- **Strong Buy Signal**: ≥2 Tier-1 brokers (AK/BK/RX/ZP/GW/DP/YU/KZ) + ≥1 Tier-1 domestic (CC/DX/LG/HP) accumulating concurrently
- **Moderate Buy Signal**: 1 Tier-1 foreign + 1 Tier-1 domestic
- **Weak Signal**: Only retail-tier brokers or single-broker accumulation
- **Distribution Warning**: If Tier-1 foreign (AK/BK/RX/ZP) actively distributing while retail (XL/XC) accumulating = retail trap pattern

### Sector-Specific Broker Affinities

The AI should expect higher weight for these broker-sector combinations:

| Sector | High-Affinity Brokers (their flows are most informative) |
|--------|----------------------------------------------------------|
| Banking (BBCA, BBRI, BMRI, BBNI) | AK, BK, ZP, RX, GW, KZ, DP, CC, NI, OD |
| Telco (TLKM, EXCL, ISAT) | AK, BK, RX, ZP, GW, BB |
| Mining/Energy (ADRO, MEDC, ANTM, INCO) | RX, ZP, AI, KI (Lippo), AF (Harita-related) |
| Consumer (UNVR, ICBP, INDF) | AK, BK, ZP, GW, DP, YU |
| Property (BSDE, SMRA, CTRA) | DH (bias), HP, KI |
| Tech/Startup (GOTO, BUKA, EMTK) | LG, BB, YU, KZ, retail brokers (XL, XC) |

## Caveats & Limitations

1. **IDX broker code disclosure was suspended June 2022 - July 2025**. Broker visibility resumed in July 2025. Historical patterns from 2022-2025 may be incomplete or based on after-the-fact reconstruction.

2. **Foreign broker identification is fluid**. Some brokers transition from foreign to local through ownership changes (e.g., CGS-CIMB → CGS International). Always verify current ownership.

3. **Retail brokers can occasionally carry institutional flow**. While XL/XC are primarily retail proxies, some smart traders use them for stealth. Treat extreme outlier behavior with scrutiny.

4. **MURI and award status ≠ smart money quality**. A broker can be popular for retail (Phintraco's MURI records, BNI awards) while having low smart money weight. The AI must distinguish marketing reputation from informational edge.

5. **Always correlate with float P/L and price action**. Even Tier-1 broker accumulation is meaningless without favorable entry zone (avg bandar price vs current price) and momentum context.

## Update Frequency

This dataset should be reviewed and updated:
- **Quarterly**: For ownership changes, mergers, license updates
- **Annually**: For market share rankings (top 10/20 broker lists)
- **Ad-hoc**: When major regulatory events occur (broker suspension, SPAB revocation)

## Sources

Profiles synthesized from:
- IDX (Bursa Efek Indonesia) member registry and statistical reports
- OJK (Otoritas Jasa Keuangan) license registry
- IDNFinancials.com transaction value rankings (H1 2025)
- Bisnis.com / Investor.id weekly broker rankings
- Cermati.com, Rankia.id, MStock Mirae Asset, IdxStock broker reviews
- CNBC Indonesia broker activity reports
- Company official websites (BNI Sekuritas, Mirae Asset, etc)
- Bandarmologi research traditions (Argha J. Karokaro, Ryan Filbert, William Hartanto)

## Disclaimer

This dataset is a synthesis of publicly available research and observable broker behavior patterns. Smart money weights are interpretive judgments based on market structure analysis, not absolute rules. Always validate signals with multiple data sources before making trading decisions.
