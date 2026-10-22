# Test fixtures

- `gladys-feature-table.json`: the category/type couples, units and poll frequencies the Gladys
  core and front know, extracted from their code (see `test/gladys-rules.test.js`).
- `hamqsl/solar-2026-10-22.xml`: the real HamQSL feed (https://www.hamqsl.com/solarxml.php),
  recorded on 22/10/2026 at 05:42 UTC, unchanged. Data courtesy of Paul Herrman, N0NBH.
- `hamqsl/storm.xml`: the same document shaped as during a severe storm (K 9, X1.2 flare, the
  values of May 2024 rounded), with the cases the feed really has: `No Report` in place of a
  value, a missing tag (`sunspots`), an open VHF phenomenon. Written by hand for the tests.
