# AGENTS.md

## Scope and authority

The agent MUST follow this file for every repository task.

A closer `AGENTS.md` MAY add or strengthen rules for its directory. It MUST NOT weaken this file unless this file explicitly permits the exception.

The agent MUST apply instructions and artifacts in this order:

1. Explicit instructions in the current task
2. The closest applicable `AGENTS.md`
3. Normative specifications
4. Public schemas and API definitions
5. Accepted Architecture Decision Records
6. Reference and architecture documentation
7. Tests
8. Existing implementation
9. Tutorials and examples

The absolute prohibitions in **Git and filesystem safety** MUST apply regardless of instruction precedence.

WHEN a task changes an artifact, the agent MUST update every dependent artifact that would otherwise become inaccurate.

The agent MUST use a separate manual edit operation for each file.

The agent MUST NOT preserve behavior that conflicts with a higher-authority artifact.

IF authoritative artifacts conflict, THEN the agent MUST report the conflict and MUST NOT resolve it silently.

## Working method

The agent MUST apply the **Karpathy-inspired coding principles**:

- Think before coding.
- Prefer simplicity.
- Make surgical changes.
- Work toward verifiable goals.

Before editing, the agent MUST:

1. Identify the required behavior.
2. Verify assumptions that affect behavior, architecture, compatibility, or verification.
3. Identify affected boundaries and compatibility surfaces.
4. Define observable success criteria.
5. Define the verification method.

The agent MUST implement the smallest solution that satisfies the identified requirements and success criteria.

The agent MUST NOT add speculative features, abstractions, configuration, compatibility layers, or unrelated cleanup.

Every changed line MUST support the task, its verification, or required documentation.

WHEN the success criteria, verification, and required review are complete, the agent MUST stop changing the repository.

## Specification-driven development

The development process MUST follow the life-cycle principles of **ISO/IEC/IEEE 12207**.

Requirements MUST follow **ISO/IEC/IEEE 29148**.

Life-cycle documentation SHOULD follow **ISO/IEC/IEEE 15289** unless a repository-defined artifact provides the required information more directly.

BEFORE implementing an observable behavior change, the agent MUST identify the applicable normative requirement, public schema, or machine-readable contract.

IF no applicable requirement exists, THEN the agent MUST add or update the specification before implementation.

IF an existing requirement already defines the intended behavior, THEN the agent MUST NOT change the requirement only to describe the implementation.

Each normative behavior change MUST be traceable through:

1. A requirement identifier or machine-readable contract
2. An acceptance, conformance, or regression test
3. The implementation
4. The verification result

Tests MUST operationalize normative requirements. Tests MUST NOT replace normative requirements.

Implementation details MUST NOT become normative unless interoperability, compatibility, security, or another stated requirement depends on them.

IF implementation, tests, and specifications disagree, THEN the agent MUST resolve the disagreement according to **Scope and authority** before completion.

Internal refactors and mechanical changes MUST NOT require new normative requirements unless they change observable behavior.

## Structured ideation and decisions

IF authoritative artifacts do not resolve a durable design choice, THEN the agent MUST apply **ISO 56007** and the **Design Council Double Diamond**.

IF authoritative artifacts determine the design, THEN the agent MUST NOT brainstorm alternatives.

Before generating options, the agent MUST define:

- the problem;
- goals and non-goals;
- constraints;
- decision criteria;
- assumptions that require validation.

The agent MUST generate two to four materially different options that satisfy known constraints.

The agent MAY generate one option when only one valid option exists. The agent MAY generate more than four options when four options cannot represent the distinct design classes.

The agent MUST include the existing or minimal-change approach when it satisfies known constraints.

The agent MUST evaluate each option against requirements, architecture, compatibility, correctness, security, simplicity, reversibility, cost, and testability.

The agent MUST reject an option that violates a requirement or constraint. The agent MUST NOT present an invalid option as a tradeoff.

