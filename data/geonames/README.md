# GeoNames city index

`cities.min.json` is generated from the GeoNames `cities15000` dataset by
`npm run build:geonames`.

To rebuild, download and extract `cities15000.zip`, place
`cities15000.txt` in this directory, then run the command. Raw source archives
are intentionally not committed or deployed.

Source: https://download.geonames.org/export/dump/

GeoNames data is licensed under Creative Commons Attribution 4.0:
https://creativecommons.org/licenses/by/4.0/

The generated index retains city names, alternate search names, coordinates,
population, country/admin identifiers, and IANA timezone IDs.
