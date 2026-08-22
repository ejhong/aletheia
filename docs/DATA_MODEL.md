# Initial Data Model

The TypeScript implementation may refine field names, but it should preserve these concepts.

```ts
type ID = string;

type AssessmentState =
  | "established"
  | "well_supported"
  | "provisionally_supported"
  | "mixed"
  | "weakly_supported"
  | "contradicted"
  | "unresolved"
  | "presently_untestable";

type EvidenceDirection =
  | "supports"
  | "undermines"
  | "qualifies"
  | "context";

type ReviewState = "draft" | "frozen" | "reviewed" | "superseded";

type ClaimType =
  | "observation"
  | "measurement"
  | "historical"
  | "causal"
  | "mechanistic"
  | "statistical"
  | "interpretive"
  | "existence"
  | "prediction";

type ClaimRelationshipType =
  | "depends_on"
  | "refines"
  | "duplicates"
  | "alternative_to"
  | "contradicts"
  | "supersedes"
  | "is_example_of";

interface CaseRecord {
  id: ID;
  slug: string;
  title: string;
  subtitle: string;
  summary: string;
  domain: string;
  status: "active" | "incubating" | "archived";
  overallAssessment: AssessmentState;
  assessmentSummary: string;
  centralCrux: string;
  bestConventionalAlternative: string;
  whatWouldChangeOurMind: string[];
  hypothesisIds: ID[];
  rootClaimIds: ID[];
  researchCruxIds: ID[];
  researchOpportunityIds: ID[];
  editorNames: string[];
  lastComprehensiveReview: string;
  isDemo: boolean;
}

interface HypothesisRecord {
  id: ID;
  caseId: ID;
  title: string;
  shortLabel: string;
  description: string;
  isFeatured: boolean;
  predictions: string[];
  explainsWell: string[];
  strugglesWith: string[];
  discriminatingObservations: string[];
}

interface ClaimRecord {
  id: ID;
  caseId: ID;
  statement: string;
  plainLanguage: string;
  type: ClaimType;
  importance: "core" | "major" | "supporting" | "peripheral";
  reviewState: ReviewState;
  credibilityAssessment: AssessmentState;
  credibilitySummary: string;
  diagnosticity:
    | "high"
    | "moderate"
    | "low"
    | "indeterminate";
  diagnosticitySummary: string;
  parentClaimIds: ID[];
  childClaimIds: ID[];
  predictionIds?: ID[];
  predictions: string[];
  disconfirmers: string[];
  whatWouldChangeOurMind: string[];
  strongestObjection: string;
  lastReviewed: string;
  isDemo: boolean;
}

interface ClaimRelationshipRecord {
  id: ID;
  fromClaimId: ID;
  toClaimId: ID;
  type: ClaimRelationshipType;
  note?: string;
}

interface EvidenceRecord {
  id: ID;
  caseId: ID;
  claimIds: ID[];
  sourceId: ID;
  title: string;
  summary: string;
  direction: EvidenceDirection;
  strength: "decisive" | "strong" | "moderate" | "weak";
  independenceGroup: string;
  exactLocator?: string;
  sourceStatement: string;
  editorInference?: string;
  limitations: string[];
  replicationStatus:
    | "not_applicable"
    | "unreplicated"
    | "partially_replicated"
    | "independently_replicated"
    | "failed_replication"
    | "mixed";
  isDemo: boolean;
}

interface SourceRecord {
  id: ID;
  title: string;
  authors: string[];
  organization?: string;
  date?: string;
  sourceType:
    | "paper"
    | "preprint"
    | "dataset"
    | "book"
    | "interview"
    | "archive"
    | "artifact_record"
    | "image"
    | "webpage"
    | "other";
  identifier?: string;
  url?: string;
  status:
    | "verified"
    | "placeholder"
    | "unverified"
    | "corrected"
    | "retracted";
  reliabilityNotes: string[];
  versionNotes?: string;
  isDemo: boolean;
}

interface AssessmentRecord {
  id: ID;
  objectType: "case" | "claim";
  objectId: ID;
  state: AssessmentState;
  summary: string;
  confidenceLabel: "high" | "moderate" | "low";
  probabilityRange?: {
    min: number;
    max: number;
  };
  supportingEvidenceIds: ID[];
  underminingEvidenceIds: ID[];
  qualifyingEvidenceIds: ID[];
  strongestObjection: string;
  whatWouldChangeOurMind: string[];
  assessedAt: string;
  humanReviewer: string;
  aiAssistance?: {
    used: boolean;
    modelLabel?: string;
    purpose?: string;
  };
  supersedesAssessmentId?: ID;
}

interface ResearchCruxRecord {
  id: ID;
  caseId: ID;
  title: string;
  question: string;
  whyItMatters: string;
  affectedClaimIds: ID[];
  discriminatingOutcomes: {
    outcome: string;
    favorsHypothesisIds: ID[];
    explanation: string;
  }[];
}

interface ResearchOpportunityRecord {
  id: ID;
  caseId: ID;
  title: string;
  summary: string;
  affectedClaimIds: ID[];
  expectedInformationGain: "very_high" | "high" | "moderate" | "low";
  effortTier: "small" | "medium" | "large" | "major_program";
  feasibility: "high" | "moderate" | "low";
  prerequisites: string[];
  failureModes: string[];
  proposedSuccessCriteria: string[];
}

interface UpdateRecord {
  id: ID;
  caseId: ID;
  date: string;
  objectType: "case" | "claim" | "evidence" | "source" | "research";
  objectId: ID;
  title: string;
  summary: string;
  previousState?: string;
  newState?: string;
  reason: string;
  triggeringSourceIds: ID[];
  humanReviewer: string;
  aiAssisted: boolean;
}
```

## Validation invariants

- Every referenced ID exists.
- Every Claim belongs to one Case.
- Parent and child references agree.
- A Claim cannot be its own ancestor.
- Every Evidence record has at least one Claim and one Source.
- Demo Evidence may use only demo or placeholder Sources.
- A verified-looking identifier may not be invented for demo content.
- Evidence direction is independent from Evidence strength.
- Assessment records identify both favorable and unfavorable evidence when available.
- A superseded Assessment remains readable in history.
- Case slugs and object IDs are stable.
