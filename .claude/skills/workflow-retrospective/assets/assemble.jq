def ts2e: (.[0:19]+"Z")|fromdateiso8601;
def sum0(f): (map(f)|add)//0;

($launches | map({key:.agent_id, value:.}) | from_entries) as $L
| ($agents
   | map(. + {
       resolved_model: ($L[.agent_id].resolved_model // .models[0] // "unknown"),
       launched_at: ($L[.agent_id].ts // .first_ts)
     })
   | sort_by(.first_ts)) as $A
| ([range(0; ($A|length))]
   | reduce .[] as $i ({w: 1, prev: null, out: []};
       ($A[$i].first_ts|ts2e) as $t
       | (if .prev == null or ($t - .prev) <= 30 then . else .w += 1 end)
       | .out += [$A[$i] + {wave: .w}]
       | .prev = $t)
   | .out) as $AW
| ([$AW[]|{a: .agent_id, f: .files_read[]}] + [{a: "orchestrator", f: $orchestrator.files_read[]}]) as $reads
| ([$AW[]|{a: .agent_id, c: .bash_commands[]}] + [{a: "orchestrator", c: $orchestrator.bash_commands[]}]) as $cmds
| {
    session: $session,
    orchestrator: ($orchestrator | del(.bash_commands, .models, .files_read)),
    subagents_total: {
      count: ($AW|length),
      api_calls: ($AW|sum0(.api_calls)),
      output: ($AW|sum0(.output)),
      cache_creation: ($AW|sum0(.cache_creation)),
      cache_read: ($AW|sum0(.cache_read)),
      thinking: ($AW|sum0(.thinking))
    },
    subagent_share_of_output: (
      (($AW|sum0(.output)) + $orchestrator.output) as $t
      | if $t > 0 then (($AW|sum0(.output)) * 100 / $t | round) else 0 end),
    launches: ([$AW[] | {agent_id, agent_type, description, resolved_model, launched_at, wave, spawn_depth}]),
    agents: ($AW | map(del(.bash_commands, .models))),
    parallelism: {
      sum_agent_seconds: ($AW|sum0(.duration_s)),
      session_seconds: $session.wall_clock_s,
      agent_time_ratio: (if $session.wall_clock_s > 0
                then (($AW|sum0(.duration_s)) * 100 / $session.wall_clock_s | round) / 100
                else 0 end),
      widest_wave: (($AW|group_by(.wave)|map(length)|max)//0),
      waves: ($AW | group_by(.wave) | map({
        wave: .[0].wave,
        agents: length,
        types: (map(.agent_type)|unique),
        fastest_s: (map(.duration_s)|min),
        slowest_s: (map(.duration_s)|max)
      }))
    },
    by_agent_type: ($AW | group_by(.agent_type) | map({
      agent_type: .[0].agent_type,
      count: length,
      output: sum0(.output),
      tool_calls: sum0(.tool_calls),
      median_duration_s: (sort_by(.duration_s) | .[(length/2|floor)].duration_s)
    }) | sort_by(-.output)),
    duplication: {
      files_read_by_n_agents: ($reads | group_by(.f) | map({
        file: .[0].f, readers: (map(.a)|unique|length), by: (map(.a)|unique)
      }) | map(select(.readers > 1)) | sort_by(-.readers) | .[0:25]),
      repeated_bash: ($cmds | group_by(.c) | map({
        command: .[0].c, times: length, agents: (map(.a)|unique|length)
      }) | map(select(.times > 1)) | sort_by(-.times) | .[0:20])
    },
    tools: {
      orchestrator: $orchestrator.tools,
      by_agent: ($AW | map({key: (.agent_type + ":" + .agent_id[0:8]), value: .tools}) | from_entries)
    },
    skills: {
      preloaded_never_invoked: "see references/rubric.md — cross agents[].skill_calls against .claude/agents/<type>.md skills:",
      invoked: ([$AW[].skill_calls[]] + ($orchestrator.skill_calls // []) | group_by(.) | map({key: .[0], value: length}) | from_entries),
      attributed: $attributed
    },
    turns: $turns,
    notes: $notes
  }
