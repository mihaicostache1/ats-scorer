.PHONY: seed
seed:
	@echo "Generating synthetic data (if not already present)..."
	cd ml/synthetic && python -m venv .venv
	cd ml/synthetic && (.venv/Scripts/pip install -r requirements.txt || .venv/bin/pip install -r requirements.txt)
	cd ml/synthetic && (.venv/Scripts/python generate.py --jobs 20 || .venv/bin/python generate.py --jobs 20)
	@echo "Seeding database..."
	cd api && python -m scripts.seed
