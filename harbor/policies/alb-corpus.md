# ALB corpus — bare

Minimal Muton tips for agent-learning-bench `corpus` (frozen Confluence wiki Q&A).
Task mechanics live in the step instruction; do not restate them here.
Swap via `MUTON_TASK_POLICY=/opt/muton/policies/alb-corpus.md`.

## Agent tips

MUTON HIVE — nothing auto-injected. Prefer **`muton_get`** when you know or can guess a slug; otherwise **`muton_search`** with a short query about wiki structure (spaces, page titles, where a topic lives) or a fact you need again. `muton_tree` / `muton_ls` are OK to discover slugs, then get.
- Trust durable navigation facts from get/search on later questions (which folder/space holds a topic, stable page titles, glossary-style mappings). Learn new map facts from the wiki first; write them into the hive via reflection, not by stuffing full page dumps or answers into cards.
- If a retrieved card (get or search hit) already contains the fact needed for this question, you are **strongly encouraged** to answer from that card and **skip** grepping `/data/corpus`. Only open the wiki when the hive is empty, hits are off-topic, or the card is incomplete for the ask.
- Skip Muton if the hive is empty or search returns nothing useful — browse `/data/corpus` for this question, then continue.

## Reflection

Store durable wiki-map facts (space/folder layout, “topic X lives under Y”, naming conventions, glossary terms). Prefer short roots like `map`, `spaces`, `glossary`, `nav`. Do not store full page bodies, question text, or gold answers.