WHEN a decision affects an interactive system, the agent MUST apply **ISO 9241-210**.

The agent MUST recommend one option and state the reason.

IF the unresolved choice would durably change a public API, compatibility commitment, architecture boundary, persistence model, serialization format, migration, trust model, or major dependency, THEN the agent MUST request user confirmation before implementation.

WHEN the user or an authoritative artifact selects an option, the agent MUST stop brainstorming.

A design RFC or ADR MUST record the reason for rejecting a valid alternative when future contributors could reasonably select that alternative again.

## Context acquisition and findings

The agent MUST apply **Agent Skills progressive disclosure** and the traceability principles of **ISO/IEC/IEEE 29148**.

The agent MUST acquire context in this order:

1. Read the closest applicable `AGENTS.md`.
2. Search for exact symbols, terms, errors, and requirement identifiers.
3. Inspect the complete matching logical unit.
4. Read the complete file when it is a primary edit target or module context affects the change.
5. Inspect a related artifact only to answer a specific unresolved question.

The agent MUST use text search or language-aware tools to locate code.

The agent MUST NOT modify code based only on an isolated search result.

Searches and command output MUST use the smallest scope that answers the current question.

The agent MUST NOT repeat an overlapping search or file read unless the source changed or the earlier result was incomplete.

Token efficiency MUST NOT reduce correctness.

The agent MUST maintain a concise task-local findings record.

WHEN a finding changes the implementation, verification, or interpretation of the task, the record MUST identify:

- the fact or invariant;
- its authoritative source;
- the affected symbol, file, or requirement;
- its consequence for the task.

The findings record SHOULD reference source locations instead of copying content unless the source can change or disappear during the task.

WHEN a finding source changes, the agent MUST revalidate the finding.

The agent MUST NOT add temporary investigation notes to the repository.

WHEN a finding defines durable and non-obvious information, the agent MUST update its owning artifact:

- terminology: `/glossary.md`;
- normative behavior: specification;
- accepted decision or rationale: ADR;
- architecture boundary or interaction: architecture documentation;
- public behavior: reference documentation;
- local invariant that code cannot express: comment.

The agent MUST NOT duplicate the same information across owning artifacts.

Secondary artifacts SHOULD link to the authoritative artifact unless a local summary is required for comprehension.

## Glossary, writing, and requirements

The agent MUST maintain the canonical project glossary at `/glossary.md`.

The glossary, comments, technical documentation, and requirements MUST apply **ASD-STE100**, **Google AIP-190**, and **ISO/IEC/IEEE 29148** terminology principles:

- One term MUST identify one concept.
- Different concepts MUST use different terms.
- A domain term MUST be defined before a normative requirement uses it.
- Project artifacts MUST use glossary terms consistently.
- Sentences MUST use active voice unless passive voice identifies the result more clearly.
- A sentence MUST name the actor.
- A condition MUST appear before its required response.
- A sentence MUST state one primary requirement.
- Error behavior and exceptions MUST be explicit.
- Observable criteria MUST replace vague or subjective terms.

WHEN a change introduces, changes, disambiguates, abbreviates, or publicly renames a domain concept, the agent MUST update the glossary.

Each glossary entry MUST contain the canonical term and definition. It MUST also contain scope, permitted abbreviations, prohibited alternatives, or related concepts when those details prevent ambiguity.

Other artifacts MUST NOT duplicate glossary definitions.

Normative statements in this file and in `spec/` MUST use **BCP 14**, comprising RFC 2119 and RFC 8174.

Only uppercase BCP 14 keywords have normative meaning.

WHEN a normative requirement depends on an event, state, or condition, the requirement MUST use **EARS** clause structure:

```text
WHEN <event>,
the <system> MUST <response>.

WHILE <state>,
the <system> MUST <response>.

IF <condition>,
THEN the <system> MUST <response>.
```

Each normative specification requirement MUST:

