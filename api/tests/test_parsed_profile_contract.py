"""Keep the client-facing parsed-profile contract aligned with shared L-10 fixtures."""

import json
from importlib.resources import files
from pathlib import Path

import jsonschema
import yaml
from ats_scoring.schema import load_parsed_cv_fixture


def test_openapi_parsed_cv_accepts_and_rejects_the_shared_fixtures() -> None:
    contract = yaml.safe_load(
        (Path(__file__).resolve().parents[2] / "docs/openapi.yaml").read_text()
    )
    schema = {
        "$ref": "#/components/schemas/ParsedCV",
        "components": contract["components"],
    }
    validator = jsonschema.Draft202012Validator(schema)
    fixtures = files("ats_scoring").joinpath("schemas", "fixtures")
    for kind in ("valid", "invalid"):
        for fixture in fixtures.joinpath(kind).iterdir():
            if fixture.name.endswith(".json"):
                errors = list(validator.iter_errors(json.loads(fixture.read_text())))
                assert bool(errors) == (kind == "invalid"), fixture.name


def test_openapi_profile_patch_accepts_and_validates_suggestions() -> None:
    contract = yaml.safe_load(
        (Path(__file__).resolve().parents[2] / "docs/openapi.yaml").read_text()
    )
    validator = jsonschema.Draft202012Validator(
        {
            "$ref": "#/components/schemas/ParsedProfilePatch",
            "components": contract["components"],
        }
    )
    validator.validate(load_parsed_cv_fixture("valid", "skill_suggestions"))
    for name in ("skill_suggestion_empty", "skill_suggestion_as_object"):
        assert list(validator.iter_errors(load_parsed_cv_fixture("invalid", name))), name
