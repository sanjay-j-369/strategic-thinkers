from presidio_analyzer import AnalyzerEngine
text = "Subject: Your runway\nFrom: sarah@vc-firm.com\n\nHey Alex—quick check-in."
analyzer = AnalyzerEngine()
results = analyzer.analyze(text=text, language="en")
for r in results:
    print(r.entity_type, r.start, r.end, text[r.start:r.end])
