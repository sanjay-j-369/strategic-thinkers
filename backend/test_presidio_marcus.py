from presidio_analyzer import AnalyzerEngine
text = "Subject: Re: Q2 Roadmap Review\nFrom: marcus@client-co.com\n\nHi Alex"
analyzer = AnalyzerEngine()
results = analyzer.analyze(text=text, language="en")
for r in results:
    print(r.entity_type, r.start, r.end, f"'{text[r.start:r.end]}'")
