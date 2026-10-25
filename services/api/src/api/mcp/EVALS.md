# MCP evals

Real requests the Bessel MCP server should handle well. Run them against a test account in Claude, or in Claude Code (`claude mcp add --transport http bessel-local http://localhost:8100/mcp`), after changing tool names, descriptions or outputs. For each one, check that the agent picks the expected tools without fumbling (no guessed ids, no retries from unclear errors, no asking for the timezone) and that the answer is right.

| # | Request | Expected tools | Good answer |
|---|---|---|---|
| 1 | What should I focus on today? | `get_task_overview`, `get_calendar_events` | Leads with overdue/urgent and today's routines, fits tasks around meetings |
| 2 | What's overdue? | `get_task_overview` or `find_tasks(due="overdue")` | Most overdue first, with how late each is |
| 3 | Anything urgent for Bessel this week? | `find_tasks(project="bessel", due="this_week", min_priority="high")` | Loose project match works first try |
| 4 | Do I have a task about the passport? | `find_tasks(search="passport", status="any")` | Finds it whether open or done |
| 5 | Remind me to renew my passport next friday, high priority | `add_tasks` | Due date is next Friday in the user's timezone, no timezone question |
| 6 | Turn these meeting notes into tasks: … | `get_task_overview` (for project names), then one `add_tasks` call | One batch, existing project names, sensible due dates only where the notes give one |
| 7 | Push all my overdue Bessel tasks to Saturday | `find_tasks(due="overdue", project="Bessel")`, one `update_tasks` | Asks before changing; one batched update |
| 8 | I paid rent and did the laundry | `find_tasks(search=…)`, `complete_tasks` | Completes both; mentions the next occurrence of any routine |
| 9 | Oops, I didn't finish the laundry | `undo_complete_tasks` | Reopens it without leaving a duplicate routine |
| 10 | What did I get done this week? | `find_completed_tasks` | Grouped by project, with counts |
| 11 | (Claude Code, in the Bessel repo) Work on the next Bessel task | `start_task(project_path=<cwd>)` | Picks the right task, follows the brief, notes progress with `update_tasks(append_note=…)`, completes it at the end |
| 12 | When am I free for 2 hours this week? | `find_free_time(duration_minutes=120)` | Real gaps between meetings within working hours, nothing in the past |
| 13 | What can I cook with leeks and feta? | `search_recipes(ingredients=["leek", "feta"])`, `get_recipe` | Only recipes with both |
| 14 | Save this recipe: <pasted text> | `search_recipes(search=…)`, `add_recipe` | Amounts and units preserved; refuses a duplicate title instead of overwriting |
| 15 | How did I sleep this week, and how much did I work out? | `get_sleep(start="7 days ago")`, `list_workouts(start="7 days ago")` | Per-night totals and the workouts in range |
| 16 | How long did I code today? | `get_computer_activity` | Per-app breakdown for today |
| 17 | Delete my old tasks | (none) | Explains that Bessel's MCP can't delete; offers to cancel them with `update_tasks(status="cancelled")` |
| 18 | Add a dentist appointment on Friday at 14:00 | `list_calendars`, then `add_calendar_events` after confirming | Personal calendar, 14:00–15:00 local time, busy; asks which calendar only if it's unclear |
| 19 | Put the company's tax deadlines for next year in my calendar | `list_calendars`, one `add_calendar_events` batch | Confirms the list first; all-day and free; running it again adds nothing new |
| 20 | How much did I spend on food last month? | `get_month_summary(month="last month")` | The food category's total in kronor, compared with the six-month average |
| 21 | What needs attention in my accounts? | `get_finances_overview` | Lists only accounts with `needs_attention`, such as a bank approval to renew |
| 22 | What did my company spend on servers this year? | `search_transactions(company=true, text=…, start=…)` | Company money only, summed per currency |
| 23 | How are my investments doing? | `get_investments` | Value, growth and dividends per account, and the biggest positions, the user's and the company's apart |
| 24 | Give me a summary of my week | `get_task_overview`/`find_completed_tasks`, `get_calendar_events`, `get_sleep`, `search_transactions(start="7 days ago")` | Ties work, plans, sleep and spending together without inventing numbers |
| 25 | Will it rain in Västerås this afternoon? | `get_weather(place="Västerås", hours=…)` | Hour by hour for the afternoon in local time, credits Yr |
| 26 | Is Saturday good for a long run? | `get_weather(days=…)`, `get_calendar_events` | Saturday's temperature, rain and wind, fitted around what's in the calendar |
| 27 | Double the dal recipe and note that it freezes well | `search_recipes`, `get_recipe`, one `update_recipe` with `ingredient_groups` and `sections` | Every amount doubled, nothing else rewritten; only the changed fields sent |
