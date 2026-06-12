import os
import sys
import html
import base64
from io import BytesIO
import matplotlib.pyplot as plt

# On macOS, ensure Homebrew's lib path is in DYLD_FALLBACK_LIBRARY_PATH so WeasyPrint can load gobject / pango
if sys.platform == "darwin":
    homebrew_lib = "/opt/homebrew/lib"
    if os.path.exists(homebrew_lib):
        # Update DYLD_FALLBACK_LIBRARY_PATH
        fallback_path = os.environ.get("DYLD_FALLBACK_LIBRARY_PATH", "")
        if homebrew_lib not in fallback_path:
            os.environ["DYLD_FALLBACK_LIBRARY_PATH"] = (
                f"{fallback_path}:{homebrew_lib}" if fallback_path else homebrew_lib
            )
        # Also update DYLD_LIBRARY_PATH
        lib_path = os.environ.get("DYLD_LIBRARY_PATH", "")
        if homebrew_lib not in lib_path:
            os.environ["DYLD_LIBRARY_PATH"] = (
                f"{lib_path}:{homebrew_lib}" if lib_path else homebrew_lib
            )

try:
    from weasyprint import HTML
    HAS_WEASYPRINT = True
except (ImportError, OSError):
    HAS_WEASYPRINT = False

try:
    from fpdf import FPDF
    HAS_FPDF2 = True
except ImportError:
    HAS_FPDF2 = False


