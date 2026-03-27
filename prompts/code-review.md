Review the entire codebase and identify every file affected by the changes.

Your task:
1. Create a complete list of all affected files.
2. Sort the files in the order they should be reviewed.
3. For each file, briefly explain why it appears in that position.
4. Use an order that helps a reviewer understand the changes logically and efficiently (for example: high-level entry points first, then core business logic, then supporting utilities, and finally tests or configuration files).
5. If helpful, group related files into sections.

Output format:
- A numbered review order
- File path for each item
- A short explanation for the review position of each file

Be thorough and avoid omitting indirectly affected files if they are important for understanding the full change.