"""
Generates the UORA Demo Video Script PDF — scene-by-scene shooting guide
for a 3-4 minute demo, with on-screen actions, voice-over, and notes.
"""

from __future__ import annotations

from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageBreak, PageTemplate,
    Paragraph, Spacer, Table, TableStyle, KeepTogether,
)

# Palette (matches the design doc)
VOID_BLACK = HexColor("#010509")
INK_0      = HexColor("#F0F6FC")
INK_100    = HexColor("#C9D1D9")
INK_300    = HexColor("#8B949E")
INK_400    = HexColor("#6E7681")
INK_500    = HexColor("#484F58")
PLASMA     = HexColor("#00D4FF")
BID        = HexColor("#16C784")
ASK        = HexColor("#EA3943")
AMBER      = HexColor("#F0B90B")
PANEL      = HexColor("#07111F")
PANEL_BD   = HexColor("#0F1B2D")

styles = getSampleStyleSheet()

TITLE = ParagraphStyle("Title", fontName="Helvetica-Bold", fontSize=32,
                       leading=36, textColor=INK_0, alignment=TA_LEFT,
                       spaceAfter=8)
SUB = ParagraphStyle("Sub", fontName="Courier", fontSize=10, leading=14,
                     textColor=PLASMA, alignment=TA_LEFT, spaceAfter=20)
H1 = ParagraphStyle("H1", fontName="Helvetica-Bold", fontSize=19,
                    leading=22, textColor=INK_0, spaceBefore=14,
                    spaceAfter=8)
H2 = ParagraphStyle("H2", fontName="Helvetica-Bold", fontSize=14,
                    leading=17, textColor=PLASMA, spaceBefore=10,
                    spaceAfter=4)
H3 = ParagraphStyle("H3", fontName="Helvetica-Bold", fontSize=11,
                    leading=14, textColor=INK_0, spaceBefore=6, spaceAfter=2)
BODY = ParagraphStyle("Body", fontName="Helvetica", fontSize=11,
                      leading=14.5, textColor=INK_100, alignment=TA_JUSTIFY,
                      spaceAfter=6)
VO = ParagraphStyle("VO", fontName="Helvetica-Oblique", fontSize=11,
                    leading=14.5, textColor=INK_0, alignment=TA_JUSTIFY,
                    leftIndent=12, rightIndent=12,
                    backColor=PANEL, borderColor=PLASMA, borderWidth=0.5,
                    borderPadding=8, spaceBefore=4, spaceAfter=8)
ACT = ParagraphStyle("Action", fontName="Courier", fontSize=9.5, leading=13,
                     textColor=BID, leftIndent=12, rightIndent=12,
                     spaceBefore=2, spaceAfter=4)
NOTE = ParagraphStyle("Note", fontName="Helvetica-Oblique", fontSize=9.5,
                      leading=12, textColor=INK_400, leftIndent=12,
                      rightIndent=12, spaceAfter=8)
EYEBROW = ParagraphStyle("Eye", fontName="Courier-Bold", fontSize=8,
                         textColor=PLASMA, alignment=TA_LEFT)
CAP = ParagraphStyle("Cap", fontName="Helvetica-Oblique", fontSize=8,
                     leading=11, textColor=INK_400, alignment=TA_CENTER,
                     spaceAfter=10)


def cover_bg(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(VOID_BLACK)
    canvas.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)
    # Plasma glow — real alpha layers via setFillAlpha (ReportLab can't
    # parse 8-digit RGBA hex strings).
    cx, cy = A4[0]/2, A4[1]/2 + 5*cm
    canvas.setFillColor(PLASMA)
    for i, alpha in enumerate([0.06, 0.04, 0.02]):
        canvas.setFillAlpha(alpha)
        r = (i + 1) * 80
        canvas.circle(cx, cy, r, fill=1, stroke=0)
    canvas.setFillAlpha(1.0)
    canvas.setStrokeColor(PLASMA)
    canvas.setLineWidth(0.6)
    canvas.rect(1.2*cm, 1.2*cm, A4[0]-2.4*cm, A4[1]-2.4*cm, fill=0, stroke=1)
    # Brackets
    for x, y in [(1.2*cm, 1.2*cm), (A4[0]-1.2*cm, 1.2*cm),
                 (1.2*cm, A4[1]-1.2*cm), (A4[0]-1.2*cm, A4[1]-1.2*cm)]:
        sx = -18 if x > A4[0]/2 else 18
        sy = -18 if y > A4[1]/2 else 18
        canvas.setStrokeColor(PLASMA)
        canvas.setLineWidth(2)
        canvas.line(x, y, x + sx, y)
        canvas.line(x, y, x, y + sy)
    canvas.restoreState()


