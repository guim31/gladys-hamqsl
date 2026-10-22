# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- A "HF propagation (HamQSL)" device, from the public feed of N0NBH (hamqsl.com): solar flux,
  sunspot number, K and A indices, X-ray class, solar wind, Bz, signal noise, geomagnetic field,
  the HF band conditions by day and by night (80-40 m to 12-10 m), the VHF aurora and sporadic E
  openings, and the time of the N0NBH update.
- A dashboard widget: the band table, with the main indices.
- Scene triggers: a band becomes good, a geomagnetic storm, an M or X class solar flare.
- A scene action: the propagation bulletin in one text, with the main values.
- A configuration action to read the feed at once.
- Texts and documentation in English, French, German and Spanish.
