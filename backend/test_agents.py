import asyncio
from app.services.load_management_agents import LoadManagementCrew
import os

# Ensure the .env is loaded to retrieve GROQ_API_KEY
from dotenv import load_dotenv
load_dotenv()
os.environ["OPENAI_API_KEY"] = "NA"

mock_curriculum = {
    "subjects": [
        {"subject_id": "sub1", "subject_name": "Data Structures", "theory_hours": 3, "lab_hours": 2, "tutorial_hours": 1},
        {"subject_id": "sub2", "subject_name": "Algorithms", "theory_hours": 4, "lab_hours": 0, "tutorial_hours": 0}
    ],
    "divisions": [
        {"division_id": "div1", "division_name": "Div A"},
        {"division_id": "div2", "division_name": "Div B"}
    ],
    "batches": [
        {"batch_id": "b1", "batch_name": "A1", "division_id": "div1"},
        {"batch_id": "b2", "batch_name": "A2", "division_id": "div1"}
    ]
}

mock_faculties = [
    {"faculty_id": "f1", "faculty_name": "Dr. Smith", "priority_level": 1, "role": "FACULTY"},
    {"faculty_id": "f2", "faculty_name": "Prof. Jones", "priority_level": 2, "role": "FACULTY"}
]

mock_mappings = [
    {"faculty_id": "f1", "subject_id": "sub1", "session_type": "THEORY", "division_id": "div1"}, # 3 hr
    {"faculty_id": "f1", "subject_id": "sub1", "session_type": "LAB", "batch_id": "b1"}, # 2 hr
    {"faculty_id": "f2", "subject_id": "sub2", "session_type": "THEORY", "division_id": "div1"} # 4 hr
]

def main():
    print("Testing LoadManagementCrew with existing mappings...")
    crew = LoadManagementCrew()
    
    try:
        # Expected manual calculation for f1: Theory (3) + Lab (2) = 5
        # Expected manual calculation for f2: Theory (4) = 4
        
        result = crew.calculate_and_validate_load(
            curriculum_data=mock_curriculum, 
            faculties_data=mock_faculties,
            mapping_data=mock_mappings
        )
        print("\n\n--- CREW OUTPUT ---")
        print(result)
        print("-------------------")
    except Exception as e:
        print(f"Error occurred: {e}")

if __name__ == "__main__":
    main()
