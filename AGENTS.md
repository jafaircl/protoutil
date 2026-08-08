# General rules

**Git**
- The user stages and commits. You can run read-only commands, such as `git diff`. Do not run a git command that changes files or history.

**Safety**
- Do not run `rm -rf` or a similar command. If a file or folder must go, ask the user to delete it.

**Test-driven development**
- This is non-negotiable. You may not add/change/remove any code that affects behavior without a corresponding test.
- Before you write tests for a new area, name the public interface you will test against. Confirm it with the user once, not per test.
- Write a failing test first. Then write the minimum code that makes it pass.
- Test through public interfaces only. Do not test private methods or internal calls.
- A good test name states a capability, for example "user can checkout with valid cart".
- Mock only external systems: APIs, databases, time, and the file system. Do not mock your own code.
- Take expected values from a known source, such as a spec or a worked example. Do not compute the expected value the same way the code does.

**Workflow**
- Before you edit, read enough to understand the task: the code you will change, its callers, and its tests. Do not read a file already in context. Stop once you understand the task; do not read further "just in case."
- Before you write code, form one plan: the approach, the files it touches, and the edge cases it must cover. State your assumptions. If more than one approach fits, list them and ask the user to choose one.
- Write one file at a time. Do not write several files before you save them.
- Do not make a functionality decision on your own. If a problem comes up, tell the user and ask how to proceed.
- After you change code, run the tests that cover it. Fix a failure before you report the task done.
- Report only what changed and why, in a few lines. Do not restate the task. Do not explain unless asked.

**Code style**
- Change only the lines the task needs. Do not edit unrelated code, comments, or formatting. Match the existing style.
- Remove an import or variable only when your change makes it unused. Leave other dead code in place, and tell the user about it.

**Design**
- Build the simplest design that meets today's requirement. Add no unused option, no config for a case that does not exist, and no layer of indirection for a need you do not have yet.
- Grow the system in layers. Get the smallest end-to-end version working first. Add each new capability on top of a version that already works. Do not set aside working code for a bigger version that is not finished.
- Give each component one job. Keep components separate, so a change to one does not force a change to another.
- Before you write new logic, look for it in the codebase and in the project's current dependencies. Do not rewrite something that already works. Check a dependency's documentation and types before you decide it cannot do the job.
- Build each design to last. "Simplest" means no unneeded part, not a shortcut. Do not add code that you plan to replace later.

**Documentation**
- Add a doc comment to every exported item: interface, type, class, method, property, function, constant, and enum. Use the doc-comment format for the language of the file (for example JSDoc in TypeScript or JavaScript, docstrings in Python, Javadoc in Java, rustdoc in Rust). For each function or method, state its parameters, its return value, an example call, and the errors or exceptions it can raise, using that format's tags for these (for example `@param`, `@returns`, `@example`, `@throws` in JSDoc).
- A tool builds documentation from these comments. Write each one so it is correct and complete on its own, with no missing parameter or return value.
- Add an inline comment wherever a reader may not see the code's purpose at once. Do not add one where the code is already plain.
- Write all comments, docs, and messages in Simplified Technical English (ASD-STE100):
  - Keep sentences short: 20 words for an instruction, 25 words for a description.
  - Give each word one meaning. Do not swap between synonyms (pick one of check/verify/confirm, one of config/settings).
  - Use active voice and simple verb forms. Do not use "should"; use "must" or "can".
  - Put the condition before the command: "If the build fails, read the log."
  - Do not use contractions. Do not use filler words, such as "leverage", "simply", or "robust".

# Codebase specific

- `spec/fixtures` holds NCT Assessment Header metadata, demographics, study config, and study assessment config. Use these before you write new sample data. Ask the user for metadata that is missing; do not invent it.
- Do not edit any file in `src/models/gen`. The generator overwrites this folder.
- Before you explore the legacy code, read `findings.md` in the repo root. Add a note there for anything worth remembering, so you do not rediscover it.
- Put domain logic on the model that owns the state. Do not add a string-dispatch API, a pass-through module, a helper function, or a new folder when a model method can do the job. If you believe a new abstraction is needed, name the owning model, the caller, and why no current model method works, and confirm with the user first.