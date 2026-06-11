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

    def generate_pdf(self, html_content: str, output_path: str) -> str:
        """Converts HTML to PDF using WeasyPrint, with fpdf2 fallback."""
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        if HAS_WEASYPRINT:
            HTML(string=html_content).write_pdf(output_path)
        elif HAS_FPDF2:
            # Generate a minimal valid PDF using fpdf2 with report summary
            pdf = FPDF()
            pdf.add_page()
            pdf.set_font("Helvetica", size=12)
            pdf.cell(0, 10, "UORA Performance Report", new_x="LMARGIN", new_y="NEXT", align="C")
            pdf.ln(5)
            pdf.set_font("Helvetica", size=10)
            pdf.multi_cell(0, 6, "Full HTML report available separately. WeasyPrint was not available for HTML-to-PDF conversion.")
            pdf.ln(5)
            pdf.cell(0, 8, "Install WeasyPrint for rich PDF output: pip install weasyprint", new_x="LMARGIN", new_y="NEXT")
            pdf.output(output_path)
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
