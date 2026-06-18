const QUESTION_CATEGORY_DEFINITIONS = [
  {
    id: "basic_definition",
    label: "Basic Definition",
    aliases: ["basic definition", "definition", "core definition", "concept definition"],
  },
  {
    id: "boundary_distinction",
    label: "Boundary Distinction",
    aliases: ["boundary distinction", "boundary", "distinction", "definition distinction"],
  },
  {
    id: "formula_calculation",
    label: "Formula Calculation",
    aliases: ["formula calculation", "formula", "calculation", "formula application"],
  },
  {
    id: "relationship_comprehension",
    label: "Relationship Comprehension",
    aliases: ["relationship comprehension", "relationship", "relationship judgment"],
  },
  {
    id: "scenario_application",
    label: "Scenario Application",
    aliases: ["scenario application", "scenario", "scenario choice", "scenario judgment"],
  },
  {
    id: "decision_judgment",
    label: "Decision Judgment",
    aliases: ["decision judgment", "decision", "platform decision", "choice judgment"],
  },
  {
    id: "causal_inference",
    label: "Causal Inference",
    aliases: ["causal inference", "causal", "cause", "why reasoning"],
  },
  {
    id: "comparative_analysis",
    label: "Comparative Analysis",
    aliases: ["comparative analysis", "comparison", "comparative reasoning"],
  },
  {
    id: "common_misconception",
    label: "Common Misconception",
    aliases: ["common misconception", "misconception", "error analysis", "trap analysis"],
  },
  {
    id: "comprehensive_application",
    label: "Comprehensive Application",
    aliases: ["comprehensive application", "comprehensive", "transfer", "integrated application"],
  },
];

const QUESTION_CATEGORY_IDS = QUESTION_CATEGORY_DEFINITIONS.map((item) => item.id);
const QUESTION_CATEGORY_LABEL_MAP = new Map(
  QUESTION_CATEGORY_DEFINITIONS.map((item) => [item.id, item.label])
);

function normalizeTaxonomyText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, " ")
    .trim();
}

function matchQuestionCategory(value) {
  const normalized = normalizeTaxonomyText(value);
  if (!normalized) {
    return "";
  }

  for (const definition of QUESTION_CATEGORY_DEFINITIONS) {
    const aliasList = [definition.id, definition.label, ...(definition.aliases || [])];
    if (aliasList.some((alias) => normalizeTaxonomyText(alias) === normalized)) {
      return definition.id;
    }
  }

  for (const definition of QUESTION_CATEGORY_DEFINITIONS) {
    const aliasList = [definition.id, definition.label, ...(definition.aliases || [])];
    if (aliasList.some((alias) => normalized.includes(normalizeTaxonomyText(alias)))) {
      return definition.id;
    }
  }

  return "";
}

function inferQuestionCategory({ questionAngle = "", knowledgeType = "", fallback = "" } = {}) {
  const direct = matchQuestionCategory(questionAngle) || matchQuestionCategory(knowledgeType);
  if (direct) {
    return direct;
  }

  const angle = normalizeTaxonomyText(questionAngle);
  const type = normalizeTaxonomyText(knowledgeType);
  const corpus = `${angle} ${type}`.trim();

  if (/(^| )definition( |$)|(^| )concept( |$)/.test(corpus)) {
    return "basic_definition";
  }
  if (/(boundary|distinction|elimination)/.test(corpus)) {
    return "boundary_distinction";
  }
  if (/(formula|calculation|calculate)/.test(corpus)) {
    return "formula_calculation";
  }
  if (/(relationship|metric relation|judgment)/.test(corpus)) {
    return "relationship_comprehension";
  }
  if (/(scenario|application)/.test(corpus)) {
    return "scenario_application";
  }
  if (/(decision|auction|platform)/.test(corpus)) {
    return "decision_judgment";
  }
  if (/(causal|cause|why)/.test(corpus)) {
    return "causal_inference";
  }
  if (/(comparison|comparative)/.test(corpus)) {
    return "comparative_analysis";
  }
  if (/(misconception|error|trap)/.test(corpus)) {
    return "common_misconception";
  }
  if (/(comprehensive|transfer|integrated)/.test(corpus)) {
    return "comprehensive_application";
  }

  return matchQuestionCategory(fallback) || "basic_definition";
}

function formatQuestionCategoryList() {
  return QUESTION_CATEGORY_DEFINITIONS.map((item) => `${item.id} (${item.label})`).join(", ");
}

function getQuestionCategoryLabel(categoryId) {
  return QUESTION_CATEGORY_LABEL_MAP.get(categoryId) || categoryId || "";
}

module.exports = {
  QUESTION_CATEGORY_DEFINITIONS,
  QUESTION_CATEGORY_IDS,
  formatQuestionCategoryList,
  getQuestionCategoryLabel,
  inferQuestionCategory,
  matchQuestionCategory,
};
