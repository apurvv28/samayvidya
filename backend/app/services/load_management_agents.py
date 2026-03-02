import os
import json
import logging
from typing import List, Dict, Any
from crewai import Agent, Task, Crew, Process, LLM
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

class FacultyAssignment(BaseModel):
    faculty_id: str
    faculty_name: str
    faculty_priority: int
    target_load: int
    total_assigned_hours: int
    load_status: str

class LoadAssignmentOutput(BaseModel):
    assignments: List[FacultyAssignment]
    validation_passed: bool
    notes: str = ""

def get_llm():
    # Retrieve the API key from environment
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        logger.warning("GROQ_API_KEY is missing in environment.")
        
    return LLM(
        model="groq/meta-llama/llama-4-scout-17b-16e-instruct",
        temperature=0.1,
        api_key=api_key
    )

class LoadManagementCrew:
    def __init__(self):
        self.llm = get_llm()
        
    def create_agents(self):
        calculator = Agent(
            role="Load Calculator",
            goal="Analyze the faculty-subject mappings and accurately calculate the exact teaching hours required for each mapping based on the curriculum. Theory hours depend on the subject, while labs/tutorials usually count as 2/1 hours per specific batch mapped.",
            backstory="An expert in academic workload calculation who computes the exact hour commitments for each assigned class, lab, or tutorial.",
            verbose=True,
            llm=self.llm,
            allow_delegation=False
        )
        
        validator = Agent(
            role="Validation Agent",
            goal="Sum the calculated hours for each faculty and verify if the assigned load exactly hits their required target load (Professor: 14h, Associate: 18h, Assistant: 20h or 22h). If a faculty is underloaded or overloaded, determine the discrepancy. Produce a final structured JSON report.",
            backstory="A strict human resources auditor who compares every computed hour against faculty target load requirements. Produces final, clean, structured JSON reports. You ALWAYS return ONLY raw JSON, with no markdown formatting like ```json.",
            verbose=True,
            llm=self.llm,
            allow_delegation=False
        )
        
        return calculator, validator

    def calculate_and_validate_load(self, curriculum_data: Dict[str, Any], faculties_data: List[Dict[str, Any]], mapping_data: List[Dict[str, Any]]) -> str:
        """
        Main entry point to run the crew to calculate loads for existing mappings.
        curriculum_data should include subjects, divisions, and batch records.
        faculties_data should include faculty records with priority_level.
        mapping_data should include the existing faculty-subject-division-batch assignments.
        """
        calculator, validator = self.create_agents()

        # Task 1: Calculate Load
        task1 = Task(
            description=f"Analyze these existing faculty-subject mappings and determine the TOTAL teaching hours assigned to each mapping. \n\nCurriculum Data: {json.dumps(curriculum_data, indent=2)}\n\nMapping Data: {json.dumps(mapping_data, indent=2)}\n\nRule: For EACH mapping record, look up the subject's required hours for the given session_type (THEORY, LAB, TUTORIAL). If it's THEORY for a division, use the subject's theory_hours. If it's LAB/TUTORIAL for a specific batch, use the subject's lab/tutorial hours. Produce a detailed list of how many hours each individual mapping record consumes.",
            expected_output="A structured breakdown listing each mapping and its precisely calculated hours.",
            agent=calculator
        )
        
        # Task 2: Validate against limits
        task2 = Task(
            description=f"Take the calculated hours for all mappings from the Load Calculator. Group the mappings by faculty. Calculate the total assigned hours for each faculty. Compare this against their REQUIRED target load based on their designation/priority level (Professor/Priority 1: 14h, Associate/Priority 2: 18h, Assistant/Priority 3/4: 20h or 22h). \n\nFaculty Data: {json.dumps(faculties_data, indent=2)}\n\nIdentify if any faculty is 'Underloaded', 'Overloaded', or 'Perfect' and set the `load_status` string field accordingly. State any discrepancy notes in the notes field. DO NOT WRAP THE JSON IN MARKDOWN.",
            expected_output="The final Output JSON mapping faculties, their total computed hours, their target_load, load_status (Underloaded/Overloaded/Perfect) and any validation notes. MUST BE RAW JSON. NO CODE BLOCKS.",
            agent=validator,
            context=[task1],
            output_json=LoadAssignmentOutput
        )
        
        crew = Crew(
            agents=[calculator, validator],
            tasks=[task1, task2],
            process=Process.sequential,
            verbose=True
        )
        
        # Kickoff the crew
        result = crew.kickoff()
        
        return result.raw
