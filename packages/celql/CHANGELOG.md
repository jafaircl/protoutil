# @protoutil/celql

## 0.3.2

### Minor Changes

- Add the celql specification, public translator API, core conformance suite, ANSI SQL version 1 profile, and PostgreSQL version 1 profile.
- Expose subclassable ANSI SQL and PostgreSQL dialect visitors and bind `createTranslator` to one dialect class.
- Add shared-input, per-profile conformance expectations and execute every successful PostgreSQL source expectation against PostgreSQL 14.