- have a stable identifier;
- define one observable behavior;
- be unambiguous;
- be verifiable;
- state failure behavior when applicable.

Examples and rationale MUST NOT define normative requirements.

A source comment or JSDoc comment MUST add information that the code cannot express clearly. It MUST NOT restate the code.

A source comment MAY explain an invariant, precondition, lifecycle, concurrency behavior, compatibility requirement, security boundary, deliberate tradeoff, or why a simpler implementation is invalid.

A source comment or JSDoc comment MUST NOT reference an internal specification, requirement identifier, ADR, RFC, issue, review finding, or implementation task.

WHEN internal repository information is required to understand the code, the comment MUST state the relevant intent or constraint directly in terms that are meaningful to downstream users and maintainers.

Internal traceability MUST remain in specifications, tests, ADRs, RFCs, review records, or other repository documentation.

## Naming

The agent MUST apply naming authorities in this order:

1. `/glossary.md`
2. **Google AIP-190: Naming Conventions**
3. **Google AIP-140: Abbreviations**
4. The applicable language or schema style guide
5. Local consistency

Protocol Buffer names MUST follow the **Protocol Buffers Style Guide**.

TypeScript names MUST follow the **Google TypeScript Style Guide** unless the repository records an explicit exception.

Public APIs MUST apply the **Swift API Design Guidelines** principle of clarity at the point of use.

Unless an applicable language guide requires another form:

- The same concept MUST use the same name.
- Different concepts MUST use different names.
- Types MUST use nouns or noun phrases.
- Non-Boolean variables and properties MUST use nouns or noun phrases.
- Action functions and methods MUST use verbs or verb phrases.
- Boolean identifiers MUST read as predicates.
- Collections MUST use plural nouns.
- Abbreviations MUST be standard or glossary-defined.
- Names MUST NOT encode static type information.
- Interfaces MUST NOT use an `I` prefix.
- Names MUST NOT use `Impl`, `Manager`, `Handler`, or a similar term unless it adds domain meaning.

A public rename MUST be treated as a compatibility change.

## Design and documentation

IF a proposed change contains an unresolved durable design choice that affects public behavior, architecture, compatibility, persistence, security, migration behavior, or a dependency commitment, THEN the agent MUST create or update a design RFC based on the **Rust RFC structure** before implementation.

A design RFC MUST define goals, non-goals, required behavior, compatibility effects, alternatives, testing, and unresolved questions.

WHEN the project accepts a durable design decision, the agent MUST create or update an **Architecture Decision Record** that follows the project **MADR** template.

The agent MUST NOT reverse an accepted decision without superseding its ADR.

IF a change only implements or clarifies an accepted decision, THEN the agent MUST NOT rewrite the ADR only to describe the implementation.

Architecture documentation MUST use:

- the **C4 model** for structural architecture;
- **ISO/IEC/IEEE 42010** for viewpoints, audiences, and concerns;
- applicable **arc42** sections for constraints, runtime scenarios, cross-cutting concepts, quality, and risks;
- sequence diagrams for ordered runtime interactions;
- state machines or statecharts for lifecycle behavior;
- decision tables for combinations of independent conditions;
- data models for persistent relationships.

WHEN a change makes an architecture artifact inaccurate, the agent MUST update that artifact.

User documentation MUST follow **Diátaxis**:

- Tutorials MUST teach through a guided sequence.
- How-to guides MUST describe how to complete a task.
- Reference documentation MUST define current behavior.
- Explanation documentation MUST describe concepts and rationale.

Specifications, ADRs, and architecture documentation MUST remain separate from Diátaxis user documentation.

## Quality and security

Quality requirements MUST use **ISO/IEC 25010** terminology and measurable quality scenarios.

Quality requirements MUST NOT rely on undefined terms such as `fast`, `scalable`, `robust`, or `maintainable`.

WHEN **OWASP ASVS** covers an applicable application-security requirement, the agent MUST use that requirement.

