export type Action = "allow" | "review" | "block";

export type Question =
  | {
      type: "noul";
      instructions: string;
      criteria?: { true: string; false: string };
    }
  | {
      type: "choice";
      instructions: string;
      criteria: Record<string, string>;
    }
  | {
      type: "score";
      instructions: string;
      criteria: string[];
    };

export type NoulAnswer = { type: "noul"; noul: number };
export type ChoiceAnswer = {
  type: "choice";
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
};
export type ScoreAnswer = {
  type: "score";
  score: number;
  confidence: number;
  probabilities: Record<string, number>;
  legend: Record<string, string>;
};
export type Answer = NoulAnswer | ChoiceAnswer | ScoreAnswer;

export type Thresholds = {
  auto: number;
  review: number;
};

export type Verdict = {
  action: Action;
  reasons: string[];
  model_tier: "cheap" | "standard" | "reasoning" | "unknown";
  confidence_floor: number;
};

export type JevResponse = {
  model: string;
  answers: Record<string, Answer>;
  usage?: { input_tokens: number; output_tokens: number };
};

export type DiffMetrics = {
  file_count: number;
  added: number;
  removed: number;
  timeout_bumps: string[];
  skip_added: string[];
  empty_catch: string[];
  sql_concat: string[];
  type_escape: string[];
  sleep_added: string[];
};

export type FileMetrics = {
  path: string;
  loc: number;
  module_dir: string;
  module_file_count: number;
  module_loc: number;
  share_of_module: number;
  function_count: number;
  class_count: number;
  top_functions: { name: string; approx_lines: number }[];
  import_buckets: Record<string, number>;
  import_bucket_diversity: number;
  looks_generated: boolean;
  churn_90d_commits: number | null;
};

export type Report = {
  pack: string;
  tool: "debt_assess_diff" | "debt_assess_file" | "debt_workaround_gate";
  skipped_jev?: boolean;
  fail_open?: boolean;
  shadow?: boolean;
  model?: string;
  usage?: { input_tokens: number; output_tokens: number };
  metrics: DiffMetrics | FileMetrics | Record<string, unknown>;
  answers?: Record<string, Answer>;
  verdict: Verdict;
  state_preview?: unknown;
};
