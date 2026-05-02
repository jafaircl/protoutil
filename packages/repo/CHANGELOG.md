# @protoutil/repo

## 0.3.2

### Patch Changes

- 2fe4322: - New Features
  - Added transport-neutral pub/sub system with CloudEvents 1.0 support for protobuf services
  - Kafka, RabbitMQ, and NATS transport implementations with durable scheduling and dead-letter handling
  - Conformance test suite for validating pub/sub transport behavior
  - Example Fastify server demonstrating event publishing and subscription
  - Documentation
    - Comprehensive guides for pub/sub usage and transport-specific configuration
    - Added transport READMEs for Kafka, RabbitMQ, and NATS with examples
    - Updated main documentation with new pub/sub package overview
  - Chores
    - Updated repo error handling with stable error codes
    - Added benchmark suite for transport performance measurement
  - @protoutil/aip@0.3.2
  - @protoutil/aipql@0.3.2
  - @protoutil/core@0.3.2

## 0.3.1

### Patch Changes

- 686f9ba: feat(repo): add repository customization APIs, benchmarks, and docs
  - @protoutil/aip@0.3.1
  - @protoutil/aipql@0.3.1
  - @protoutil/core@0.3.1

## 0.3.0

### Minor Changes

- Add changesets release workflow, CONTRIBUTING guide, and LICENSE

### Patch Changes

- Updated dependencies
  - @protoutil/aip@0.3.0
  - @protoutil/aipql@0.3.0
  - @protoutil/core@0.3.0
