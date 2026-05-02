# @protoutil/conformance-runner

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
- Updated dependencies [2fe4322]
  - @protoutil/pubsub@0.3.2
