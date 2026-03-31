from presidio_analyzer import AnalyzerEngine
from presidio_anonymizer import AnonymizerEngine
import uuid
import os
from app.pipeline.encryption import encrypt

_analyzer = AnalyzerEngine()
_anonymizer = AnonymizerEngine()

def strip_pii(text: str, user_id: str = None, language: str = "en"):
    """Returns PII-redacted version of text and mapping of tokens to encrypted PII."""
    try:
        results = _analyzer.analyze(text=text, language=language)
        
        if not user_id:
            return _anonymizer.anonymize(text=text, analyzer_results=results).text
            
        # Filter out overlaps (preferring longer/earlier entities)
        sorted_for_overlap = sorted(results, key=lambda x: (x.start, -x.end))
        filtered_results = []
        last_end = -1
        for r in sorted_for_overlap:
            if r.start >= last_end:
                filtered_results.append(r)
                last_end = r.end
                
        # Now sort reverse for safe list replacement
        results = sorted(filtered_results, key=lambda x: x.start, reverse=True)
        
        redacted_text = list(text)
        mapping = {}
        for r in results:
            pii_text = text[r.start:r.end]
            uid = str(uuid.uuid4()).split('-')[0]
            token = f"<{r.entity_type}_{uid}>"
            
            enc_val = encrypt(user_id, pii_text)
            mapping[token] = enc_val
            redacted_text[r.start:r.end] = list(token)
            
        return "".join(redacted_text), mapping
    except Exception as e:
        print(f"PII error fallback: {e}")
        return text if not user_id else (text, {})
