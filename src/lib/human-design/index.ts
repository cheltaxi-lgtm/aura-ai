export * from "./types";
export {
  AUTHORITY_NAMES_RU,
  CENTER_NAMES_RU,
  CHANNELS,
  CROSS_ANGLE_NAMES_RU,
  CROSS_NAMES_EN,
  CROSS_NAMES_RU,
  DEFINITION_NAMES_RU,
  GATE_CENTERS,
  GATE_NAMES_RU,
  GATE_ORDER,
  MOTOR_CENTERS,
  PROFILE_NAMES_RU,
  TYPE_META,
  VALID_PROFILES,
  crossAngleFromProfile,
} from "./constants";
export {
  calculateHdChart,
  computeTransits,
  hdAuthorityFromChannels,
  HD_MAX_BIRTH_YEAR,
  HD_MIN_BIRTH_YEAR,
  hdTypeFromChannels,
  longitudeToActivation,
  solveDesignJd,
} from "./calculate";
export {
  hdFingerprint,
  normalizeHdTimezone,
  type HdChartIdentity,
} from "./fingerprint";
export {
  buildHdAskSystemPrompt,
  buildHdCompositeReportSystemPrompt,
  buildHdReportSystemPrompt,
  formatHdEvidence,
  sanitizeHdCompositeReportText,
  sanitizeHdReportText,
} from "./prompt";
export {
  analyzeHdConnection,
  connectionRelationPromptHint,
  formatHdConnectionEvidence,
  HD_CONNECTION_RELATIONS,
  type HdChannelBond,
  type HdCenterBond,
  type HdConnectionAnalysis,
  type HdConnectionRelation,
} from "./connection";
export {
  HD_COMPOSITE_REQUIRED_SECTIONS,
  HD_CONNECTION_REPORT_MODULES,
  HD_FULL_REPORT_MODULES,
  HD_REPORT_REQUIRED_SECTIONS,
  hdReportTextToPrintSections,
  type HdReportModule,
  type HdReportPackageId,
} from "./packages";
export {
  formatExtrasForEvidence,
  hangingGates,
  reportTonePromptHint,
  splitCardGates,
  variableSummary,
  type HdReportTone,
} from "./chart-extras";
export { computeTransitWeek, type HdTransitDay } from "./transits-week";
