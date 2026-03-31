text = "From: sarah@vc-firm.com\nHey Alex—quick check-in."
class R:
    def __init__(self, start, end, type):
        self.start = start
        self.end = end
        self.entity_type = type

results = [R(6, 23, "EMAIL_ADDRESS")]
for r in results:
    pii_text = text[r.start:r.end]
    print(f"PII: '{pii_text}'")
    uid = "28eb6448"
    token = f"<{r.entity_type}_{uid}>"
    redacted_text = list(text)
    redacted_text[r.start:r.end] = list(token)
    print("".join(redacted_text))