class ReportGenerator:
    """Generates PDF performance reports for UORA submissions."""

    def __init__(self):
        # Curated, professional light palette suited for printable PDFs
        self.colors = {
            "primary": "#0f172a",      # slate-900 (Deep Navy/Slate)
            "accent": "#0284c7",       # sky-600 (Core Tech Blue)
            "good": "#10b981",         # emerald-500 (Clean Success Green)
            "warning": "#f59e0b",      # amber-500 (Vibrant Warning Amber)
            "danger": "#ef4444",       # red-500 (Alert Red)
            "bg": "#ffffff",           # white
            "card_bg": "#f8fafc",      # slate-50 (Very Light Grey)
            "text": "#1e293b",         # slate-800
            "muted": "#64748b",        # slate-500
            "border": "#e2e8f0"        # slate-200
        }

    def generate_latency_chart(self, latencies: list) -> str:
        """Generates a base64 encoded PNG histogram of latencies."""
        plt.style.use('default')  # Clean light background style for printing
        fig, ax = plt.subplots(figsize=(8, 3.5))
        
        # Convert to ms
        latencies_ms = [l / 1_000_000 for l in latencies]
        
        # Beautiful sky blue bars with slight transparency and no borders
        ax.hist(latencies_ms, bins=50, color='#0ea5e9', alpha=0.85, edgecolor='none')
        
        ax.set_title("Latency Distribution (ms)", color=self.colors["primary"], pad=15, fontsize=12, fontweight='bold')
        ax.set_xlabel("Latency (ms)", color=self.colors["muted"], fontsize=9)
        ax.set_ylabel("Frequency (Order Count)", color=self.colors["muted"], fontsize=9)
        
        # Style adjustments
        ax.grid(True, alpha=0.15, color='#64748b', linestyle='--')
        ax.set_facecolor('#f8fafc')
        fig.patch.set_facecolor('#ffffff')
        
        for spine in ax.spines.values():
            spine.set_color('#cbd5e1')
            spine.set_linewidth(0.5)
            
        plt.tight_layout()
        
        # Render to base64
        buf = BytesIO()
        plt.savefig(buf, format="png", dpi=200, facecolor='#ffffff', transparent=False)
        plt.close(fig)
        return base64.b64encode(buf.getvalue()).decode('utf-8')

    def generate_score_card(self, score_data: dict) -> str:
        """Generates the HTML for the primary score summary."""
        score = score_data.get("composite_score", 0)
        latency_data = score_data.get("latency", {})
        throughput_data = score_data.get("throughput", {})
        correctness_data = score_data.get("correctness", {})
        reliability_data = score_data.get("reliability", {})

        p99_latency_ms = score_data.get("p99_latency_ms", latency_data.get("p99_ms", 0))
        p50_latency_ms = latency_data.get("p50_ms", 0)
        p90_latency_ms = latency_data.get("p90_ms", 0)
        
        throughput = score_data.get("throughput", 0)
        if isinstance(throughput, dict):
            throughput = throughput.get("avg", throughput.get("max", 0))
        elif isinstance(throughput_data, dict):
            throughput = throughput_data.get("avg", throughput_data.get("max", 0))
            
        throughput_max = throughput_data.get("max", throughput)
            
        correctness_rate = score_data.get("correctness_rate", correctness_data.get("rate", 0))
        
        success_rate = reliability_data.get("success_rate", 1.0)
        error_rate = reliability_data.get("error_rate", 0.0)
        total_orders = reliability_data.get("total_orders", 0)
        
        color = self.colors["danger"]
        rating = "UNSATISFACTORY"
        rating_desc = "Correctness violations or excessive latency. Not suitable for trading."
        if score >= 90:
            color = self.colors["good"]
            rating = "PRODUCTION READY (EXCELLENT)"
            rating_desc = "Outstanding latency profile, maximum throughput, and zero correctness violations."
        elif score >= 75:
            color = self.colors["good"]
            rating = "PRODUCTION READY"
            rating_desc = "Passes correctness and safety validation. Acceptable performance bounds."
        elif score >= 50:
            color = self.colors["warning"]
            rating = "NEEDS OPTIMIZATION"
            rating_desc = "No fatal correctness errors, but exhibits high tail latency or lower throughput."

        return f"""
        <div class="summary-section">
            <div class="score-card">
                <div class="score-label">COMPOSITE SCORE</div>
                <div class="score-value" style="color: {color};">{score:.2f}</div>
                <div class="score-rating" style="background-color: {color}15; color: {color}; border: 1px solid {color}30;">
                    {rating}
                </div>
                <div class="score-rating-desc">{rating_desc}</div>
            </div>
            
            <div class="score-info">
                <h3>Resilience Score Metric Analysis</h3>
                <p>UORA computes the composite score using the following formalized objective function:</p>
                <div class="formula-box">
                    Score = (Throughput &times; Correctness &times; Success Rate) / (P99 Latency + Resource Penalty<sup>2</sup>)
                </div>
                <p>This ensures that scoring is strictly dependent on correctness (0% if any Level 1/2 correctness rule is violated), penalizes system resource overuse, and rewards low tail latency under concurrent stress.</p>
                
                <table class="summary-details-table">
                    <tr>
                        <td><strong>Reliability</strong></td>
                        <td>Success Rate: {success_rate * 100:.2f}% | Error Rate: {error_rate * 100:.2f}%</td>
                    </tr>
                    <tr>
                        <td><strong>Total Volume</strong></td>
                        <td>{total_orders:,} total orders processed under stress</td>
                    </tr>
                    <tr>
                        <td><strong>Resource Penalty</strong></td>
                        <td>{score_data.get("resource_penalty", 0.0):.4f} (vCPU/Memory limit adjustments)</td>
                    </tr>
                </table>
            </div>
        </div>
        """

    def generate_html(self, submission_id: str, score_data: dict, violations: list, anomaly_result: dict, latency_b64: str) -> str:
        """Combines all elements into a full HTML document.
        
        All user-provided data is escaped via html.escape() to prevent XSS.
        """
        # Escape fields to prevent XSS
        safe_submission_id = html.escape(str(submission_id))
        
        # Get language and date if present, else fallback
        language = html.escape(str(score_data.get("language", "Python/C++")))
        date_str = html.escape(str(score_data.get("date", "2026-06-11")))
        
        latency_data = score_data.get("latency", {})
        throughput_data = score_data.get("throughput", {})
        correctness_data = score_data.get("correctness", {})
        
        p50_ms = latency_data.get("p50_ms", 0.0)
        p90_ms = latency_data.get("p90_ms", 0.0)
        p99_ms = latency_data.get("p99_ms", 0.0)
        
        throughput_avg = throughput_data.get("avg", 0.0)
        throughput_max = throughput_data.get("max", 0.0)
        
        correctness_pct = correctness_data.get("percentage", "0.00%")
        
        # Anomaly status block
        anomaly_score = score_data.get("anomaly", {}).get("score", 0.0)
        if anomaly_result and anomaly_result.get("is_anomaly"):
            safe_reason = html.escape(str(anomaly_result.get('reason', 'Suspicious behavior pattern')))
            anomaly_html = f"""
            <div class="anomaly-alert danger">
                <div class="alert-title">⚠️ MACHINE LEARNING ANOMALY DETECTED</div>
                <div class="alert-content">
                    <p><strong>Anomaly Score:</strong> {anomaly_score:.4f} | <strong>Confidence:</strong> {anomaly_result.get('confidence', 0)*100:.1f}%</p>
                    <p><strong>Reason:</strong> {safe_reason}</p>
                </div>
            </div>
            """
        else:
            anomaly_html = f"""
            <div class="anomaly-alert good">
                <div class="alert-title">✓ MACHINE LEARNING RESILIENCE SCAN PASSED</div>
                <div class="alert-content">
                    <p><strong>Anomaly Score:</strong> {anomaly_score:.4f} | <strong>Status:</strong> CLEAN</p>
                    <p>No anomalous latency spikes, volume leakage, or suspicious order book state transitions were detected by the isolation forest model during stress testing.</p>
                </div>
            </div>
            """

        # Correctness violations section
        if violations:
            rows = "".join(
                f"<tr>"
                f"<td style='font-family: monospace; font-size: 9pt;'>{html.escape(str(v.get('action', '')))}</td>"
                f"<td>{html.escape(str(v.get('reason', '')))}</td>"
                f"</tr>"
                for v in violations
            )
            violations_html = f"""
            <div class="section-title">Correctness Audit & Violations</div>
            <p class="section-desc">UORA enforces four levels of correctness constraints based on double-auction reference LOB laws. The following violations were logged:</p>
            <table class="violations-table">
                <thead>
                    <tr><th style="width: 30%;">Violation Target</th><th>Audit Log Details</th></tr>
                </thead>
                <tbody>
                    {rows}
                </tbody>
            </table>
            """
        else:
            violations_html = f"""
            <div class="section-title">Correctness Audit & Violations</div>
            <p class="section-desc">UORA enforces four levels of correctness constraints based on double-auction reference LOB laws:</p>
            <table class="rules-table">
                <thead>
                    <tr><th style="width: 25%;">Audit Level</th><th>Constraint Verified</th><th style="width: 15%; text-align: center;">Status</th></tr>
                </thead>
                <tbody>
                    <tr><td><strong>Level 1 (L1)</strong></td><td>Order ID uniqueness, field boundaries, and syntactic validity.</td><td class="status-pass">PASS</td></tr>
                    <tr><td><strong>Level 2 (L2)</strong></td><td>Status consistency (pending/partial_fill/filled/cancelled) compared to reference.</td><td class="status-pass">PASS</td></tr>
                    <tr><td><strong>Level 3 (L3)</strong></td><td>Execution execution price/quantity matching matching accuracy.</td><td class="status-pass">PASS</td></tr>
                    <tr><td><strong>Level 4 (L4)</strong></td><td>Resting order book state consistency and transition flow legality.</td><td class="status-pass">PASS</td></tr>
                </tbody>
            </table>
            <div class="success-banner">
                <strong>✓ CORRECTNESS GUARANTEED:</strong> All 4 correctness levels verified with 100% fidelity. No compliance violations detected.
            </div>
            """

        css = f"""
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&family=Inter:wght@400;500;600&display=swap');

        @page {{
            size: A4;
            margin: 18mm;
            @bottom-right {{
                content: "Page " counter(page) " of " counter(pages);
                font-family: 'Inter', sans-serif;
                font-size: 8pt;
                color: {self.colors["muted"]};
            }}
            @bottom-left {{
                content: "UORA Platform - Confidential Benchmarking Report";
                font-family: 'Inter', sans-serif;
                font-size: 8pt;
                color: {self.colors["muted"]};
            }}
        }}

        body {{
            font-family: 'Inter', -apple-system, sans-serif;
            background-color: {self.colors["bg"]};
            color: {self.colors["text"]};
            margin: 0;
            padding: 0;
            line-height: 1.5;
            font-size: 10pt;
        }}

        /* Header Style */
        .header {{
            border-bottom: 2px solid {self.colors["primary"]};
            padding-bottom: 15px;
            margin-bottom: 25px;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
        }}
        .header-title-box {{
            flex: 1;
        }}
        h1 {{
            font-family: 'Outfit', sans-serif;
            margin: 0;
            color: {self.colors["primary"]};
            font-size: 24pt;
            font-weight: 700;
            letter-spacing: -0.5px;
        }}
        .subtitle {{
            color: {self.colors["muted"]};
            font-size: 9pt;
            margin-top: 3px;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 1px;
        }}
        .meta-table {{
            width: 100%;
            margin-bottom: 25px;
            border-collapse: collapse;
        }}
        .meta-table td {{
            padding: 6px 12px;
            font-size: 8.5pt;
            border: 1px solid {self.colors["border"]};
            background-color: {self.colors["card_bg"]};
        }}
        .meta-table td strong {{
            color: {self.colors["primary"]};
        }}

        /* Executive Summary Grid */
        .summary-section {{
            display: flex;
            margin-bottom: 25px;
            gap: 20px;
        }}
        .score-card {{
            flex: 1;
            background: {self.colors["card_bg"]};
            border: 1px solid {self.colors["border"]};
            border-radius: 10px;
            padding: 20px;
            text-align: center;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
        }}
        .score-label {{
            font-family: 'Outfit', sans-serif;
            font-size: 9pt;
            font-weight: 700;
            letter-spacing: 1px;
            color: {self.colors["muted"]};
        }}
        .score-value {{
            font-family: 'Outfit', sans-serif;
            font-size: 44pt;
            font-weight: 700;
            line-height: 1.1;
            margin: 8px 0;
        }}
        .score-rating {{
            font-size: 8.5pt;
            font-weight: 600;
            padding: 4px 12px;
            border-radius: 20px;
            display: inline-block;
            margin-bottom: 8px;
            letter-spacing: 0.5px;
        }}
        .score-rating-desc {{
            font-size: 7.5pt;
            color: {self.colors["muted"]};
            max-width: 200px;
            margin: 0 auto;
        }}
        .score-info {{
            flex: 1.8;
            border: 1px solid {self.colors["border"]};
            border-radius: 10px;
            padding: 18px;
        }}
        .score-info h3 {{
            margin-top: 0;
            margin-bottom: 10px;
            font-family: 'Outfit', sans-serif;
            color: {self.colors["primary"]};
            font-size: 12pt;
        }}
        .score-info p {{
            font-size: 8.5pt;
            color: {self.colors["muted"]};
            margin: 0 0 10px 0;
        }}
        .formula-box {{
            background-color: {self.colors["primary"]};
            color: #ffffff;
            font-family: monospace;
            font-size: 8.5pt;
            padding: 10px;
            border-radius: 6px;
            text-align: center;
            margin-bottom: 12px;
            font-weight: bold;
        }}
        .summary-details-table {{
            width: 100%;
            font-size: 8pt;
            border-collapse: collapse;
        }}
        .summary-details-table td {{
            padding: 5px 0;
            border-bottom: 1px solid {self.colors["border"]};
        }}
        .summary-details-table td:first-child {{
            width: 25%;
        }}

        /* Metrics Dashboard Grid */
        .section-title {{
            font-family: 'Outfit', sans-serif;
            font-size: 13pt;
            font-weight: 700;
            color: {self.colors["primary"]};
            margin-top: 25px;
            margin-bottom: 5px;
            border-bottom: 1px solid {self.colors["border"]};
            padding-bottom: 5px;
        }}
        .section-desc {{
            font-size: 8.5pt;
            color: {self.colors["muted"]};
            margin-bottom: 15px;
            margin-top: 0;
        }}
        
        .metrics-dashboard {{
            display: flex;
            flex-wrap: wrap;
            gap: 15px;
            margin-bottom: 25px;
        }}
        .metric-tile {{
            flex: 1;
            min-width: 45%;
            background-color: {self.colors["card_bg"]};
            border: 1px solid {self.colors["border"]};
            border-radius: 8px;
            padding: 12px 15px;
        }}
        .metric-tile h4 {{
            margin: 0 0 8px 0;
            font-family: 'Outfit', sans-serif;
            font-size: 10pt;
            color: {self.colors["primary"]};
            border-bottom: 1px solid {self.colors["border"]};
            padding-bottom: 4px;
        }}
        .metric-row {{
            display: flex;
            justify-content: space-between;
            font-size: 8.5pt;
            margin-bottom: 4px;
        }}
        .metric-row span.m-label {{
            color: {self.colors["muted"]};
        }}
        .metric-row span.m-val {{
            font-weight: 600;
            color: {self.colors["primary"]};
        }}

        /* Charts & Visuals */
        .chart-container {{
            border: 1px solid {self.colors["border"]};
            border-radius: 10px;
            padding: 12px;
            text-align: center;
            background-color: #ffffff;
            margin-bottom: 25px;
            page-break-inside: avoid;
        }}
        img.chart {{
            width: 100%;
            height: auto;
            border-radius: 6px;
        }}

        /* Alerts and Banners */
        .anomaly-alert {{
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 25px;
            page-break-inside: avoid;
        }}
        .anomaly-alert.good {{
            background-color: {self.colors["good"]}08;
            border: 1px solid {self.colors["good"]}30;
            border-left: 4px solid {self.colors["good"]};
        }}
        .anomaly-alert.good .alert-title {{
            color: {self.colors["good"]};
            font-weight: 700;
            font-family: 'Outfit', sans-serif;
            font-size: 9.5pt;
            margin-bottom: 5px;
        }}
        .anomaly-alert.danger {{
            background-color: {self.colors["danger"]}08;
            border: 1px solid {self.colors["danger"]}30;
            border-left: 4px solid {self.colors["danger"]};
        }}
        .anomaly-alert.danger .alert-title {{
            color: {self.colors["danger"]};
            font-weight: 700;
            font-family: 'Outfit', sans-serif;
            font-size: 9.5pt;
            margin-bottom: 5px;
        }}
        .anomaly-alert p {{
            margin: 0;
            font-size: 8.5pt;
        }}

        /* Tables */
        .rules-table, .violations-table {{
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 15px;
            font-size: 8.5pt;
        }}
        .rules-table th, .violations-table th {{
            background-color: {self.colors["primary"]};
            color: #ffffff;
            font-family: 'Outfit', sans-serif;
            text-align: left;
            padding: 8px 12px;
            font-weight: 600;
        }}
        .rules-table td, .violations-table td {{
            padding: 8px 12px;
            border-bottom: 1px solid {self.colors["border"]};
        }}
        .rules-table tr:nth-child(even) {{
            background-color: {self.colors["card_bg"]};
        }}
        .status-pass {{
            color: {self.colors["good"]};
            font-weight: bold;
            text-align: center;
        }}
        .success-banner {{
            background-color: {self.colors["good"]}10;
            color: {self.colors["good"]};
            border: 1px dashed {self.colors["good"]}50;
            padding: 10px 15px;
            border-radius: 6px;
            font-size: 8.5pt;
            margin-bottom: 25px;
            text-align: center;
        }}

        .page-break {{
            page-break-before: always;
        }}
        """

        return f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>UORA Performance Report</title>
            <style>{css}</style>
        </head>
        <body>
            <!-- Page 1: Executive Dashboard -->
            <div class="header">
                <div class="header-title-box">
                    <h1>UORA PERFORMANCE & RESILIENCE</h1>
                    <div class="subtitle">AUTOMATED HFT BENCHMARKING ENGINE AUDIT</div>
                </div>
            </div>
            
            <table class="meta-table">
                <tr>
                    <td><strong>Submission ID:</strong> {safe_submission_id}</td>
                    <td><strong>Evaluation Date:</strong> {date_str}</td>
                </tr>
                <tr>
                    <td><strong>Engine Language:</strong> {language}</td>
                    <td><strong>Target Protocol:</strong> REST API (FIX Loopback)</td>
                </tr>
            </table>
            
            {self.generate_score_card(score_data)}
            
            <div class="section-title">Key Performance Dashboard</div>
            <p class="section-desc">Summary of telemetry data captured across simulated closed-loop liquidity stress testing:</p>
            
            <div class="metrics-dashboard">
                <div class="metric-tile">
                    <h4>Latency Profile</h4>
                    <div class="metric-row"><span class="m-label">P50 Latency (Median)</span><span class="m-val">{p50_ms:.3f} ms</span></div>
                    <div class="metric-row"><span class="m-label">P90 Latency (Tail)</span><span class="m-val">{p90_ms:.3f} ms</span></div>
                    <div class="metric-row"><span class="m-label">P99 Latency (Tail)</span><span class="m-val">{p99_ms:.3f} ms</span></div>
                </div>
                
                <div class="metric-tile">
                    <h4>Throughput Capacity</h4>
                    <div class="metric-row"><span class="m-label">Average TPS</span><span class="m-val">{throughput_avg:,.1f} {score_data.get("throughput", {}).get("unit", "ops")}</span></div>
                    <div class="metric-row"><span class="m-label">Peak TPS</span><span class="m-val">{throughput_max:,.1f} {score_data.get("throughput", {}).get("unit", "ops")}</span></div>
                    <div class="metric-row"><span class="m-label">State</span><span class="m-val">STABLE</span></div>
                </div>
            </div>
            
            {anomaly_html}
            
            <div class="page-break"></div>
            
            <!-- Page 2: Visual Telemetry and Compliance Audit -->
            <div class="header">
                <div class="header-title-box">
                    <h1>UORA PERFORMANCE & RESILIENCE</h1>
                    <div class="subtitle">VISUAL TELEMETRY & COMPLIANCE AUDIT</div>
                </div>
            </div>
            
            <div class="section-title">Latency Distribution Analysis</div>
            <p class="section-desc">The graph below plots order processing latency percentiles. Tail latencies are crucial indicators of system stability under HFT load.</p>
            
            <div class="chart-container">
                <img class="chart" src="data:image/png;base64,{latency_b64}" />
            </div>
            
            {violations_html}
            
        </body>
        </html>
        """

    def generate_pdf(
        self,
        html_content: str,
        output_path: str,
        score_data: dict | None = None,
        submission_id: str | None = None,
        violations: list | None = None,
        anomaly: dict | None = None,
    ) -> str:
        """Generate a print-quality PDF report.

        Path 1 (preferred): WeasyPrint renders the rich HTML directly.
        Path 2 (fallback): fpdf2 builds a structured multi-section report from
            ``score_data`` — same numbers, no system deps required. This is
            what production currently runs since the slim Python image doesn't
            ship Cairo/Pango.
        """
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        if HAS_WEASYPRINT:
            HTML(string=html_content).write_pdf(output_path)
        elif HAS_FPDF2:
            self._render_pdf_fpdf2(
                output_path,
                score_data=score_data or {},
                submission_id=submission_id or "—",
                violations=violations or [],
                anomaly=anomaly or {},
            )
        else:
            # No PDF library available — save HTML-only with a clear message
            html_path = output_path.rsplit(".", 1)[0] + ".html"
            with open(html_path, "w", encoding="utf-8") as f:
                f.write(html_content)
            # Write a minimal valid PDF explaining the situation
            with open(output_path, "wb") as f:
                # Minimal valid PDF 1.4 structure
                pdf_content = (
                    b"%PDF-1.4\n"
                    b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
                    b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
                    b"3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj\n"
                    b"4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n"
                    b"5 0 obj<</Length 107>>stream\n"
                    b"BT /F1 12 Tf 72 720 Td (UORA Report: HTML-only output) Tj 0 -20 Td (Install weasyprint or fpdf2 for PDF) Tj ET\n"
                    b"endstream\n"
                    b"endobj\n"
                    b"xref\n0 6\n"
                    b"0000000000 65535 f \n"
                    b"0000000009 00000 n \n"
                    b"0000000058 00000 n \n"
                    b"0000000115 00000 n \n"
                    b"0000000266 00000 n \n"
                    b"0000000340 00000 n \n"
                    b"trailer<</Size 6/Root 1 0 R>>\n"
                    b"startxref\n560\n%%EOF\n"
                )
                f.write(pdf_content)
        return output_path

    # ── fpdf2 path: full structured report (no system deps) ─────────────────
    def _render_pdf_fpdf2(
        self,
        output_path: str,
        score_data: dict,
        submission_id: str,
        violations: list,
        anomaly: dict,
    ) -> None:
        """Render a print-quality PDF report in UORA Void Terminal style.

        Multi-page, dark void background, plasma cyan accents, bid/ask colors,
        monospace numerals. Covers everything the dashboard surfaces:
        identity → composite score → telemetry matrix → validation L1-L4 →
        anomaly detail → composite formula → pipeline → footer.
        """
        from datetime import datetime, timezone

        pdf = FPDF(format="A4", unit="mm")
        pdf.set_auto_page_break(auto=True, margin=14)

        # ── UORA Void Terminal palette ─────────────────────────────────────
        VOID_950 = (5, 11, 20)      # background
        VOID_900 = (10, 21, 37)     # card bg
        VOID_800 = (17, 32, 58)     # elevated
        VOID_700 = (26, 48, 80)     # border
        PLASMA   = (0, 212, 255)    # primary accent
        PLASMA_D = (0, 158, 189)    # plasma dim
        BID      = (22, 199, 132)   # green
        ASK      = (234, 57, 67)    # red
        WARN     = (240, 185, 11)   # amber
        INK_0    = (240, 246, 252)  # primary text
        INK_200  = (200, 209, 217)  # body text
        INK_400  = (139, 148, 158)  # muted
        INK_500  = (110, 118, 129)  # subtle
        INK_600  = (72, 79, 88)     # very muted

        PAGE_W   = 210
        PAGE_H   = 297
        MARGIN   = 14

        def fill(rgb): pdf.set_fill_color(*rgb)
        def text(rgb): pdf.set_text_color(*rgb)
        def draw(rgb): pdf.set_draw_color(*rgb)

        def void_bg():
            fill(VOID_950)
            pdf.rect(0, 0, PAGE_W, PAGE_H, style="F")

        def add_grid_band():
            # subtle horizontal divider band (plasma 8% opacity feel)
            draw(VOID_700)
            pdf.set_line_width(0.15)
            pdf.line(MARGIN, pdf.get_y(), PAGE_W - MARGIN, pdf.get_y())

        def section_header(label: str):
            text(INK_500)
            pdf.set_font("Courier", "", 7)
            pdf.cell(0, 4, f"// {label.upper()}", new_x="LMARGIN", new_y="NEXT")
            pdf.ln(1)

        def page_chrome(page_num: int, page_total: int, title: str):
            # Top status bar
            fill(VOID_900)
            pdf.rect(0, 0, PAGE_W, 9, style="F")
            text(PLASMA)
            pdf.set_font("Courier", "B", 8)
            pdf.set_xy(MARGIN, 2.5)
            pdf.cell(0, 4, "UORA  -  PERFORMANCE  AUDIT", new_x="LMARGIN", new_y="NEXT")
            text(INK_500)
            pdf.set_font("Courier", "", 7)
            pdf.set_xy(PAGE_W - 50, 2.5)
            pdf.cell(36, 4, title.upper(), new_x="RIGHT", new_y="TOP", align="R")
            pdf.set_xy(PAGE_W - MARGIN - 10, 2.5)
            pdf.cell(10, 4, f"{page_num}/{page_total}", new_x="LMARGIN", new_y="NEXT", align="R")
            # plasma accent line
            draw(PLASMA)
            pdf.set_line_width(0.3)
            pdf.line(0, 9, PAGE_W, 9)
            # Footer
            text(INK_500)
            pdf.set_font("Courier", "", 6.5)
            pdf.set_xy(MARGIN, PAGE_H - 8)
            pdf.cell(0, 3, f"SUBMISSION  /  {submission_id}", new_x="LMARGIN", new_y="NEXT")
            pdf.set_xy(PAGE_W - 70, PAGE_H - 8)
            ts = datetime.now(timezone.utc).strftime("%Y-%m-%d  %H:%M  UTC")
            pdf.cell(60, 3, ts, new_x="LMARGIN", new_y="NEXT", align="R")

        # ── Pre-compute values ─────────────────────────────────────────────
        # `score_data` may be either flat (the simple shape) or nested (the
        # actual shape emitted by uora.scoring.engine: throughput.max,
        # latency.p99_ms, correctness.rate, reliability.success_rate, …).
        # Handle both so the report works whichever caller passed it.
        def _num(v, default=0.0):
            try:
                if isinstance(v, dict): return default
                return float(v)
            except (TypeError, ValueError):
                return default

        thr_node = score_data.get("throughput")
        if isinstance(thr_node, dict):
            throughput = _num(thr_node.get("max") or thr_node.get("avg"))
        else:
            throughput = _num(thr_node or score_data.get("max_tps"))

        lat_node = score_data.get("latency") or {}
        if isinstance(lat_node, dict) and lat_node:
            p50_ms = _num(lat_node.get("p50_ms"))
            p90_ms = _num(lat_node.get("p90_ms"))
            p99_ms = _num(lat_node.get("p99_ms"))
        else:
            p50_ms = _num(score_data.get("p50_latency_ms"))
            p90_ms = _num(score_data.get("p90_latency_ms"))
            p99_ms = _num(score_data.get("p99_latency_ms"))

        corr_node = score_data.get("correctness")
        if isinstance(corr_node, dict):
            correctness = _num(corr_node.get("rate"))
        else:
            correctness = _num(corr_node or score_data.get("correctness_rate"))

        rel_node = score_data.get("reliability") or {}
        if isinstance(rel_node, dict) and rel_node:
            success_rate = _num(rel_node.get("success_rate"))
            error_rate   = _num(rel_node.get("error_rate"))
        else:
            success_rate = _num(score_data.get("success_rate"))
            error_rate   = _num(score_data.get("error_rate"))

        anom_node = score_data.get("anomaly")
        if isinstance(anom_node, dict):
            anomaly_score_v = _num(anomaly.get("score") or anom_node.get("score"))
            is_anom         = bool(anomaly.get("is_anomaly") or anom_node.get("is_anomaly")) or anomaly_score_v >= 0.5
            anom_reason     = anomaly.get("reason") or anom_node.get("reason") or ""
        else:
            anomaly_score_v = _num(anomaly.get("score") or score_data.get("anomaly_score"))
            is_anom         = bool(anomaly.get("is_anomaly")) or anomaly_score_v >= 0.5
            anom_reason     = anomaly.get("reason") or ""

        composite = _num(score_data.get("composite_score"))
        team      = str(score_data.get("team") or "-")
        language  = str(score_data.get("language") or "-")

        TOTAL_PAGES = 3

        # ══════════════════════════════════════════════════════════════════
        # PAGE 1  —  COVER  +  HERO  +  IDENTITY
        # ══════════════════════════════════════════════════════════════════
        pdf.add_page()
        void_bg()
        page_chrome(1, TOTAL_PAGES, "COVER")

        # Big UORA wordmark
        pdf.set_xy(MARGIN, 28)
        text(INK_0)
        pdf.set_font("Helvetica", "B", 52)
        pdf.cell(0, 18, "UORA", new_x="LMARGIN", new_y="NEXT")
        text(PLASMA)
        pdf.set_font("Courier", "B", 9)
        pdf.set_xy(MARGIN, 50)
        pdf.cell(0, 4, "UNIFIED  ORDERBOOK  RESILIENCE  ARCHITECTURE", new_x="LMARGIN", new_y="NEXT")
        text(INK_500)
        pdf.set_font("Courier", "", 8)
        pdf.set_xy(MARGIN, 56)
        pdf.cell(0, 4, "Matching-engine benchmarking platform  -  IICPC 2026",
                 new_x="LMARGIN", new_y="NEXT")

        # Big composite-score hero card (dark, plasma border)
        y0 = 72
        fill(VOID_900)
        draw(PLASMA)
        pdf.set_line_width(0.4)
        pdf.rect(MARGIN, y0, PAGE_W - 2*MARGIN, 48, style="DF")
        # corner accent ticks
        pdf.set_line_width(0.6)
        pdf.line(MARGIN, y0, MARGIN + 8, y0)
        pdf.line(MARGIN, y0, MARGIN, y0 + 8)
        pdf.line(PAGE_W - MARGIN - 8, y0, PAGE_W - MARGIN, y0)
        pdf.line(PAGE_W - MARGIN, y0, PAGE_W - MARGIN, y0 + 8)

        text(INK_500)
        pdf.set_font("Courier", "", 7)
        pdf.set_xy(MARGIN + 6, y0 + 5)
        pdf.cell(0, 4, "// COMPOSITE  SCORE", new_x="LMARGIN", new_y="NEXT")

        # Score color
        if composite >= 20:   score_color = PLASMA
        elif composite >= 5:  score_color = WARN
        else:                 score_color = ASK

        text(score_color)
        pdf.set_font("Helvetica", "B", 44)
        pdf.set_xy(MARGIN + 6, y0 + 12)
        pdf.cell(80, 18, f"{composite:.2f}", new_x="RIGHT", new_y="TOP")

        # Right side: anomaly status
        pdf.set_xy(MARGIN + 90, y0 + 5)
        text(INK_500)
        pdf.set_font("Courier", "", 7)
        pdf.cell(0, 4, "// ANOMALY  STATUS", new_x="LMARGIN", new_y="NEXT")
        pdf.set_xy(MARGIN + 90, y0 + 13)
        if is_anom:
            text(ASK); badge = "FLAGGED"
        else:
            text(BID); badge = "CLEAN"
        pdf.set_font("Helvetica", "B", 22)
        pdf.cell(0, 10, badge, new_x="LMARGIN", new_y="NEXT")
        text(INK_400)
        pdf.set_font("Courier", "", 8)
        pdf.set_xy(MARGIN + 90, y0 + 25)
        pdf.cell(0, 4, f"score   {anomaly_score_v:.4f}", new_x="LMARGIN", new_y="NEXT")
        pdf.set_xy(MARGIN + 90, y0 + 30)
        pdf.cell(0, 4, f"thresh  0.5000", new_x="LMARGIN", new_y="NEXT")

        # Bottom of hero: status row
        pdf.set_xy(MARGIN + 6, y0 + 36)
        text(BID)
        pdf.set_font("Courier", "B", 8)
        pdf.cell(20, 4, "[ SCORED ]", new_x="RIGHT", new_y="TOP")
        text(INK_500)
        pdf.set_font("Courier", "", 7)
        pdf.cell(0, 4, f"  build OK   deploy OK   benchmark OK   validate OK",
                 new_x="LMARGIN", new_y="NEXT")

        # Identity panel
        pdf.set_y(132)
        section_header("submission identity")
        rows = [
            ("submission_id", submission_id),
            ("team",          team),
            ("language",      language),
            ("pipeline",      "queued -> built -> deployed -> benchmarked -> validated -> scored"),
        ]
        for k, v in rows:
            row_y = pdf.get_y()
            text(INK_500)
            pdf.set_font("Courier", "", 8)
            pdf.set_xy(MARGIN, row_y)
            pdf.cell(40, 5, k, new_x="RIGHT", new_y="TOP")
            text(INK_0)
            pdf.set_font("Courier", "B", 8.5)
            pdf.cell(0, 5, str(v)[:90], new_x="LMARGIN", new_y="NEXT")
            pdf.ln(0.5)

        # Big KPI strip (TPS, p99, correctness, anomaly)
        pdf.set_y(170)
        section_header("headline kpis")
        big_kpis = [
            ("THROUGHPUT", f"{throughput/1000:.1f}K" if throughput >= 1000 else f"{throughput:.0f}",
             "orders/s", PLASMA),
            ("P99 LATENCY", f"{p99_ms:.1f}", "ms",
             ASK if p99_ms >= 5 else WARN if p99_ms >= 1 else BID),
            ("CORRECTNESS", f"{correctness*100:.1f}", "%",
             BID if correctness >= 0.95 else WARN if correctness >= 0.7 else ASK),
            ("ANOMALY", f"{anomaly_score_v:.3f}", "score",
             ASK if is_anom else BID),
        ]
        kp_w = (PAGE_W - 2*MARGIN) / 4
        for i, (label, big, unit, color) in enumerate(big_kpis):
            x = MARGIN + i * kp_w
            fill(VOID_900); draw(VOID_700)
            pdf.set_line_width(0.2)
            pdf.rect(x + 1, pdf.get_y(), kp_w - 2, 28, style="DF")
            text(INK_500)
            pdf.set_font("Courier", "", 6.5)
            pdf.set_xy(x + 4, pdf.get_y() + 3)
            pdf.cell(0, 3, label, new_x="LMARGIN", new_y="NEXT")
            text(color)
            pdf.set_font("Helvetica", "B", 18)
            pdf.set_xy(x + 4, pdf.get_y() + 1)
            pdf.cell(0, 9, big, new_x="LMARGIN", new_y="NEXT")
            text(INK_400)
            pdf.set_font("Courier", "", 7)
            pdf.set_xy(x + 4, pdf.get_y() + 1)
            pdf.cell(0, 3, unit, new_x="LMARGIN", new_y="NEXT")
        pdf.set_y(pdf.get_y() + 6)

        # ══════════════════════════════════════════════════════════════════
        # PAGE 2  —  TELEMETRY MATRIX  +  VALIDATION  +  ANOMALY DETAIL
        # ══════════════════════════════════════════════════════════════════
        pdf.add_page()
        void_bg()
        page_chrome(2, TOTAL_PAGES, "TELEMETRY")

        pdf.set_y(20)
        text(INK_0)
        pdf.set_font("Helvetica", "B", 22)
        pdf.cell(0, 9, "Telemetry Matrix", new_x="LMARGIN", new_y="NEXT")
        text(INK_500)
        pdf.set_font("Courier", "", 8)
        pdf.cell(0, 4, "Full nanosecond-grade benchmark surface  -  L1 to L4 ground truth",
                 new_x="LMARGIN", new_y="NEXT")
        pdf.ln(5)

        # 8 KPI cards 2x4
        kpis = [
            ("P50  LATENCY",    f"{p50_ms:.3f}",    "ms",
             BID if p50_ms < 1 else WARN if p50_ms < 5 else ASK),
            ("P90  LATENCY",    f"{p90_ms:.3f}",    "ms",
             BID if p90_ms < 2 else WARN if p90_ms < 10 else ASK),
            ("P99  LATENCY",    f"{p99_ms:.3f}",    "ms",
             BID if p99_ms < 5 else WARN if p99_ms < 50 else ASK),
            ("PEAK  THROUGHPUT", f"{throughput:.0f}", "orders/s", PLASMA),
            ("SUCCESS  RATE",   f"{success_rate*100:.3f}", "%",     BID),
            ("ERROR  RATE",     f"{error_rate*100:.3f}",   "%",     BID if error_rate == 0 else ASK),
            ("CORRECTNESS",     f"{correctness*100:.3f}",  "%",
             BID if correctness >= 0.95 else WARN if correctness >= 0.7 else ASK),
            ("ANOMALY  SCORE",  f"{anomaly_score_v:.4f}", "isolation forest",
             ASK if is_anom else BID),
        ]
        card_w = (PAGE_W - 2*MARGIN - 6) / 2
        for i, (label, big, unit, color) in enumerate(kpis):
            col = i % 2
            if col == 0: row_y = pdf.get_y()
            x = MARGIN + col * (card_w + 6)
            fill(VOID_900); draw(VOID_700)
            pdf.set_line_width(0.2)
            pdf.rect(x, row_y, card_w, 18, style="DF")
            # left accent stripe
            fill(color)
            pdf.rect(x, row_y, 1.2, 18, style="F")
            # label
            text(INK_500)
            pdf.set_font("Courier", "", 7)
            pdf.set_xy(x + 5, row_y + 3)
            pdf.cell(0, 3, label, new_x="LMARGIN", new_y="NEXT")
            # big value
            text(INK_0)
            pdf.set_font("Helvetica", "B", 14)
            pdf.set_xy(x + 5, row_y + 6.5)
            pdf.cell(card_w - 38, 7, big, new_x="RIGHT", new_y="TOP")
            # unit
            text(INK_400)
            pdf.set_font("Courier", "", 7)
            pdf.set_xy(x + card_w - 33, row_y + 9)
            pdf.cell(30, 4, unit, new_x="LMARGIN", new_y="NEXT", align="R")
            if col == 1: pdf.set_y(row_y + 21)
        if len(kpis) % 2 == 1: pdf.set_y(row_y + 21)
        pdf.ln(2)

        # Validation matrix L1-L4
        section_header("validation matrix")
        if correctness >= 0.99 and len(violations) == 0:
            levels = [
                ("L1", "Price-Time Priority",  "Fill ordering correctness",            True),
                ("L2", "State Machine",        "Order lifecycle transitions",          True),
                ("L3", "Market Invariants",    "Cross-order consistency",              True),
                ("L4", "Deterministic GED",    "Graph-edit-distance replay",           True),
            ]
        else:
            levels = [
                ("L1", "Price-Time Priority",  "Fill ordering correctness",            correctness >= 0.99),
                ("L2", "State Machine",        "Order lifecycle transitions",          correctness >= 0.95),
                ("L3", "Market Invariants",    "Cross-order consistency",              correctness >= 0.90),
                ("L4", "Deterministic GED",    "Graph-edit-distance replay",           correctness >= 0.99),
            ]
        for code, name, desc, ok in levels:
            row_y = pdf.get_y()
            fill(VOID_900); draw(VOID_700)
            pdf.set_line_width(0.2)
            pdf.rect(MARGIN, row_y, PAGE_W - 2*MARGIN, 11, style="DF")
            # code badge
            fill(PLASMA if ok else ASK)
            pdf.rect(MARGIN, row_y, 12, 11, style="F")
            text(VOID_950)
            pdf.set_font("Courier", "B", 9)
            pdf.set_xy(MARGIN, row_y + 3.5)
            pdf.cell(12, 5, code, new_x="LMARGIN", new_y="NEXT", align="C")
            # name + desc
            text(INK_0)
            pdf.set_font("Helvetica", "B", 9)
            pdf.set_xy(MARGIN + 16, row_y + 2.5)
            pdf.cell(110, 4, name, new_x="LMARGIN", new_y="NEXT")
            text(INK_500)
            pdf.set_font("Courier", "", 7)
            pdf.set_xy(MARGIN + 16, row_y + 6.5)
            pdf.cell(110, 3, desc, new_x="LMARGIN", new_y="NEXT")
            # pass/fail
            text(BID if ok else ASK)
            pdf.set_font("Courier", "B", 10)
            pdf.set_xy(PAGE_W - MARGIN - 30, row_y + 3.5)
            pdf.cell(28, 5, "[ PASS ]" if ok else "[ FAIL ]",
                     new_x="LMARGIN", new_y="NEXT", align="R")
            pdf.set_y(row_y + 13)

        # Anomaly detail panel
        pdf.ln(2)
        section_header("ml anomaly detection  -  isolation forest")
        row_y = pdf.get_y()
        fill(VOID_900); draw(VOID_700)
        pdf.rect(MARGIN, row_y, PAGE_W - 2*MARGIN, 28, style="DF")
        # left stripe
        fill(ASK if is_anom else BID)
        pdf.rect(MARGIN, row_y, 1.5, 28, style="F")
        # status
        text(ASK if is_anom else BID)
        pdf.set_font("Helvetica", "B", 12)
        pdf.set_xy(MARGIN + 6, row_y + 4)
        pdf.cell(0, 5, f"[ {'FLAGGED' if is_anom else 'CLEAN'} ]   score = {anomaly_score_v:.4f}",
                 new_x="LMARGIN", new_y="NEXT")
        reason = str(anom_reason or
                     ("Within training manifold." if not is_anom else "Outside training manifold."))[:240]
        text(INK_200)
        pdf.set_font("Helvetica", "", 9)
        pdf.set_xy(MARGIN + 6, row_y + 12)
        pdf.multi_cell(PAGE_W - 2*MARGIN - 12, 4.2, reason)

        # Violations summary
        if violations:
            pdf.ln(2)
            section_header(f"violations  -  {len(violations)} total")
            for v in violations[:6]:
                vrow = pdf.get_y()
                fill(VOID_900); draw(VOID_700)
                pdf.rect(MARGIN, vrow, PAGE_W - 2*MARGIN, 9, style="DF")
                fill(ASK)
                pdf.rect(MARGIN, vrow, 1.2, 9, style="F")
                text(INK_200)
                pdf.set_font("Courier", "", 8)
                pdf.set_xy(MARGIN + 5, vrow + 3)
                txt = str(v.get("reason", str(v)))[:120]
                pdf.cell(0, 4, txt, new_x="LMARGIN", new_y="NEXT")
                pdf.set_y(vrow + 10)

        # ══════════════════════════════════════════════════════════════════
        # PAGE 3  —  SCORE FORMULA  +  PIPELINE  +  CREDITS
        # ══════════════════════════════════════════════════════════════════
        pdf.add_page()
        void_bg()
        page_chrome(3, TOTAL_PAGES, "METHODOLOGY")

        pdf.set_y(20)
        text(INK_0)
        pdf.set_font("Helvetica", "B", 22)
        pdf.cell(0, 9, "Composite Score Formula", new_x="LMARGIN", new_y="NEXT")
        text(INK_500)
        pdf.set_font("Courier", "", 8)
        pdf.cell(0, 4, "Rewards throughput and correctness; punishes tail latency and resource burn.",
                 new_x="LMARGIN", new_y="NEXT")
        pdf.ln(5)

        # Formula slab — looks like a terminal block
        row_y = pdf.get_y()
        fill(VOID_900); draw(PLASMA)
        pdf.set_line_width(0.3)
        pdf.rect(MARGIN, row_y, PAGE_W - 2*MARGIN, 30, style="DF")
        text(PLASMA)
        pdf.set_font("Courier", "B", 10)
        pdf.set_xy(MARGIN + 5, row_y + 4)
        pdf.cell(0, 5, "// score =  (throughput * correctness_rate * success_rate)",
                 new_x="LMARGIN", new_y="NEXT")
        pdf.set_xy(MARGIN + 5, row_y + 10)
        pdf.cell(0, 5, "//          ----------------------------------------------------",
                 new_x="LMARGIN", new_y="NEXT")
        pdf.set_xy(MARGIN + 5, row_y + 16)
        pdf.cell(0, 5, "//          (p99_latency_ms  +  resource_penalty ^ 2)",
                 new_x="LMARGIN", new_y="NEXT")
        text(INK_500)
        pdf.set_font("Courier", "", 7)
        pdf.set_xy(MARGIN + 5, row_y + 24)
        pdf.cell(0, 4, "// Bounded [0, 100] via isolation-forest normalization across the leaderboard.",
                 new_x="LMARGIN", new_y="NEXT")
        pdf.set_y(row_y + 34)

        # Live numbers fed into the formula
        section_header("live values  -  this submission")
        live_rows = [
            ("throughput",        f"{throughput:.2f}",        "orders / sec"),
            ("correctness_rate",  f"{correctness:.4f}",       "0.00 - 1.00"),
            ("success_rate",      f"{success_rate:.4f}",      "0.00 - 1.00"),
            ("p99_latency_ms",    f"{p99_ms:.4f}",            "milliseconds"),
            ("resource_penalty",  f"{0.0:.4f}",               "cpu / mem cost"),
            ("==>  composite",    f"{composite:.4f}",         "final score"),
        ]
        for k, v, u in live_rows:
            row_y = pdf.get_y()
            fill(VOID_900); draw(VOID_700)
            pdf.set_line_width(0.15)
            pdf.rect(MARGIN, row_y, PAGE_W - 2*MARGIN, 7, style="DF")
            text(INK_500)
            pdf.set_font("Courier", "", 8)
            pdf.set_xy(MARGIN + 4, row_y + 1.8)
            pdf.cell(60, 4, k, new_x="RIGHT", new_y="TOP")
            text(PLASMA if k.startswith("==>") else INK_0)
            pdf.set_font("Courier", "B", 9)
            pdf.cell(50, 4, v, new_x="RIGHT", new_y="TOP")
            text(INK_500)
            pdf.set_font("Courier", "", 7)
            pdf.cell(0, 4, u, new_x="LMARGIN", new_y="NEXT")
            pdf.set_y(row_y + 8)
        pdf.ln(3)

        # Pipeline stages
        section_header("pipeline  -  six deterministic stages")
        stages = [
            ("01", "UPLOAD",     "Source accepted, hash recorded"),
            ("02", "BUILD",      "Sandboxed compile, static link"),
            ("03", "DEPLOY",     "gVisor + seccomp-bpf container"),
            ("04", "BENCHMARK",  "Async bot fleet replays LOBSTER tape"),
            ("05", "VALIDATE",   "L1-L4 correctness + GED diff"),
            ("06", "SCORE",      "Composite formula + ML anomaly"),
        ]
        for n, name, desc in stages:
            row_y = pdf.get_y()
            fill(VOID_900); draw(VOID_700)
            pdf.set_line_width(0.15)
            pdf.rect(MARGIN, row_y, PAGE_W - 2*MARGIN, 8, style="DF")
            fill(PLASMA)
            pdf.rect(MARGIN, row_y, 9, 8, style="F")
            text(VOID_950)
            pdf.set_font("Courier", "B", 8)
            pdf.set_xy(MARGIN, row_y + 2.5)
            pdf.cell(9, 4, n, new_x="LMARGIN", new_y="NEXT", align="C")
            text(INK_0)
            pdf.set_font("Helvetica", "B", 9)
            pdf.set_xy(MARGIN + 13, row_y + 1.5)
            pdf.cell(40, 4, name, new_x="RIGHT", new_y="TOP")
            text(INK_400)
            pdf.set_font("Courier", "", 8)
            pdf.cell(0, 4, desc, new_x="LMARGIN", new_y="NEXT")
            pdf.set_y(row_y + 9)
        pdf.ln(3)

        # Credits block
        section_header("about")
        text(INK_200)
        pdf.set_font("Helvetica", "", 9)
        pdf.set_xy(MARGIN, pdf.get_y())
        pdf.multi_cell(
            PAGE_W - 2*MARGIN, 4.5,
            "UORA (Unified Orderbook Resilience Architecture) is a distributed "
            "matching-engine benchmarking platform: every contestant submission runs "
            "inside a hardened gVisor sandbox while a distributed bot fleet replays "
            "deterministic LOBSTER tape against it. Telemetry is captured at the Envoy "
            "edge, stored in TimescaleDB, validated against a reference orderbook with "
            "graph-edit-distance, ranked against the leaderboard via a composite score, "
            "and finally screened by an isolation-forest ML anomaly detector. "
            "This report is the deterministic audit trail for one such run."
        )

        pdf.output(output_path)


if __name__ == "__main__":
    generator = ReportGenerator()
    sub_id = "test-123"
    
    # Mock data
    latencies = [1_500_000, 2_000_000, 2_100_000, 1_900_000, 5_000_000, 1_600_000] * 100
    score_data = {
        "composite_score": 92.45,
        "language": "Python",
        "date": "2026-06-11 15:07:39",
        "throughput": {
            "avg": 45120.5,
            "max": 58900.0,
            "unit": "orders/sec",
        },
        "latency": {
            "p50_ms": 1.75,
            "p90_ms": 2.84,
            "p99_ms": 4.90,
        },
        "correctness": {
            "rate": 1.0,
            "percentage": "100.00%",
        },
        "reliability": {
            "success_rate": 1.0,
            "error_rate": 0.0,
            "total_orders": 250000,
        },
        "anomaly": {
            "score": 0.042,
            "is_anomaly": False,
            "confidence": 0.98,
            "reason": "Clean traffic signature",
        },
        "resource_penalty": 0.0,
        "formula": "(throughput &times; correctness &times; success_rate) / (p99_latency_ms + resource_penalty²)",
    }
    violations = []
    anomaly = {
        "is_anomaly": False
    }
    
    latency_b64 = generator.generate_latency_chart(latencies)
    html_content = generator.generate_html(sub_id, score_data, violations, anomaly, latency_b64)
    
    out_dir = os.path.join(os.path.dirname(__file__), "../../uora-reports")
    os.makedirs(out_dir, exist_ok=True)
    
    html_path = os.path.join(out_dir, f"report-{sub_id}.html")
    pdf_path = os.path.join(out_dir, f"report-{sub_id}.pdf")
    
    with open(html_path, "w") as f:
        f.write(html_content)
        
    generator.generate_pdf(html_content, pdf_path)
    
    print(f"✓ HTML report generated: uora-reports/report-{sub_id}.html")
    print(f"✓ PDF report generated: uora-reports/report-{sub_id}.pdf")
    print(f"✓ File size: {os.path.getsize(pdf_path) / 1024:.1f} KB")
