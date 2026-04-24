You are a senior QA and software test engineer.

Task:
Using the previously listed functionalities as the source of truth, generate a comprehensive test plan that identifies the unit tests and integration tests we should write. Focus ONLY on backend tests.

Instructions:

1. Organize the output into two main sections:
   - Unit tests
   - Integration tests

2. For each test case, include:
   - Test name
   - Purpose
   - Component or feature under test
   - Preconditions / setup
   - Inputs
   - Expected result
   - Priority (High / Medium / Low)

3. For unit tests:
   - Focus on isolated logic, edge cases, validation rules, error handling, state transitions, and boundary conditions.
   - Mock or stub external dependencies where appropriate.

4. For integration tests:
   - Focus on interactions between modules, services, APIs, databases, queues, authentication, and third-party dependencies.
   - Include both happy paths and failure scenarios.

5. Ensure the test plan:
   - Covers normal flows, edge cases, invalid inputs, and regression-prone areas
   - Avoids duplicate or overly generic test cases
   - Groups related tests by functionality
   - Highlights any assumptions made when functionality details are incomplete

6. Output format:
   - Use a structured table for each section
   - Add a final section called "Coverage Gaps / Open Questions" listing unclear areas, missing requirements, or testability risks

Goal:
Produce a practical, engineering-grade test checklist that a QA or development team can directly use for implementation.
