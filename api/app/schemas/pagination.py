"""Shared pagination schemas (OpenAPI v1 ``PaginationMeta``)."""

from pydantic import BaseModel


class PaginationMeta(BaseModel):
    """Standard pagination envelope metadata."""

    page: int
    per_page: int
    total_items: int
    total_pages: int
    has_next: bool
    has_prev: bool

    @classmethod
    def build(cls, page: int, per_page: int, total_items: int) -> "PaginationMeta":
        """Derive page counts and navigation flags from the raw totals."""
        total_pages = -(-total_items // per_page)
        return cls(
            page=page,
            per_page=per_page,
            total_items=total_items,
            total_pages=total_pages,
            has_next=page < total_pages,
            has_prev=page > 1,
        )