def body_bg(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(VOID_BLACK)
    canvas.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)
    canvas.setStrokeColor(PLASMA)
    canvas.setLineWidth(0.5)
    canvas.line(2*cm, A4[1]-1.4*cm, A4[0]-2*cm, A4[1]-1.4*cm)
    canvas.setFillColor(PLASMA)
    canvas.setFont("Courier-Bold", 8)
    canvas.drawString(2*cm, A4[1]-1.2*cm, "UORA  ·  DEMO VIDEO SCRIPT")
    canvas.drawRightString(A4[0]-2*cm, A4[1]-1.2*cm,
                           "Total runtime ~ 3:30 minutes")
    canvas.setFillColor(INK_500)
    canvas.setFont("Courier", 7)
    canvas.drawCentredString(A4[0]/2, 1.0*cm,
                             f"Page {canvas.getPageNumber()}  ·  uora-platform")
    canvas.restoreState()


def make_scene(num, title, time, location, voice, on_screen, note=None):
    """Returns a flowable group representing one scene."""
    parts = []
    header = Table([[
        Paragraph(f"<b>SCENE {num:02d}</b>", ParagraphStyle(
            "ScN", fontName="Helvetica-Bold", fontSize=11, textColor=PLASMA)),
        Paragraph(f"<b>{title}</b>", ParagraphStyle(
            "ScT", fontName="Helvetica-Bold", fontSize=12, textColor=INK_0)),
        Paragraph(f"{time}", ParagraphStyle(
            "ScTm", fontName="Courier-Bold", fontSize=9.5, textColor=AMBER,
            alignment=TA_LEFT)),
    ]], colWidths=[2.2*cm, 11.5*cm, 1.8*cm])
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BACKGROUND", (0, 0), (-1, -1), PANEL),
        ("BOX", (0, 0), (-1, -1), 0.4, PLASMA),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    parts.append(header)
    parts.append(Spacer(1, 0.15*cm))
    parts.append(Paragraph(f"<b>LOCATION:</b> {location}", BODY))
    parts.append(Paragraph("ON SCREEN", H3))
    parts.append(Paragraph(on_screen, ACT))
    parts.append(Paragraph("VOICE-OVER", H3))
    parts.append(Paragraph(f'"{voice}"', VO))
    if note:
        parts.append(Paragraph(f"<b>Director note —</b> {note}", NOTE))
    parts.append(Spacer(1, 0.4*cm))
    return KeepTogether(parts)


