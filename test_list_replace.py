text = "Subject: Re: Q2 Roadmap Review\nFrom: marcus@client-co.com"
r1_start, r1_end = 37, 57 # marcus@client-co.com
r2_start, r2_end = 13, 15 # Q2

redacted = list(text)
print("Len before:", len(redacted))
redacted[r1_start:r1_end] = list("<EMAIL_1234>")
print("".join(redacted))
redacted[r2_start:r2_end] = list("<ID_1234>")
print("".join(redacted))
