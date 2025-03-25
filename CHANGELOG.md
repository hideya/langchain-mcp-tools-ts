# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).


## [Unreleased]

## [0.1.17] - 2025-03-25

### Changed

- Improve the API to accept a custom logger
- Minor updates to README.me


## [0.1.16] - 2025-03-19

### Fixed

- Outdated tests that failed due to past behavioral updates
- Multiple vulnerabilities found in the dependent library versions


## [0.1.15] - 2025-03-19

### Changed

- Minor updates to README.me and example.ts


## [0.1.14] - 2025-02-21

### Changed

- Minor updates to README.me and example.ts


## [0.1.13] - 2025-02-20

### Fixed

- Issue #8: Add try-catch surrounding MCP "tools/call" invocation to handle unexpected exceptions

### Added

- examples/exmaple.ts and `npm run example` sript to check the library functionality
- `npm run publish-dry-run` and `npm run do-publish` for better publication handling


## [0.1.12] - 2025-02-12

### Fixed

- Better conversion from MCP's results into a string

### Changed

- Update example code in README.md to use `claude-3-5-sonnet-latest`
  instead of `haiku` which is sometimes less capable to handle results from MCP
