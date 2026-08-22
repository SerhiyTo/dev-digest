def ts2e: (.[0:19]+"Z")|fromdateiso8601;
def sum0(f): (map(f)|add)//0;

. as $all
| ([$all[]|select(.type=="assistant" and .message.usage!=null)]
   | group_by(.message.id) | map(max_by(.message.usage.output_tokens))) as $u
| ([$all[]|select(.type=="assistant")|.message.content[]?|select(.type=="tool_use")|{id,name,input}]
   | unique_by(.id)) as $tu
| ([$all[]|select(.timestamp|type=="string")|.timestamp]|sort) as $ts
| {
    api_calls: ($u|length),
    output: ($u|sum0(.message.usage.output_tokens)),
    input: ($u|sum0(.message.usage.input_tokens)),
    cache_creation: ($u|sum0(.message.usage.cache_creation_input_tokens)),
    cache_read: ($u|sum0(.message.usage.cache_read_input_tokens)),
    thinking: ($u|sum0(.message.usage.output_tokens_details.thinking_tokens//0)),
    tool_calls: ($tu|length),
    tools: ($tu|group_by(.name)|map({key:.[0].name,value:length})|from_entries),
    models: ([$u[]|.message.model//empty]|unique),
    first_ts: ($ts|first),
    last_ts: ($ts|last),
    duration_s: (if ($ts|length) > 1 then (($ts|last|ts2e) - ($ts|first|ts2e)) else 0 end),
    files_read: (
      ([$tu[]|select(.name=="Read")|.input.file_path//empty]
       + ([$tu[]|select(.name=="Bash")|.input.command//empty]
          | map(select(test("(^|\\||&&|;)\\s*(cat|head|tail|sed|wc|less|bat)\\s")))
          | map(scan("[A-Za-z0-9_.@/-]*/[A-Za-z0-9_.@-]+\\.[A-Za-z0-9]{1,5}"))
          | flatten))
      | map(sub("^\\./"; "")) | unique),
    skill_calls: ([$tu[]|select(.name=="Skill")|.input.skill//empty]|unique),
    bash_commands: [$tu[]|select(.name=="Bash")|.input.command//empty]
  }
