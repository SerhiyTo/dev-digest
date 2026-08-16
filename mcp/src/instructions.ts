export const INSTRUCTIONS = `DevDigest reviews GitHub pull requests locally with configurable AI reviewer agents. Requires the DevDigest API running (DEVDIGEST_API_URL, default http://localhost:3001).

Refs are plain values, never ids: repo = "owner/name" or the bare repo name; pr = the GitHub PR number; agent = the reviewer's name from list_agents.

Workflow: call list_agents once to learn the reviewer names, then run_agent_on_pr(repo, pr, agent) - it creates the run, waits, and returns {verdict, score, findings} itself. There is no separate start/poll step. Use get_findings only for a run that already finished, or when run_agent_on_pr hands back a run_id after exhausting its 180s wait budget. get_conventions returns the repo's extracted coding conventions. get_blast_radius maps a PR's changed symbols to their callers and the HTTP endpoints and cron jobs those callers reach; it returns degraded:true when the repository is not indexed.

Every tool returns compact JSON in one text block, capped near 6000 chars. When a payload is truncated it carries a "truncated" note naming the arguments that narrow it (min_severity, limit) - re-call with those rather than asking the user for more.

Errors name the next call: an unknown repo, pr or agent tells you which listing tool to call. Reviews cost money and the API rate-limits review starts to 10/minute - never retry a failed run blindly.`;
