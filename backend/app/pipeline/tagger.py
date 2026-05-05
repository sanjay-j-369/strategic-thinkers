KEYWORD_TAGS = {
    "hiring": ["hire", "hiring", "recruit", "headcount", "onboard", "offer letter", "cto", "engineer"],
    "investor": ["investor", "vc", "fund", "term sheet", "due diligence", "pitch", "deck", "valuation"],
    "gtm": ["gtm", "go-to-market", "sales", "pipeline", "demo", "prospect", "lead", "customer success", "renewal", "expansion"],
    "technical": ["deploy", "bug", "hotfix", "api", "rate limit", "latency", "outage", "incident", "pr", "pull request"],
    "fundraise": ["fundraise", "fundraising", "raise", "series", "seed", "pre-seed", "runway", "close"],
    "burn": ["burn", "spend", "invoice", "cost", "expense", "budget", "cash"],
    "customer": ["customer", "client", "user", "churn", "nps", "feedback", "support", "renewal", "billing"],
    "revenue": ["revenue", "arr", "mrr", "invoice", "billing", "contract", "renewal", "expansion", "churn", "pipeline"],
}


def extract_tags(content: str) -> list[str]:
    """Extract context tags from content using keyword matching."""
    content_lower = content.lower()
    matched_tags = []
    for tag, keywords in KEYWORD_TAGS.items():
        if any(kw in content_lower for kw in keywords):
            matched_tags.append(tag)
    return matched_tags
