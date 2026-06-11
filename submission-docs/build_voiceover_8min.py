"""
Generates the UORA 8-minute Voice-Over Script PDF — continuous spoken narration
formatted for AI voice generation (Emergent / ElevenLabs / similar).

Also writes a plain-text version (UORA-Voiceover-8min.txt) for direct paste
into an AI voice tool.
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

TITLE = ParagraphStyle("Title", fontName="Helvetica-Bold", fontSize=30,
                       leading=34, textColor=INK_0, alignment=TA_LEFT, spaceAfter=8)
H1 = ParagraphStyle("H1", fontName="Helvetica-Bold", fontSize=16,
                    leading=20, textColor=PLASMA, spaceBefore=16, spaceAfter=4)
SEG_META = ParagraphStyle("SegMeta", fontName="Courier", fontSize=9,
                          textColor=INK_400, spaceAfter=8)
NARR = ParagraphStyle("Narr", fontName="Helvetica", fontSize=12.5,
                      leading=19, textColor=INK_100, alignment=TA_LEFT,
                      spaceAfter=10)
DIR = ParagraphStyle("Dir", fontName="Helvetica-Oblique", fontSize=9.5,
                     leading=13, textColor=AMBER, leftIndent=10, rightIndent=10,
                     backColor=HexColor("#100C02"), borderColor=HexColor("#3a2e08"),
                     borderWidth=0.5, borderPadding=7, spaceBefore=2, spaceAfter=12)
BODY = ParagraphStyle("Body", fontName="Helvetica", fontSize=11, leading=16,
                      textColor=INK_100, alignment=TA_JUSTIFY, spaceAfter=8)
EYEBROW = ParagraphStyle("Eye", fontName="Courier-Bold", fontSize=9,
                         textColor=PLASMA, alignment=TA_LEFT, spaceAfter=2)


# ─────────────────────────────────────────────────────────────────────────────
# THE SCRIPT — 8 segments, ~150 words/min target ⇒ ~1,200 words total for ~8 min.
# Each segment: (title, target_time, on_screen_hint, narration)
# Narration is written to be read aloud verbatim by an AI voice.
# ─────────────────────────────────────────────────────────────────────────────

SEGMENTS = [
    (
        "Segment 1 — The Hook",
        "0:00 – 0:50",
        "Landing page hero, animated latency stream pulsing on the right.",
        "Every electronic exchange on the planet runs on a single piece of software "
        "called a matching engine. It is the component that takes every buy order and "
        "every sell order, and decides — in a fraction of a millisecond — who trades "
        "with whom, at what price, and in what order. When it is fast and correct, "
        "markets are fair and liquid. When it is even slightly wrong — a fill out of "
        "order, a microsecond of unexpected delay — someone loses real money, and a "
        "regulator starts asking questions. And yet, the way most engineering teams "
        "test their matching engine before it goes live is shockingly informal. A few "
        "hand-written load scripts. A spreadsheet of latencies. A visual glance at an "
        "order book. There has never been a single platform that proves an engine is "
        "both fast and correct, under real pressure, with results anyone can reproduce. "
        "That is the problem we set out to solve. This is UORA.",
    ),
    (
        "Segment 2 — What UORA Is",
        "0:50 – 1:45",
        "Scroll the landing page: hero stats, six-stage pipeline, feature cards.",
        "UORA stands for Unified Orderbook Resilience Architecture. In one sentence, it "
        "is a distributed benchmarking platform that takes a contestant's matching "
        "engine, runs it under fire, and ranks it on a live leaderboard. Here is how it "
        "works. You upload your engine as source code — C plus plus, Rust, Go, or "
        "Python. UORA compiles it inside a hardened, isolated sandbox. It then unleashes "
        "a distributed fleet of trading bots that replay real, deterministic market data "
        "from the LOBSTER dataset — the same nanosecond-resolution order flow a real "
        "exchange would see. While your engine is under load, UORA streams every "
        "latency measurement, every fill, and every correctness check, in real time, to "
        "a ranked dashboard. And critically — every number on that leaderboard is "
        "reproducible. Same market tape, same validator, same scoring formula, every "
        "single run. No synthetic results. No staged demos. Just real engines, proven "
        "under real conditions.",
    ),
    (
        "Segment 3 — The Architecture",
        "1:45 – 2:50",
        "Architecture section: the four coloured layer pills; hover the components.",
        "Under the hood, UORA is built as four independent layers, and the key design "
        "decision is that they are completely decoupled. The first layer handles "
        "submission and sandboxing — authentication, file upload, object storage, and "
        "the secure build. The second layer is the benchmark and validation engine — "
        "the asynchronous bot fleet, the reference order book, and the four-level "
        "correctness validator. The third layer is telemetry and scoring — nanosecond "
        "timing captured at the proxy edge, stored in a time-series database, and fed "
        "into the composite score and the machine-learning anomaly detector. The fourth "
        "layer is the real-time leaderboard and user interface. What makes this "
        "architecture resilient is that these layers never share memory. They "
        "communicate only through Redis streams and publish-subscribe channels. That "
        "means any layer can be scaled up, restarted, or replayed completely "
        "independently of the others. A surge of submissions? Add more builders. A "
        "slow benchmark host? Replace it mid-flight. Nothing else even notices.",
    ),
    (
        "Segment 4 — Security & Sandboxing",
        "2:50 – 3:45",
        "Security stack diagram; the nested isolation layers.",
        "Now, there is an obvious danger here. We are taking untrusted code, written by "
        "someone we have never met, and running it on our infrastructure at full load. "
        "So security is not an afterthought — it is the foundation. Every submission "
        "runs behind five layers of progressively tighter isolation. At the outer edge, "
        "a gVisor user-space kernel intercepts and filters every single system call the "
        "engine attempts — direct access to the host kernel is simply impossible. "
        "Inside that, a seccomp-bpf profile enforces a deny-by-default policy: of over "
        "thirteen hundred Linux system calls, only the three hundred and twelve an "
        "engine legitimately needs are allowed; the rest are blocked at the kernel "
        "level. Network egress is set to none — the engine can only accept inbound "
        "orders from our bot fleet. CPU and memory are capped, and the container image "
        "is built from scratch, with no shell and no tools an attacker could use. This "
        "is the same class of isolation that the largest cloud providers use to run "
        "untrusted workloads.",
    ),
    (
        "Segment 5 — Validation: L1 to L4",
        "3:45 – 4:50",
        "Validation funnel diagram L1→L4; then the dashboard Validation tab.",
        "Speed without correctness is worthless. An engine that is blazingly fast but "
        "fills orders in the wrong sequence is not a fast engine — it is a broken one. "
        "So UORA validates every scored submission against a canonical reference order "
        "book, using four escalating levels of scrutiny. Level one checks price-time "
        "priority — that every fill respects the strict first-in, first-out ordering at "
        "each price. Level two checks the order lifecycle — that every order moves "
        "through valid states, from pending, to partially filled, to filled or "
        "cancelled. Level three checks market invariants — that the engine's own implied "
        "order book never crosses, that a bid never sits above an ask. And level four is "
        "the deepest: we render the engine's entire sequence of state transitions as a "
        "mathematical graph, and compute the graph-edit-distance against the reference. "
        "If the two graphs diverge, the engine is non-deterministic — and we catch it. "
        "Four levels, every submission, no exceptions.",
    ),
    (
        "Segment 6 — Scoring & Anomaly Detection",
        "4:50 – 6:00",
        "Composite score formula; then the ML anomaly section / radar chart.",
        "Once an engine passes validation, UORA computes a single composite score. The "
        "formula is deliberately simple and deliberately unforgiving. The numerator "
        "rewards what we want: raw throughput, multiplied by correctness rate, "
        "multiplied by success rate. The denominator punishes what we do not want: tail "
        "latency, plus a squared penalty for wasted CPU and memory. Because correctness "
        "is a multiplier, an engine that is only half correct does not lose a few "
        "points — it loses half its entire score. And because the latency penalty is "
        "convex, doubling your worst-case latency quadruples the damage. But a clever "
        "contestant might try to cheat — hard-code responses to known test patterns, or "
        "fake a perfectly flat latency to look fast. So on top of scoring, UORA runs a "
        "machine-learning anomaly detector. An isolation forest, trained on the profile "
        "of a healthy engine, watches eight behavioral features at once — latency "
        "entropy, throughput variance, pattern correlation, state-transition distance, "
        "and more. An engine that looks statistically unlike anything healthy gets "
        "flagged automatically — and the judges see exactly why.",
    ),
    (
        "Segment 7 — Live Demonstration",
        "6:00 – 7:15",
        "Dashboard: upload advanced_engine.py, watch pipeline, then the scored card.",
        "But none of this means anything if it does not actually run. So let us prove "
        "it. Here is the live console, signed in to a real account. I am going to drop "
        "in a real Python matching engine — two hundred lines that implement full "
        "price-time priority, all four order types, and self-trade prevention. Watch the "
        "pipeline. The platform detects the language, queues the build, compiles the "
        "engine, and deploys it into the sandbox — every stage lighting up green in real "
        "time. The build log on the right is not a scripted animation; that is the "
        "actual compiler output, streaming live. Now the bot fleet hits it. And there — "
        "a real score. A composite of two hundred and thirty, a hundred percent "
        "correctness, twenty-nine thousand orders per second, and a clean anomaly "
        "rating. Every one of those numbers came from a real process, accepting real "
        "HTTP traffic, producing real fills. And to prove the detector works — when we "
        "submit a deliberately broken engine, it is fast, but only eighteen percent "
        "correct, and the platform flags it instantly. Speed alone does not win.",
    ),
    (
        "Segment 8 — Close",
        "7:15 – 8:00",
        "Leaderboard with the ranked entry; Reports tab → Download PDF; UORA logo.",
        "And the moment that score lands, the leaderboard updates for everyone, live, "
        "over a server-sent event stream. Open the reports tab, and the full performance "
        "audit is right there — tail latency, fill correctness, anomaly status — "
        "downloadable as a PDF that ships alongside the source. That is UORA. Compile, "
        "sandbox, replay, validate, score — the entire journey from a raw source file "
        "to a ranked, reproducible leaderboard entry, in under thirty seconds, with "
        "every number honest and every number repeatable. It is the testing platform "
        "that high-frequency trading has always needed, and never had. Thank you for "
        "watching. The complete source code is on GitHub, and we would love for you to "
        "run it yourself.",
    ),
]


def build_pdf(path: str) -> None:
    doc = BaseDocTemplate(path, pagesize=A4,
                          leftMargin=2*cm, rightMargin=2*cm,
                          topMargin=2*cm, bottomMargin=1.6*cm)

    def cover_bg(canvas, d):
        canvas.saveState()
        canvas.setFillColor(VOID_BLACK)
        canvas.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)
        cx, cy = A4[0]/2, A4[1]/2 + 4*cm
        canvas.setFillColor(PLASMA)
        for i, a in enumerate([0.06, 0.04, 0.02]):
            canvas.setFillAlpha(a); canvas.circle(cx, cy, (i+1)*70, fill=1, stroke=0)
        canvas.setFillAlpha(1.0)
        canvas.setStrokeColor(PLASMA); canvas.setLineWidth(0.6)
        canvas.rect(1.2*cm, 1.2*cm, A4[0]-2.4*cm, A4[1]-2.4*cm, fill=0, stroke=1)
        for x, y in [(1.2*cm, 1.2*cm), (A4[0]-1.2*cm, 1.2*cm),
                     (1.2*cm, A4[1]-1.2*cm), (A4[0]-1.2*cm, A4[1]-1.2*cm)]:
            sx = -18 if x > A4[0]/2 else 18
            sy = -18 if y > A4[1]/2 else 18
            canvas.setLineWidth(2)
            canvas.line(x, y, x+sx, y); canvas.line(x, y, x, y+sy)
        canvas.restoreState()

    def body_bg(canvas, d):
        canvas.saveState()
        canvas.setFillColor(VOID_BLACK)
        canvas.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)
        canvas.setStrokeColor(PLASMA); canvas.setLineWidth(0.5)
        canvas.line(2*cm, A4[1]-1.4*cm, A4[0]-2*cm, A4[1]-1.4*cm)
        canvas.setFillColor(PLASMA); canvas.setFont("Courier-Bold", 8)
        canvas.drawString(2*cm, A4[1]-1.2*cm, "UORA  ·  VOICE-OVER SCRIPT")
        canvas.drawRightString(A4[0]-2*cm, A4[1]-1.2*cm, "Target runtime ~ 8:00")
        canvas.setFillColor(INK_500); canvas.setFont("Courier", 7)
        canvas.drawCentredString(A4[0]/2, 1.0*cm,
                                 f"Page {canvas.getPageNumber()}  ·  read aloud verbatim")
        canvas.restoreState()

    cover_f = Frame(2.5*cm, 2.5*cm, A4[0]-5*cm, A4[1]-5*cm)
    body_f = Frame(2*cm, 1.6*cm, A4[0]-4*cm, A4[1]-3.6*cm)
    doc.addPageTemplates([
        PageTemplate(id="Cover", frames=[cover_f], onPage=cover_bg),
        PageTemplate(id="Body", frames=[body_f], onPage=body_bg),
    ])

    story = []
    # Cover
    story.append(Spacer(1, 1.4*cm))
    story.append(Paragraph("<font color='#00D4FF'>[ UORA · VOICE-OVER ]</font>", EYEBROW))
    story.append(Paragraph("8-Minute Narration", TITLE))
    story.append(Paragraph(
        "Full spoken script · ready for AI voice generation",
        ParagraphStyle("CSub", fontName="Helvetica", fontSize=14, textColor=PLASMA,
                       alignment=TA_LEFT, spaceAfter=22)))
    story.append(Paragraph(
        "This document is the complete word-for-word narration for the UORA demo "
        "video, timed to run approximately eight minutes at a natural ~150 words per "
        "minute pace. It is written to be read aloud verbatim — paste each segment "
        "(or the whole script) into an AI voice generator such as the one in Emergent, "
        "ElevenLabs, or any text-to-speech tool, and record the screen actions noted in "
        "amber to match.",
        BODY))
    meta = [
        ["TOTAL WORDS",   "~1,200 (≈ 8 minutes at 150 wpm)"],
        ["SEGMENTS",      "8 — record continuously or one at a time"],
        ["VOICE STYLE",   "Calm, confident, documentary. Not salesy."],
        ["PACE",          "Unhurried. Pause at every full stop."],
        ["PRONUNCIATION", "UORA = \"oo-OR-ah\". gVisor = \"gee-VY-zor\"."],
        ["PLAIN TEXT",    "UORA-Voiceover-8min.txt (paste-ready, no markup)"],
    ]
    t = Table(meta, colWidths=[3.6*cm, 12*cm])
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Courier"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (0, -1), PLASMA),
        ("TEXTCOLOR", (1, 0), (1, -1), INK_100),
        ("LINEBELOW", (0, 0), (-1, -1), 0.3, PANEL_BD),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(t)

    story.append(PageBreak())

    # Segments
    for title, tcode, hint, narration in SEGMENTS:
        block = [
            Paragraph(title, H1),
            Paragraph(f"⏱  {tcode}", SEG_META),
            Paragraph(f"<b>On screen —</b> {hint}", DIR),
            Paragraph(narration, NARR),
        ]
        story.append(KeepTogether(block))
        story.append(Spacer(1, 0.3*cm))

    story.append(Spacer(1, 0.4*cm))
    story.append(Paragraph(
        "<font color='#00D4FF'>———</font>   End of narration · total ≈ 8:00   "
        "<font color='#00D4FF'>———</font>",
        ParagraphStyle("End", fontName="Courier", fontSize=9, textColor=INK_400,
                       alignment=TA_CENTER)))

    doc.build(story)


def write_txt(path: str) -> None:
    """Paste-ready plain text — no markup, segment markers as comments the
    narrator/AI can ignore or delete."""
    lines = []
    lines.append("UORA — 8-MINUTE VIDEO VOICE-OVER SCRIPT")
    lines.append("Read aloud verbatim. ~150 words/min ≈ 8 minutes.")
    lines.append("Pronunciation: UORA = oo-OR-ah. gVisor = gee-VY-zor. LOBSTER = lob-ster.")
    lines.append("=" * 70)
    lines.append("")
    for title, tcode, hint, narration in SEGMENTS:
        lines.append(f"[{title}  |  {tcode}]")
        lines.append(f"(on screen: {hint})")
        lines.append("")
        lines.append(narration)
        lines.append("")
        lines.append("")
    with open(path, "w") as f:
        f.write("\n".join(lines))


if __name__ == "__main__":
    base = "/Users/vanshgupta/Desktop/uora/submission-docs"
    pdf = f"{base}/UORA-Voiceover-8min.pdf"
    txt = f"{base}/UORA-Voiceover-8min.txt"
    build_pdf(pdf)
    write_txt(txt)
    # quick word count
    words = sum(len(n.split()) for *_, n in SEGMENTS)
    print(f"OK -> {pdf}")
    print(f"OK -> {txt}")
    print(f"Total narration words: {words}  (~{words/150:.1f} min at 150 wpm)")
