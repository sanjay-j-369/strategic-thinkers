import re

reply = "The message from <EMAIL_ADDRESS_b587> mentions that..."
tokens = set(re.findall(r"<[A-Z0-9_]+_[a-f0-9]+>", reply))
print(tokens)