A security requirement MUST identify the protected asset, threat, trust boundary, required behavior, and verification method.

The agent MUST NOT weaken validation, authorization, or trust boundaries to make a test pass.

The agent MUST NOT log secrets or credentials.

## Systematic debugging and testing

The agent MUST follow the **Google SRE Effective Troubleshooting** methodology.

Debugging MUST use observable evidence and falsifiable hypotheses.

Testing terminology, evidence, processes, and techniques MUST follow **ISO/IEC/IEEE 29119**.

Software anomaly classifications SHOULD follow **IEEE 1044** unless the repository uses another documented classification system.

Before changing code during debugging, the agent MUST:

1. State the expected behavior.
2. State the observed behavior.
3. Establish the smallest reliable reproduction.
4. Separate confirmed facts, assumptions, and hypotheses.

During diagnosis, the agent MUST test one specific hypothesis at a time, state the evidence that would support or reject it, test the least invasive distinguishing variable, and record the result.

The agent MUST NOT make speculative code changes to determine whether they help.

The agent MUST NOT treat correlation as proof of cause or present a hypothesis as a confirmed cause.

IF the root cause cannot be established, THEN the agent MUST report the uncertainty and collected evidence.

WHEN the root cause is established, the agent MUST use the TDD process for the fix.

Behavioral changes and confirmed bug fixes MUST follow **Kent Beck’s Test-Driven Development** process and the **GDS Red–Green–Refactor** cycle:

1. Add the smallest test that defines or reproduces the behavior.
2. Confirm that the test fails for the expected reason.
3. Add the smallest implementation that makes the test pass.
4. Confirm that the applicable tests pass.
5. Refactor only while the tests remain green.

A refactor MUST begin with passing tests and MUST preserve observable behavior.

Tests MUST verify externally meaningful behavior rather than incidental implementation details.

WHEN a machine-readable conformance schema exists, the agent MUST use typed conformance fixtures for conformance behavior.

The agent SHOULD use **Gherkin Given/When/Then** when it expresses observable behavior more clearly than ordinary test code or prose. The agent MAY use another representation when it is clearer.

WHEN decision tables, state machines, property tests, or fuzz tests express behavior more precisely than example-based tests, the agent MUST use the more precise technique.

The agent MUST NOT weaken a valid test to accommodate an incorrect implementation.

IF an automated test cannot be added before implementation, THEN the agent MUST record the reason and add the strongest available automated verification before completion.

The agent MUST NOT suppress an error, broaden a retry, add a fallback, or weaken a test only to hide a failure.

IF a temporary diagnostic does not provide durable observability, THEN the agent MUST remove it before completion.

## Safe changes and commands

Manual file edits MUST apply **optimistic concurrency control**, **atomicity**, and **failure isolation**.

RFC 6902 `test` operations and RFC 9110 conditional requests define the precondition model.

Each manual patch or write operation MUST modify or create one file only.

For each file, the agent MUST:

1. Read the current logical unit.
2. Apply the edit.
3. Confirm that the edit succeeded.
4. Inspect that file’s diff.
5. Continue to the next file.

Before applying an edit, the agent MUST verify that the target matches the content used to prepare it.

IF a patch does not match the current file, THEN the agent MUST stop the edit, reread the file, rebase only that file’s intended change, and preserve successful edits.

The agent MUST NOT force, fuzz, or approximate a failed patch.

The current working tree MUST be the source of truth for editing, verification, and reporting.

The agent MUST NOT reconstruct repository state from memory, intended edits, or earlier tool output.

The agent MUST NOT discard or recreate successful work because a later edit failed.

The agent MUST NOT run concurrent write operations against the same working tree.

WHEN a modifying command changes a file, the agent MUST reread that file before preparing another manual edit.

The agent MUST preserve existing encoding, line endings, formatting, and untouched content.

The agent MUST NOT rewrite a complete file when a focused edit can express the change.

