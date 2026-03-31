from app.pipeline.pii import strip_pii
text = "Subject: Your runway\nFrom: sarah@vc-firm.com\n\nHey Alex—quick check-in."
redacted, mapping = strip_pii(text, "d4c615b8-cedc-4c97-80ed-2c8373610d78")
print(redacted)
print(mapping)
