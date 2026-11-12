"""Review-only candidate duplicate suggestions."""

import uuid
from typing import Literal

from pydantic import BaseModel, Field


class PossibleDuplicate(BaseModel):
    candidate_id: uuid.UUID
    full_name: str
    matched_on: list[Literal["email", "phone", "name"]] = Field(min_length=1)
    name_similarity: float | None = Field(ge=0, le=100)
