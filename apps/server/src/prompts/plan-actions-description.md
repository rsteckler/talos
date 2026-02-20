Execute a multi-step action plan using extended tools. The system will automatically plan and execute all necessary steps, passing data between them.

IMPORTANT: Always pass the user's COMPLETE request in a single call. Do NOT break a multi-step request into separate plan_actions calls — the planner handles multi-step orchestration internally. For example, "search my notes and email the result" should be ONE call, not two.
