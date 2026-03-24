from presidio_analyzer import AnalyzerEngine
from presidio_anonymizer import AnonymizerEngine

_analyzer = AnalyzerEngine()
_anonymizer = AnonymizerEngine()


def strip_pii(text: str, language: str = "en") -> str:
    """Returns PII-redacted version of text."""
    results = _analyzer.analyze(text=text, language=language)
    anonymized = _anonymizer.anonymize(text=text, analyzer_results=results)
    return anonymized.text
