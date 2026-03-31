import os
import certifi
os.environ["SSL_CERT_FILE"] = certifi.where()
from pinecone import Pinecone

pc = Pinecone(api_key=os.environ.get("PINECONE_API_KEY", "pcsk_2KfTZu_rZETHJvf4JdKvgdbQzTMLgPFY1zshEBoHhqtBnrbN8r93g3sWvV85oNZm61ZZi"))
index = pc.Index(os.environ.get("PINECONE_INDEX", "founders-helper"))

res = index.query(
    namespace="founder_memory",
    vector=[0.1] * 384, # Dummy vector
    top_k=5,
    include_metadata=True
)

for match in res['matches']:
    print(f"ID: {match['id']}")
    print(f"TEXT: {match['metadata'].get('text', '')}")
    print("-" * 40)
