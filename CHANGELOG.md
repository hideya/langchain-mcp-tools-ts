# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [0.2.8] - 2025-06-21

### Changed
- Clean up the conditions for transport selection to ensure consistent checking

### Added
- Update REAMDE.md and JSDocs to better reflect the current implementations 


## [0.2.7] - 2025-06-20

### Added
- Issue #39: Support for VSCode style remote MCP protocol configurations

### Fixed
- Issue #40: HTTP backwards compatibility approach differs from the recommendations of the MCP spec

### Changed
- Consistently use double quotations instead of single quotations for string literals


## [0.2.6] - 2025-06-18

### Changed
- Add `transport?: never;` to `CommandBasedConfig`
- Remove mistakenly added `ws` from the dependencies


## [0.2.5] - 2025-06-18

### Added
- Issue #33: Streamable HTTP support

### Fixed
- Issue #34: Compatibility issue with OpenAI's Structured Outputs requirements
- Issue #36: JSON Schema Compatibility Issues with Google Gemini Models


## [0.2.4] - 2025-04-24

### Changed
- Update dependencies
- Minor updates to README.md


## [0.2.3] - 2025-04-22

### Added
- Add TypeDoc configuration and improve API documentation
- Add README_DEV.md


## [0.2.2] - 2025-04-20

- Add authentication support for SSE connections to MCP servers
- Add test server and client for SSE connection with authentication


## [0.2.1] - 2025-04-11

### Changed
- Update dependencies
- Minor updates to the README.md


## [0.2.0] - 2025-04-04

### Changed
- Add support for SSE and Websocket remote MCP servers
- Use double quotes instead of single quotes for string literals


## [0.1.20] - 2025-03-31

### Changed
- Update the dependencies, esp. `"@modelcontextprotocol/sdk": "^1.8.0"`
- Add `cwd` to `McpServersConfig` to specify the working directory for the MCP server to use
- Rename ` examples/example.ts` to `testfiles/simple-usage.ts` to avoid confusion


## [0.1.19] - 2025-03-28

### Changed
- Follow `StdioServerParameters` definition closely: `errlog` -> `stderr`


## [0.1.18] - 2025-03-27

### Changed
- Enhance `McpServersConfig` to include a filedescriptor to which MCP server's stderr is redirected


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
