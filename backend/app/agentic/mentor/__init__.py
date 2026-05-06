from __future__ import annotations


def run_mentor_review(*, user_id: str) -> dict:
	from .service import run_mentor_review as _run_mentor_review

	return _run_mentor_review(user_id=user_id)


__all__ = ["run_mentor_review"]
