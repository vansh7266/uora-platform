import os
import html
import base64
from io import BytesIO
import matplotlib.pyplot as plt

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
        # We use a custom color palette for UORA
        self.colors = {
            "good": "#10b981",    # emerald-500
            "warning": "#f59e0b", # amber-500
            "danger": "#ef4444",  # red-500
            "bg": "#0f172a",      # slate-900
            "text": "#f8fafc",    # slate-50
            "muted": "#94a3b8"    # slate-400
        }

    def generate_latency_chart(self, latencies: list) -> str:
        """Generates a base64 encoded PNG histogram of latencies."""
        plt.style.use('dark_background')
        fig, ax = plt.subplots(figsize=(8, 4))
        
        # Convert to ms
        latencies_ms = [l / 1_000_000 for l in latencies]
        
        ax.hist(latencies_ms, bins=50, color='#0ea5e9', alpha=0.8, edgecolor='none')
        ax.set_title("Latency Distribution (ms)", color=self.colors["text"], pad=15)
        ax.set_xlabel("Latency (ms)", color=self.colors["muted"])
        ax.set_ylabel("Frequency", color=self.colors["muted"])
        
        # Style adjustments
        ax.grid(True, alpha=0.1, color='#e2e8f0')
        for spine in ax.spines.values():
            spine.set_visible(False)
            
        plt.tight_layout()
        
        # Render to base64
        buf = BytesIO()
        plt.savefig(buf, format="png", dpi=150, facecolor=self.colors["bg"], transparent=False)
        plt.close(fig)
        return base64.b64encode(buf.getvalue()).decode('utf-8')

    def generate_score_card(self, score_data: dict) -> str:
        """Generates the HTML for the primary score summary."""
        score = score_data.get("composite_score", 0)
        latency_data = score_data.get("latency", {})
        throughput_data = score_data.get("throughput", {})
        correctness_data = score_data.get("correctness", {})

        p99_latency_ms = score_data.get("p99_latency_ms", latency_data.get("p99_ms", 0))
        throughput = score_data.get("throughput", 0)
        if isinstance(throughput, dict):
            throughput = throughput.get("avg", throughput.get("max", 0))
        elif isinstance(throughput_data, dict):
            throughput = throughput_data.get("avg", throughput_data.get("max", 0))
        correctness_rate = score_data.get("correctness_rate", correctness_data.get("rate", 0))
        
        color = self.colors["danger"]
        if score > 80:
            color = self.colors["good"]
        elif score > 50:
            color = self.colors["warning"]

        return f"""
        <div class="score-card">
            <h2>Composite Score</h2>
            <div class="score-value" style="color: {color};">{score:.2f}</div>
            <div class="metrics-grid">
                <div class="metric">
                    <span class="label">P99 Latency</span>
                    <span class="value">{float(p99_latency_ms):.2f} ms</span>
                </div>
                <div class="metric">
                    <span class="label">Throughput</span>
                    <span class="value">{float(throughput):,.0f} ops</span>
                </div>
                <div class="metric">
                    <span class="label">Correctness</span>
                    <span class="value">{float(correctness_rate) * 100:.2f}%</span>
                </div>
            </div>
        </div>
        """

    def generate_html(self, submission_id: str, score_data: dict, violations: list, anomaly_result: dict, latency_b64: str) -> str:
        """Combines all elements into a full HTML document.
        
        All user-provided data is escaped via html.escape() to prevent XSS.
        """
        # Escape submission_id to prevent XSS
        safe_submission_id = html.escape(str(submission_id))
        
        violations_html = ""
        if violations:
            # Escape all user-provided violation fields
            rows = "".join(
                f"<tr><td>{html.escape(str(v.get('action', '')))}</td>"
                f"<td>{html.escape(str(v.get('reason', '')))}</td></tr>"
                for v in violations
            )
            violations_html = f"""
            <h3>Correctness Violations</h3>
            <table>
                <tr><th>Action</th><th>Violation Reason</th></tr>
                {rows}
            </table>
            """
            
        anomaly_html = ""
        if anomaly_result and anomaly_result.get("is_anomaly"):
            # Escape anomaly reason to prevent XSS
            safe_reason = html.escape(str(anomaly_result.get('reason', 'Suspicious behavior pattern')))
            anomaly_html = f"""
            <div class="anomaly-alert">
                <h3>⚠️ ML Anomaly Detected</h3>
                <p><strong>Confidence:</strong> {anomaly_result.get('confidence', 0)*100:.1f}%</p>
                <p><strong>Reason:</strong> {safe_reason}</p>
            </div>
            """

        css = f"""
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: {self.colors["bg"]};
            color: {self.colors["text"]};
            margin: 0;
            padding: 40px;
        }}
        .header {{
            border-bottom: 2px solid #334155;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }}
        h1 {{ margin: 0; color: #38bdf8; font-size: 28px; }}
        .subtitle {{ color: {self.colors["muted"]}; font-size: 14px; margin-top: 5px; }}
        .score-card {{
            background: #1e293b;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            margin-bottom: 30px;
        }}
        .score-value {{ font-size: 64px; font-weight: bold; margin: 10px 0; }}
        .metrics-grid {{
            display: flex;
            justify-content: space-around;
            margin-top: 20px;
            border-top: 1px solid #334155;
            padding-top: 20px;
        }}
        .metric .label {{ display: block; color: {self.colors["muted"]}; font-size: 12px; text-transform: uppercase; }}
        .metric .value {{ display: block; font-size: 20px; font-weight: 600; margin-top: 5px; }}
        img.chart {{ width: 100%; border-radius: 8px; margin: 20px 0; }}
        table {{ width: 100%; border-collapse: collapse; margin-bottom: 30px; }}
        th, td {{ padding: 12px; text-align: left; border-bottom: 1px solid #334155; }}
        th {{ color: {self.colors["muted"]}; font-weight: normal; }}
        .anomaly-alert {{
            background: #7f1d1d;
            border-left: 4px solid #ef4444;
            padding: 15px;
            border-radius: 4px;
            margin-bottom: 30px;
        }}
        .anomaly-alert h3 {{ margin-top: 0; color: #fca5a5; }}
        .footer {{
            text-align: center;
            color: {self.colors["muted"]};
            font-size: 12px;
            margin-top: 50px;
            padding-top: 20px;
            border-top: 1px solid #334155;
        }}
        """

        return f"""
        <!DOCTYPE html>
        <html>
        <head><style>{css}</style></head>
        <body>
            <div class="header">
                <h1>UORA Performance Report</h1>
                <div class="subtitle">Submission ID: {safe_submission_id}</div>
            </div>
            
            {self.generate_score_card(score_data)}
            
            <h3>Latency Distribution</h3>
            <img class="chart" src="data:image/png;base64,{latency_b64}" />
            
            {anomaly_html}
            {violations_html}
            
            <div class="footer">
                Generated by UORA Platform<br/>
                Unified Orderbook Resilience Architecture
            </div>
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
        "composite_score": 87.5,
        "p99_latency_ms": 4.8,
        "throughput": 45000,
        "correctness_rate": 1.0
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
