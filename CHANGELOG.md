# Changelog

All notable changes to Datablaze will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.4] - 2025-12-12

### Fixed
- Fixed JSON/CSV export to respect sorted row order. When exporting selected rows after sorting the table, the export now correctly uses the sorted order instead of the original data order.
  - Updated `copySelectedAsJSON()` to use sorted rows
  - Updated `copySelectedAsCSV()` to use sorted rows  
  - Updated `selectAllRows()` to use sorted rows for consistency

## [0.2.3] - Previous Release

### Added
- Cell editing with database persistence
- Resizable columns
- Pagination controls
- Copy row functionality
- MySQL ID fix
