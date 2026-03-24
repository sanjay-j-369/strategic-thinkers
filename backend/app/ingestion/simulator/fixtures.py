FAKE_EMAILS = [
    {
        "subject": "Re: Q2 Roadmap Review",
        "from": "marcus@client-co.com",
        "body": "Hi Alex, following up on the API rate limits we discussed. "
                "We still see 429s in production. Can we get a fix by Friday?",
        "tags": ["customer", "gtm", "technical"],
    },
    {
        "subject": "Your runway",
        "from": "sarah@vc-firm.com",
        "body": "Hey Alex—quick check-in. Burn looks high vs. MRR. "
                "What's the plan to hit ramen profitability?",
        "tags": ["investor", "fundraise", "burn"],
    },
    {
        "subject": "Contractor invoices — June",
        "from": "dev@myStartup.io",
        "body": "Alex, 4 contractor invoices attached totalling $18k this month.",
        "tags": ["hiring", "dev-spend"],
    },
]

FAKE_SLACK_MESSAGES = [
    {"channel": "#engineering", "text": "Deploy failed on main — hotfix needed ASAP",        "tags": ["technical"]},
    {"channel": "#growth",      "text": "Marcus from Client Co wants a demo next week",       "tags": ["gtm", "customer"]},
    {"channel": "#founders",    "text": "Should we post the Series A deck to DocSend today?", "tags": ["fundraise"]},
]

FAKE_MEETINGS = [
    {"summary": "Q2 Roadmap Review",            "attendees": ["marcus@client-co.com"]},
    {"summary": "Investor Update Call — Sarah", "attendees": ["sarah@vc-firm.com"]},
]
