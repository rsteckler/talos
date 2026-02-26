Execute a multi-step action plan using extended tools. The system will automatically discover the right tools, plan the steps, and execute them.

You may call plan_actions multiple times in a single response when later phases depend on results from earlier phases. For example, if you need to search first and then act on what you find, call plan_actions for the search phase, observe the results, then call plan_actions again with a refined request. Each call creates a separate plan that executes independently.

For requests where all steps are known upfront and don't depend on intermediate results, a single plan_actions call is preferred.
