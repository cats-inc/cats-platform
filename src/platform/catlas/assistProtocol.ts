export const CATLAS_PROMPT_FORMAT = `Return {"surfaces":[{"scopeKey":"a supplied scope", "operations":[], "recommendations":[]}]}.
Operations: {op:"add",kind:"greeting",text,locale} or {op:"add",kind:"chip",label,prompt,surface,locale},
or {op:"remove"|"enable"|"disable",kind:"greeting"|"chip",id}. Builtins cannot be removed.
Only use supplied item IDs for existing items; never assign IDs. Never edit owner configuration.
At most 10 Catlas greetings and 8 Catlas chips per catalog. Leave at least one greeting enabled.
Greeting max 60 characters, label max 16, prompt max 200. Use the supplied locale.
Recommendations: {basis:[supplied record IDs],action:"prefill",surface:"chat"|"code"|"work",label,prompt}.
Every recommendation needs a nonempty basis. Name the actual item. Recommend pending and blocked items first.
Lobby accepts greeting operations and no prefill recommendations. Prefer a few useful changes; empty lists are valid.`;
export const CATLAS_NAVIGATION_FORMAT = `Return {"surfaces":[{"scopeKey":"a supplied scope", "recommendations":[{"basis":["supplied record id"],"action":"open","target":{"kind":"conversation"|"task"|"work_item"|"project","id":"one basis id"}}]}]}.
Only these fields are allowed. No text fields, labels, prompts, catalog operations or prefill actions.
Rank pending approvals, blocked work and unanswered choices above idle projects. Use real supplied IDs only.`;
