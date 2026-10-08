import json
import os
import pathlib
import sys

# Add the 'api' directory to sys.path so 'app' can be imported
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.job import Job
from app.models.organization import Organization
from app.models.user import User


def seed_db():
    db = SessionLocal()
    try:
        # Check if Demo organization exists
        org = db.query(Organization).filter_by(slug="demo").first()
        if not org:
            print("Creating Demo organization...")
            org = Organization(name="Demo Org", slug="demo")
            db.add(org)
            db.commit()
            db.refresh(org)
        else:
            print("Demo organization already exists.")

        # Create one user per role
        roles = ["admin", "recruiter"]
        for role in roles:
            email = f"{role}@demo.com"
            user = db.query(User).filter_by(email=email).first()
            if not user:
                print(f"Creating user for role: {role} (email: {email})")
                user = User(
                    org_id=org.id,
                    email=email,
                    hashed_password=hash_password("DevOnly123!"),
                    full_name=f"Demo {role.capitalize()}",
                    role=role
                )
                db.add(user)
        db.commit()

        # Load 20 jobs from ml/synthetic/output/jobs
        base_dir = pathlib.Path(__file__).parent.parent.parent
        jobs_dir = base_dir / "ml" / "synthetic" / "output" / "jobs"
        if not jobs_dir.exists():
            print(f"Jobs directory not found at {jobs_dir}. Please run data generation first.")
            return

        json_files = list(jobs_dir.glob("*.json"))
        if not json_files:
            print(f"No job JSON files found in {jobs_dir}.")
            return

        print(f"Loading jobs from {jobs_dir}...")

        # Load the admin user to set as created_by
        admin_user = db.query(User).filter_by(email="admin@demo.com").first()

        count = 0
        for json_file in json_files[:20]:
            with open(json_file, encoding="utf-8") as f:
                job_data = json.load(f)

            # Check if job already exists by title
            title = job_data.get("title")
            existing_job = db.query(Job).filter_by(org_id=org.id, title=title).first()
            if existing_job:
                continue

            # print(f"Creating job: {title}")
            job = Job(
                org_id=org.id,
                title=title,
                department=job_data.get("department"),
                location=job_data.get("location"),
                employment_type=job_data.get("employment_type", "full_time"),
                status="published",
                description=job_data.get("description", ""),
                required_skills=job_data.get("required_skills", []),
                preferred_skills=job_data.get("preferred_skills", []),
                min_experience_years=job_data.get("min_experience_years", 0),
                created_by=admin_user.id if admin_user else None
            )
            db.add(job)
            count += 1
        db.commit()
        print(f"Seed completed. Created {count} jobs.")
    except Exception as e:
        print(f"Error during seeding: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_db()