def build(path: str) -> None:
    doc = BaseDocTemplate(path, pagesize=A4,
                          leftMargin=2*cm, rightMargin=2*cm,
                          topMargin=2*cm, bottomMargin=1.5*cm)
    cover_f = Frame(2.5*cm, 2.5*cm, A4[0]-5*cm, A4[1]-5*cm, showBoundary=0)
    body_f = Frame(2*cm, 1.5*cm, A4[0]-4*cm, A4[1]-3.5*cm, showBoundary=0)
    doc.addPageTemplates([
        PageTemplate(id="Cover", frames=[cover_f], onPage=cover_bg),
        PageTemplate(id="Body", frames=[body_f], onPage=body_bg),
    ])

    story = []

    # ─── COVER ────────────────────────────────────────────────────────────
    story.append(Spacer(1, 1.6*cm))
    story.append(Paragraph(
        "<font color='#00D4FF'>[ UORA · DEMO VIDEO ]</font>", EYEBROW))
    story.append(Paragraph("Shooting Script", TITLE))
    story.append(Paragraph(
        "Scene-by-scene guide · ~3 minutes 30 seconds",
        ParagraphStyle("CSub", fontName="Helvetica", fontSize=14,
                       textColor=PLASMA, alignment=TA_LEFT, spaceAfter=24)))

    story.append(Paragraph(
        "This script is built to be recorded in a single uninterrupted take "
        "with the live UORA stack running. Every command, every URL, every "
        "click is rehearsed and timed. The voice-over is what you read; the "
        "on-screen action is what you do.",
        ParagraphStyle("CBody", fontName="Helvetica", fontSize=10.5,
                       leading=16, textColor=INK_100, alignment=TA_JUSTIFY,
                       spaceAfter=24)))

    meta = [
        ["FORMAT",       "1920 × 1080 · 60 fps · screen recording"],
        ["AUDIO",        "Voice-over recorded separately, 48 kHz mono"],
        ["RUNTIME",      "3 min 30 s (10 scenes)"],
        ["DELIVERABLE",  "MP4 · H.264 · &le; 500 MB"],
        ["BACKDROP",     "Dark macOS theme · hide notifications · DND on"],
        ["STACK NEEDED", "All 6 UORA services up at recording time"],
        ["DRY RUN",      "Submit dummy_engine.py once before take so MinIO is warm"],
    ]
    t = Table(meta, colWidths=[3.5*cm, 12*cm])
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Courier"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("TEXTCOLOR", (0, 0), (0, -1), PLASMA),
        ("TEXTCOLOR", (1, 0), (1, -1), INK_100),
        ("LINEBELOW", (0, 0), (-1, -1), 0.3, PANEL_BD),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(t)
    story.append(Spacer(1, 1*cm))
    story.append(Paragraph(
        "<font color='#00D4FF'>———</font>   "
        "Read the voice-over aloud as if you're explaining UORA to a CTO who "
        "has never seen it.   <font color='#00D4FF'>———</font>",
        ParagraphStyle("Tag", fontName="Courier", fontSize=9,
                       textColor=INK_400, alignment=TA_CENTER)))

    # ─── BODY ─────────────────────────────────────────────────────────────
    story.append(PageBreak())
    story.append(Paragraph("Pre-Production Checklist", H1))
    story.append(Paragraph(
        "Before pressing record, verify every item below. If any check "
        "fails, fix it first — re-shooting is more expensive than waiting.",
        BODY))
    chk = [
        ["#", "Check",                                       "Command / location"],
        ["1", "Backend running on :8000",                    "curl -sf localhost:8000/health"],
        ["2", "Frontend running on :3000",                   "open http://localhost:3000"],
        ["3", "Reference engine running on :8081",           "curl -sf localhost:8081/health"],
        ["4", "Local builder consuming build_queue",         "ps aux | grep local_builder"],
        ["5", "Benchmark worker consuming benchmark_queue",  "ps aux | grep benchmark.worker"],
        ["6", "Postgres + Redis + MinIO up",                 "pg_isready; redis-cli ping"],
        ["7", "Test account created and password handy",     "qa-final@uora.io / QaFinal-2026!"],
        ["8", "examples/dummy_engine.py is committed",       "git status"],
        ["9", "Browser DND on, notifications muted",         "System Settings"],
        ["10","Screen recorder set to 1920×1080 / 60 fps",   "QuickTime or OBS"],
    ]
    t = Table(chk, colWidths=[0.6*cm, 7*cm, 7.9*cm])
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, 1), (-1, -1), "Courier"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("TEXTCOLOR", (0, 0), (-1, 0), INK_0),
        ("TEXTCOLOR", (0, 1), (0, -1), PLASMA),
        ("TEXTCOLOR", (1, 1), (1, -1), INK_100),
        ("TEXTCOLOR", (2, 1), (-1, -1), BID),
        ("BACKGROUND", (0, 0), (-1, 0), PANEL_BD),
        ("BACKGROUND", (0, 1), (-1, -1), PANEL),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOX", (0, 0), (-1, -1), 0.4, PANEL_BD),
        ("INNERGRID", (0, 0), (-1, -1), 0.3, PANEL_BD),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(t)

    # ─── Scenes ──────────────────────────────────────────────────────────
    story.append(Spacer(1, 0.4*cm))
    story.append(Paragraph("Scene Breakdown", H1))
    story.append(Paragraph(
        "10 scenes, ~3:30 total. Time stamps are cumulative; the "
        "<font color='#F0B90B'>amber</font> figures are the planned end of "
        "each scene.",
        BODY))

    story.append(make_scene(
        num=1, title="Cold open — the hook",
        time="0:15",
        location="UORA landing page · http://localhost:3000",
        voice="Every electronic exchange runs on a matching engine. A "
              "millisecond too slow, a single out-of-order fill, and someone "
              "loses real money. So how do you actually prove your engine "
              "is fast — and correct — before it sees live traffic? This is "
              "UORA.",
        on_screen="Slow-pan over the landing hero. Animated latency stream on "
                  "the right is oscillating. Cursor still.",
        note="No talking head. Pure screen recording. Let the animation breathe."
    ))

    story.append(make_scene(
        num=2, title="Tour the landing page",
        time="0:35",
        location="Same page, scrolling down",
        voice="UORA is a benchmarking platform built for high-frequency "
              "matching engines. Upload your code; it's sandboxed, hit with a "
              "distributed bot fleet replaying real LOBSTER market data, and "
              "ranked on a live leaderboard. Every result is reproducible.",
        on_screen="Smooth-scroll past the hero stats, past the six-stage "
                  "pipeline, into the feature cards: Hardened Sandbox, "
                  "Distributed Bot Fleet, Nanosecond Telemetry, Live Leaderboard.",
        note="Scroll at a constant 200 px/s so the camera doesn't jerk."
    ))

    story.append(make_scene(
        num=3, title="Architecture deep-dive",
        time="0:55",
        location="Scroll to 'Four decoupled layers' section",
        voice="The platform is split into four horizontal layers. Submission "
              "and sandbox at the top, then benchmark and validation, "
              "telemetry and scoring, and the live UI. They talk only by "
              "Redis Streams and Pub/Sub — no shared memory, no hidden "
              "coupling.",
        on_screen="Pause on the colored layer pills. Mouse-hover the "
                  "individual component chips so they get the cyan highlight.",
        note="Move the cursor deliberately — one chip per beat."
    ))

    story.append(make_scene(
        num=4, title="Sign in with a real account",
        time="1:15",
        location="http://localhost:3000/auth",
        voice="The console is gated. Real submissions need a real account. "
              "Email and password — or Google OAuth.",
        on_screen="Click 'Launch Console'. Auth page loads. Type "
                  "qa-final@uora.io and the password. Click 'Sign In'.",
        note="Use the typing-clip plugin so the password doesn't show. "
             "Pre-warm Chromium so the page loads instantly."
    ))

    story.append(make_scene(
        num=5, title="The dashboard, empty",
        time="1:30",
        location="http://localhost:3000/dashboard",
        voice="This is the operator console. Empty for now — there are no "
              "scored engines on this team. Top score, best p99, anomalies — "
              "all dashes. The moment we submit something, it changes.",
        on_screen="Land on dashboard. Hover the four KPI cards (Active "
                  "Submissions, Top Score, Best P99, Anomalies). Pause on each.",
        note="Make sure you signed out and cleared state before the take so "
             "the dashboard is genuinely empty."
    ))

    story.append(make_scene(
        num=6, title="Upload a real engine",
        time="2:00",
        location="Submit panel",
        voice="Drag in a Python matching engine. Two hundred lines of "
              "stdlib — price-time priority, self-trade prevention, the full "
              "HTTP contract. The platform detects the language, queues the "
              "build, and shows the pipeline tracker.",
        on_screen="Drag examples/dummy_engine.py into the drop zone. "
                  "'Python · 3.13' badge appears. Click 'Submit Engine'. "
                  "Watch Recent Submissions: QUEUED → BUILD → DEPLOY → "
                  "BENCHMARK pipeline fills with green check marks.",
        note="The dropped file MUST be the latest dummy_engine.py — the "
             "DELETE-cancel fix is what gets it to score. Pre-stage it on the desktop."
    ))

    story.append(make_scene(
        num=7, title="Live build log",
        time="2:20",
        location="Right side of the dashboard",
        voice="The right panel is the real compiler output, not a scripted "
              "demo. Python 3.13 boots, the engine binds to a free port, "
              "the bot fleet starts firing.",
        on_screen="Pan to the 'Live Build Log' panel. Real lines appear: "
                  "`$ python3 --version`, `→ Entry: dummy_engine.py`. "
                  "Color-coded — green commands, gray info.",
        note="If the build log is empty, sign out, sign back in, retry. The "
             "log only renders on a fresh submission."
    ))

    story.append(make_scene(
        num=8, title="Score reveal",
        time="2:45",
        location="Submit panel after ~15 s",
        voice="And that's a real score: composite of two hundred and "
              "twenty-eight, p99 around a hundred and twenty milliseconds, "
              "throughput at twenty-eight thousand orders a second, "
              "correctness one hundred percent. Every number is from real "
              "HTTP traffic against a real running process.",
        on_screen="Recent Submissions row flips to SCORED. The 4-metric grid "
                  "appears: Score (cyan), P99 Latency, Throughput, Correctness "
                  "(green).",
        note="The exact numbers will vary ±5% each run. Don't re-take if "
             "they differ — the point is they're real."
    ))

    story.append(make_scene(
        num=9, title="Leaderboard + downloadable PDF report",
        time="3:10",
        location="Sidebar → Leaderboard, then Reports",
        voice="The leaderboard updates the moment the score lands. Click "
              "into Reports and you get the full performance audit — tail "
              "latency, fill correctness, anomaly status, and a downloadable "
              "PDF that ships with the source.",
        on_screen="Click 'Leaderboard'. Single row at rank 1 — QAFinal team. "
                  "Click 'Reports'. Click 'Download PDF Report'. Browser "
                  "shows the file save dialog briefly.",
        note="The PDF really downloads — don't fake it. Show the macOS "
             "download bezel."
    ))

    story.append(make_scene(
        num=10, title="Close",
        time="3:30",
        location="Back to landing page",
        voice="UORA. Compile, sandbox, replay, validate, score — all in "
              "under thirty seconds, with every number reproducible. Source "
              "on the screen. Thanks for watching.",
        on_screen="Cmd-click 'UORA' logo to open landing in a new tab. "
                  "Type-in overlay: github.com/vansh7266/uora-platform. "
                  "Fade to UORA mark on black.",
        note="Render the closing card in post — don't try to record the "
             "fade live."
    ))

    # ─── Post-prod ────────────────────────────────────────────────────────
    story.append(Paragraph("Post-Production Notes", H1))
    notes = [
        ("Music.",
         "Subtle, ambient, no sub-bass that masks the voice. "
         "Recommended: a 90 BPM lo-fi loop at -22 LUFS."),
        ("Cuts.",
         "Hard cut between scenes — no fades. Total cuts ≤ 12."),
        ("On-screen text.",
         "Two captions only: 'UORA' at 0:01 and 'github.com/vansh7266/uora-platform' "
         "at 3:25. Use the same Helvetica Bold as the dashboard."),
        ("Cursor.",
         "Use Mouseposé (macOS) to halo the pointer during clicks so the "
         "viewer's eye follows it."),
        ("Audio leveling.",
         "Normalize voice to -16 LUFS. Compress 3:1, gentle ratio. Truepeak "
         "ceiling -1 dB."),
        ("Export.",
         "1080p60, H.264 high profile, CRF 18, audio AAC 192 kbps. "
         "Target size: 80-120 MB."),
    ]
    for title, body in notes:
        story.append(Paragraph(
            f"<font color='#00D4FF'>{title}</font> {body}", BODY))

    # ─── Sign-off ────────────────────────────────────────────────────────
    story.append(Spacer(1, 0.6*cm))
    story.append(Paragraph(
        "<font color='#00D4FF'>———</font>   End of script · go shoot   "
        "<font color='#00D4FF'>———</font>",
        ParagraphStyle("End", fontName="Courier", fontSize=9,
                       textColor=INK_400, alignment=TA_CENTER)))

    doc.build(story)


if __name__ == "__main__":
    out = "/Users/vanshgupta/Desktop/uora/submission-docs/UORA-Demo-Video-Script.pdf"
    build(out)
    print(f"OK -> {out}")