The agent MUST NOT normalize unrelated formatting, imports, whitespace, or ordering.

### Git and filesystem safety

The agent MUST apply the **principle of least privilege**.

Without explicit user permission, the agent MAY run only these read-only Git command families:

```text
git status
git diff
git log
git show
git grep
```

The agent MAY use path arguments and options that only narrow the read-only output of a permitted command.

Any other Git operation MUST require explicit user permission for that specific operation.

Without that permission, the agent MUST leave the working tree, index, references, history, branches, tags, stashes, and worktrees unchanged.

The agent MUST NOT run a command that is unsafe by default and becomes safe only through an unrequested flag, argument, alias, configuration, or repository condition.

The agent MUST NOT run any of these commands:

```text
rm -rf
rm -r
find ... -delete
xargs rm
```

This prohibition is absolute.

The agent MUST NOT perform an equivalent recursive or bulk deletion through another tool or language.

The agent MUST NOT delete a file unless the user explicitly identifies that file for deletion.

IF deletion appears necessary, THEN the agent MUST identify the file, explain the reason, and leave it unchanged.

### Downloaded content

The agent MUST NOT pipe downloaded content directly into a shell or interpreter.

The agent MUST NOT execute downloaded executable content without explicit user permission.

Permission to download content MUST NOT imply permission to execute it.

WHEN execution is explicitly authorized, the agent MUST download the content to an explicit path, inspect human-readable content, verify the source and purpose, and run only the authorized operation.

### Modifying commands

Before running a modifying command, the agent MUST:

1. Determine which files or resources it can change.
2. Use a dry-run or check mode when available.
3. Scope the command to the affected file or package.
4. Inspect `git status` and the relevant diff afterward.

IF a narrower modifying command can complete the operation, THEN the agent MUST NOT run the repository-wide equivalent.

The agent MUST NOT add, remove, or upgrade a dependency unless the task requires that change.

IF an installation command can rewrite a lockfile and the task does not require installation or dependency validation, THEN the agent MUST NOT run it.

WHEN a lockfile changes, the agent MUST inspect the relevant lockfile diff.

The agent MUST NOT publish, deploy, release, upload, or modify a remote, shared, or production system unless the user explicitly requests that action.

IF a command changes an unexpected file or resource, generated output exceeds the expected scope, or a formatter changes unrelated content, THEN the agent MUST stop and preserve the current state.

IF a test fails outside the expected change scope, THEN the agent MUST stop implementation and diagnose the failure.

IF repository evidence conflicts with the planned implementation, THEN the agent MUST stop and report the conflict.

The agent MUST NOT reset, clean, revert, or repair unrelated changes.

## Code review

Code reviews MUST follow **ISO/IEC 20246**, the applicable **Google Engineering Practices**, and this file.

Formal reviews and audits SHOULD apply **IEEE 1028** unless the task does not require a formal review or audit.

Security reviews MUST apply the **OWASP Code Review Guide** and applicable **OWASP ASVS** requirements.

A requested review-only task MUST remain read-only unless the user explicitly requests fixes.

Before reviewing code, the reviewer MUST define the objective, review target, scope, criteria, verification methods, and exclusions.

### Review target

The reviewer MUST review the code state or change set requested by the user.

The reviewer MUST NOT assume `main`, `master`, the default branch, or another branch is the review baseline.

IF the user specifies a baseline, branch, commit, diff, pull request, or change set, THEN the reviewer MUST use that review target.

IF the review follows changes made during the current task, THEN the reviewer MUST review those current-task changes and MUST NOT substitute a comparison against another branch.

IF selecting a baseline would materially change an ambiguous review scope, THEN the reviewer MUST ask the user to identify the intended baseline.

The reviewer MUST state the review target and scope before reporting findings.

IF the review examines a change, THEN the reviewer MUST inspect the complete requested change set and enough surrounding code to understand each changed behavior.

