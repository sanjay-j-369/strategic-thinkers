import os
import requests
from pinecone import Pinecone

pc = Pinecone(api_key=os.environ.get("PINECONE_API_KEY", "pcsk_2KfTZu_rZETHJvf4JdKvgdbQzTMLgPFY1zshEBoHhqtBnrbN8r93g3sWvV85oNZm61ZZi"))
index = pc.Index(os.environ.get("PINECONE_INDEX", "founders-helper"))
index.delete(delete_all=True, namespace="founder_memory")
print("Pinecone wiped")
