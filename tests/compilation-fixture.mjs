import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { knowledgeQueryFixture } from "./knowledge-query-fixture.mjs";

export const principle =
  "# 合成会议 A\n2026-09-20，合成项目组提出：所有任务必须经过双人审核后交付。这里只是一次会议中的建议，尚无效果数据。\n";
export const retrospective =
  "# 合成复盘 B\n2026-09-25，合成项目组发现低风险错字修正的双人审核导致延误。因此建议：高风险交付保留双人审核，低风险可由执行人自检。只记录一次试点，不足以推广。\n";

export async function compilationFixture(options = {}) {
  const f = await knowledgeQueryFixture(options);
  await f.changeFile("专题/判断原则.md", principle);
  await writeFile(join(f.emptyRoot, "复盘.md"), retrospective);
  return {
    ...f,
    roots: [f.root, f.emptyRoot],
    originals: async () => [
      await f.original(),
      await readFile(join(f.emptyRoot, "复盘.md"), "utf8"),
    ],
  };
}

export function makeCandidate(task) {
  const refs = task.evidence.map((entry) => entry.id);
  return {
    schema: 1,
    taskId: task.id,
    manifestHash: task.manifestHash,
    title: "审核原则应按交付风险区分 · 待审候选",
    summary:
      "早期双人审核建议与后续低风险试点出现范围分歧。可以提出按风险分级的候选方法，但还不能视为已确认的管理原则。",
    claims: [
      {
        id: "claim-1",
        kind: "source_statement",
        text: "会议记录提出所有交付双人审核；这是一条来源陈述，不证明效果。",
        evidenceIds: [refs[0]],
      },
      {
        id: "claim-2",
        kind: "analysis",
        text: "<script>window.candidateExecuted=true</script> 应保留风险范围差异，不能直接用后文覆盖旧判断。",
        evidenceIds: refs,
      },
    ],
    conflicts: [
      {
        text: "所有交付双审与低风险自检的适用范围有分歧，尚待本人决定。",
        evidenceIds: refs,
      },
    ],
    unknowns: ["风险等级尚无明确定义，也没有跨项目效果证据。"],
    relations: [
      {
        text: "后续复盘是对早期审核建议适用范围的修正线索。",
        evidenceIds: refs,
      },
    ],
  };
}