IF the review examines a package or codebase, THEN the reviewer MUST track the components, requirements, and quality areas reviewed.

IF the review uses sampling, THEN the reviewer MUST identify the sampling method and MUST NOT claim complete coverage.

The reviewer MUST evaluate concerns in this order:

1. Requirements and architecture
2. Public interfaces and compatibility
3. Correctness, failure behavior, security, concurrency, and lifecycle
4. Tests and verification
5. Complexity, naming, comments, and documentation
6. Formatting and style

The reviewer MUST NOT prioritize style findings while a correctness, security, compatibility, or architecture finding remains unresolved.

Each finding MUST contain:

- a stable identifier;
- a classification;
- the affected file, symbol, or requirement;
- specific evidence;
- the violated requirement, standard, or principle;
- the consequence;
- a corrective action.

The reviewer MUST use these classifications:

- `MUST FIX`: confirmed violation of a requirement, correctness rule, security rule, compatibility commitment, or required verification condition;
- `SHOULD FIX`: confirmed code-health problem that requires correction unless a documented reason justifies the design;
- `SUGGESTION`: optional improvement;
- `QUESTION`: missing information that prevents a conclusion.

A `QUESTION` MUST NOT be reported as a defect.

The reviewer MUST separate confirmed defects from risks, assumptions, and questions.

The reviewer MUST NOT report a speculative concern or unvalidated automated-analysis result as a confirmed defect.

The reviewer MUST NOT claim compliance or conformance unless every applicable requirement in the stated scope has supporting evidence.

IF no defect is found, THEN the reviewer MUST state the reviewed scope and verification performed.

### Pre-completion review

Every repository change MUST receive a final review of the changes made during the current task against the task, applicable standards, tests, and repository instructions.

IF a change is material, THEN the agent MUST perform a distinct code-review pass after implementation and before completion.

A change is material when it affects a public or compatibility surface, architecture boundary, trust boundary, persistent or wire data, migration, concurrency, shared behavior, broad generated output, multiple interacting components, or behavior whose failure can cause data loss, security exposure, or service unavailability.

A material change SHOULD receive an independent review by a fresh reviewer that did not implement the change unless an independent reviewer is unavailable or its cost is disproportionate to the material risk.

The reviewer MUST receive:

- the task and success criteria;
- the current final change set;
- the repository code-review requirements;
- the durable artifacts, tests, and verification results required by the review scope.

The reviewer MUST NOT receive the implementer’s private reasoning, discarded attempts, or unpublished rationale.

IF unpublished information is required to justify the implementation, THEN the agent MUST record that information in the appropriate repository artifact before review.

Review context MUST apply **Agent Skills progressive disclosure**.

IF an independent review is unavailable or disproportionate to risk, THEN the agent MAY perform a distinct self-review pass.

IF the review identifies a `MUST FIX` finding, THEN the agent MUST resolve it and repeat the affected verification.

The agent MUST NOT declare a material change complete while a `MUST FIX` finding remains unresolved.

## Implementation, verification, and completion

The agent MUST NOT edit generated files directly.

WHEN generated output must change, the agent MUST change its source and run the documented generator.

The agent MUST NOT introduce a breaking change unless the task requires it.

The agent MUST begin with the narrowest applicable verification and MUST run applicable verification in this order:

1. Formatting and static checks
2. Focused tests
3. Integration and conformance tests
4. Broader tests when shared behavior changes
5. Required code review

The agent MAY increase command verbosity only when additional output is required to diagnose a failure.

A passing test MUST NOT override a conflicting specification.

The agent MUST NOT claim that a check or review passed unless it completed successfully.

The completion report MUST identify:

- the behavior and important files changed;
- the affected requirements, decisions, or architecture;
- the tests and checks that ran;
- the review target;
- the review performed and whether it was independent;
- applicable verification or review steps that did not run;
- unresolved findings, limitations, or conflicts.
