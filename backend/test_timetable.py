#!/usr/bin/env python
"""Test script to run timetable orchestration and display results."""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

# Suppress deprecation warnings
import warnings
warnings.filterwarnings('ignore', category=DeprecationWarning)

# Import required modules
from dotenv import load_dotenv
load_dotenv(override=True)

from app.services.timetable_orchestrator import TimetableOrchestrationEngine

def main():
    print("=" * 80)
    print("TIMETABLE ORCHESTRATION TEST")
    print("=" * 80)
    
    try:
        engine = TimetableOrchestrationEngine()
        result = engine.run(
            user_id=None,
            department_id=None,
            persist=False,
            reason="Test run with division_daily relaxation"
        )
        
        print("\n" + "=" * 80)
        print("ORCHESTRATION RESULT")
        print("=" * 80)
        
        # Display summary
        if isinstance(result, dict):
            print(f"\nTotal Sessions Scheduled: {result.get('scheduled_count', 'N/A')}/203")
            print(f"Unresolved Sessions: {result.get('unresolved_count', 'N/A')}")
            print(f"Execution Time: {result.get('execution_time', 'N/A')}s")
            
            if result.get('unresolved_sessions'):
                print(f"\nUnresolved Sessions Detail:")
                for session in result.get('unresolved_sessions', [])[:10]:  # Show first 10
                    print(f"  - {session}")
                if len(result.get('unresolved_sessions', [])) > 10:
                    print(f"  ... and {len(result.get('unresolved_sessions', [])) - 10} more")
        else:
            print(f"\nResult: {result}")
        
        print("\n" + "=" * 80)
        
    except Exception as e:
        print(f"\nError during orchestration: {str(e)}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
